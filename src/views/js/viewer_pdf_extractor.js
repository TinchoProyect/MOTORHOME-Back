/**
 * VIEWER PDF EXTRACTOR - Middleware de Ingesta
 * Responsable de estructurar archivos PDF en formato tabular estricto.
 */
console.log("%c 📄 PDF EXTRACTOR: READY ", "background: #f43f5e; color: #fff; font-weight: bold; padding: 4px;");

window.PDFExtractor = (function() {
    let currentRawItems = [];

    async function loadPdfText(arrayBuffer) {
        if (!window.pdfjsLib) throw new Error("Librería PDF.js no fue encontrada.");
        
        const pdfjsLib = window.pdfjsLib;
        const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
        const pdfDoc = await loadingTask.promise;
        
        currentRawItems = [];
        window.currentVerticalAnchors = []; // [Ticket #009] Limpiar anclas previas
        
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;
            const pageOffset = (pageNum - 1) * 2000;
            
            textContent.items.forEach(item => {
                if (!item.str || item.str.trim() === '') return;
                const x = item.transform[4];
                const rawY = item.transform[5];
                const y = (pageHeight - rawY) + pageOffset;
                
                currentRawItems.push({
                    text: item.str.trim(),
                    x: Math.round(x),
                    y: Math.round(y)
                });
            });

            // [Ticket #009] Extracción de Geometría (Líneas Verticales)
            try {
                const opList = await page.getOperatorList();
                const OPS = pdfjsLib.OPS;
                for (let i = 0; i < opList.fnArray.length; i++) {
                    const fn = opList.fnArray[i];
                    const args = opList.argsArray[i];
                    
                    if (fn === OPS.rectangle) {
                        const x = args[0], w = args[2], h = args[3];
                        if (w < 4 && h > 20) window.currentVerticalAnchors.push(Math.round(x));
                    }
                    if (fn === OPS.constructPath) {
                        const opsArray = args[0];
                        const coords = args[1];
                        let cx = 0, cy = 0, coordIdx = 0;
                        for (let j = 0; j < opsArray.length; j++) {
                            const op = opsArray[j];
                            if (op === OPS.moveTo) {
                                cx = coords[coordIdx++];
                                cy = coords[coordIdx++];
                            } else if (op === OPS.lineTo) {
                                const nx = coords[coordIdx++];
                                const ny = coords[coordIdx++];
                                if (Math.abs(cx - nx) < 2 && Math.abs(cy - ny) > 20) {
                                    window.currentVerticalAnchors.push(Math.round(cx));
                                }
                                cx = nx; cy = ny;
                            }
                        }
                    }
                }
            } catch(e) {
                console.warn("Fallo leve ignorado al parsear OperatorList:", e);
            }
        }
        
        if (currentRawItems.length === 0) {
            throw new Error("El PDF no contiene texto extraíble.");
        }
        
        // [Ticket #009] Filtrado de Anclas Únicas
        if (window.currentVerticalAnchors && window.currentVerticalAnchors.length > 0) {
            const uniqueAnchors = [];
            window.currentVerticalAnchors.sort((a, b) => a - b);
            let lastX = -999;
            window.currentVerticalAnchors.forEach(x => {
                if (Math.abs(x - lastX) > 5) { // 5px tolerancia geométrica
                    uniqueAnchors.push(x);
                    lastX = x;
                }
            });
            window.currentVerticalAnchors = uniqueAnchors;
            console.log(`[PDF_EXTRACTOR] Esqueleto Vectorial (Líneas) Detectado en:`, uniqueAnchors);
        }

        console.log(`[PDF_EXTRACTOR] Texto binario cargado en memoria. Items totales: ${currentRawItems.length}`);
        return currentRawItems.length;
    }

    function applyClustering(config = {}) {
        if (currentRawItems.length === 0) throw new Error("No hay un PDF cargado en memoria.");

        const thresholdY = parseInt(config.thresholdY) || 6;
        const thresholdXMerge = parseInt(config.thresholdXMerge) || 8;
        const colTolerance = parseInt(config.colTolerance) || 15;

        const items = JSON.parse(JSON.stringify(currentRawItems));

        // 1. Agrupación por Eje Y (Filas Teóricas)
        items.sort((a, b) => a.y - b.y);
        
        const rowsUnfiltered = [];
        let currentRow = [];
        let currentY = items[0].y;
        
        items.forEach(item => {
            if (Math.abs(item.y - currentY) <= thresholdY) {
                currentRow.push(item);
            } else {
                rowsUnfiltered.push(currentRow);
                currentRow = [item];
                currentY = item.y;
            }
        });
        if (currentRow.length > 0) rowsUnfiltered.push(currentRow);
        
        // 2. Limpieza Temprana
        const isNumeric = (str) => /^[$\s]*[0-9.,]+[$\s]*$/.test(str);
        const validRows = [];
        
        rowsUnfiltered.forEach(rowItems => {
            rowItems.sort((a,b) => a.x - b.x);
            let merged = [];
            let currentItem = rowItems[0];
            
            for(let i = 1; i < rowItems.length; i++) {
                if (Math.abs(rowItems[i].x - (currentItem.x + currentItem.text.length * 5)) < thresholdXMerge) {
                    currentItem.text += " " + rowItems[i].text;
                } else {
                    merged.push(currentItem);
                    currentItem = rowItems[i];
                }
            }
            merged.push(currentItem);
            
            let hasNumbers = merged.some(itm => isNumeric(itm.text));
            if (merged.length < 2 && !hasNumbers) {
                console.log("PDF_Limpieza: Descartando fila ruidosa:", merged.map(m=>m.text).join(" "));
            } else {
                validRows.push(merged);
            }
        });
        
        // 3. Extracción Discreta de Columnas
        let colAnchors = [];
        
        // [Ticket #009] Si hay Anclas Vectoriales (Líneas reales), usarlas como paredes absolutas
        if (window.currentVerticalAnchors && window.currentVerticalAnchors.length > 0) {
            colAnchors = [...window.currentVerticalAnchors];
            console.log("[PDF_EXTRACTOR] 🛡️ Ignorando Dispersión Heurística. Imponiendo Anclas Geométricas:", colAnchors);
        } else {
            let allXs = [];
            validRows.forEach(row => row.forEach(itm => allXs.push(itm.x)));
            allXs.sort((a,b) => a - b);
            
            if (allXs.length > 0) {
                let cx = allXs[0];
                colAnchors.push(cx);
                for(let i=1; i<allXs.length; i++) {
                    if (Math.abs(allXs[i] - cx) > colTolerance) {
                        cx = allXs[i];
                        colAnchors.push(cx);
                    }
                }
            }
        }
        
        // 4. Tabulación Visual
        const finalMatrix = [];
        validRows.forEach(rowItems => {
            let rowPaddded = new Array(colAnchors.length).fill("");
            rowItems.forEach(itm => {
                let bestColIdx = 0;
                let minDist = Infinity;
                colAnchors.forEach((ax, idx) => {
                    let d = Math.abs(itm.x - ax);
                    if (d < minDist) {
                        minDist = d;
                        bestColIdx = idx;
                    }
                });
                
                if (rowPaddded[bestColIdx] !== "") {
                    rowPaddded[bestColIdx] += " " + itm.text;
                } else {
                    rowPaddded[bestColIdx] = itm.text;
                }
            });
            finalMatrix.push(rowPaddded);
        });
        
        if (finalMatrix.length > 0) {
            let headers = colAnchors.map((_, i) => "Columna " + (i + 1));
            finalMatrix.unshift(headers);
        }
        
        console.log(`[PDF_EXTRACTOR] Muestreo Aplicado. Filas Válidas: ${finalMatrix.length}. Columnas detectadas: ${colAnchors.length}`);
        return finalMatrix;
    }

    return {
        loadPdfText,
        applyClustering
    }
})();
