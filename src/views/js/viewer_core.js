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
window.virtualColumns = []; // V4.1 Proxy Visual
window.computedColumns = []; // V5 Computed Columns (Phase 2)
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
    window.virtualColumns = [];
    window.computedColumns = []; // V5
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
    if (window._isSavingSimulationLock) {
        console.warn("⏳ [V4] Save already in progress, queuing or ignoring to prevent race conditions.");
        return;
    }
    window._isSavingSimulationLock = true;

    // 1. Validaciones Básicas
    if (!window.globalContext || !window.globalContext.providerId) {
        window._isSavingSimulationLock = false;
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

        // [NEW] Persistir reglas ETL (V4) dentro del Config (V3) para las Columnas Calculadas
        if (window.computedColumns && window.draftPipelines) {
            window.computedColumns.forEach(c => {
                const pipe = window.draftPipelines[c.id];
                if (pipe && pipe.rules) {
                    c.rules = pipe.rules;
                }
            });
        }

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
                rules: typeof processingRules !== 'undefined' ? processingRules : {},
                computedCols: window.computedColumns || [],
                colWidths: window.currentColWidths || {},
                config_visual: window.LayoutManager ? window.LayoutManager.serializeSettings() : {},
                hiddenColumns: window.ViewerVisibilityManager ? window.ViewerVisibilityManager.serializeSettings() : {},
                ghostCols: window.virtualColumns ? window.virtualColumns.filter(c => c.isGhostPlaceholder) : []
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
            for (const [vColId, config] of Object.entries(window.draftPipelines)) {
                // Backward compatibility & Virtual Columns support
                let dataIdx;
                
                // [NEW] Omitir guardado en DB origen físico para Columnas Calculadas:
                if (vColId.startsWith('comp_') || vColId.startsWith('col_calc_')) continue;

                if (window.virtualColumns && window.virtualColumns.length > 0) {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    
                    if (vCol && vCol.isCalculated) continue; // Por seguridad doble comprobación
                    
                    dataIdx = vCol ? vCol.dataIdx : parseInt(vColId.replace('col_', ''));
                } else {
                    dataIdx = parseInt(vColId.replace('col_', ''));
                }

                if (isNaN(dataIdx)) dataIdx = 0;

                mapeosPayload.push({
                    columna_origen_index: dataIdx, // This is the physical index for the DB
                    columna_origen_nombre: config.colName || `Columna ${dataIdx}`,
                    campo_maestro_id: config.masterField.id,
                    reglas: (config.rules || []).filter(r => r && r.id).map(r => r.id)
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
        window._isSavingSimulationLock = false;
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
                    columnMapping = {};
                    Object.keys(resultV3.data.reglas_mapeo).forEach(oldKey => {
                        const vColId = oldKey.startsWith('col_') ? oldKey : `col_${oldKey}`;
                        columnMapping[vColId] = resultV3.data.reglas_mapeo[oldKey];
                    });
                }

                if (resultV3.data.reglas_procesamiento) {
                    processingRules = {};
                    const rawRules = resultV3.data.reglas_procesamiento.rules || resultV3.data.reglas_procesamiento;
                    Object.keys(rawRules).forEach(oldKey => {
                        if (oldKey === 'computedColumns') return; // Skip computed columns in processingRules
                        const vColId = oldKey.startsWith('col_') ? oldKey : `col_${oldKey}`;
                        processingRules[vColId] = rawRules[oldKey];
                    });

                    // [V5] Hydrate Computed Columns from Backend
                    if (resultV3.data.reglas_procesamiento.computedColumns) {
                        window.computedColumns = Array.isArray(resultV3.data.reglas_procesamiento.computedColumns)
                            ? resultV3.data.reglas_procesamiento.computedColumns
                            : [];
                        console.log("✅ [V5] Columnas Calculadas recuperadas:", window.computedColumns.length);
                    }
                }

                // [V5] Hydrate User Column Widths
                if (resultV3.data.colWidths) {
                    window.currentColWidths = resultV3.data.colWidths;
                    console.log("✅ [V5] Dimensiones de columnas recuperadas.", window.currentColWidths);
                } else if (resultV3.data.reglas_procesamiento && resultV3.data.reglas_procesamiento.colWidths) {
                    window.currentColWidths = resultV3.data.reglas_procesamiento.colWidths;
                    console.log("✅ [V5] Dimensiones de columnas recuperadas (Legacy).");
                }
                
                
                // [V5 UX] Hydrate Visual Configuration
                if (resultV3.data.config_visual && window.LayoutManager) {
                    window.LayoutManager.hydrateSettings(resultV3.data.config_visual);
                }
                
                // [V6 UX] Hydrate Hidden Columns
                if (resultV3.data.hiddenColumns && window.ViewerVisibilityManager) {
                    window.ViewerVisibilityManager.hydrateSettings(resultV3.data.hiddenColumns);
                }

                // [V5.20] Hydrate Ghost Placeholder Columns
                if (resultV3.data.ghostCols && Array.isArray(resultV3.data.ghostCols)) {
                    // Solo agregarlas si no están ya en config
                    resultV3.data.ghostCols.forEach(ghost => {
                        if (!window.virtualColumns.find(v => v.id === ghost.id)) {
                            window.virtualColumns.push(ghost);
                        }
                    });
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

                        const vColId = `col_${m.columna_origen_index}`; // Map DB integer to valid proxy string

                        // Reconstrucción inteligente de clones visuales (si hay más de 1 regla a la misma columna)
                        let activeVColId = vColId;
                        if (window.draftPipelines[activeVColId]) {
                            const dataIdx = m.columna_origen_index;
                            let cloneCounter = 1;
                            activeVColId = `${vColId}_clone_${cloneCounter}`;
                            while (window.draftPipelines[activeVColId] || (window.virtualColumns && window.virtualColumns.find(v => v.id === activeVColId))) {
                                cloneCounter++;
                                activeVColId = `${vColId}_clone_${cloneCounter}`;
                            }
                            // Inyectar al arreglo de columnas virtuales para que se dibuje
                            if (window.virtualColumns) {
                                const idx = window.virtualColumns.findIndex(v => v.id === vColId);
                                if (idx !== -1) window.virtualColumns.splice(idx + 1, 0, { id: activeVColId, dataIdx: dataIdx });
                            }
                        }

                        // Sincronizar el clon recién reconstruido con el estado global de Mapeo (V3)
                        // Esto garantiza que viewer_render.js detecte la columna mapeada y active la vista de Auditoría ETL.
                        if (!window.columnMapping) window.columnMapping = {};
                        window.columnMapping[activeVColId] = m.campo_maestro_id;

                        let resolvedName = m.campo_maestro_id;
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            const match = window.masterDictionary.find(dict => String(dict.id) === String(m.campo_maestro_id));
                            if (match) resolvedName = match.nombre_campo;
                        }

                        window.draftPipelines[activeVColId] = {
                            masterField: { id: m.campo_maestro_id, nombre_campo: resolvedName },
                            colName: m.columna_origen_nombre,
                            rules: rulesArr
                        };

                        // Aplicar visualmente
                        if (window.viewerETL && window.viewerETL.commitColumnMapping) {
                            window.viewerETL.commitColumnMapping(activeVColId, window.draftPipelines[activeVColId].masterField, rulesArr);
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

    // [NEW] 3. Rehidratar el Taller de Reglas para las Columnas Calculadas desde JSON (V3)
    if (window.computedColumns && window.computedColumns.length > 0) {
        if (!window.draftPipelines) window.draftPipelines = {};
        let computedHydrated = false;
        
        window.computedColumns.forEach(c => {
            if (c.rules && c.rules.length > 0) {
                window.draftPipelines[c.id] = {
                    masterField: c.masterField,
                    colName: c.masterField.nombre_campo || 'Calculada',
                    rules: c.rules
                };
                
                if (!window.columnMapping) window.columnMapping = {};
                window.columnMapping[c.id] = c.masterField.id;
                
                computedHydrated = true;
            }
        });
        
        if (computedHydrated) {
            console.log("✅ [V5] Pipeline de Reglas restaurado para Columnas Calculadas.");
            if (typeof window.renderVirtualTable === 'function') {
                window.renderVirtualTable(currentSheetData);
            }
            loadedAnything = true;
        }
    }

    // Retorna true si encontró algo para disparar UI re-renders masivos si aplica
    return loadedAnything;
};

console.log("🧠 [ViewerCore] Estado Global Inicializado (+Persistencia +CacheFix)");