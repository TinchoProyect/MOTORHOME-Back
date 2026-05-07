/**
 * VIEWER ENGINE - Sistema de Gestión de Proveedores
 * Módulo de Visualización, Worker Excel y Herramientas de Mapeo
 * v2.7 (Bindings Fix + Dynamic UI Integration)
 */

console.log("%c 🚀 VIEWER ENGINE: v2.7 - READY ", "background: #8b5cf6; color: #fff; font-weight: bold; padding: 4px;");

// --- 1. VARIABLES GLOBALES (MIGRADO A viewer_core.js) ---
// viewerWorker, currentSheetData, workbook, etc. ahora residen en viewer_core.js


// --- 2. CÓDIGO DEL OBRERO (MIGRADO A viewer_worker.js) ---
// WORKER_CODE ahora es window.WORKER_CODE


// --- 3. FUNCIONES CORE DEL VISOR ---

async function openFileViewer(fileId, fileName, providerId = null, flujoId = null) {
    window.globalContext.fileId = fileId;
    window.globalContext.providerId = providerId; // [V2] PRIVATE CONTEXT INJECTION
    window.globalContext.flujoId = flujoId; // [FLUJOS] Rehydration Trigger

    // [FIX] Resolve Provider Name if not set
    if (providerId && window.currentSuppliers) {
        const provider = window.currentSuppliers.find(p => p.id === providerId);
        if (provider) {
            window.globalContext.providerName = provider.nombre;
            console.log(`[ViewerContext] Resolved Provider: ${provider.nombre}`);
        }
    }

    // UI Elements
    const modal = document.getElementById('viewerModal');
    const loader = document.getElementById('viewerLoader');
    const title = document.getElementById('viewerTitle');
    const badgeContainer = document.getElementById('viewerBadges');

    // Title & Badges
    title.textContent = fileName;
    title.className = "text-sm font-bold text-white tracking-wide opacity-70";

    if (badgeContainer) {
        const type = window.globalContext.fileType || "GENERAL";
        const pName = window.globalContext.providerName || "DESCONOCIDO";
        const badgeColor = type === "LISTA_PRECIOS" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20";
        const badgeIcon = type === "LISTA_PRECIOS" ? "layers" : "folder";

        badgeContainer.innerHTML = `
            <span class="px-2 py-0.5 text-[10px] rounded-full border bg-slate-800 text-slate-300 border-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="building-2" class="w-3 h-3"></i> ${pName}
            </span>
            <span class="px-2 py-0.5 text-[10px] rounded-full border ${badgeColor} uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${type.replace('_', ' ')}
            </span>
        `;
    }
    if (window.lucide) window.lucide.createIcons();

    // [Ticket 1] Forzar el ocultamiento del selector de Flujos Activos en "Pendientes"
    const flowContainer = document.getElementById('activeFlujoContainer');
    if (flowContainer) {
        flowContainer.classList.add('hidden');
        flowContainer.classList.remove('flex');
    }

    // [QA-4] Establecer Flags de Contexto para Pendientes vs Procesados
    // Pendientes = Cualquier archivo de Drive (no es VIRTUAL_DB)
    window.isViewerReadOnly = true; 
    
    // Raw Mode = "Omitir e inicio vacío" (sin flujo)
    window.isRawViewerMode = (!flujoId || flujoId === "CRUDO");

    // Prevenir auto-hidratación V3/V4/flujos si es Raw
    if (window.isRawViewerMode) {
        window.globalContext.flujoId = "CRUDO"; // Forza salida rápida de loadSavedConfiguration
    }

    // Reset Containers
    const excelContainer = document.getElementById('excelContainer');
    const sheetTabs = document.getElementById('sheetTabs');
    const errContainer = document.getElementById('errorContainer');
    const pdfContainer = document.getElementById('pdfContainer');
    const imgContainer = document.getElementById('imageContainer');
    const imgEl = document.getElementById('viewerImage');

    // [QA-HOTFIX] Restaurar botón principal "Ingestar" (Pendientes)
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.remove('hidden');

    // [QA-HOTFIX] Ocultar control explícito de Auditoría
    const btnGlobal = document.getElementById('btnGlobalPreview');
    if (btnGlobal) btnGlobal.classList.add('hidden');

    // Ocultar botones especiales al abrir un nuevo archivo
    const btnMap = document.getElementById('btnMappingMode');
    const btnOffset = document.getElementById('btnOffsetMode');
    const btnCalc = document.getElementById('btnCalcMode');
    const btnSave = document.getElementById('btnSaveConfig');
    const btnSaveFlujo = document.getElementById('btnSaveFlujo');
    const btnReset = document.getElementById('btnResetConfig');

    [btnMap, btnOffset, btnCalc, btnSave, btnSaveFlujo, btnReset].forEach(btn => {
        if (btn) btn.classList.add('hidden');
    });

    if (viewerWorker) {
        viewerWorker.terminate();
        viewerWorker = null;
    }

    currentSheetData = []; window.currentSheetData = currentSheetData;
    if (excelContainer) {
        excelContainer.onscroll = null;
        excelContainer.innerHTML = '';
    }
    if (sheetTabs) sheetTabs.innerHTML = '';

    [excelContainer, sheetTabs, pdfContainer, imgContainer, errContainer].forEach(el => el && el.classList.add('hidden'));
    modal.classList.remove('hidden');
    loader.classList.remove('hidden');

    // Reset Tools
    mappingMode = false;
    columnMapping = {};

    offsetSelectionMode = false;
    currentOffset = null;
    window.endOffsetSelectionMode = false;
    window.currentEndOffset = null;
    
    // [QA-4] Wipe all virtual memory completely
    window.virtualColumns = [];
    window.computedColumns = [];
    window.draftPipelines = {};
    window.sheetConfigStore = {};
    if (window.LayoutManager) window.LayoutManager.reset();
    if (window.ViewerVisibilityManager) window.ViewerVisibilityManager.reset();

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const downloadUrl = `${backendUrl}/api/files/download/${fileId}`;

        const isExcel = fileName.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = fileName.match(/\.pdf$/i);
        const isImg = fileName.match(/\.(jpg|jpeg|png)$/i);

        if (isExcel) {
            // [QA-HOTFIX] En modo Pendientes/Lectura, NO renderizar herramientas ETL avanzadas.
            if (window.ViewerUI && window.ViewerUI.toggleTools) {
                window.ViewerUI.toggleTools(false);
            } else {
                if (btnMap) btnMap.classList.add('hidden');
                if (btnOffset) btnOffset.classList.add('hidden');
                if (btnCalc) btnCalc.classList.add('hidden');
                if (btnSave) btnSave.classList.add('hidden');
                if (btnReset) btnReset.classList.add('hidden');
            }

            // [V4 Fix] Rule Workshop se auto-inicializa ahora.

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error("Error descargando archivo.");
            const arrayBuffer = await response.arrayBuffer();
            window.currentFileBuffer = arrayBuffer; // [Ticket #019] Exponer arrayBuffer para herramienta geométrica
            currentFileBuffer = arrayBuffer;

            // Worker Init
            const blob = new Blob([window.WORKER_CODE], { type: 'application/javascript' });
            viewerWorker = new Worker(URL.createObjectURL(blob));

            const initWatchdog = setTimeout(() => {
                if (useWorker && !currentWorkbook) {
                    console.error("🚨 Worker INIT Timeout (7s).");
                    useWorker = false;
                    viewerWorker.terminate();
                    processLocally(workbook, "Hoja1");
                }
            }, 7000);

            viewerWorker.postMessage({ type: 'INIT_FILE', payload: arrayBuffer });

            viewerWorker.onerror = (e) => {
                clearTimeout(initWatchdog);
                console.error("🚨 Worker Crash:", e);
                useWorker = false;
                e.preventDefault();
                viewerWorker.terminate();
                processLocally(workbook, currentSheetName);
            };

            viewerWorker.onmessage = (e) => {
                clearTimeout(initWatchdog);
                const { type, payload } = e.data;

                if (type === 'SHEETS_READY') {
                    const sheetNames = payload;
                    if (sheetNames.length === 0) throw new Error("Excel vacío.");
                    window.currentSheetList = sheetNames;
                    renderSheetTabs(sheetNames);
                    if (sheetNames.length > 1) sheetTabs.classList.remove('hidden');
                    excelContainer.classList.remove('hidden');
                    loadSheet(sheetNames[0]);
                    loader.classList.add('hidden');
                } else if (type === 'SHEET_DATA_READY') {
                    // [V5.19 UX] Filter out phantom empty rows at the bottom of the Excel file
                    let rawData = payload.data || [];
                    let lastRealRowIndex = rawData.length - 1;

                    while (lastRealRowIndex >= 0) {
                        const row = rawData[lastRealRowIndex];
                        const isEmptyRow = !row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === "");
                        if (!isEmptyRow) break;
                        lastRealRowIndex--;
                    }

                    currentSheetData = rawData.slice(0, lastRealRowIndex + 1);

                    // [Local Override Fix] Inyección de Stamp Determinista de Fila
                    if (currentSheetData && currentSheetData.length > 0) {
                        currentSheetData.forEach((row, idx) => {
                            if (row && typeof row === 'object') row._rowUid = idx;
                        });
                    }

                    console.log(`🛑 [VIGÍA FRONTEND] Filas crudas recibidas: ${rawData.length}, Filas efectivas tras limpieza de fantasmas: ${currentSheetData.length}`);
                    renderVirtualTable(currentSheetData);

                    // [CORRECCIÓN FINAL] INTENTAR CARGAR MEMORIA AUTOMÁTICAMENTE
                    if (window.loadSavedConfiguration && !window._flujoAlreadyLoaded) {
                        window.loadSavedConfiguration().then(ok => {
                            if (ok) {
                                window._flujoAlreadyLoaded = true;
                                console.log("🔄 [ViewerEngine] Worker terminó + Configuración aplicada. Repintando...");
                                renderVirtualTable(currentSheetData);
                            }
                        });
                    }

                } else if (type === 'ERROR') {
                    console.error("Worker Logical Error:", payload);
                    useWorker = false;
                    viewerWorker.terminate();
                    processLocally(workbook, currentSheetName);
                }
            };
        } else if (isPdf) {
            // [UX REQ] Mostrar siempre el PDF primero y desplegar modo de muestreo interactivo
            pdfContainer.src = downloadUrl;
            pdfContainer.classList.remove('hidden');
            excelContainer.classList.add('hidden');
            loader.classList.remove('hidden');

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error("Error descargando archivo PDF.");
            const arrayBuffer = await response.arrayBuffer();
            window.currentFileBuffer = arrayBuffer; // [Ticket #019] Exponer arrayBuffer para herramienta geométrica
            
            // Cargar en memoria el PDF sin tabular aún
            window.PDFExtractor.loadPdfText(arrayBuffer).then(itemCount => {
                loader.classList.add('hidden');
                const panel = document.getElementById('pdfControlsPanel');
                if(panel && window.isViewerReadOnly) panel.classList.remove('hidden');

                // Cargar plantillas del proveedor (Ticket #006)
                const provId = window.globalContext?.providerId || window.currentActiveProviderId;
                if(provId && window.loadPdfTemplates) {
                    window.loadPdfTemplates(provId);
                }
            }).catch(e => {
                console.error("PDF Load Error:", e);
                errContainer.textContent = "Error al leer PDF: " + e.message;
                errContainer.classList.remove('hidden');
                loader.classList.add('hidden');
                pdfContainer.classList.add('hidden');
            });
        } else if (isImg) {
            imgEl.src = downloadUrl;
            imgContainer.classList.remove('hidden');
            loader.classList.add('hidden');
        } else {
            throw new Error("Formato no soportado.");
        }

    } catch (error) {
        console.error(error);
        errContainer.textContent = error.message;
        errContainer.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function loadSheet(sheetName) {
    if (currentSheetName && currentSheetName !== sheetName) {
        saveSheetState(currentSheetName);
    }

    // [FIX] Reset Viewer State REMOVED to prevent Context Loss (Provider Name)
    // if (window.resetViewerState) window.resetViewerState();

    currentSheetName = sheetName; window.currentSheetName = currentSheetName;
    loadSheetState(sheetName);
    renderSheetTabs();

    const excelContainer = document.getElementById('excelContainer');
    if (excelContainer) {
        // [FIX] Ensure container is VISIBLE (resetViewerState might hide it)
        excelContainer.classList.remove('hidden');

        excelContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-64 text-blue-400">
            <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <span class="text-xs font-mono animate-pulse">PROCESANDO...</span>
        </div>`;
    }

    currentSheetData = null;

    // 1. Virtual Cache Support (Multi-Sheet DB Recovery)
    if (window.virtualWorkbookCache && window.virtualWorkbookCache[sheetName]) {
        console.log(`[ViewerEngine] Loading '${sheetName}' from Virtual Cache.`);

        // Hacemos el callback async para poder esperar a la configuración
        setTimeout(async () => {
            let cachedData = window.virtualWorkbookCache[sheetName];

            // CORRECCIÓN CRÍTICA: Convertir Worksheet a Array si es necesario
            if (!Array.isArray(cachedData) && typeof XLSX !== 'undefined') {
                try {
                    currentSheetData = XLSX.utils.sheet_to_json(cachedData, { header: 1 });
                    if (currentSheetData && currentSheetData.length > 0) {
                        currentSheetData.forEach((row, idx) => {
                            if (row && typeof row === 'object') row._rowUid = idx;
                        });
                    }
                } catch (err) {
                    console.error("Error converting sheet to json:", err);
                    currentSheetData = []; window.currentSheetData = currentSheetData;
                }
            } else {
                currentSheetData = cachedData; window.currentSheetData = currentSheetData;
            }

            // 1. Render inicial (crudo)
            renderVirtualTable(currentSheetData);

            // 2. [NUEVO] INTENTAR CARGAR CONFIGURACIÓN GUARDADA 🧠
            if (window.loadSavedConfiguration && !window._flujoAlreadyLoaded) {
                const loaded = await window.loadSavedConfiguration();
                if (loaded) {
                    window._flujoAlreadyLoaded = true;
                    console.log("🔄 [ViewerEngine] Re-pintando tabla con configuración aplicada...");
                    // Volver a pintar para que se vean los colores y el offset aplicado
                    renderVirtualTable(currentSheetData);
                }
            } else if (window._flujoAlreadyLoaded) {
                // Ya se mapeó el store universal, solo asegurarse de repintar
                console.log("🔄 [ViewerEngine] Re-aplicando vista de tab via store pre-cargado...");
                renderVirtualTable(currentSheetData);
            }

            const loader = document.getElementById('viewerLoader');
            if (loader) loader.classList.add('hidden');
        }, 50);
        return;
    }

    // Worker Logic
    if (typeof useWorker !== 'undefined' && useWorker && viewerWorker) {
        viewerWorker.postMessage({ type: 'PARSE_SHEET', payload: sheetName });
        setTimeout(() => {
            if (currentSheetData === null && useWorker && document.getElementById('excelContainer')?.innerHTML.includes('border-t-transparent')) {
                console.warn("Worker timeout. Intentando modo local...");
                processLocally(workbook, sheetName);
            }
        }, 5000);
    } else {
        setTimeout(() => { processLocally(workbook, sheetName); }, 50);
    }
}

const processLocally = (wb, sName) => {
    console.warn("⚠️ Fallback Local activado para: " + sName);
    const excelContainer = document.getElementById('excelContainer');
    if (excelContainer) excelContainer.innerHTML = '<div class="text-xs text-amber-500 p-4">Modo Local Activado...</div>';

    try {
        if (!workbook && wb) workbook = wb;
        if (!workbook && typeof XLSX !== 'undefined' && currentFileBuffer) {
            try { workbook = XLSX.read(currentFileBuffer); } catch (e) { console.error("Fallo lectura buffer:", e); }
        }
        if (!workbook) throw new Error("No se pudo leer el archivo Excel (Fallo total).");

        if ((!sName || sName === "") && workbook.SheetNames.length > 0) {
            sName = workbook.SheetNames[0];
            currentSheetName = sName; window.currentSheetName = currentSheetName;
        }

        const ws = workbook.Sheets[sName];
        if (!ws) throw new Error("Hoja '" + sName + "' no encontrada.");

        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (json && json.length > 0) {
            json.forEach((row, idx) => {
                if (row && typeof row === 'object') row._rowUid = idx;
            });
        }
        currentSheetData = json;
        renderVirtualTable(json);
        const loader = document.getElementById('viewerLoader');
        if (loader) loader.classList.add('hidden');

    } catch (e) {
        console.error("Local Processing Error:", e);
        const errContainer = document.getElementById('errorContainer');
        if (errContainer) {
            errContainer.textContent = "Error Crítico: " + e.message;
            errContainer.classList.remove('hidden');
        }
    }
};

// --- STATE MANAGEMENT ---

function saveSheetState(sheetName) {
    if (!sheetName) return;
    // Guardamos el draftPipelines actual para esta hoja aislando memoria
    sheetConfigStore[sheetName] = {
        offset: window.currentOffset,
        endOffset: window.currentEndOffset,
        pipelines: window.draftPipelines ? JSON.parse(JSON.stringify(window.draftPipelines)) : {},
        colWidths: window.currentColWidths ? JSON.parse(JSON.stringify(window.currentColWidths)) : {},
        virtualCols: window.virtualColumns ? JSON.parse(JSON.stringify(window.virtualColumns)) : [],
        computedCols: window.computedColumns ? JSON.parse(JSON.stringify(window.computedColumns)) : [],
        columnMapping: window.columnMapping ? JSON.parse(JSON.stringify(window.columnMapping)) : {},
        layoutConfig: window.LayoutManager ? window.LayoutManager.serializeSettings() : {},
        visibilityConfig: window.ViewerVisibilityManager ? window.ViewerVisibilityManager.serializeSettings() : {}
    };
}

function loadSheetState(sheetName) {
    window.currentOffset = null;
    window.currentEndOffset = null;
    window.draftPipelines = {};
    window.offsetSelectionMode = false;
    window.endOffsetSelectionMode = false;
    window.currentColWidths = {}; // Global para Drag&Drop Resizer
    window.virtualColumns = []; // Reset V4 Proxy
    window.computedColumns = []; // Reset V5 Computed Cols

    // Variables legacy reset
    window.columnMapping = {};
    window.processingRules = {};

    const config = sheetConfigStore[sheetName];
    if (config) {
        window.currentOffset = config.offset;
        window.currentEndOffset = config.endOffset;
        window.draftPipelines = config.pipelines || {};
        window.currentColWidths = config.colWidths || {};
        window.virtualColumns = config.virtualCols || [];
        window.computedColumns = config.computedCols || [];
        window.columnMapping = config.columnMapping || {};
        
        if (window.LayoutManager && config.layoutConfig) {
            window.LayoutManager.hydrateSettings(config.layoutConfig);
        }
        if (window.ViewerVisibilityManager && config.visibilityConfig) {
            window.ViewerVisibilityManager.hydrateSettings(config.visibilityConfig);
        }
    }
}

function renderSheetTabs(sheetNames) {
    if (sheetNames) window.currentSheetList = sheetNames;
    const list = window.currentSheetList || [];
    const container = document.getElementById('sheetTabs');
    if (!container) return;
    container.innerHTML = '';

    list.forEach((sheetName) => {
        const btn = document.createElement('button');
        const isActive = (sheetName === currentSheetName);
        let baseClass = "px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-lg transition-all border-b-2 flex items-center gap-2 ";
        if (isActive) baseClass += "bg-slate-800 text-white border-blue-500 shadow-md relative z-10 ";
        else baseClass += "bg-slate-900 border-transparent hover:bg-slate-800 opacity-60 hover:opacity-100 ";

        btn.innerHTML = `<span>${sheetName}</span>`;
        btn.className = baseClass;
        btn.onclick = () => { if (currentSheetName !== sheetName) loadSheet(sheetName); };
        container.appendChild(btn);
    });
}

function toggleOffsetMode(isEnd = false) {
    try {
        const t0 = performance.now();
        console.error(`🚨 [VIGÍA DETERMINISTA] toggleOffsetMode(${isEnd}) INICIO`);
        
        if (isEnd) {
            window.endOffsetSelectionMode = !window.endOffsetSelectionMode;
            window.offsetSelectionMode = false;
            const btnEnd = document.getElementById('btnEndOffsetMode');
            const btnStart = document.getElementById('btnOffsetMode');
            if (btnStart) btnStart.classList.remove('bg-amber-600', 'text-white', 'animate-pulse');
            
            if (window.endOffsetSelectionMode) {
                if (window.viewerMapper) window.viewerMapper.cancelMapping();
                if (btnEnd) btnEnd.classList.add('bg-red-600', 'text-white', 'animate-pulse');
            } else {
                if (btnEnd) btnEnd.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
            }
        } else {
            window.offsetSelectionMode = !window.offsetSelectionMode;
            window.endOffsetSelectionMode = false;
            const btnStart = document.getElementById('btnOffsetMode');
            const btnEnd = document.getElementById('btnEndOffsetMode');
            if (btnEnd) btnEnd.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
            
            if (window.offsetSelectionMode) {
                if (window.viewerMapper) window.viewerMapper.cancelMapping();
                if (btnStart) btnStart.classList.add('bg-amber-600', 'text-white', 'animate-pulse');
            } else {
                if (btnStart) btnStart.classList.remove('bg-amber-600', 'text-white', 'animate-pulse');
            }
        }
        
        // Ensure we refer to window.currentSheetData explicitly if 'currentSheetData' local scope is masking it in a module
        const activeData = (typeof currentSheetData !== 'undefined' && currentSheetData) ? currentSheetData : window.currentSheetData;
        console.error(`🚨 [VIGÍA DETERMINISTA] toggleOffsetMode evaluando activeData. Length: ${activeData ? activeData.length : 'NULL'}`);
        
        if (activeData) renderVirtualTable(activeData);
        else console.error(`🚨 [VIGÍA DETERMINISTA] renderVirtualTable NO ejecutado porque activeData es falsy!`);
        
        const t1 = performance.now();
        console.error(`🚨 [VIGÍA DETERMINISTA] toggleOffsetMode COMPLETADO en ${t1 - t0}ms`);
    } catch (e) {
        console.error(`🚨 [VIGÍA FALLA CRÍTICA] toggleOffsetMode CRASHED:`, e);
    }
}

function handleOffsetClick(i, j) {
    try {
        console.error(`🚨 [VIGÍA DETERMINISTA] handleOffsetClick(${i}, ${j}) INICIO. offsetSelectionMode=${window.offsetSelectionMode}`);
        if (window.offsetSelectionMode) {
            window.currentOffset = { row: i, col: j };
            toggleOffsetMode(false);
            saveSheetState(currentSheetName);
            renderSheetTabs();
        } else if (window.endOffsetSelectionMode) {
            window.currentEndOffset = { row: i, col: j };
            toggleOffsetMode(true);
            saveSheetState(currentSheetName);
            renderSheetTabs();
        }
        console.error(`🚨 [VIGÍA DETERMINISTA] handleOffsetClick COMPLETADO`);
    } catch (e) {
        console.error(`🚨 [VIGÍA FALLA CRÍTICA] handleOffsetClick CRASHED:`, e);
    }
}

function toggleSimulationMode() {
    generatePreview();
}

function toggleSimulationRule(colIndex) {
    if (processingRules[colIndex]) {
        const current = processingRules[colIndex].isSimActive !== undefined ? processingRules[colIndex].isSimActive : true;
        processingRules[colIndex].isSimActive = !current;
        generatePreview();
    }
}

function closeSimulationModal() {
    document.getElementById('simulationModal').classList.add('hidden');
}

function closeViewerModal() {
    document.getElementById('viewerModal').classList.add('hidden');
}

// --- 4. EXPOSICIÓN GLOBAL (Bindings) ---
window.openFileViewer = (fileId, fileName, providerId, flujoId) => openFileViewer(fileId, fileName, providerId, flujoId);
window.loadSheet = (sheetName) => loadSheet(sheetName);


// 🔥 BINDINGS FALTANTES CORREGIDOS 🔥
window.toggleOffsetMode = toggleOffsetMode;   // Lo usa el botón HTML
window.handleOffsetClick = handleOffsetClick; // Lo usa el click en celda

window.closeViewerModal = function () {
    closeViewerModal();
    window.resetViewerState(); // [TABULA RASA] - Clean on Exit
};

// Satellite Bindings
window.saveSheetState = saveSheetState;
window.loadSheetState = loadSheetState;
window.renderSheetTabs = renderSheetTabs;
window.toggleSimulationRule = toggleSimulationRule;
window.closeSimulationModal = closeSimulationModal;

// [PHASE 4] Snapshot Export for Ingestion
window.getViewerSnapshot = function () {
    return (typeof currentSheetData !== 'undefined') ? currentSheetData : null;
};

// [PHASE 5] Virtual Workbook Loader (Multi-Sheet DB Recovery)
window.loadVirtualWorkbook = function (workbookMap, fileName, providerName = "DATO HISTÓRICO", flujoId = null, providerId = null, fileId = null) {
    console.log("[ViewerEngine] Loading Virtual Workbook:", fileName, Object.keys(workbookMap), "con Flujo:", flujoId || "N/A");

    // 1. Reset State
    window.resetViewerState();
    
    // [QA-4] Habilitar modo interactivo pleno para Procesados
    window.isViewerReadOnly = false;
    window.isRawViewerMode = false;
    
    // [FLUJOS] Asignar identificador a global context post-reset
    window.globalContext.flujoId = flujoId;

    // 2. Load Data Cache
    const sheetNames = Object.keys(workbookMap);
    window.currentSheetList = sheetNames;
    if (sheetNames.length === 0) {
        console.warn("🚨 VIGÍA DE ALERTA AMARILLA - DATOS NULOS: El archivo virtual cargado está completamente vacío.");
        return;
    }

    // Set Cache & Config
    window.virtualWorkbookCache = workbookMap;
    window.useWorker = false;

    // [FIX] Hydrate Context
    window.globalContext.fileType = "VIRTUAL_DB";
    window.globalContext.providerName = providerName;
    if (providerId) window.globalContext.providerId = providerId;
    if (fileId) window.globalContext.fileId = fileId;
    console.log("[ViewerEngine] Virtual Context Hydrated:", window.globalContext);

    // 3. UI Setup (ESTO VA PRIMERO para que limpie la casa)
    if (window.ViewerUI) {
        window.ViewerUI.updateHeader(fileName, { isProcessed: true });
        window.ViewerUI.showContainer('excel');
        window.ViewerUI.toggleTools(true);
        window.ViewerUI.toggleLoader(false);
    }

    // 4. Force Hide Ingest Button (Es Procesados, no se ingesta)
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.add('hidden');
    
    // [Ticket #013] Asegurar que el Panel de Muestreo PDF se oculte en Procesados
    const pdfPanel = document.getElementById('pdfControlsPanel');
    if (pdfPanel) pdfPanel.classList.add('hidden');

    // [QA-HOTFIX] Asegurar que botón de Auditoría ETL está visible en Procesados
    const btnGlobal = document.getElementById('btnGlobalPreview');
    if (btnGlobal) btnGlobal.classList.remove('hidden');

    // 5. Update Badges manually (AHORA VA AL FINAL para sobrescribir)
    const badgeContainer = document.getElementById('viewerBadges');
    if (badgeContainer) {
        badgeContainer.innerHTML = `
            <span class="px-2 py-0.5 text-[10px] rounded-full border bg-emerald-900/30 text-emerald-400 border-emerald-500/30 uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="database" class="w-3 h-3"></i> BASE DE DATOS
            </span>
             <span class="px-2 py-0.5 text-[10px] rounded-full border bg-slate-800 text-slate-300 border-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="building-2" class="w-3 h-3"></i> ${providerName}
            </span>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    // [QA-3] Inicializar desplegable Header Flujos Activos en Visor Virtual
    const currentProviderId = window.globalContext.providerId || window.currentActiveProviderId;
    if (window.initViewerFlujosContext && currentProviderId) {
        window.initViewerFlujosContext(currentProviderId, flujoId);
    }

    // 6. Render Tabs
    renderSheetTabs(sheetNames);
    if (sheetNames.length > 1) {
        document.getElementById('sheetTabs').classList.remove('hidden');
    }

    // 7. Load First Sheet
    loadSheet(sheetNames[0]);
};

// --- 5. CONTROLES PDF (Ticket #004) ---
window.runPdfSampling = function(preserveOmissions = false) {
    const config = {
        thresholdY: document.getElementById('pdfRangeY')?.value || 6,
        thresholdXMerge: document.getElementById('pdfRangeXMerge')?.value || 8,
        colTolerance: document.getElementById('pdfRangeCol')?.value || 15
    };

    try {
        const matrix = window.PDFExtractor.applyClustering(config);
        
        window.virtualWorkbookCache = window.virtualWorkbookCache || {};
        window.virtualWorkbookCache["PDF_Tabulado"] = matrix;
        if (window.updatePdfUIState) window.updatePdfUIState();
        
        const sheetNames = ["PDF_Tabulado"];
        window.currentSheetList = sheetNames;
        renderSheetTabs(sheetNames);
        const tabsEl = document.getElementById('sheetTabs');
        if (sheetNames.length > 1 && tabsEl) tabsEl.classList.remove('hidden');
        
        currentSheetName = sheetNames[0]; window.currentSheetName = currentSheetName;
        currentSheetData = matrix; window.currentSheetData = currentSheetData;
        if (currentSheetData && currentSheetData.length > 0) {
            currentSheetData.forEach((row, idx) => {
                if (row && typeof row === 'object') row._rowUid = idx;
            });
        }
        
        window.virtualColumns = [];
        window.computedColumns = [];
        window.draftPipelines = {};
        window.columnMapping = {};
        
        // [Ticket #010/#016] Limpiar exclusiones de PDF solo si no se pide preservarlas
        if (!preserveOmissions) {
            window.pdfOmittedColumns = [];
        }

        const pdfCont = document.getElementById('pdfContainer');
        const excelCont = document.getElementById('excelContainer');
        
        // [Ticket #008] Capturar estado de scroll actual (Fijado a excelContainer, no a agGrid)
        const savedScrollY = excelCont ? excelCont.scrollTop : 0;

        if(pdfCont) pdfCont.classList.add('hidden');
        if(excelCont) excelCont.classList.remove('hidden');
        
        // [Ticket #007] Delay render para permitir que el DOM aplique display: block
        setTimeout(() => {
            renderVirtualTable(matrix);
            
            // [Ticket #008] Restaurar estado de scroll nativo
            setTimeout(() => {
                if (excelCont) {
                    excelCont.scrollTop = savedScrollY;
                }
            }, 50); // Leve delay para asegurar que el DOM Virtual se instanció

            if (window.ViewerUI && window.ViewerUI.toggleTools) {
                window.ViewerUI.toggleTools(false);
            }
        }, 10);
    } catch(e) {
        console.error("Error en Muestreo PDF:", e);
        const errContainer = document.getElementById('errorContainer');
        if(errContainer) {
            errContainer.textContent = "Error en muestreo: " + e.message;
            errContainer.classList.remove('hidden');
        }
    }
};

window.purifyPdfMatrix = function() {
    if (!window.currentSheetData || window.currentSheetData.length === 0) {
        Swal.fire({icon: 'warning', title: 'Sin datos', text: 'No hay ninguna matriz cargada para purificar.', background: '#0f172a', color: '#f8fafc'});
        return;
    }

    try {
        let totalCellsCleaned = 0;
        const matrix = window.currentSheetData;
        
        for (let r = 0; r < matrix.length; r++) {
            if (!Array.isArray(matrix[r])) continue;
            for (let c = 0; c < matrix[r].length; c++) {
                let cellText = String(matrix[r][c] || "");
                if (cellText !== "") {
                    let cleanText = cellText.replace(/\r\n|\n|\r/g, " "); // Convertir saltos a espacios
                    cleanText = cleanText.replace(/[\x00-\x1F\x7F-\x9F]/g, ""); // Purgar caracteres de control nulos
                    cleanText = cleanText.trim().replace(/\s+/g, " "); // Colapsar espacios
                    
                    if (cellText !== cleanText) totalCellsCleaned++;
                    matrix[r][c] = cleanText;
                }
            }
        }

        // Forzar guardado en caché si se usó PDF
        if (window.virtualWorkbookCache && window.virtualWorkbookCache["PDF_Tabulado"]) {
             window.virtualWorkbookCache["PDF_Tabulado"] = matrix;
        }

        // Re-renderizar la tabla para mostrar los datos limpios
        if (window.renderVirtualTable) {
            window.renderVirtualTable(matrix);
        }

        Swal.fire({
            icon: 'success', 
            title: 'Matriz purificada al 100% - Formato Excel', 
            text: `Se sanearon ${totalCellsCleaned} celdas que contenían caracteres residuales.`,
            background: '#0f172a', 
            color: '#f8fafc',
            timer: 4000
        });
        
    } catch(e) {
        console.error("Error purificando matriz:", e);
        Swal.fire({icon: 'error', title: 'Fallo de Purificación', text: e.message, background: '#0f172a', color: '#f8fafc'});
    }
};

window.restorePdfVisual = function() {
    const pdfCont = document.getElementById('pdfContainer');
    const excelCont = document.getElementById('excelContainer');
    if(excelCont) excelCont.classList.add('hidden');
    if(pdfCont) pdfCont.classList.remove('hidden');
};

// --- GESTIÓN DE PLANTILLAS PDF (Ticket #006) ---
window.cachedPdfTemplates = [];

window.loadPdfTemplates = async function(providerId) {
    try {
        const response = await fetch(`http://localhost:5655/api/pdf-templates/${providerId}`);
        if(!response.ok) throw new Error("Error obteniendo plantillas");
        const templates = await response.json();
        window.cachedPdfTemplates = templates || [];
        
        const select = document.getElementById('pdfTemplateSelect');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Sin Plantilla --</option>';
        window.cachedPdfTemplates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.template_name + (t.is_default ? ' (Predeterminada)' : '');
            select.appendChild(opt);
        });
        
        if(window.cachedPdfTemplates.length > 0) {
            select.value = window.cachedPdfTemplates[0].id;
            window.loadPdfTemplateData(select.value);
        }
    } catch(e) {
        console.error("[PDF_TEMPLATES] GET Error:", e);
    }
};

window.loadPdfTemplateData = function(templateId) {
    if(!templateId) return;
    const template = window.cachedPdfTemplates.find(t => t.id === templateId);
    if(template) {
        const ySlider = document.getElementById('pdfRangeY');
        const xSlider = document.getElementById('pdfRangeXMerge');
        const colSlider = document.getElementById('pdfRangeCol');
        
        if(ySlider) { ySlider.value = template.threshold_y; document.getElementById('pdfValY').textContent = template.threshold_y + 'px'; }
        if(xSlider) { xSlider.value = template.threshold_x_merge; document.getElementById('pdfValXMerge').textContent = template.threshold_x_merge + 'px'; }
        if(colSlider) { colSlider.value = template.col_tolerance; document.getElementById('pdfValCol').textContent = template.col_tolerance + 'px'; }
        
        // [Ticket #010] Hidratar Columnas Omitidas
        window.pdfOmittedColumns = template.omitted_columns || [];
        
        // [Ticket #013/#017] Auto-ejecutar muestreo preservando exclusiones
        if (window.runPdfSampling) {
            window.runPdfSampling(true);
        }
    }
};

// [Ticket #010] Toggle Omission
window.toggleColumnOmission = function(colIdx) {
    if (!window.pdfOmittedColumns) window.pdfOmittedColumns = [];
    const idxStr = parseInt(colIdx, 10);
    const index = window.pdfOmittedColumns.indexOf(idxStr);
    if (index > -1) {
        window.pdfOmittedColumns.splice(index, 1);
    } else {
        window.pdfOmittedColumns.push(idxStr);
    }
    console.log("[PDF_EXTRACTOR] Columnas omitidas actuales:", window.pdfOmittedColumns);
    if (window.currentSheetData && typeof window.renderVirtualTable === 'function') {
        window.renderVirtualTable(window.currentSheetData);
    }
};

window.promptSavePdfTemplate = async function() {
    const providerId = window.globalContext?.providerId || window.currentActiveProviderId;
    if(!providerId) { console.error("🚨 VIGÍA DE ALERTA ROJA - FALLO DE CONTEXTO: No hay proveedor activo (providerId) para asociar la plantilla PDF."); return; }
    
    // [Ticket #015] Gestión Avanzada CRUD
    const select = document.getElementById('pdfTemplateSelect');
    const selectedTemplateId = select ? select.value : null;
    let selectedTemplateName = "Lista Estándar";
    if (selectedTemplateId && select.options[select.selectedIndex]) {
        selectedTemplateName = select.options[select.selectedIndex].text.replace(' (Predeterminada)', '');
    }

    if (selectedTemplateId) {
        const result = await Swal.fire({
            title: 'Gestión de Plantilla',
            text: `¿Desea actualizar la plantilla "${selectedTemplateName}" o crear una nueva?`,
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Actualizar',
            denyButtonText: 'Guardar como Nueva',
            cancelButtonText: 'Cancelar',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#4f46e5', denyButtonColor: '#059669'
        });

        if (result.isConfirmed) {
            window.executeSavePdfTemplate(selectedTemplateName); // Actualiza la existente por coincidencia de nombre
        } else if (result.isDenied) {
            askNewTemplateName("Nueva Plantilla");
        }
    } else {
        askNewTemplateName("Lista Estándar");
    }
};

async function askNewTemplateName(defaultName) {
    const { value: newName } = await Swal.fire({
        title: 'Guardar Nueva Plantilla',
        input: 'text',
        inputValue: defaultName,
        showCancelButton: true,
        background: '#0f172a', color: '#f8fafc',
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar'
    });
    if (newName) {
        window.executeSavePdfTemplate(newName);
    }
}

window.promptDeletePdfTemplate = async function() {
    const providerId = window.globalContext?.providerId || window.currentActiveProviderId;
    if(!providerId) return;
    
    const select = document.getElementById('pdfTemplateSelect');
    const selectedTemplateId = select ? select.value : null;
    
    if (!selectedTemplateId) {
        Swal.fire({icon: 'warning', title: 'Sin selección', text: 'No hay ninguna plantilla seleccionada para eliminar.', background: '#0f172a', color: '#f8fafc'});
        return;
    }
    
    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar Plantilla?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#0f172a', color: '#f8fafc'
    });
    
    if (isConfirmed) {
        try {
            const res = await fetch(`http://localhost:5655/api/pdf-templates/${selectedTemplateId}`, {
                method: 'DELETE'
            });
            if(!res.ok) throw new Error("Fallo al eliminar en el servidor");
            
            Swal.fire({icon: 'success', title: 'Plantilla eliminada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, background: '#0f172a', color: '#f8fafc'});
            window.pdfOmittedColumns = [];
            window.loadPdfTemplates(providerId);
        } catch (e) {
            Swal.fire({icon: 'error', title: 'Error', text: e.message, background: '#0f172a', color: '#f8fafc'});
        }
    }
};

window.executeSavePdfTemplate = async function(nameToSave) {
    const providerId = window.globalContext?.providerId || window.currentActiveProviderId;
    if(!providerId) return;
    
    const name = nameToSave && typeof nameToSave === 'string' ? nameToSave.trim() : "";
    if(!name) return;
    
    // Backup state
    const currentOmitted = window.pdfOmittedColumns ? [...window.pdfOmittedColumns] : [];
    
    const payload = {
        provider_id: providerId,
        template_name: name,
        threshold_y: document.getElementById('pdfRangeY')?.value || 6,
        threshold_x_merge: document.getElementById('pdfRangeXMerge')?.value || 8,
        col_tolerance: document.getElementById('pdfRangeCol')?.value || 15,
        is_default: true,
        omitted_columns: currentOmitted
    };
    
    try {
        const res = await fetch('http://localhost:5655/api/pdf-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) {
            const errData = await res.json().catch(()=>({}));
            throw new Error(errData.error || "Error al guardar en el servidor");
        }
        
        // Cargar lista actualizada, esperar, y luego forzar el estado visual para evitar Reseteo
        await window.loadPdfTemplates(providerId);
        window.pdfOmittedColumns = currentOmitted;
        if(window.runPdfSampling) window.runPdfSampling(true);
        
        Swal.fire({icon: 'success', title: 'Plantilla guardada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, background: '#0f172a', color: '#f8fafc'});
    } catch(e) {
        Swal.fire({icon: 'error', title: 'Error', text: e.message, background: '#0f172a', color: '#f8fafc'});
    }
};

// --- TICKET #011: LÓGICA DE PANEL DRAGGABLE Y COLAPSABLE ---
window.togglePdfPanelCollapse = function(event) {
    if(event) event.stopPropagation(); // Evitar desencadenar drag
    const body = document.getElementById('pdfControlsBody');
    const icon = document.getElementById('pdfPanelCollapseIcon');
    if(!body || !icon) return;
    
    if(body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        icon.setAttribute('data-lucide', 'minus');
    } else {
        body.classList.add('hidden');
        icon.setAttribute('data-lucide', 'plus');
    }
    if(window.lucide) window.lucide.createIcons();
};

window.initPdfPanelDrag = function(e) {
    if(e.target.tagName === 'BUTTON' || e.target.closest('button')) return; // No arrastrar si se hizo click en un botón
    const panel = document.getElementById('pdfControlsPanel');
    if(!panel) return;
    
    let startX = e.clientX;
    let startY = e.clientY;
    
    // Obtener las coordenadas actuales (puede estar anclado a right/top inicialmente)
    const rect = panel.getBoundingClientRect();
    let currentLeft = rect.left;
    let currentTop = rect.top;
    
    // Cambiar a absolute con left/top explícito para que el drag sea fluido y anular right/bottom
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = currentLeft + 'px';
    panel.style.top = currentTop + 'px';
    panel.style.margin = '0'; // Prevenir que los márgenes jodan el cálculo
    
    const onMouseMove = function(moveEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        
        currentLeft += dx;
        currentTop += dy;
        
        panel.style.left = currentLeft + 'px';
        panel.style.top = currentTop + 'px';
        
        startX = moveEvent.clientX;
        startY = moveEvent.clientY;
    };
    
    const onMouseUp = function() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
};

console.log("✅ VIEWER ENGINE INITIALIZED & EXPOSED");// [Ticket #018] Editor de Geometr�a Manual en PDF
window.openPdfAnchorModal = async function() {
    if (!window.currentFileBuffer) {
        console.error("🚨 VIGÍA DE ALERTA ROJA - FALLO DE SCOPE: No hay un PDF cargado en memoria (window.currentFileBuffer es nulo o indefinido).");
        return;
    }
    const modal = document.getElementById('pdfAnchorModal');
    modal.classList.remove('hidden');

    const canvas = document.getElementById('pdfAnchorCanvas');
    const wrapper = document.getElementById('pdfAnchorWrapper');
    const ctx = canvas.getContext('2d');

    // Clonar las anclas actuales para edici�n
    window._draftAnchors = [...(window.currentVerticalAnchors || [])];

    try {
        const loadingTask = pdfjsLib.getDocument(new Uint8Array(window.currentFileBuffer));
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1); // Renderizar solo p�gina 1 para definir anclas
        const viewport = page.getViewport({ scale: 1.5 }); // Escala 1.5 para mejor visibilidad

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        
        window._pdfAnchorViewport = viewport; // Guardar viewport para c�lculos inversos

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        await page.render(renderContext).promise;
        
        window._pdfAnchorBaseImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        window.redrawPdfAnchors();

        // [Ticket #019] Drag and Drop Listeners
        let isDragging = false;
        let draggedAnchorIndex = -1;
        let dragStartX = -1;
        const tolerance = 8;

        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const logicalX = Math.round(mouseX / viewport.scale);

            if (isDragging && draggedAnchorIndex !== -1) {
                window._draftAnchors[draggedAnchorIndex] = logicalX;
                window.redrawPdfAnchors();
                return;
            }

            // Hover effect
            let hovering = false;
            for (let i = 0; i < window._draftAnchors.length; i++) {
                if (Math.abs(window._draftAnchors[i] - logicalX) <= tolerance) {
                    hovering = true;
                    break;
                }
            }
            canvas.style.cursor = hovering ? 'ew-resize' : 'crosshair';
        };

        canvas.onmousedown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const logicalX = Math.round(mouseX / viewport.scale);

            for (let i = 0; i < window._draftAnchors.length; i++) {
                if (Math.abs(window._draftAnchors[i] - logicalX) <= tolerance) {
                    isDragging = true;
                    draggedAnchorIndex = i;
                    dragStartX = logicalX;
                    break;
                }
            }
        };

        canvas.onmouseup = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const logicalX = Math.round(mouseX / viewport.scale);

            if (isDragging) {
                // Si casi no se movió, lo interpretamos como un clic para eliminar
                if (Math.abs(logicalX - dragStartX) < 2) {
                    window._draftAnchors.splice(draggedAnchorIndex, 1);
                } else {
                    // Terminó de arrastrar
                    window._draftAnchors.sort((a,b) => a - b);
                }
                isDragging = false;
                draggedAnchorIndex = -1;
                window.redrawPdfAnchors();
                return;
            }
        };

        // [TICKET #034] Opción B: Doble Clic para crear una nueva ancla
        canvas.ondblclick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const logicalX = Math.round(mouseX / viewport.scale);

            // Evitar crear un ancla nueva si hacemos doble clic justo encima de una existente
            let isOverlapping = false;
            for (let i = 0; i < window._draftAnchors.length; i++) {
                if (Math.abs(window._draftAnchors[i] - logicalX) <= tolerance) {
                    isOverlapping = true;
                    break;
                }
            }

            if (!isOverlapping) {
                window._draftAnchors.push(logicalX);
                window._draftAnchors.sort((a,b) => a - b);
                window.redrawPdfAnchors();
                console.log(`[UX FIX] Nueva ancla vertical inyectada en posición X: ${logicalX}`);
            }
        };
        canvas.onmouseleave = () => {
            if (isDragging) {
                isDragging = false;
                draggedAnchorIndex = -1;
                window._draftAnchors.sort((a,b) => a - b);
                window.redrawPdfAnchors();
            }
        };

        canvas.oncontextmenu = (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const logicalX = Math.round(mouseX / viewport.scale);

            for (let i = 0; i < window._draftAnchors.length; i++) {
                if (Math.abs(window._draftAnchors[i] - logicalX) <= tolerance) {
                    window._draftAnchors.splice(i, 1);
                    window.redrawPdfAnchors();
                    break;
                }
            }
            return false;
        };

    } catch (e) {
        console.error("Error renderizando Canvas PDF:", e);
        console.error("🚨 VIGÍA DE ALERTA ROJA - ERROR DE RENDERIZADO: Fallo al intentar renderizar el documento PDF en el Canvas de anclas manuales.");
    }
};

window.redrawPdfAnchors = function() {
    const canvas = document.getElementById('pdfAnchorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Restaurar base PDF
    if (window._pdfAnchorBaseImage) {
        ctx.putImageData(window._pdfAnchorBaseImage, 0, 0);
    }

    const scale = window._pdfAnchorViewport ? window._pdfAnchorViewport.scale : 1.5;

    // Dibujar l�neas
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(220, 38, 38, 0.8)"; // Red
    ctx.setLineDash([5, 3]);

    (window._draftAnchors || []).forEach(logicalX => {
        const visualX = logicalX * scale;
        ctx.beginPath();
        ctx.moveTo(visualX, 0);
        ctx.lineTo(visualX, canvas.height);
        ctx.stroke();
    });
    ctx.setLineDash([]);
};

window.closePdfAnchorModal = function() {
    const modal = document.getElementById('pdfAnchorModal');
    if (modal) modal.classList.add('hidden');
};

window.savePdfAnchors = function() {
    window.currentVerticalAnchors = [...window._draftAnchors];
    console.log("Anclas Manuales Aplicadas:", window.currentVerticalAnchors);
    window.closePdfAnchorModal();
    if (window.runPdfSampling) {
        window.runPdfSampling();
    }
};
