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

    // Variables de Datos
    currentSheetData = [];
    currentSheetName = null;

    // Variables de Mapeo
    mappingMode = false;
    columnMapping = {};
    currentOffset = { row: 0, col: 0 };
    processingRules = {};

    // CORRECCIÓN: Limpiar la caché de términos para evitar fugas entre proveedores
    nomenclatureCache = [];

    // Variables de Simulación
    currentSimData = [];
    currentDisplayConfig = [];
    sheetConfigStore = {};

    // UI Reset
    if (window.ViewerUI) {
        window.ViewerUI.resetView();
        window.ViewerUI.updateHeader("", {});
    }
};

// --- 6. PERSISTENCE LOGIC (Guardado) ---
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

    if (!window.draftPipelines || Object.keys(window.draftPipelines).length === 0) {
        alert("Atención: No hay mapeos configurados en el Taller de Reglas para esta hoja.");
        return;
    }

    // 2. Preparar el Payload V4
    const mapeosPayload = [];
    for (const [colIndexStr, config] of Object.entries(window.draftPipelines)) {
        mapeosPayload.push({
            columna_origen_index: parseInt(colIndexStr),
            columna_origen_nombre: config.colName || `Columna ${colIndexStr}`,
            campo_maestro_id: config.masterField.id,
            reglas: (config.rules || []).map(r => r.id)
        });
    }

    const payload = {
        proveedor_id: window.globalContext.providerId,
        nombre_hoja: currentSheetName || 'Sheet1',
        mapeos: mapeosPayload
    };

    // 3. UI Feedback (Loading)
    const btn = document.querySelector('button[onclick="saveSimulationConfig()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        console.log("💾 [V4] Guardando Pipeline ETL en el servidor...", payload);
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        // 4. Llamada al Backend
        const response = await fetch(`${backendUrl}/api/mapping/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Error desconocido al guardar.");
        }

        // 5. Success
        console.log("✅ [V4] Configuración guardada:", result);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Motor ETL Guardado',
                text: 'Mapeo y Reglas configurados exitosamente.',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            alert("¡Mapeo guardado exitosamente!");
        }

    } catch (error) {
        console.error("❌ Error saveSimulationConfig [V4]:", error);
        if (typeof Swal !== 'undefined') Swal.fire("Error", error.message, "error");
        else alert("Error al guardar: " + error.message);
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


// --- 6.1. PERSISTENCE LOGIC (Reset/Delete) ---
/**
 * Elimina la configuración guardada y resetea el visor.
 */
window.deleteSimulationConfig = async function () {
    if (!window.globalContext || !window.globalContext.providerId) return;

    if (!confirm("¿Estás seguro de eliminar toda la configuración guardada para esta hoja? Esto borrará el mapeo y las reglas.")) {
        return;
    }

    const payload = {
        providerId: window.globalContext.providerId,
        sheetName: currentSheetName
    };

    const btn = document.querySelector('button[onclick="deleteSimulationConfig()"]');
    if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>`;

    try {
        console.log("🗑️ Eliminando configuración del servidor...", payload);
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        const response = await fetch(`${backendUrl}/api/files/template`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || "Error al eliminar.");

        console.log("✅ Configuración eliminada.");

        // Reset Local State
        window.resetViewerState();

        // Reload Sheet to see "virgin" state
        if (currentSheetName) {
            loadSheet(currentSheetName);
        }

        if (typeof Swal !== 'undefined') Swal.fire("Reseteado", "La configuración ha sido eliminada.", "success");
        else alert("Configuración eliminada.");

    } catch (error) {
        console.error("❌ Error deleteSimulationConfig:", error);
        alert("Error al eliminar: " + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i> Limpiar`;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// =============================================================================
// --- 7. LOAD CONFIGURATION (Recuperar Memoria) ---
// =============================================================================
window.loadSavedConfiguration = async function () {
    const providerId = window.globalContext.providerId;
    const sheetName = currentSheetName || 'Sheet1';

    if (!providerId) return false;

    try {
        console.log(`🧠 [V4] Buscando Pipeline ETL para Proveedor ${providerId} (Hoja: ${sheetName})...`);

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const url = `${backendUrl}/api/mapping/${providerId}/${encodeURIComponent(sheetName)}`;

        const response = await fetch(url);
        if (!response.ok) return false;

        const result = await response.json();

        if (result && result.status === 'found' && result.mapeos) {
            console.log("✅ [V4] Motor ETL configurado desde DB:", result);

            window.draftPipelines = {};

            // 1. APLICAR OFFSET FORMATO (Legacy compatibility if needed)
            if (result.formato && result.formato.offset_filas !== undefined) {
                currentOffset = { row: result.formato.offset_filas, col: 0 };
            }

            // 2. RECONSTRUIR PIPELINES MULTI-HOJA
            for (const m of result.mapeos) {
                const rulesArr = (m.mapeo_reglas_aplicadas || []).map(r => ({
                    id: r.regla_id,
                    nombre_regla: r.reglas_limpieza.nombre_regla,
                    tipo_regex: r.reglas_limpieza.tipo_regex,
                    descripcion: ""
                }));

                window.draftPipelines[m.columna_origen_index] = {
                    masterField: { id: m.campo_maestro_id, nombre_campo: `Mapeo Recuperado (${m.campo_maestro_id.substring(0, 4)})` },
                    colName: m.columna_origen_nombre,
                    rules: rulesArr
                };

                // Aplicar visualmente
                if (window.viewerETL && window.viewerETL.commitColumnMapping) {
                    window.viewerETL.commitColumnMapping(m.columna_origen_index, window.draftPipelines[m.columna_origen_index].masterField, rulesArr);
                }
            }

            return true;
        }

    } catch (error) {
        console.warn("⚠️ No se pudo cargar la configuración V4 guardada (normal si es nuevo):", error);
    }
    return false;
};

console.log("🧠 [ViewerCore] Estado Global Inicializado (+Persistencia +CacheFix)");