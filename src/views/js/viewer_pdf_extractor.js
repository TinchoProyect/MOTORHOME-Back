/**
 * VIEWER PDF EXTRACTOR - Middleware de Ingesta
 * Responsable de estructurar archivos PDF en formato tabular estricto.
 */
console.log("%c 📄 PDF EXTRACTOR: READY ", "background: #f43f5e; color: #fff; font-weight: bold; padding: 4px;");

window.PDFExtractor = (function() {
    
    /**
     * Extrae texto y coordenadas, y agrupa en filas y columnas.
     */
    async function extractToTabla(arrayBuffer) {
        if (!window.pdfjsLib) {
            throw new Error("Librería PDF.js no fue encontrada.");
        }
        
        // Configuramos el worker si es necesario (generalmente lo resuelve automagicamente con CDN, 
        // pero PDF.js suele quejarse si no está explicitado. Lo asume del mismo path)
        const pdfjsLib = window.pdfjsLib;
        // pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        
        const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
        const pdfDoc = await loadingTask.promise;
        
        const allItems = [];
        
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Cada item contiene 'str' y transform = [ escalaX, skewY, skewX, escalaY, x, y ]
            // Como las páginas caen una debajo de otra, le restamos el offset de la página a la Y
            // En PDF.js, Y=0 es la parte inferior.
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;
            const pageOffset = (pageNum - 1) * 2000; // Un offset holgado para separar páginas
            
            textContent.items.forEach(item => {
                if (!item.str || item.str.trim() === '') return;
                
                const x = item.transform[4];
                const rawY = item.transform[5];
                // Invertimos Y para que crezca de arriba hacia abajo (y sumamos la paginación)
                const y = (pageHeight - rawY) + pageOffset;
                
                allItems.push({
                    text: item.str.trim(),
                    x: Math.round(x),
                    y: Math.round(y)
                });
            });
        }
        
        if (allItems.length === 0) {
            throw new Error("El PDF no contiene texto extraíble (posiblemente sea una imagen escaneada).");
        }
        
        // 1. Agrupación por Eje Y (Filas Teóricas)
        allItems.sort((a, b) => a.y - b.y);
        
        const rowsUnfiltered = [];
        let currentRow = [];
        let currentY = allItems[0].y;
        const THRESHOLD_Y = 6; // Tolerancia de 6 píxeles verticales
        
        allItems.forEach(item => {
            if (Math.abs(item.y - currentY) <= THRESHOLD_Y) {
                currentRow.push(item);
            } else {
                rowsUnfiltered.push(currentRow);
                currentRow = [item];
                currentY = item.y;
            }
        });
        if (currentRow.length > 0) rowsUnfiltered.push(currentRow);
        
        // 2. Limpieza Temprana (Filtrado de Ruido / Títulos y Tótems Semánticos Aislados)
        const isNumeric = (str) => {
            // Regex permisiva para montos: 12.345,67 o $ 500
            return /^[$\s]*[0-9.,]+[$\s]*$/.test(str);
        };
        
        const validRows = [];
        rowsUnfiltered.forEach(rowItems => {
            // Unificamos fragmenos contiguos horizontalmente por si el PDF partió una palabra en pedacitos
            rowItems.sort((a,b) => a.x - b.x);
            let merged = [];
            let currentItem = rowItems[0];
            const THRESHOLD_X_MERGE = 8;
            
            for(let i = 1; i < rowItems.length; i++) {
                if (Math.abs(rowItems[i].x - (currentItem.x + currentItem.text.length * 5)) < THRESHOLD_X_MERGE) {
                    currentItem.text += " " + rowItems[i].text;
                } else {
                    merged.push(currentItem);
                    currentItem = rowItems[i];
                }
            }
            merged.push(currentItem);
            
            // Evaluar Densidad: ¿Es una fila válida o es un Título de Rubro?
            let hasNumbers = merged.some(itm => isNumeric(itm.text));
            if (merged.length < 2 && !hasNumbers) {
                // Fila ruidosa. Un texto aislado que ni siquiera es número. IGNORAR.
                console.log("PDF_Limpieza: Descartando fila ruidosa:", merged.map(m=>m.text).join(" "));
            } else {
                validRows.push(merged);
            }
        });
        
        // 3. Extracción Discreta de Columnas (Eje X)
        // Recolectamos todas las coordenadas X únicas y agrupamos cercanías
        let allXs = [];
        validRows.forEach(row => row.forEach(itm => allXs.push(itm.x)));
        allXs.sort((a,b) => a - b);
        
        const colAnchors = [];
        if (allXs.length > 0) {
            let cx = allXs[0];
            colAnchors.push(cx);
            for(let i=1; i<allXs.length; i++) {
                if (Math.abs(allXs[i] - cx) > 15) { // Si hay más de 15px de diferencia, es una nueva columna
                    cx = allXs[i];
                    colAnchors.push(cx);
                }
            }
        }
        
        // 4. Tabulación Visual y Alineamiento Matricial
        const finalMatrix = [];
        
        // En base a colAnchors, cada fila tendrá exactamente colAnchors.length columnas
        validRows.forEach(rowItems => {
            let rowPaddded = new Array(colAnchors.length).fill("");
            
            rowItems.forEach(itm => {
                // Encontrar a qué "columna / anchor" pertenece midiendo distancia
                let bestColIdx = 0;
                let minDist = Infinity;
                colAnchors.forEach((ax, idx) => {
                    let d = Math.abs(itm.x - ax);
                    if (d < minDist) {
                        minDist = d;
                        bestColIdx = idx;
                    }
                });
                
                // Anexar texto (por si caen dos textos en la misma columna por error de distancias)
                if (rowPaddded[bestColIdx] !== "") {
                    rowPaddded[bestColIdx] += " " + itm.text;
                } else {
                    rowPaddded[bestColIdx] = itm.text;
                }
            });
            
            finalMatrix.push(rowPaddded);
        });
        
        // Generar Cabeceras Automáticas Dummy si es necesario para mantener integridad en UI
        if (finalMatrix.length > 0) {
            let headers = colAnchors.map((_, i) => "Columna " + (i + 1));
            finalMatrix.unshift(headers);
        }
        
        console.log(`[PDF_EXTRACTOR] Extracción Completa. Filas Válidas obtenidas: ${finalMatrix.length}`);
        return finalMatrix;
    }

    return {
        extractToTabla
    }
})();
