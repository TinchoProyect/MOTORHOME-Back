// viewer_ocr_listas.js - Satélite OCR para Listas de Precios (Imágenes)
console.log("%c 🖼️ VISOR OCR LISTAS: READY ", "background: #4f46e5; color: #fff; font-weight: bold; padding: 4px;");

window.currentVisorOcrZoom = 1;
window.ocrGridInstance = null;
window.currentOcrProviderId = null;
window.currentOcrFileId = null;
window.currentOcrFileName = null;

// ==========================
// Controles de Zoom
// ==========================
window.zoomVisorOcr = function(delta) {
    window.currentVisorOcrZoom += delta;
    if (window.currentVisorOcrZoom < 0.5) window.currentVisorOcrZoom = 0.5;
    if (window.currentVisorOcrZoom > 4) window.currentVisorOcrZoom = 4;
    const img = document.getElementById('imgOcrOriginal');
    if (!img) return;
    const tx = img.dataset.tx || 0;
    const ty = img.dataset.ty || 0;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorOcrZoom})`;
};

window.resetZoomVisorOcr = function() {
    window.currentVisorOcrZoom = 1;
    const img = document.getElementById('imgOcrOriginal');
    if (img) {
        img.style.transform = `translate(0px, 0px) scale(1)`;
        img.dataset.tx = 0;
        img.dataset.ty = 0;
    }
};

// ==========================
// Control de Visor
// ==========================
window.closeVisorOcrListas = function() {
    const modal = document.getElementById('visorOcrListasModal');
    if (modal) modal.classList.add('hidden');
    if (window.ocrGridInstance) {
        window.ocrGridInstance.destroy();
        window.ocrGridInstance = null;
    }
};

window.openVisorOcrListas = async function(fileId, fileName, providerId) {
    const modal = document.getElementById('visorOcrListasModal');
    const img = document.getElementById('imgOcrOriginal');
    const sub = document.getElementById('visorOcrListasSub');
    const btnSave = document.getElementById('btn_save_ocr_listas');
    const badge = document.getElementById('ocr_status_badge');
    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    if (!modal || !img || !sub) return;

    window.currentOcrProviderId = providerId;
    window.currentOcrFileId = fileId; // Puede ser un String o un Array
    window.currentOcrFileName = fileName;
    
    const firstFileId = Array.isArray(fileId) ? fileId[0] : fileId;

    // Resetear Grilla
    if (window.ocrGridInstance) {
        window.ocrGridInstance.destroy();
        window.ocrGridInstance = null;
    }
    document.getElementById('ocr_grid_container').innerHTML = '';

    // Resetear Botón de Secuencia
    const seqBtn = document.querySelector('button[onclick="window.processFullOcrSequence()"]');
    if (seqBtn) {
        seqBtn.disabled = false;
        seqBtn.innerHTML = '<i data-lucide="play" class="w-3 h-3"></i> Ejecutar Secuencia';
    }

    // Cargar UI
    sub.textContent = `${fileName} - Procesando...`;
    img.style.display = 'none';
    img.src = ''; // Clear prev
    btnSave.disabled = true;
    btnSave.classList.add('cursor-not-allowed', 'opacity-50', 'grayscale');
    
    // Inject Spinner in Blocks Panel
    const listContainer = document.getElementById('ocr_sections_list');
    if (listContainer) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full py-10 text-indigo-500/50 animate-pulse">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin mb-3"></i>
                <p class="text-xs font-bold uppercase tracking-widest text-center">Detectando<br>Sectores Visuales...</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }
    badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
    badge.textContent = 'EXTRAYENDO IA...';
    modal.classList.remove('hidden');

    if (window.Swal) {
        Swal.fire({
            title: 'Motor Chofer IA (Vision)',
            html: 'Convirtiendo imagen desestructurada a tabla...<br><span class="text-xs text-indigo-400 mt-2 block">Esto puede tardar unos segundos.</span>',
            allowOutsideClick: false,
            background: '#0f172a',
            color: '#f8fafc',
            customClass: { 
                popup: 'border border-indigo-500/50 shadow-[0_0_40px_rgba(79,70,229,0.2)] rounded-2xl',
                container: 'z-[9999]'
            },
            didOpen: () => { Swal.showLoading() }
        });
    }

    // 1. Cargar la imagen usando el Proxy (para mostrarla visualmente en el panel izquierdo)
    const proxyUrl = `${backendUrl}/api/facturas/pdf/${firstFileId}?name=${encodeURIComponent(fileName)}`;
    img.src = proxyUrl;
    img.style.display = 'block';
    window.resetZoomVisorOcr();

    // Setup Dragging for Image
    let isDragging = false;
    let startX, startY;
    
    // Clear old listeners by replacing element if needed, or just handle multiple binds carefully.
    // For simplicity, using one-time binding pattern or anonymous isn't ideal but works if handled carefully.
    img.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX - parseFloat(img.dataset.tx || 0);
        startY = e.clientY - parseFloat(img.dataset.ty || 0);
        e.preventDefault(); 
    };
    window.onmouseup = () => { isDragging = false; };
    window.onmousemove = (e) => {
        if (!isDragging) return;
        const tx = e.clientX - startX;
        const ty = e.clientY - startY;
        img.dataset.tx = tx;
        img.dataset.ty = ty;
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorOcrZoom})`;
    };
    const wrapper = document.getElementById('visorOcrZoomWrapper');
    wrapper.onwheel = (e) => {
        e.preventDefault();
        window.zoomVisorOcr(e.deltaY > 0 ? -0.1 : 0.1);
    };

    // 2. Extraer Índice Estructural con el nuevo endpoint
    try {
        const res = await fetch(`${backendUrl}/api/ai/ocr-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, fileId, fileName, action: 'index' })
        });
        
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Fallo en extracción OCR IA (Fase 1)");
        
        const data = json.data; // { secciones: [...] }
        const secciones = data.secciones || [];

        if (window.Swal) Swal.close();
        sub.textContent = `${fileName} - Mapeo Completado`;
        
        badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        badge.textContent = `LISTO (${secciones.length} SECTORES)`;
        
        btnSave.disabled = false;
        btnSave.classList.remove('cursor-not-allowed', 'opacity-50', 'grayscale');

        // Inicializar AG Grid Vacía y pasar el esquema custom (si existe)
        const customSchema = data.customSchema || null;
        initOcrGrid([], customSchema);
        
        // Renderizar Sectores
        renderOcrIndex(secciones);

    } catch (e) {
        console.error(e);
        if (window.Swal) {
            Swal.fire({
                title: 'Error de Extracción',
                text: e.message,
                icon: 'error',
                background: '#0f172a',
                color: '#f8fafc'
            });
        }
        badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30';
        badge.textContent = 'FALLÓ';
        document.getElementById('ocr_sections_list').innerHTML = '<div class="text-[10px] text-red-500 text-center mt-10">Error de mapeo estructural.</div>';
    }
};

function renderOcrIndex(secciones) {
    const container = document.getElementById('ocr_sections_list');
    container.innerHTML = '';
    
    if (secciones.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-slate-500 text-center mt-10">No se detectaron sectores.</div>';
        return;
    }

    secciones.forEach((sec, idx) => {
        const secName = sec.nombre || '';
        const safeName = secName.replace(/'/g, "\\'");
        
        const div = document.createElement('div');
        div.className = 'bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 transition-all hover:border-indigo-500/50 group';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">${secName || 'Desconocido'}</span>
                <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">${sec.filas_estimadas || '?'} filas</span>
            </div>
            <button data-section="${secName}" data-filas="${sec.filas_estimadas || 0}" onclick="window.extractOcrSection('${safeName}', this)" class="w-full mt-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 hover:border-indigo-500 px-3 py-1.5 rounded transition-all text-[10px] font-bold flex items-center justify-center gap-2 extract-section-btn">
                <i data-lucide="scan-text" class="w-3 h-3"></i> Extraer Sección
            </button>
        `;
        container.appendChild(div);
    });
    if (window.lucide) lucide.createIcons();
}

window.processFullOcrSequence = async function() {
    const buttons = document.querySelectorAll('.extract-section-btn');
    const total = buttons.length;
    let count = 0;
    
    if (total === 0) return;

    // Deshabilitar temporalmente el botón de secuencia
    const seqBtn = document.querySelector('button[onclick="window.processFullOcrSequence()"]');
    if (seqBtn) {
        seqBtn.disabled = true;
        seqBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Ejecutando Secuencia...';
        if (window.lucide) lucide.createIcons();
    }

    // Iterar secuencialmente usando for...of (procesa solo pendientes)
    for (let btn of buttons) {
        // Verifica que siga siendo el botón de "Extraer Sección" (no "Reprocesar")
        if (btn.innerHTML.includes('Extraer Sección') && !btn.disabled) {
            const sectionName = btn.getAttribute('data-section');
            if (sectionName) {
                // Hacer scroll hasta el botón actual
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Extraer de forma sincrónica esperando al modelo
                await window.extractOcrSection(sectionName, btn);
                count++;
            }
        }
    }

    if (seqBtn) {
        seqBtn.disabled = false;
        seqBtn.innerHTML = '<i data-lucide="check-check" class="w-3 h-3 text-emerald-400"></i> Secuencia Finalizada';
        setTimeout(() => {
            seqBtn.innerHTML = '<i data-lucide="play" class="w-3 h-3"></i> Ejecutar Secuencia';
            if (window.lucide) lucide.createIcons();
        }, 3000);
        if (window.lucide) lucide.createIcons();
    }
    
    if (count > 0 && window.Swal) {
        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'success',
            title: `Se procesaron automáticamente ${count} bloques pendientes.`,
            showConfirmButton: false,
            timer: 3000,
            background: '#1e293b', color: '#f8fafc'
        });
    }
};

window.extractOcrSection = async function(sectionName, btnEl) {
    if (!sectionName) return;
    
    const filasEstimadas = btnEl ? parseInt(btnEl.getAttribute('data-filas')) || 0 : 0;
    
    // UI Feedback
    const originalHtml = btnEl.innerHTML;
    btnEl.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Extrayendo...';
    btnEl.disabled = true;
    btnEl.classList.add('opacity-50', 'cursor-not-allowed');
    if (window.lucide) lucide.createIcons();

    // Lógica de Reprocesamiento: Purgar filas anteriores del sector
    if (window.ocrGridInstance) {
        window.ocrGridInstance.showLoadingOverlay();
        const rowsToRemove = [];
        window.ocrGridInstance.forEachNode(node => {
            if (node.data && node.data.sector === sectionName) {
                rowsToRemove.push(node.data);
            }
        });
        if (rowsToRemove.length > 0) {
            window.ocrGridInstance.applyTransaction({ remove: rowsToRemove });
        }
    }

    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    try {
        const res = await fetch(`${backendUrl}/api/ai/ocr-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                providerId: window.currentOcrProviderId, 
                fileId: window.currentOcrFileId, 
                fileName: window.currentOcrFileName, 
                action: 'section',
                targetSection: sectionName,
                filasEstimadas: filasEstimadas
            })
        });
        
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Fallo en extracción quirúrgica");
        
        const data = json.data; // { productos: [...] }
        const newRows = data.productos || [];

        if (window.ocrGridInstance) {
            window.ocrGridInstance.hideOverlay();
            window.ocrGridInstance.applyTransaction({ add: newRows });
            
            // Actualizar badge con el total de filas
            const totalRows = window.ocrGridInstance.getDisplayedRowCount();
            const badge = document.getElementById('ocr_status_badge');
            if (badge) {
                badge.textContent = `TOTAL: ${totalRows} ÍTEMS`;
            }
        }

        // Transformar en botón de "Reprocesar"
        btnEl.innerHTML = '<i data-lucide="refresh-cw" class="w-3 h-3"></i> Reprocesar';
        btnEl.disabled = false;
        btnEl.className = 'w-full mt-1 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/30 hover:border-amber-500 px-3 py-1.5 rounded transition-all text-[10px] font-bold flex items-center justify-center gap-2';

    } catch (e) {
        console.error(e);
        Swal.fire({
            icon: 'error', title: 'Error',
            text: e.message,
            background: '#0f172a', color: '#f8fafc',
            customClass: { container: 'z-[9999]' }
        });
        btnEl.innerHTML = originalHtml;
        btnEl.disabled = false;
        btnEl.classList.remove('opacity-50', 'cursor-not-allowed');
        if (window.ocrGridInstance) {
            window.ocrGridInstance.hideOverlay();
        }
    }
    if (window.lucide) lucide.createIcons();
};

// ==========================
// Lógica AG-Grid
// ==========================
function initOcrGrid(rowData, customSchema = null) {
    let priceColumns = [
        { field: 'precio_kilo', headerName: 'Precio x KG', editable: true, flex: 1,
          valueParser: params => Number(params.newValue),
          valueFormatter: params => params.value ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(params.value)) : '$ 0,00' },
        { field: 'precio_unitario', headerName: 'Precio Final', editable: true, flex: 1,
          valueParser: params => Number(params.newValue),
          valueFormatter: params => params.value ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(params.value)) : '$ 0,00' }
    ];

    // Mapeo Dinámico si el proveedor definió columnas customizadas
    if (customSchema && customSchema.columns && Array.isArray(customSchema.columns)) {
        priceColumns = customSchema.columns.map(c => {
            const isPrice = c.field.toLowerCase().includes('precio');
            
            return {
                field: c.field,
                headerName: c.headerName || c.field,
                editable: true,
                flex: 1,
                valueParser: params => {
                    const val = String(params.newValue).replace(/[^\d.,-]/g, '');
                    if (!val) return 0;
                    const lastDot = val.lastIndexOf('.');
                    const lastComma = val.lastIndexOf(',');
                    let floatVal = 0;
                    if (lastDot > lastComma && lastComma !== -1) floatVal = parseFloat(val.replace(/,/g, ''));
                    else if (lastComma > lastDot && lastDot !== -1) floatVal = parseFloat(val.replace(/\./g, '').replace(',', '.'));
                    else floatVal = parseFloat(val.replace(/,/g, '.'));
                    return isNaN(floatVal) ? 0 : floatVal;
                },
                valueFormatter: params => {
                    const num = Number(params.value);
                    if (isNaN(num) || num === 0 && !params.value) return isPrice ? '$ 0,00' : '0';
                    
                    if (isPrice) {
                        return new Intl.NumberFormat('es-AR', { 
                            style: 'currency', 
                            currency: 'ARS',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(num);
                    } else {
                        // Magnitud física limpia
                        return new Intl.NumberFormat('es-AR', { 
                            minimumFractionDigits: 0, 
                            maximumFractionDigits: 4 
                        }).format(num);
                    }
                }
            };
        });
    }

    const gridOptions = {
        rowData: rowData,
        columnDefs: [
            { field: 'sector', headerName: 'Sector', editable: true, flex: 1 },
            { field: 'codigo', headerName: 'Código', editable: true, flex: 1, cellEditor: 'agTextCellEditor' },
            { field: 'descripcion', headerName: 'Descripción', editable: true, flex: 2, cellEditor: 'agLargeTextCellEditor' },
            { field: 'presentacion', headerName: 'Presentación', editable: true, flex: 1 },
            ...priceColumns
        ],
        defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true
        },
        theme: "legacy",
        animateRows: true,
        stopEditingWhenCellsLoseFocus: true
    };

    const eGridDiv = document.querySelector('#ocr_grid_container');
    window.ocrGridInstance = agGrid.createGrid(eGridDiv, gridOptions);
}

// ==========================
// Generador de Códigos Determinista
// ==========================
window.generateOcrCodes = function() {
    if (!window.ocrGridInstance) return;

    // Función de Hash cyrb53 (rápida, determinista y bajo índice de colisión)
    const cyrb53 = (str, seed = 0) => {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for(let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };

    const rowUpdates = [];
    window.ocrGridInstance.forEachNode(node => {
        const data = node.data;
        // Solo generamos si no tiene código (o si queremos forzarlo, lo pisamos)
        if (!data.codigo || data.codigo.trim() === '') {
            // Usamos descripción y presentación como base semántica para el hash
            const baseStr = `${data.descripcion || ''}_${data.presentacion || ''}`.toUpperCase().trim();
            if (baseStr.length > 1) {
                // Generar hash numérico y convertirlo a string base36 para hacerlo alfanumérico corto
                const hashNum = cyrb53(baseStr);
                data.codigo = `OCR-${hashNum.toString(36).toUpperCase()}`;
                rowUpdates.push(data);
            }
        }
    });

    if (rowUpdates.length > 0) {
        window.ocrGridInstance.applyTransaction({ update: rowUpdates });
        
        if (window.Swal) {
            Swal.fire({
                toast: true,
                position: 'bottom-end',
                icon: 'success',
                title: `Se generaron ${rowUpdates.length} códigos únicos.`,
                showConfirmButton: false,
                timer: 2000,
                background: '#1e293b', color: '#f8fafc'
            });
        }
    } else {
        if (window.Swal) {
            Swal.fire({
                toast: true,
                position: 'bottom-end',
                icon: 'info',
                title: `No hay filas sin código para procesar.`,
                showConfirmButton: false,
                timer: 2000,
                background: '#1e293b', color: '#f8fafc'
            });
        }
    }
};


// ==========================
// Consolidación a Excel
// ==========================
window.saveOcrListas = async function() {
    if (!window.ocrGridInstance) return;

    if (!window.Swal) return;
    
    const result = await Swal.fire({
        title: '¿Ingestar Datos?',
        text: "Los datos validados serán ingresados directamente en la base de datos central, y el documento origen pasará a Procesados.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Ingestar',
        cancelButtonText: 'Cancelar',
        background: '#1e293b', color: '#f8fafc',
        customClass: { container: 'z-[9999]' }
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'Ingestando...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); },
        customClass: { container: 'z-[9999]' }
    });

    try {
        // 1. Extraer datos de la grilla
        const rowData = [];
        window.ocrGridInstance.forEachNode(node => rowData.push(node.data));

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        // 2. Ingestar Inmediatamente en Tabla Maestra y Mover a Procesados (Usando imagen original)
        // Eliminamos el paso intermedio de crear un archivo Excel basura. 
        // Pasamos directamente el ID de la imagen escaneada para mantener la trazabilidad.
        const confirmRes = await fetch(`${backendUrl}/api/files/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileId: window.currentOcrFileId, // Enviamos directamente el ID de la imagen original
                providerId: window.currentOcrProviderId,
                dataSnapshot: rowData
            })
        });

        const confirmData = await confirmRes.json();
        if (!confirmRes.ok || !confirmData.success) {
            throw new Error(confirmData.error || "Error durante la Ingesta de Datos en la Base de Datos.");
        }

        // 7. Finalizar
        window.closeVisorOcrListas();
        
        Swal.fire({
            icon: 'success', title: 'Ingesta Completa',
            text: 'La tabla ha sido guardada en Drive y Procesada.',
            background: '#1e293b', color: '#f8fafc',
            timer: 3000, showConfirmButton: false,
            customClass: { container: 'z-[9999]' }
        });
        
        // Refrescar el explorador de archivos para mostrar cambios (si está en la UI actual)
        if (window.exploreSupplierFiles && typeof window.loadProcessedFiles === 'function') {
            window.loadProcessedFiles(); // Refresca pestaña Procesados
        }

    } catch (e) {
        console.error("Error al ingestar OCR:", e);
        Swal.fire('Error', 'No se pudo ingestar el archivo: ' + e.message, 'error');
    }
};

// ==========================
// Lógica de Redimensionamiento (Splitters)
// ==========================
function initOcrSplitters() {
    const layout = document.getElementById('visorOcrLayoutContainer');
    const panelLeft = document.getElementById('visorOcrPanelLeft');
    const panelMiddle = document.getElementById('visorOcrPanelMiddle');
    const panelRight = document.getElementById('visorOcrPanelRight');
    const splitter1 = document.getElementById('visorOcrSplitter1');
    const splitter2 = document.getElementById('visorOcrSplitter2');
    
    if (!layout || !splitter1 || !splitter2) return;

    let isDragging1 = false;
    let isDragging2 = false;

    splitter1.addEventListener('mousedown', (e) => {
        isDragging1 = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    splitter2.addEventListener('mousedown', (e) => {
        isDragging2 = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging1 && !isDragging2) return;
        
        const containerWidth = layout.getBoundingClientRect().width;
        
        if (isDragging1) {
            // Calcula el nuevo porcentaje para el panel izquierdo
            let newLeftPct = (e.clientX / containerWidth) * 100;
            if (newLeftPct < 15) newLeftPct = 15;
            if (newLeftPct > 60) newLeftPct = 60;
            panelLeft.style.width = `${newLeftPct}%`;
        }
        
        if (isDragging2) {
            // Calcula el porcentaje para el panel del medio basándose en la posición del splitter2
            const leftWidth = panelLeft.getBoundingClientRect().width;
            let newMiddlePct = ((e.clientX - leftWidth) / containerWidth) * 100;
            if (newMiddlePct < 10) newMiddlePct = 10;
            if (newMiddlePct > 40) newMiddlePct = 40;
            panelMiddle.style.width = `${newMiddlePct}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging1 = false;
        isDragging2 = false;
        document.body.style.cursor = '';
    });
}

// Inicializar splitters una vez cargado el DOM o la función
document.addEventListener("DOMContentLoaded", initOcrSplitters);
// Llama directo por si se inyecta dinámicamente
initOcrSplitters();

// ==========================
// MOTOR DE FÓRMULAS DINÁMICAS (JIT MATH ENGINE)
// ==========================

window.openCalculatedFieldModal = function() {
    if (!window.ocrGridInstance) {
        if (window.Swal) Swal.fire({ icon: 'warning', title: 'Grilla Vacía', text: 'No hay datos extraídos para aplicar fórmulas.', background: '#0f172a', color: '#fff' });
        return;
    }

    // Poblar el Select de Columnas Base
    const select = document.getElementById('calcFieldBase');
    select.innerHTML = '<option value="">-- Seleccione Columna --</option>';
    
    // Obtenemos las columnas actuales de la grilla (evitando las de sistema)
    const cols = window.ocrGridInstance.getColumnDefs();
    cols.forEach(c => {
        if (!['sector', 'codigo', 'descripcion', 'presentacion'].includes(c.field)) {
            const option = document.createElement('option');
            option.value = c.field;
            option.textContent = c.headerName || c.field;
            select.appendChild(option);
        }
    });

    document.getElementById('calcFieldName').value = '';
    document.getElementById('calcFieldFormula').value = '';
    document.getElementById('ocrCalcFieldModal').classList.remove('hidden');
};

window.closeCalculatedFieldModal = function() {
    document.getElementById('ocrCalcFieldModal').classList.add('hidden');
};

window.applyCalculatedField = function() {
    const name = document.getElementById('calcFieldName').value.trim();
    const baseCol = document.getElementById('calcFieldBase').value;
    const formulaStr = document.getElementById('calcFieldFormula').value.trim();

    if (!name || !baseCol || !formulaStr) {
        if (window.Swal) Swal.fire({ icon: 'error', title: 'Faltan Datos', text: 'Debe completar todos los campos.', background: '#0f172a', color: '#fff' });
        return;
    }

    // Sanitización y creación segura del evaluador (JIT)
    let safeFormula;
    try {
        // Reemplazamos BASE por la variable para la evaluación.
        // Validamos que la fórmula solo contenga caracteres matemáticos y la palabra BASE.
        const cleanFormula = formulaStr.replace(/BASE/g, 'BASE').replace(/[^\d\.\+\-\*\/\(\)\sBASE]/g, '');
        safeFormula = new Function('BASE', `return ${cleanFormula};`);
        
        // Test rápido de sanidad
        safeFormula(10);
    } catch (e) {
        if (window.Swal) Swal.fire({ icon: 'error', title: 'Fórmula Inválida', text: 'La sintaxis matemática es incorrecta.', background: '#0f172a', color: '#fff' });
        return;
    }

    // 1. Añadir nueva Columna Dinámica a la configuración de la grilla
    const fieldId = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    let currentCols = window.ocrGridInstance.getColumnDefs();
    
    const isPrice = name.toLowerCase().includes('precio');
    
    currentCols.push({
        field: fieldId,
        headerName: name + ' (Calc)',
        editable: true,
        flex: 1,
        valueParser: params => {
            const val = String(params.newValue).replace(/[^\d.,-]/g, '');
            if (!val) return 0;
            const lastDot = val.lastIndexOf('.');
            const lastComma = val.lastIndexOf(',');
            let floatVal = 0;
            if (lastDot > lastComma && lastComma !== -1) floatVal = parseFloat(val.replace(/,/g, ''));
            else if (lastComma > lastDot && lastDot !== -1) floatVal = parseFloat(val.replace(/\./g, '').replace(',', '.'));
            else floatVal = parseFloat(val.replace(/,/g, '.'));
            return isNaN(floatVal) ? 0 : floatVal;
        },
        valueFormatter: params => {
            const num = Number(params.value);
            if (isNaN(num) || num === 0 && !params.value) return isPrice ? '$ 0,00' : '0';
            
            if (isPrice) {
                return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
            } else {
                return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(num);
            }
        }
    });
    
    if (typeof window.ocrGridInstance.setGridOption === 'function') {
        window.ocrGridInstance.setGridOption('columnDefs', currentCols);
    } else if (typeof window.ocrGridInstance.updateGridOptions === 'function') {
        window.ocrGridInstance.updateGridOptions({ columnDefs: currentCols });
    } else if (typeof window.ocrGridInstance.setColumnDefs === 'function') {
        window.ocrGridInstance.setColumnDefs(currentCols);
    } else if (window.ocrGridInstance.api && typeof window.ocrGridInstance.api.setColumnDefs === 'function') {
        window.ocrGridInstance.api.setColumnDefs(currentCols);
    } else {
        console.warn('LAMDA [AG-Grid] fallback total: reinicializando grilla para aplicar columnas');
    }

    // 2. Aplicar la fórmula a todas las filas
    let rowData = [];
    window.ocrGridInstance.forEachNode(node => {
        let baseValue = parseFloat(node.data[baseCol]);
        if (isNaN(baseValue)) baseValue = 0;
        
        let calcValue = 0;
        try {
            calcValue = safeFormula(baseValue);
            if (isNaN(calcValue) || !isFinite(calcValue)) calcValue = 0;
        } catch(e) { calcValue = 0; }
        
        node.data[fieldId] = calcValue;
        rowData.push(node.data);
    });

    if (typeof window.ocrGridInstance.setGridOption === 'function') {
        window.ocrGridInstance.setGridOption('rowData', rowData);
    } else if (typeof window.ocrGridInstance.updateGridOptions === 'function') {
        window.ocrGridInstance.updateGridOptions({ rowData: rowData });
    } else if (typeof window.ocrGridInstance.setRowData === 'function') {
        window.ocrGridInstance.setRowData(rowData);
    } else if (window.ocrGridInstance.api && typeof window.ocrGridInstance.api.setRowData === 'function') {
        window.ocrGridInstance.api.setRowData(rowData);
    }
    
    window.closeCalculatedFieldModal();
    
    if (window.Swal) Swal.fire({ icon: 'success', title: 'Fórmula Inyectada', toast: true, position: 'bottom-end', showConfirmButton: false, timer: 2000, background: '#0f172a', color: '#fff' });
};
