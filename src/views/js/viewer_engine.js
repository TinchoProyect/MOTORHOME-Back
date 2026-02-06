/**
 * VIEWER ENGINE - Sistema de Gestión de Proveedores
 * Módulo de Visualización, Worker Excel y Herramientas de Mapeo
 * v2.6 (Regex Logic Restored + Computed Columns + Preview Fix)
 */

console.log("%c 🚀 VIEWER ENGINE: v2.6 - READY ", "background: #8b5cf6; color: #fff; font-weight: bold; padding: 4px;");

// --- 1. VARIABLES GLOBALES (Scope Módulo) ---
// --- 1. VARIABLES GLOBALES (MIGRADO A viewer_core.js) ---
// viewerWorker, currentSheetData, workbook, etc. ahora residen en viewer_core.js


// --- 2. CÓDIGO DEL OBRERO (Worker) ---
// --- 2. CÓDIGO DEL OBRERO (MIGRADO A viewer_worker.js) ---
// WORKER_CODE ahora es window.WORKER_CODE


// --- 3. FUNCIONES CORE DEL VISOR ---
// exportAllSheets moved to viewer_worker.js


async function openFileViewer(fileId, fileName) {
    window.globalContext.fileId = fileId;

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

    // Reset Containers
    const excelContainer = document.getElementById('excelContainer');
    const sheetTabs = document.getElementById('sheetTabs');
    const errContainer = document.getElementById('errorContainer');
    const pdfContainer = document.getElementById('pdfContainer');
    const imgContainer = document.getElementById('imageContainer');
    const imgEl = document.getElementById('viewerImage');

    // Reset Buttons visibility (Calc button added)
    const btnMap = document.getElementById('btnMappingMode');
    const btnOffset = document.getElementById('btnOffsetMode');
    const btnCalc = document.getElementById('btnCalcMode'); // New Button

    [btnMap, btnOffset, btnCalc].forEach(btn => {
        if (btn) {
            btn.classList.add('hidden');
            // Reset styles
            btn.classList.remove('bg-blue-600', 'bg-amber-600', 'bg-purple-600', 'text-white', 'border-blue-500', 'animate-pulse');
            btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
        }
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

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const downloadUrl = `${backendUrl}/api/files/download/${fileId}`;

        const isExcel = fileName.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = fileName.match(/\.pdf$/i);
        const isImg = fileName.match(/\.(jpg|jpeg|png)$/i);

        if (isExcel) {
            if (btnMap) btnMap.classList.remove('hidden');
            if (btnOffset) btnOffset.classList.remove('hidden');
            if (btnCalc) btnCalc.classList.remove('hidden'); // Show calc button

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
                    currentSheetData = payload.data;
                    renderVirtualTable(currentSheetData);
                } else if (type === 'ERROR') {
                    console.error("Worker Logical Error:", payload);
                    useWorker = false;
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
    currentSheetName = sheetName;
    loadSheetState(sheetName);
    renderSheetTabs();

    const excelContainer = document.getElementById('excelContainer');
    excelContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-64 text-blue-400">
        <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <span class="text-xs font-mono animate-pulse">PROCESANDO...</span>
    </div>`;

    currentSheetData = null;

    // 1. Virtual Cache Support (Multi-Sheet DB Recovery)
    if (window.virtualWorkbookCache && window.virtualWorkbookCache[sheetName]) {
        console.log(`[ViewerEngine] Loading '${sheetName}' from Virtual Cache.`);
        setTimeout(() => {
            let cachedData = window.virtualWorkbookCache[sheetName];

            // CORRECCIÓN CRÍTICA:
            // Si es un Objeto Worksheet (no es array), lo convertimos a Matriz Visual.
            if (!Array.isArray(cachedData) && typeof XLSX !== 'undefined') {
                // header: 1 genera un Array de Arrays [[A1, B1], [A2, B2]...]
                try {
                    currentSheetData = XLSX.utils.sheet_to_json(cachedData, { header: 1 });
                } catch (err) {
                    console.error("Error converting sheet to json:", err);
                    currentSheetData = [];
                }
            } else {
                // Si ya era array (fallback), lo usamos directo
                currentSheetData = cachedData;
            }

            renderVirtualTable(currentSheetData);

            const loader = document.getElementById('viewerLoader');
            if (loader) loader.classList.add('hidden');
        }, 50);
        return;
    }

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

// --- MAPPING & NOMENCLATURE TOOLS ---
// Moved to viewer_mapping.js


// --- VIRTUAL SCROLLER & PROCESSING ---
// renderVirtualTable moved to viewer_render.js


// --- STATE MANAGEMENT ---

function saveSheetState(sheetName) {
    if (!sheetName) return;
    sheetConfigStore[sheetName] = { offset: currentOffset, mapping: columnMapping || {} };
}

function loadSheetState(sheetName) {
    currentOffset = null;
    columnMapping = {};
    offsetSelectionMode = false;
    const config = sheetConfigStore[sheetName];
    if (config) {
        currentOffset = config.offset;
        columnMapping = config.mapping || {};
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

function toggleOffsetMode() {
    offsetSelectionMode = !offsetSelectionMode;
    const btn = document.getElementById('btnOffsetMode');
    if (offsetSelectionMode) {
        if (mappingMode) toggleMappingMode();
        btn.classList.add('bg-amber-600', 'text-white', 'animate-pulse');
    } else {
        btn.classList.remove('bg-amber-600', 'text-white', 'animate-pulse');
    }
    if (currentSheetData) renderVirtualTable(currentSheetData);
}

function handleOffsetClick(i, j) {
    if (!offsetSelectionMode) return;
    currentOffset = { row: i, col: j };
    toggleOffsetMode();
    saveSheetState(currentSheetName);
    renderSheetTabs();
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

// --- NEW PREVIEW ENGINE ---
// currentSimData & currentDisplayConfig moved to viewer_core.js
// generatePreview, filterSimulationData, renderSimulationTable moved to viewer_render.js


// --- 4. EXPOSICIÓN GLOBAL (Bindings) ---
window.openFileViewer = function (fileId, fileName) {
    window.resetViewerState(); // [TABULA RASA] - Always Start Clean
    openFileViewer(fileId, fileName);
};

window.handleOffsetClick = handleOffsetClick;
window.toggleOffsetMode = toggleOffsetMode;
window.toggleMappingMode = toggleMappingMode;
window.openColumnMenu_v2 = openColumnMenu_v2;

window.closeViewerModal = function () {
    closeViewerModal();
    window.resetViewerState(); // [TABULA RASA] - Clean on Exit
};

window.loadSheet = loadSheet;
window.exportAllSheets = exportAllSheets;

// 🔥 CORRECCIÓN: BINDINGS PARA SATELLITE MODULES
// Estas funciones se definen aquí pero son llamadas por mapping.js o render.js
window.saveSheetState = saveSheetState;
window.loadSheetState = loadSheetState;
window.renderSheetTabs = renderSheetTabs; // <--- ESTA ES LA CLAVE (Faltaba esta)
window.toggleProcessingRule = toggleProcessingRule; // Lo busca el render.js
window.toggleSimulationRule = toggleSimulationRule; // Lo busca el HTML del preview
window.closeSimulationModal = closeSimulationModal; // Lo busca el botón del HTML

// [PHASE 4] Snapshot Export for Ingestion
// --- PUBLIC API FOR MODULES ---
window.getViewerSnapshot = function () {
    return (typeof currentSheetData !== 'undefined') ? currentSheetData : null;
};

// [PHASE 5] Virtual Workbook Loader (Multi-Sheet DB Recovery)
window.loadVirtualWorkbook = function (workbookMap, fileName, providerName = "DATO HISTÓRICO") {
    console.log("[ViewerEngine] Loading Virtual Workbook:", fileName, Object.keys(workbookMap));

    // 1. Reset State
    window.resetViewerState();

    // 2. Load Data Cache
    const sheetNames = Object.keys(workbookMap);
    if (sheetNames.length === 0) {
        alert("El archivo está vacío.");
        return;
    }

    // Set Cache & Config
    window.virtualWorkbookCache = workbookMap;
    window.useWorker = false;
    window.globalContext.fileType = "VIRTUAL_DB"; // Mark as Virtual

    // 3. UI Setup (ESTO VA PRIMERO para que limpie la casa)
    if (window.ViewerUI) {
        window.ViewerUI.updateHeader(fileName, { isProcessed: true });
        window.ViewerUI.showContainer('excel');
        window.ViewerUI.toggleTools(true);
        window.ViewerUI.toggleLoader(false);
    }

    // 4. Force Hide Ingest Button
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.add('hidden');

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

    // 6. Render Tabs
    renderSheetTabs(sheetNames);
    if (sheetNames.length > 1) {
        document.getElementById('sheetTabs').classList.remove('hidden');
    }

    // 7. Load First Sheet
    loadSheet(sheetNames[0]);
};

console.log("✅ VIEWER ENGINE INITIALIZED & EXPOSED");