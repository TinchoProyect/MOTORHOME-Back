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

    currentSheetData = [];
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
            pdfContainer.src = downloadUrl;
            pdfContainer.classList.remove('hidden');
            loader.classList.add('hidden');
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

    currentSheetName = sheetName;
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
                } catch (err) {
                    console.error("Error converting sheet to json:", err);
                    currentSheetData = [];
                }
            } else {
                currentSheetData = cachedData;
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
            currentSheetName = sName;
        }

        const ws = workbook.Sheets[sName];
        if (!ws) throw new Error("Hoja '" + sName + "' no encontrada.");

        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
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
    
    if (currentSheetData) renderVirtualTable(currentSheetData);
}

function handleOffsetClick(i, j) {
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
        alert("El archivo está vacío.");
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

console.log("✅ VIEWER ENGINE INITIALIZED & EXPOSED");