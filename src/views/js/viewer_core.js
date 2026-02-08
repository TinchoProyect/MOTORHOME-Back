/**
 * VIEWER CORE - Estado Global y Configuración 🧠
 * Este archivo DEBE cargarse primero. Define el "Store" del visor.
 */

// --- 1. CORE STATE (Variables Globales) ---
var viewerWorker = null;
var currentSheetData = [];
var workbook = null;
var currentFileBuffer = null;
var useWorker = true;
var currentSheetName = null;
var sheetConfigStore = {}; // Almacena configuraciones (offset/mapping) por hoja

// --- 2. GLOBAL CONTEXT (Datos del Proveedor/Archivo) ---
window.globalContext = {
    providerId: null,
    providerName: '',
    fileId: null,
    fileType: null,
    timestamp: null
};

// --- 3. MAPPING & RULES STATE (Lógica de Negocio) ---
var mappingMode = false;
var columnMapping = {}; // { colIndex: "TerminoID" }
var offsetSelectionMode = false;
var currentOffset = { row: 0, col: 0 };
var nomenclatureCache = []; // Catálogo de términos (se llena desde API)
var processingRules = {}; // { colIndex: [RuleObject, ...] }
var simulationModeProcessed = false;

// --- 4. SIMULATION STATE (Cache de Previsualización) ---
var currentSimData = [];
var currentDisplayConfig = [];

// --- 5. STATE RESET PROTOCOL ---
window.resetViewerState = function () {
    console.log("🧹 Resetting Viewer State...");
    currentSheetData = [];
    currentSheetName = null;
    mappingMode = false;
    columnMapping = {};
    currentOffset = { row: 0, col: 0 };
    processingRules = {};
    currentSimData = [];
    currentDisplayConfig = [];
    sheetConfigStore = {};

    // UI Reset
    if (window.ViewerUI) {
        window.ViewerUI.resetView();
        window.ViewerUI.updateHeader("", {});
    }
};

// --- 6. PERSISTENCE LOGIC (Paso 2: Guardado) ---
/**
 * Empaqueta el estado actual (Mapping + Reglas) y lo envía al Backend.
 * Se invoca desde el botón "Guardar Configuración" en el Simulador.
 */
window.saveSimulationConfig = async function () {
    // 1. Validaciones Básicas
    if (!window.globalContext || !window.globalContext.providerId) {
        alert("Error Crítico: No se ha identificado el proveedor en el contexto global.");
        return;
    }

    if (Object.keys(columnMapping).length === 0) {
        alert("Atención: No hay columnas mapeadas para guardar.");
        return;
    }

    // 2. Preparar el Payload
    // Estructuramos los datos para que el Controller los entienda fácilmente
    const payload = {
        providerId: window.globalContext.providerId,
        fileType: window.globalContext.fileType || "GENERAL", // ej: LISTA_PRECIOS
        sheetName: currentSheetName,
        config: {
            offset: currentOffset,       // { row: 3, col: 0 }
            mapping: columnMapping,      // { 0: "codigo", 2: "precio" }
            rules: processingRules       // { 2: [{type: 'sanitize_numbers'}] }
        }
    };

    // 3. UI Feedback (Loading)
    const btn = document.querySelector('button[onclick="saveSimulationConfig()"]');
    const originalContent = btn ? btn.innerHTML : "Guardar";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        console.log("💾 Enviando configuración al servidor...", payload);

        // 4. Llamada al Backend
        const response = await fetch('http://localhost:5655/api/files/save-template', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Error desconocido al guardar.");
        }

        // 5. Success
        console.log("✅ Configuración guardada:", result);
        alert("¡Configuración guardada exitosamente! \nSe aplicará automáticamente la próxima vez.");

    } catch (error) {
        console.error("❌ Error saveSimulationConfig:", error);
        alert("Error al guardar la configuración: " + error.message);
    } finally {
        // 6. UI Restore
        if (btn) {
            btn.disabled = false;
            // Restauramos el icono de guardar
            btn.innerHTML = `<i data-lucide="save" class="w-3 h-3"></i> Guardar`;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// =============================================================================
// --- 7. LOAD CONFIGURATION (Recuperar Memoria) ---
// =============================================================================
window.loadSavedConfiguration = async function () {
    const providerId = window.globalContext.providerId;
    const sheetName = currentSheetName; // Variable global definida arriba

    if (!providerId) return false;

    try {
        console.log(`🧠 [ViewerCore] Buscando configuración guardada para Proveedor ${providerId} (Hoja: ${sheetName})...`);

        // NOTA: Usamos el puerto 5655 directo para evitar el bloqueo del Frontend
        const url = new URL('http://localhost:5655/api/files/get-template');
        url.searchParams.append('providerId', providerId);
        if (sheetName) url.searchParams.append('sheetName', sheetName);

        const response = await fetch(url);
        if (!response.ok) return false;

        const result = await response.json();

        if (result && result.success && result.data) {
            const config = result.data;
            console.log("✅ Configuración recuperada:", config);

            // 1. APLICAR OFFSET (Filas/Columnas)
            if (config.fila_encabezado !== undefined && config.columna_encabezado !== undefined) {
                currentOffset = {
                    row: parseInt(config.fila_encabezado) || 0,
                    col: parseInt(config.columna_encabezado) || 0
                };
                offsetSelectionMode = true; // Activar visualmente
                // Actualizar UI del header si existe
                if (window.ViewerUI && window.ViewerUI.updateOffsetDisplay) {
                    window.ViewerUI.updateOffsetDisplay(currentOffset);
                }
            }

            // 2. APLICAR MAPEO (Columnas -> Variables)
            if (config.reglas_mapeo && Object.keys(config.reglas_mapeo).length > 0) {
                columnMapping = config.reglas_mapeo;
                mappingMode = true;
            }

            // 3. APLICAR REGLAS (Sanitización, etc.)
            if (config.reglas_procesamiento) {
                processingRules = config.reglas_procesamiento;
            }

            return true; // Éxito: Se cargó configuración
        }

    } catch (error) {
        console.warn("⚠️ No se pudo cargar la configuración guardada (esto es normal si es nuevo):", error);
    }
    return false;
};

console.log("🧠 [ViewerCore] Estado Global Inicializado (+Persistencia)");