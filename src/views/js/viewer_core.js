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

window.buildVisorFilterOptions = function() {
    let options = [];
    if (!window.virtualColumns) return options;
    
    const getHumanName = (idOrName) => {
        if (!idOrName || idOrName === 'Ignorar Columna') return idOrName;
        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
            const match = window.masterDictionary.find(m => String(m.id) === String(idOrName) || String(m.nombre_campo) === String(idOrName));
            if (match) return match.nombre_campo;
        }
        return idOrName;
    };

    window.virtualColumns.forEach(vCol => {
        const j = vCol.id;
        let pName = window.currentSheetData && window.currentSheetData[0] && window.currentSheetData[0][vCol.dataIdx] 
            ? window.currentSheetData[0][vCol.dataIdx] 
            : `Columna ${vCol.dataIdx + 1}`;
            
        if (window.draftPipelines && window.draftPipelines[j]) {
            pName = getHumanName(window.draftPipelines[j].masterField?.nombre_campo || window.draftPipelines[j].masterField?.id);
        } else if (window.columnMapping && window.columnMapping[j] && window.columnMapping[j] !== 'Ignorar Columna') {
            pName = getHumanName(window.columnMapping[j]);
        }
        
        // Agregar Columnas Calculadas Visibles
        if (vCol.isCalculated && window.computedColumns) {
            const comp = window.computedColumns.find(c => c.id === j);
            if (comp) pName = `[Calc] ${comp.masterField?.nombre_campo || 'Calculada'}`;
        }
        
        options.push({ label: pName, value: j });
    });
    return options;
};

window.filterVisorData = function() {
    if (!window.GlobalSearchFilter) return;
    window.GlobalSearchFilter.saveState('visor');
    const state = window.GlobalSearchFilter.getState('visor');

    if (!state.query) {
        if (window.renderVirtualTable && currentSheetData) window.renderVirtualTable(currentSheetData);
        return;
    }

    const normString = (s) => s != null ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const qterms = normString(state.query).split(/\s+/).filter(x => x.length > 0);

    const filtered = currentSheetData.map((row, index) => ({ row, index })) 
        .filter(({row}) => {
            return qterms.every(term => {
                
                // Helper interno para evaluar una celda on-the-fly y ver si matchea
                const checkCellMatch = (vCol) => {
                    try {
                        let rawVal = "";
                        let finalVal = "";
                        
                        if (vCol.isCalculated) {
                            if (window.computedColumns && window.evaluateComputedColumnMath) {
                                const compCfg = window.computedColumns.find(c => c.id === vCol.id);
                                if (compCfg) {
                                    let opAValue = { clean: 0, display: "", raw: "" };
                                    let opBValue = { clean: 0, display: "", raw: "" };
                                    
                                    const srcA = window.virtualColumns.find(vc => vc.id === compCfg.operands?.[0]);
                                    if (srcA && srcA.dataIdx !== undefined) {
                                        opAValue.raw = row[srcA.dataIdx];
                                        opAValue.clean = row[srcA.dataIdx];
                                    }
                                    const srcB = window.virtualColumns.find(vc => vc.id === compCfg.operands?.[1]);
                                    if (srcB && srcB.dataIdx !== undefined) {
                                        opBValue.raw = row[srcB.dataIdx];
                                        opBValue.clean = row[srcB.dataIdx];
                                    }
                                    
                                    const res = window.evaluateComputedColumnMath(compCfg, opAValue, opBValue, window.draftPipelines, window.activeEtlState);
                                    finalVal = res.resultDisplay || res.mathResult || "";
                                }
                            }
                        } else if (vCol.dataIdx !== undefined) {
                            rawVal = String(row[vCol.dataIdx] || "");
                            finalVal = rawVal;
                            
                            const pipeline = window.draftPipelines && window.draftPipelines[vCol.id] ? window.draftPipelines[vCol.id].rules : null;
                            if (pipeline && pipeline.length > 0 && window.viewerETL) {
                                const res = window.viewerETL.transformCell(rawVal, pipeline);
                                finalVal = res.resultDisplay || res.result || res.display;
                            }
                        }
                        
                        return normString(rawVal).includes(term) || normString(finalVal).includes(term);
                    } catch (e) {
                        console.warn("[Visor Search] Error silenciado en checkCellMatch:", e);
                        return false;
                    }
                };

                let matched = false;
                if (state.field === "ALL") {
                    matched = window.virtualColumns.some(v => checkCellMatch(v));
                } else {
                    const vTarget = window.virtualColumns.find(col => col.id === state.field);
                    if (vTarget) {
                        matched = checkCellMatch(vTarget);
                    }
                }
                
                // Fallback de seguridad extrema: Si no matcheó por la columna específica (a veces el ID del index se desincroniza),
                // y el término sigue sin aparecer, buscamos en TODOS los datos crudos de la fila por si acaso.
                if (!matched) {
                    matched = Object.values(row).some(cellStr => normString(cellStr).includes(term));
                }
                return matched;
            });
    }).map(obj => obj.row);
    
    // [BUG FIX CRÍTICO] Múltiples reportes indicaban que el 1er resultado "desaparecía" del Visor Universal.
    // Esto se debe a que renderVirtualTable asume matemáticamente que data[0] son los HEADERS (los consume
    // del DOM y el bucle for empieza en 1).
    // Si pasamos el array 'filtered' tal cual, el primer hit de búsqueda es devorado por el thead.
    // Solución: Restaurar el header original de currentSheetData en la posición 0 antes de renderear.
    if (currentSheetData && currentSheetData.length > 0) {
        // En VIRTUAL_DB y archivos normales, currentSheetData[0] siempre es la fila de encabezados
        filtered.unshift(currentSheetData[0]);
    }
    
    // IMPORTANTE: Al virtual scroller en renderVirtualTable(data) le setearemos la 'data' reducida + headers falsos en pos 0
    if (window.renderVirtualTable) {
        window.renderVirtualTable(filtered);
    }
};

window.triggerSafeRender = function() {
    if (typeof window.filterVisorData === 'function') {
        window.filterVisorData();
    } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
        window.renderVirtualTable(window.currentSheetData);
    }
};

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
        window.triggerSafeRender();
    }
};

// --- 5. STATE RESET PROTOCOL ---
window.resetViewerState = function (preserveData = false) {
    console.log("🧹 Resetting Viewer State...", preserveData ? "(Preserving Data)" : "");

    // Variables de Datos
    if (!preserveData) {
        currentSheetData = [];
        currentSheetName = null;
        currentFileBuffer = null;
        workbook = null;
    }

    // Variables de Mapeo
    mappingMode = false;
    window.virtualColumns = [];
    window.computedColumns = []; // V5
    columnMapping = {};
    window.draftPipelines = {}; // V8
    currentOffset = { row: 0, col: 0 };
    processingRules = {};

    if (window.LayoutManager) window.LayoutManager.reset();
    if (window.ViewerVisibilityManager) window.ViewerVisibilityManager.reset();

    // CORRECCIÓN: Limpiar la caché de términos para evitar fugas entre proveedores
    nomenclatureCache = [];

    // Variables de Simulación
    currentSimData = [];
    currentDisplayConfig = [];
    sheetConfigStore = {};

    // UI Reset
    if (window.ViewerUI) {
        window.ViewerUI.resetView();
        if (!preserveData) window.ViewerUI.updateHeader("", {});
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
                
                // [NEW] Omitir guardado en DB origen físico para Columnas Calculadas y Fantasmas:
                if (vColId.startsWith('comp_') || vColId.startsWith('col_calc_') || vColId.startsWith('col_ph_')) continue;

                if (window.virtualColumns && window.virtualColumns.length > 0) {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    
                    if (vCol && vCol.isCalculated) continue; // Por seguridad doble comprobación
                    
                    dataIdx = vCol ? vCol.dataIdx : parseInt(vColId.replace('col_', ''));
                } else {
                    dataIdx = parseInt(vColId.replace('col_', ''));
                }

                if (isNaN(dataIdx)) dataIdx = 0;
                
                // Evitar colisión de restricción Not Null en backend Supabase
                if (!config.masterField || !config.masterField.id) {
                    console.log(`[V4] Omitiendo columna origen ${dataIdx} - No posee campo_maestro_id (mapping) y Supabase lo rechaza.`);
                    continue;
                }

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

// =============================================================================
// --- 6.C. PERSISTENCIA DE FLUJOS (PLANTILLAS V8) ---
// =============================================================================
window.unifiedSaveAction = async function() {
    const activeFlujoId = window.globalContext.flujoId;
    const isCrudo = !activeFlujoId || activeFlujoId === "CRUDO";

    if (isCrudo) {
        let nombreFlujo = prompt("🏁 Ingrese un nombre único para esta Plantilla:", "P. Ej: Lista Precios Mayorista");
        if (!nombreFlujo || nombreFlujo.trim() === '') return;
        window._executeFlujoSave(null, nombreFlujo);
    } else {
        const selectEl = document.getElementById('headerFlujoSelect');
        let currentName = "Plantilla Activa";
        if (selectEl && selectEl.options[selectEl.selectedIndex]) {
            currentName = selectEl.options[selectEl.selectedIndex].text;
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Opciones de Guardado',
                html: `Estás trabajando sobre el flujo <b>${currentName}</b>.<br><br>¿Deseas actualizarlo y sobreescribir los cambios, o crear un flujo nuevo?`,
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: '<i data-lucide="save" class="w-4 h-4 inline-block mr-1 -mt-0.5"></i> Actualizar actual',
                confirmButtonColor: '#10b981',
                denyButtonText: '<i data-lucide="copy" class="w-4 h-4 inline-block mr-1 -mt-0.5"></i> Guardar como nuevo',
                denyButtonColor: '#d65ce6',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    window._executeFlujoSave(activeFlujoId, currentName);
                } else if (result.isDenied) {
                    let nombreFlujo = prompt("🏁 Ingrese un nombre para la nueva Plantilla:", `${currentName} (Copia)`);
                    if (!nombreFlujo || nombreFlujo.trim() === '') return;
                    window._executeFlujoSave(null, nombreFlujo);
                }
            });
            if (window.lucide) window.lucide.createIcons();
        } else {
            const op = confirm(`OK = Actualizar plantilla actual (${currentName})\nCANCEL = Crear plantilla nueva.`);
            if (op) {
                window._executeFlujoSave(activeFlujoId, currentName);
            } else {
                let nombreFlujo = prompt("🏁 Ingrese un nombre único para la nueva Plantilla:", `${currentName} (Copia)`);
                if (!nombreFlujo || nombreFlujo.trim() === '') return;
                window._executeFlujoSave(null, nombreFlujo);
            }
        }
    }
};

window._executeFlujoSave = async function (id_flujo, nombreFlujo) {
    const providerId = window.globalContext.providerId;
    if (!providerId) {
        alert("Falta el Provider ID. No se puede guardar la plantilla.");
        return;
    }

    // 0. Sincronizar hoja actual antes de serializar todo
    if (typeof saveSheetState === 'function' && window.currentSheetName) {
        saveSheetState(window.currentSheetName);
    }

    // 1. Construcción del config_payload (Versión Multi-Hoja V8)
    const payload = {
        isMultiSheet: true,
        sheets: window.sheetConfigStore || {}
    };

    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    // UI Botón
    const btn = document.getElementById('btnSaveConfig');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const bodyReq = {
            id_flujo: id_flujo,
            proveedor_id: providerId,
            nombre_flujo: nombreFlujo,
            config_payload: payload
        };

        const res = await fetch(`${backendUrl}/api/flujos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyReq)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Fallo en API /flujos");

        // Si se creó uno nuevo, actualizar el contexto con su ID
        if (!id_flujo || window.globalContext.flujoId !== result.flujo.id_flujo) {
            window.globalContext.flujoId = result.flujo.id_flujo;
            if (window.initViewerFlujosContext) {
                await window.initViewerFlujosContext(providerId, result.flujo.id_flujo);
            }
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Flujo Guardado',
                text: id_flujo ? 'El flujo fue actualizado exitosamente.' : 'Nuevo flujo creado exitosamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            alert("Flujo Guardado exitosamente!");
        }

    } catch(e) {
        console.error("❌ Error guardando flujo:", e);
        if (typeof Swal !== 'undefined') Swal.fire("Error", "Error al guardar plantilla: " + e.message, "error");
        else alert("Error al guardar plantilla: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="save" class="w-3 h-3"></i> Guardar`;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// =============================================================================
// --- 6.D. UI DE CONTEXTO Y CAMBIO DE FLUJO (QA-3) ---
// =============================================================================
window.initViewerFlujosContext = async function (providerId, activeFlujoId) {
    const container = document.getElementById('activeFlujoContainer');
    const selectEl = document.getElementById('headerFlujoSelect');
    if (!container || !selectEl || !providerId) return;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        // Optimización: Si ya los descargó el dashboard, los rehúsa.
        let flujos = window.cachedFlujos || [];
        if (!window.cachedFlujosProviderId || window.cachedFlujosProviderId !== providerId) {
            const res = await fetch(`${backendUrl}/api/flujos/${providerId}`);
            if (res.ok) {
                flujos = await res.json();
            }
        }

        if (flujos && flujos.length > 0) {
            let optionsHtml = `<option value="">-- Sin Flujo (Blanc Slate) --</option>`;
            flujos.forEach(f => {
                const selected = (f.id_flujo === activeFlujoId) ? 'selected' : '';
                optionsHtml += `<option value="${f.id_flujo}" ${selected}>${f.nombre_flujo}</option>`;
            });
            selectEl.innerHTML = optionsHtml;
            container.classList.remove('hidden');
            container.classList.add('flex');
        } else {
            container.classList.add('hidden');
            container.classList.remove('flex');
        }

    } catch (e) {
        console.error("Error inicializando Header Flujos Context:", e);
    }
};

window.cambiarFlujoActivo = async function(flujoId) {
    console.log(`[ViewerCore] Cambiando Flujo al vuelo a ID: ${flujoId}`);
    
    // Validar si hay datos en pantalla
    if (!window.currentSheetData) {
        alert("Primero debe cargar una hoja de datos.");
        return;
    }

    if (!flujoId || flujoId === "") {
        if (!confirm("¿Está seguro de limpiar todo y volver al formato en crudo?")) return;
        window.resetViewerState(true);
        window.globalContext.flujoId = null;
        if (currentSheetName) window.loadSheet(currentSheetName);
        return;
    }

    // Modal de confirmación (Pisar cambios)
    if (!confirm("¿Desea aplicar este flujo? Esto sobreescribirá todas las columnas y fórmulas actuales.")) return;

    // Actualizar global context y forzar carga
    window.globalContext.flujoId = flujoId;
    
    const uiBtn = document.getElementById('headerFlujoSelect');
    if(uiBtn) uiBtn.disabled = true;

    try {
        // [TABULA RASA] Limpiar estado previo preservando DATA
        window.resetViewerState(true);
        window.globalContext.flujoId = flujoId; // Restaurar el flujoId porque el reset lo borra

        // Relanzar la carga de la configuración que hidratará todo mágicamente
        const loaded = await window.loadSavedConfiguration();
        
        if (loaded) {
            // Re-render
            if (window.currentSheetData) {
                window.renderVirtualTable(window.currentSheetData);
            }
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: 'Flujo Aplicado', timer: 1500, showConfirmButton: false });
            }
        } else {
            alert("No se pudo cargar el flujo seleccionado.");
        }
    } catch (error) {
        console.error("Error cambiando de flujo al vuelo:", error);
        alert("Ocurrió un error al aplicar el flujo.");
    } finally {
        if(uiBtn) uiBtn.disabled = false;
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

    // [Bug 3 - QA] Si es un modo CRUDO forzado, detener inmediatamente.
    if (window.globalContext.flujoId === "CRUDO" || window.globalContext.flujoId === "") {
        console.log("🛑 Modos CRUDO explícitos: abortando hidrataciones V3/V4 de legado.");
        return false;
    }

    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    let loadedAnything = false;

    // ==========================================
    // [NUEVO] CARGA DE FLUJO/PLANTILLA (Sobrescribe modo tradicional)
    // ==========================================
    if (window.globalContext.flujoId) {
        try {
            console.log(`🧠 [FLUJOS] Hidratando Visor desde Flujo ID: ${window.globalContext.flujoId}...`);
            const resFlujo = await fetch(`${backendUrl}/api/flujos/detalle/${window.globalContext.flujoId}`);
            if (resFlujo.ok) {
                const resultFlujo = await resFlujo.json();
                if (resultFlujo && resultFlujo.config_payload) {
                    const payload = resultFlujo.config_payload;

                    // Multi-Hoja vs Legacy (Flat)
                    if (payload.isMultiSheet && payload.sheets) {
                        console.log("📂 [FLUJOS] Hidratando arquitectura Multi-Hoja (V8)");
                        window.sheetConfigStore = payload.sheets;
                        
                        // Reactivar el estado solo para la hoja actual (Virgin State para las demas)
                        if (typeof loadSheetState === 'function' && window.currentSheetName) {
                            loadSheetState(window.currentSheetName);
                        }
                    } else {
                        console.log("⚠️ [FLUJOS] Fallback: Hidratando formato Legacy Plano");
                        
                        // 1. Offset
                        if (payload.offset) {
                            window.currentOffset = payload.offset;
                            window.offsetSelectionMode = false;
                        }

                        // 2. Arrays Virtuales y Calculados
                        if (payload.virtualColumns) window.virtualColumns = payload.virtualColumns;
                        if (payload.computedColumns) window.computedColumns = payload.computedColumns;

                        // 3. Mapping
                        if (payload.columnMapping) window.columnMapping = payload.columnMapping;

                        // 4. Pipelines ETL
                        if (payload.draftPipelines) window.draftPipelines = payload.draftPipelines;

                        // 5. Layout (Anchos y Orden)
                        if (payload.layoutConfig) {
                            if (payload.layoutConfig.colWidths) window.currentColWidths = payload.layoutConfig.colWidths;
                            if (payload.layoutConfig.config_visual && window.LayoutManager) {
                                window.LayoutManager.hydrateSettings(payload.layoutConfig.config_visual);
                            }
                            if (payload.layoutConfig.hiddenColumns && window.ViewerVisibilityManager) {
                                window.ViewerVisibilityManager.hydrateSettings(payload.layoutConfig.hiddenColumns);
                            }
                        }
                        
                        // Salvaguardar forzosamente este legado plano dentro del store de la hoja actual, 
                        // para que no se filtre a la hoja 2 si navegan.
                        if (typeof saveSheetState === 'function' && window.currentSheetName) {
                            saveSheetState(window.currentSheetName);
                        }
                    }

                    console.log("✅ [FLUJOS] Hidratación Completada (Aislamiento de Memoria Garantizado)");
                    return true; // Bypass del viejo V3/V4 setup
                }
            }
        } catch (e) {
            console.error("❌ [FLUJOS] Error hidratando plantilla:", e);
        }
    }

    // ==========================================
    // 1. CARGA V3 (Offset y Formatos Básicos - Old Logic)
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
                    colName: c.masterField ? c.masterField.nombre_campo : 'Calculada',
                    rules: c.rules
                };
                
                if (!window.columnMapping) window.columnMapping = {};
                if (c.masterField && c.masterField.id) window.columnMapping[c.id] = c.masterField.id;
                
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

// =============================================================================
// --- 8. REUSABLE SEARCH COMPONENT (Auditoría ETL & Simulador) ---
// =============================================================================
window.GlobalSearchFilter = {
    render: function(targetIdPrefix, onSearchCallbackName) {
        return `
            <div class="flex items-center gap-2">
                <div class="relative w-48">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"></i>
                    <input type="text" id="${targetIdPrefix}SearchInput" placeholder="Filtrar datos..." oninput="${onSearchCallbackName}()" 
                        class="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-8 py-1 text-[11px] text-white focus:border-emerald-500 outline-none shadow-inner">
                    <button onclick="document.getElementById('${targetIdPrefix}SearchInput').value=''; ${onSearchCallbackName}();" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors" title="Limpiar filtro">
                        <i data-lucide="x-circle" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
                <select id="${targetIdPrefix}SearchField" onchange="${onSearchCallbackName}()" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-emerald-500 max-w-[130px] w-auto">
                    <!-- Inyectado dinámicamente -->
                </select>
            </div>
        `;
    },
    
    updateOptions: function(targetIdPrefix, optionsList) {
        const sel = document.getElementById(`${targetIdPrefix}SearchField`);
        if (!sel) return;
        let html = '<option value="ALL">Todo</option>';
        optionsList.forEach((opt, idx) => {
            html += `<option value="${opt.value !== undefined ? opt.value : idx}">${opt.label}</option>`;
        });
        sel.innerHTML = html;
        
        if (this.state[targetIdPrefix]) {
            sel.value = this.state[targetIdPrefix].field || "ALL";
        }
    },
    
    state: {},
    
    saveState: function(targetIdPrefix) {
        const inp = document.getElementById(`${targetIdPrefix}SearchInput`);
        const sel = document.getElementById(`${targetIdPrefix}SearchField`);
        this.state[targetIdPrefix] = {
            query: inp ? inp.value.toLowerCase().trim() : '',
            field: sel ? sel.value : 'ALL'
        };
    },
    
    getState: function(targetIdPrefix) {
        return this.state[targetIdPrefix] || { query: '', field: 'ALL' };
    }
};