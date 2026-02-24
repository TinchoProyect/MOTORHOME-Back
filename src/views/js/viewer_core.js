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
window.isGlobalPreviewEnabled = false;

window.toggleGlobalPreview = function () {
    window.isGlobalPreviewEnabled = !window.isGlobalPreviewEnabled;
    const btn = document.getElementById('btnGlobalPreview');
    if (btn) {
        if (window.isGlobalPreviewEnabled) {
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
            btn.classList.remove('bg-slate-800', 'text-slate-400');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
            btn.classList.add('bg-slate-800', 'text-slate-400');
        }
    }

    // Forzar repintado si hay datos cargados
    if (window.renderVirtualTable && currentSheetData && currentSheetData.length > 0) {
        console.log("🔄 [ViewerCore] Repintando tabla por cambio de Modo Auditoría:", window.isGlobalPreviewEnabled);
        window.renderVirtualTable(currentSheetData);
    }
};

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
window.saveSimulationConfig = async function (config = null, silent = false) {
    // 1. Validaciones Básicas
    if (!window.globalContext || !window.globalContext.providerId) {
        alert("Error Crítico: No se ha identificado el proveedor en el contexto global.");
        return;
    }

    // 2. UI Feedback (Loading)
    const btn = document.querySelector('button[onclick="saveSimulationConfig()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const providerId = window.globalContext.providerId;
        const sheetName = currentSheetName || 'Sheet1';

        // ==========================================
        // GUARDADO V3: FORMATOS BÁSICOS (Offset, Encabezados Locales)
        // ==========================================
        const templatePayload = {
            providerId: providerId,
            fileType: window.globalContext.fileType || "GENERAL",
            sheetName: sheetName,
            config: {
                offset: typeof currentOffset !== 'undefined' ? currentOffset : { row: 0, col: 0 },
                mapping: typeof columnMapping !== 'undefined' ? columnMapping : {},
                rules: typeof processingRules !== 'undefined' ? processingRules : {}
            }
        };

        console.log("💾 [V3] Guardando formato base (offset/encabezados)...", templatePayload);
        const templateResponse = await fetch(`${backendUrl}/api/files/save-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templatePayload)
        });

        const templateResult = await templateResponse.json();
        if (!templateResponse.ok) {
            throw new Error(templateResult.error || "Error al guardar el formato base de la hoja.");
        }
        console.log("✅ [V3] Formato base guardado:", templateResult);

        // ==========================================
        // GUARDADO V4: MOTOR ETL (Solo si hay pipilines definidos en el taller)
        // ==========================================
        const hasPipelines = window.draftPipelines && Object.keys(window.draftPipelines).length > 0;

        if (hasPipelines) {
            const mapeosPayload = [];
            for (const [colIndexStr, config] of Object.entries(window.draftPipelines)) {
                mapeosPayload.push({
                    columna_origen_index: parseInt(colIndexStr),
                    columna_origen_nombre: config.colName || `Columna ${colIndexStr}`,
                    campo_maestro_id: config.masterField.id,
                    reglas: (config.rules || []).map(r => r.id)
                });
            }

            const payloadV4 = {
                proveedor_id: providerId,
                nombre_hoja: sheetName,
                mapeos: mapeosPayload
            };

            console.log("💾 [V4] Guardando Pipeline ETL en el servidor...", payloadV4);
            console.log('🛑 [VIGÍA SAVE] Payload enviado al backend: \n', JSON.stringify(payloadV4, null, 2));
            const responseV4 = await fetch(`${backendUrl}/api/mapping/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadV4)
            });

            const resultV4 = await responseV4.json();
            if (!responseV4.ok) {
                throw new Error(resultV4.error || "Error al guardar pipelines ETL.");
            }
            console.log("✅ [V4] Motor ETL guardado:", resultV4);
        } else {
            console.log("⏭️ [V4] No hay reglas ETL configuradas, omitiendo guardado de mappings avanzados.");
        }

        // 5. Success
        if (!silent) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Configuración Guardada',
                    text: hasPipelines ? 'Formato base y reglas ETL guardados exitosamente.' : 'Formato de encabezados guardado exitosamente.',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                alert("¡Configuración guardada exitosamente!");
            }
        }

    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
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

    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    let loadedAnything = false;

    // ==========================================
    // 1. CARGA V3 (Offset y Formatos Básicos)
    // ==========================================
    try {
        console.log(`🧠 [V3] Buscando Formato Base para Proveedor ${providerId} (Hoja: ${sheetName})...`);
        const v3Url = `${backendUrl}/api/files/get-template?providerId=${providerId}&sheetName=${encodeURIComponent(sheetName)}`;
        const responseV3 = await fetch(v3Url);

        if (responseV3.ok) {
            const resultV3 = await responseV3.json();
            if (resultV3 && resultV3.data) {
                console.log("✅ [V3] Formato Base recuperado:", resultV3.data);

                // Aplicar Offset V3
                if (resultV3.data.fila_encabezado !== undefined) {
                    currentOffset = {
                        row: resultV3.data.fila_encabezado,
                        col: resultV3.data.columna_encabezado || 0
                    };
                    offsetSelectionMode = false;
                }

                // Aplicar Mapping V3 Clásico (Renombrado de Columnas)
                if (resultV3.data.reglas_mapeo) {
                    columnMapping = resultV3.data.reglas_mapeo;
                }

                if (resultV3.data.reglas_procesamiento) {
                    processingRules = resultV3.data.reglas_procesamiento;
                }

                loadedAnything = true;
            }
        }
    } catch (e) {
        console.warn("⚠️ [V3] No se encontró formato base previo (offset/nombres).");
    }

    // ==========================================
    // 2. CARGA V4 (Pipeline de Reglas ETL)
    // ==========================================
    try {
        console.log(`🧠 [V4] Buscando Pipeline ETL para Proveedor ${providerId} (Hoja: ${sheetName})...`);
        const urlV4 = `${backendUrl}/api/mapping/${providerId}/${encodeURIComponent(sheetName)}`;

        console.log('🛑 [VIGÍA LOAD] Solicitando V4 a BD...');
        const responseV4 = await fetch(urlV4);
        if (responseV4.ok) {
            const resultV4 = await responseV4.json();
            console.log('🛑 [VIGÍA LOAD] Respuesta BD cruda: \n', JSON.stringify(resultV4, null, 2));

            if (resultV4 && resultV4.status === 'found' && resultV4.mapeos) {
                console.log("✅ [V4] Motor ETL configurado desde DB:", resultV4);

                try {
                    window.draftPipelines = {};

                    // 3. RECONSTRUIR PIPELINES MULTI-HOJA
                    for (const m of resultV4.mapeos) {
                        const rulesArr = (m.mapeo_reglas_aplicadas || []).map(r => ({
                            id: r.regla_id,
                            nombre_regla: r.reglas_limpieza ? r.reglas_limpieza.nombre_regla : 'Regla Desconocida',
                            tipo_regex: r.reglas_limpieza ? r.reglas_limpieza.tipo_regex : 'unknown',
                            descripcion: ""
                        }));

                        window.draftPipelines[m.columna_origen_index] = {
                            masterField: { id: m.campo_maestro_id, nombre_campo: `Campo ID ${m.campo_maestro_id.substring(0, 4)}` },
                            colName: m.columna_origen_nombre,
                            rules: rulesArr
                        };

                        // Aplicar visualmente
                        if (window.viewerETL && window.viewerETL.commitColumnMapping) {
                            window.viewerETL.commitColumnMapping(m.columna_origen_index, window.draftPipelines[m.columna_origen_index].masterField, rulesArr);
                        }
                    }

                    console.log('🛑 [VIGÍA HYDRATION] draftPipelines reconstruido: \n', JSON.stringify(window.draftPipelines, null, 2));

                    if (typeof window.renderVirtualTable === 'function') {
                        console.log('🛑 [VIGÍA LOAD] Rehidratando UI con reglas aplicadas...');
                        window.renderVirtualTable(currentSheetData);
                    }

                    loadedAnything = true;
                } catch (error) {
                    console.error('🛑 [VIGÍA FATAL] El hilo de Hidratación V4 chocó: ', error.message);
                    console.error('Stack Trace:', error);
                }
            }
        }
    } catch (error) {
        console.warn("⚠️ [V4] No se pudo cargar la configuración V4 guardada (normal si es nuevo):", error);
    }

    // Retorna true si encontró algo para disparar UI re-renders masivos si aplica
    return loadedAnything;
};

console.log("🧠 [ViewerCore] Estado Global Inicializado (+Persistencia +CacheFix)");