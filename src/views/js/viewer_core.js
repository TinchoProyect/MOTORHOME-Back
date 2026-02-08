/**
 * VIEWER CORE - Global State & Configuration
 * Extracted from viewer_engine.js
 */

// --- 1. VARIABLES GLOBALES (Moved from viewer_engine.js) ---
let viewerWorker = null;
let currentSheetData = [];
let workbook = null;       // LIBRO EXCEL
let currentFileBuffer = null; // BUFFER RAW (Rescate)
let useWorker = true;      // ESTADO DEL WORKER
let currentSheetName = ""; // HOJA ACTUAL
let sheetConfigStore = {}; // { "Sheet1": { offset: {}, mapping: {} } }

// Global Context
window.globalContext = {
    providerId: null,
    providerName: "",
    fileId: null,
    fileType: "GENERAL",
    timestamp: null
};

// --- Mapeo y Offset ---
let mappingMode = false;
let columnMapping = {}; // { colIndex: "Tipo" }
let offsetSelectionMode = false;
let currentOffset = null; // { row: 0, col: 0 }
let nomenclatureCache = []; // Cache de términos
let processingRules = {}; // Rules store
let simulationModeProcessed = true; // State for Toggle

// --- Simulation State (Moved to ensure availability for resetViewerState) ---
let currentSimData = [];
let currentDisplayConfig = [];

// [TABULA RASA] State Reset Protocol
window.resetViewerState = function () {
    console.log("🧹 [ViewerEngine] Tabula Rasa Reset Executing...");

    // 1. Variables Globales (Module Scope)
    currentSheetData = [];
    currentSimData = []; // Resetting to empty array as per declaration
    window.virtualWorkbookCache = null; // Clear Cache
    if (typeof currentWorkbook !== 'undefined') currentWorkbook = null;

    // 🔥 CACHE BUSTER: Limpieza profunda de memoria de mapeo
    // Esto evita que los encabezados privados de un proveedor "persistan" al cambiar a otro.
    if (window.resetMappingCache) {
        window.resetMappingCache();
    }

    // 2. UI - Buttons Visibility
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.remove('hidden'); // Siempre visible por defecto (Ingesta)

    // 3. UI - Contenedores
    const sheetTabs = document.getElementById('sheetTabs');
    if (sheetTabs) sheetTabs.innerHTML = '';

    // [PHASE 5 FIX] - Default Hide All
    const ids = ['excelContainer', 'pdfContainer', 'imageContainer', 'errorContainer'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const previewTable = document.getElementById('previewTable');
    if (previewTable) {
        previewTable.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-600">
            <i data-lucide="loader-2" class="w-8 h-8 animate-spin mb-4"></i>
            <span class="text-xs">Iniciando Motor...</span>
        </div>`;
        if (window.lucide) window.lucide.createIcons();
    }

    const title = document.getElementById('viewerTitle');
    if (title) title.textContent = "Cargando...";

    const loader = document.getElementById('viewerLoader');
    if (loader) loader.classList.remove('hidden');

    console.log("✨ [ViewerEngine] State Cleaned.");
};