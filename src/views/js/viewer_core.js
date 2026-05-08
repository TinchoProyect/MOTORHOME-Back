/**
 * VIEWER CORE - Estado Global y Configuración 🧠
 * Este archivo DEBE cargarse primero. Define el "Store" del visor.
 */

// --- 1. CORE STATE (Variables Globales) ---
var viewerWorker = null;
var currentSheetData = []; window.currentSheetData = currentSheetData;
var workbook = null;
var currentFileBuffer = null;
var useWorker = true;
var currentSheetName = null; window.currentSheetName = currentSheetName;
var sheetConfigStore = {}; // Almacena configuraciones (offset/mapping) por hoja

// --- 2. GLOBAL CONTEXT (Datos del Proveedor/Archivo) ---
window.globalContext = {
    providerId: null,
    providerName: '',
    fileId: null,
    fileType: null,
};

// --- 2.5 SCHEMA SANITIZER GLOBAL ---
window.SchemaSanitizer = {
    cast: function(val, masterFieldObj) {
        if (!masterFieldObj || !masterFieldObj.tipo_dato) return val;
        let sVal = String(val !== undefined && val !== null ? val : "").trim();
        if (!sVal) return "";
        
        const tipo = String(masterFieldObj.tipo_dato).toUpperCase();
        
        // Reglas de Sanitización de Tipos Fuertes
        switch(tipo) {
            case "NUMERICO":
            case "NUMÉRICO":
            case "PRECIO":
            case "MONEDA":
                // Quitamos espacios y símbolos de moneda
                let stripped = sVal.replace(/[$€\s\u00A0\u202F]/g, '');
                // Si la cadena restante no tiene ni un solo número natural o separador decimal válido, es basura
                if (!/^[0-9.,\-]+$/.test(stripped)) return "";
                // Controlar si sigue siendo inparseable
                let forParse = stripped.replace(/\./g, "").replace(",", ".");
                if (isNaN(parseFloat(forParse))) return "";
                return sVal; // Devolvemos el sVal original para que no se destrocen los decimales/formatos originales todavía

            case "ALFANUMERICO":
            case "ALFANUMÉRICO":
            case "CODIGO":
            case "SKU":
                // Los códigos deben poseer inquebrantablemente al menos un dígito o una letra válida. No se admiten guiones vacíos.
                if (!/[a-zA-Z0-9]/.test(sVal)) return "";
                return sVal;
                
            default:
                // Para tipos "TEXTO" o ausentes, dejamos pasar todo excepto un string full vacío
                return sVal;
        }
    }
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
                                    
                                    const res = window.evaluateComputedColumnMath(compCfg, opAValue, opBValue, window.draftPipelines, window.activeEtlState, null, row);
                                    finalVal = res.resultDisplay || res.mathResult || "";
                                }
                            }
                        } else if (vCol.dataIdx !== undefined) {
                            rawVal = String(row[vCol.dataIdx] || "");
                            finalVal = rawVal;
                            
                            const pipeline = window.draftPipelines && window.draftPipelines[vCol.id] ? window.draftPipelines[vCol.id].rules : null;
                            if (pipeline && pipeline.length > 0 && window.viewerETL) {
                                const res = window.viewerETL.transformCell(rawVal, pipeline, row);
                                // [BUG-FIX: Null/Empty Persistence] Respetar wasTransformed
                                if (res.wasTransformed) {
                                    finalVal = res.display !== undefined ? res.display : res.result;
                                } else {
                                    finalVal = res.resultDisplay || res.result || res.display;
                                }
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
        currentSheetData = []; window.currentSheetData = currentSheetData;
        currentSheetName = null; window.currentSheetName = currentSheetName;
        currentFileBuffer = null;
        workbook = null;
        window.virtualWorkbookCache = null;
    }

    // Variables de Mapeo
    mappingMode = false;
    window._flujoAlreadyLoaded = false; // [LIFECYCLE FIX] Permite re-hidratar tras cerrar el modal
    window.virtualColumns = [];
    window.computedColumns = []; // V5
    columnMapping = {};
    window.draftPipelines = {}; // V8
    currentOffset = { row: 0, col: 0 };
    window.currentEndOffset = null;
    window.offsetSelectionMode = false;
    window.endOffsetSelectionMode = false;
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

    // --- UX INTERCEPTOR: Prevenir Autoguardado silencioso sobre Flujos Vinculados (Vínculo Granítico) ---
    if (window.checkFlujoMutationGuard) {
        const isSafe = await window.checkFlujoMutationGuard();
        if (!isSafe) {
            return; // Aborted by user
        }
    }
    // -------------------------------------------------------------------------------

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
                endOffset: typeof window.currentEndOffset !== 'undefined' ? window.currentEndOffset : null,
                mapping: typeof columnMapping !== 'undefined' ? columnMapping : {},
                rules: typeof processingRules !== 'undefined' ? processingRules : {},
                computedCols: window.computedColumns || [],
                colWidths: window.currentColWidths || {},
                config_visual: window.LayoutManager ? window.LayoutManager.serializeSettings() : {},
                hiddenColumns: window.ViewerVisibilityManager ? window.ViewerVisibilityManager.serializeSettings() : {},
                ghostCols: [], // [QA BUGFIX] Bloqueo innegociable de fuga de resaca de placeholders a DB
                draftPipelines: window.draftPipelines || {} // [FIX PERSISTENCE] Exportación explícita del estado en-memoria (AST) para rehidratación V3
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
        // GUARDADO V4: MOTOR ETL (Siempre debemos notificar al server, incluso si mapeos están vacíos para purgar)
        // ==========================================
        const mapeosPayload = [];
        if (window.draftPipelines) {
            for (const [vColId, config] of Object.entries(window.draftPipelines)) {
                // Backward compatibility & Virtual Columns support
                let dataIdx;
                
                // [V8 FIX] Omitir Columnas Calculadas y sus variantes de ID:
                // - comp_* / col_calc_* → siempre son calculadas
                // - col_ph_* → solo omitir si están registradas en computedColumns (fórmulas)
                //   Los ghosts mapeados a campos maestros regulares (Marca, Rubro) SÍ deben persistirse.
                if (vColId.startsWith('comp_') || vColId.startsWith('col_calc_')) continue;
                if (vColId.startsWith('col_ph_') && window.computedColumns && window.computedColumns.find(c => c.id === vColId)) continue;

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
                    reglas: (config.rules || []).filter(r => {
                        if (!r || !r.id) return false;
                        if (r.es_local) return false;
                        if (String(r.id) === 'BESPOKE_STRICT_NUMERIC') return false;
                        if (String(r.id).startsWith('local_') || String(r.id).startsWith('CUSTOM_')) return false;
                        return true;
                    }).map(r => {
                        // [MIGRACIÓN DE REGLA IN-MEM A UUID FÍSICA] Evita 400 Bad Request
                        if (r.id === 'sys_sanitize_decimal_fill') return '895e8e7d-11c9-439f-a98b-d9c0edf65f5d';
                        return r.id;
                    }).filter(uuid => {
                        // Resguardo final: garantizar compatibilidad estricta con UUID Postgres
                        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
                    })
                });
            }
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

        // 5. Success
        if (!silent) {
            // [FIX UX] Evitar robar el foco / destruir modales abiertos (Swal Singleton rule)
            if (typeof Swal !== 'undefined') {
                if (!Swal.isVisible()) {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Configuración Guardada',
                        text: (Object.keys(window.draftPipelines || {}).length > 0) ? 'Reglas ETL guardadas exitosamente.' : 'Formato de encabezados guardado.',
                        timer: 2000,
                        showConfirmButton: false,
                        background: '#0f172a',
                        color: '#f8fafc'
                    });
                } else {
                    console.log("💿 (Autoguardado completado en segundo plano, modal ocupado)");
                }
            } else {
                console.log("¡Configuración guardada exitosamente!");
            }
        }

    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        // Supresión Silenciosa de Errores de UI
        if (!silent) {
            if (typeof Swal !== 'undefined') Swal.fire("Error", error.message, "error");
            else alert("Error al guardar: " + error.message);
        }
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
// --- 6.C. PERSISTENCIA DE FLUJOS (PLANTILLAS V8) Y GUARDIAN DE MUTACIÓN ---
// =============================================================================

/**
 * Escudo de Integridad Funcional
 * Intercepta y bloquea ediciones a plantillas activas si tienen vínculos a la Base Maestra Histórica.
 * @returns {Promise<boolean>} true = Seguro de proceder, false = Bloqueado/Cancelado
 */
window.checkFlujoMutationGuard = async function() {
    if (!window.globalContext || !window.globalContext.flujoId) return true; 
    if (window.globalContext.flujoId === "CRUDO") return true; 

    // Si ya autorizó la mutación o ya bifurcó en esta sesión
    if (window._mutationGuardAuthorized) return true;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const excludeQuery = window.globalContext.fileId ? `?excludeFileId=${window.globalContext.fileId}` : '';
        const res = await fetch(`${backendUrl}/api/flujos/linked-status/${window.globalContext.flujoId}${excludeQuery}`);
        
        if (!res.ok) return true; // Fail open for resilience
        
        const data = await res.json();

        if (!data.success || !data.isLinked) {
            window._mutationGuardAuthorized = true; // It is isolated, safe
            return true; 
        }

        // --- VINCULACIÓN DETECTADA: DISPARAR IMPACT ALERT ---
        let fileSamples = '';
        if (data.linkedFiles && data.linkedFiles.length > 0) {
            fileSamples = data.linkedFiles.slice(0, 3).join(', ');
            if (data.linkedFiles.length > 3) fileSamples += '...';
        }

        // Variable de estado para resolución asíncrona dentro del DOM
        let forceDestructiveResolved = false;

        const modalRes = await Swal.fire({
            title: '⚠️ Vínculo Granítico Detectado',
            html: `<div class="text-sm text-slate-300 mb-4 text-left">Esta configuración ("<b>${data.flujo_name}</b>") protege la integridad de <b>${data.fileCount}</b> archivo(s) histórico(s) <i>(Ej: ${fileSamples})</i>.</div>` + 
                  `<div class="text-sm text-slate-300 text-left mb-6">Para continuar editando Mapeos o Reglas con el documento actual de forma segura sin afectar el pasado, utiliza una Variante:</div>`,
            icon: 'warning',
            background: '#0f172a',
            color: '#f8fafc',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '<i data-lucide="split-square-horizontal" class="w-4 h-4 inline mt-[-2px]"></i> Variante Local Continua',
            confirmButtonColor: '#10b981', 
            denyButtonText: '<i data-lucide="git-branch" class="w-4 h-4 inline mt-[-2px]"></i> Bifurcar (Nombrar clon)',
            denyButtonColor: '#3b82f6',
            cancelButtonText: 'Cancelar Mapeo',
            cancelButtonColor: '#475569',
            footer: '<a href="#" id="btnForceUnlink" class="text-xs text-red-500 hover:text-red-400 font-bold uppercase tracking-wider py-1 px-2 rounded hover:bg-red-950 transition-colors"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> Riesgo: Sobrescribir Base (Romper Vínculos)</a>',
            didOpen: () => { 
                if (window.lucide) window.lucide.createIcons(); 
                const forceBtn = document.getElementById('btnForceUnlink');
                if (forceBtn) {
                    forceBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        if (confirm("🚨 PELIGRO: Esto desvinculará todos los archivos históricos de esta plantilla y sobrescribirá la base original. ¿Continuar y asumir el daño a la trazabilidad histórica?")) {
                            forceDestructiveResolved = true;
                            Swal.close();
                        }
                    });
                }
            }
        });

        if (forceDestructiveResolved) {
            // Opción Z: SOBRESCRIBIR -> Rompe vínculos históricos (Unlink total)
            await fetch(`${backendUrl}/api/flujos/unlink-history/${window.globalContext.flujoId}`, { method: 'POST' });
            window._mutationGuardAuthorized = true;
            return true; // Procede
        } else if (modalRes.isConfirmed) {
            // Opción A: VARIANTE LOCAL -> Crea bifurcación silenciosa local "(Local)"
            Swal.fire({title: 'Generando variante de protección...', allowOutsideClick: false, background: '#0f172a', color: '#f8fafc', didOpen: () => Swal.showLoading()});
            const resFork = await fetch(`${backendUrl}/api/flujos/fork-local/${window.globalContext.flujoId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: window.globalContext.fileId })
            });

            if(!resFork.ok) {
                 Swal.fire({title: 'Error de Bifurcación', text: 'Falló la red', icon: 'error', background: '#0f172a', color: '#f8fafc'});
                 return false;
            }
            const forkData = await resFork.json();
            
            // Re-hidratar en memoria:
            window.globalContext.flujoId = forkData.newFlujoId;
            window._mutationGuardAuthorized = true;

            // Actualizar Componente Visual de Identidad (UX)
            const displayLabel = document.getElementById('headerFlujoNameDisplay');
            if (displayLabel) displayLabel.textContent = forkData.newFlujoName;

            return true; // Procede
        } else if (modalRes.isDenied) {
            // Opción B: BIFURCAR TRADICIONAL -> Pide nombre
            let nombreFlujo = prompt("🏁 Ingrese un nombre único para la nueva Matriz Independiente:", `${data.flujo_name} (Variante)`);
            if (!nombreFlujo || nombreFlujo.trim() === '') return false; 
            
            await window._executeFlujoSave(null, nombreFlujo); 
            window._mutationGuardAuthorized = true; 
            return true; 
        } else {
            return false; // Corta la ejecución (Cancelar)

        }

    } catch (e) {
        console.error("Error en Mutation Guard:", e);
        return true; 
    }
};

window.unifiedSaveAction = async function() {
    const activeFlujoId = window.globalContext.flujoId;
    const isCrudo = !activeFlujoId || activeFlujoId === "CRUDO";

    // Requerimiento Lógica de Vinculación Automática (Auto-Naming)
    const gProviderName = (window.globalContext && window.globalContext.providerName) 
        ? window.globalContext.providerName.split(' ')[0].toUpperCase() 
        : "PROVEEDOR";
    const dateObj = new Date();
    const monthNames = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
    const suggestedName = `${gProviderName}_EXTRACTOR_${monthNames[dateObj.getMonth()]}${String(dateObj.getFullYear()).slice(-2)}`;

    if (isCrudo) {
        let nombreFlujo = prompt("🏁 Bautizar Herramienta de Extracción:", suggestedName);
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
                title: 'Opciones de Extracción',
                html: `<div class="text-[13px] text-slate-300 mb-2 leading-relaxed">Estás trabajando sobre el flujo maestro <b class="text-fuchsia-400">"${currentName}"</b>.</div><div class="text-[12px] text-slate-400">¿Deseas impactar los cambios sobre el actual, o bifurcar hacia un nuevo formato?</div>`,
                icon: 'question',
                background: '#0f172a',
                color: '#f8fafc',
                customClass: { popup: 'border border-slate-800 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] rounded-2xl' },
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: '<i data-lucide="save" class="w-4 h-4 inline-block mr-1 -mt-0.5"></i> Actualizar Actual',
                confirmButtonColor: '#059669',
                denyButtonText: '<i data-lucide="split-square-horizontal" class="w-4 h-4 inline-block mr-1 -mt-0.5"></i> Variante (Nuevo)',
                denyButtonColor: '#8b5cf6',
                cancelButtonText: 'Cancelar',
                cancelButtonColor: '#334155'
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

    // 0. Capturar estado activo del Chofer IA si el modal quedó abierto (Evitar amnesia al tocar Guardar General)
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
        const wsState = window.viewerRuleWorkshop.getActiveState();
        if (wsState.isOpen && wsState.colIndex && wsState.masterField) {
            console.log("🛡️ [WORKSHOP-SYNC] Autoguardando progreso del Chofer IA activo antes del Commit Global...");
            if (!window.draftPipelines) window.draftPipelines = {};
            window.draftPipelines[wsState.colIndex] = {
                masterField: wsState.masterField,
                colName: wsState.colName || 'Pendiente',
                rules: wsState.pipeline ? [...wsState.pipeline] : []
            };
            // Commit headers in UI if not already done
            if (window.viewerETL && typeof window.viewerETL.commitColumnMapping === 'function') {
                window.viewerETL.commitColumnMapping(wsState.colIndex, wsState.masterField, wsState.pipeline || []);
            }
        }
    }

    // 1. Sincronizar hoja actual antes de serializar todo
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
            const newFlujoId = result.flujo.id_flujo;

            // [QA BUGFIX V9] Amarrar el archivo actual físicamente a la nueva Variante (Evita el "Blank Slate")
            if (window.globalContext.fileId) {
                try {
                    await fetch(`${backendUrl}/api/files/processed/${window.globalContext.fileId}/flujo`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ flujo_id: newFlujoId })
                    });
                    console.log(`✅ [UX FIX] Archivo actual (${window.globalContext.fileId}) anclado exitosamente a la Variante ${newFlujoId}`);
                } catch(e) {
                    console.error("Fallo anclando archivo a Variante:", e);
                }
            }

            window.globalContext.flujoId = newFlujoId;
            if (window.initViewerFlujosContext) {
                await window.initViewerFlujosContext(providerId, newFlujoId);
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
            let activeFlujoName = '';
            flujos.forEach(f => {
                const selected = (f.id_flujo === activeFlujoId) ? 'selected' : '';
                if (selected) activeFlujoName = f.nombre_flujo;
                optionsHtml += `<option value="${f.id_flujo}" ${selected}>${f.nombre_flujo}</option>`;
            });
            selectEl.innerHTML = optionsHtml;
            container.classList.remove('hidden');
            container.classList.add('flex');
            
            const displayLabel = document.getElementById('headerFlujoNameDisplay');
            if (displayLabel) {
                displayLabel.textContent = activeFlujoName || "Configuración Personalizada";
            }
        } else {
            container.classList.add('hidden');
            container.classList.remove('flex');
        }

    } catch (e) {
        console.error("Error inicializando Header Flujos Context:", e);
    }
};

window.renameActiveFlujo = async function() {
    const flujoId = window.globalContext?.flujoId;
    if (!flujoId || flujoId === "CRUDO") return;

    const displayLabel = document.getElementById('headerFlujoNameDisplay');
    const currentName = displayLabel ? displayLabel.textContent : '';

    const { value: newName } = await Swal.fire({
        title: 'Renombrar Configuración',
        input: 'text',
        inputValue: currentName,
        inputPlaceholder: 'Ej: Proveedor - Fecha | Lista Especial...',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true, confirmButtonText: 'Actualizar', cancelButtonText: 'Cancelar', confirmButtonColor: '#4f46e5', cancelButtonColor: '#334155'
    });

    if (!newName || newName.trim() === '' || newName === currentName) return;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/flujos/${flujoId}/nombre`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_flujo: newName })
        });

        if (!res.ok) throw new Error("El sistema ha impedido el renombrado (Conflicto de DB).");
        
        if (displayLabel) displayLabel.textContent = newName.trim();
        
        // Sincronizar cache y las opciones del select silenciosamente
        if (window.cachedFlujos) {
            const f = window.cachedFlujos.find(x => x.id_flujo === flujoId);
            if(f) f.nombre_flujo = newName.trim();
        }
        const opt = document.querySelector(`#headerFlujoSelect option[value="${flujoId}"]`);
        if (opt) opt.textContent = newName.trim();

        Swal.fire({ icon: 'success', title: 'Identidad Acualizada', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#0f172a', color: '#f8fafc' });
    } catch(e) {
        Swal.fire({ title: 'Avertencia de Estado', text: e.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
    }
};

window.cambiarFlujoActivo = async function(flujoId) {
    console.log(`[ViewerCore] Cambiando Flujo al vuelo a ID: ${flujoId}`);
    
    // Validar si hay datos en pantalla
    if (!window.currentSheetData) {
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Primero debe cargar una hoja de datos.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
        else alert("Primero debe cargar una hoja de datos.");
        return;
    }

    if (!flujoId || flujoId === "") {
        if (typeof Swal !== 'undefined') {
            const res = await Swal.fire({
                title: '¿Limpiar Plantilla?',
                text: '¿Está seguro de limpiar todo y volver al formato en crudo?',
                icon: 'warning', background: '#0f172a', color: '#f8fafc',
                showCancelButton: true, confirmButtonText: 'Sí, limpiar', confirmButtonColor: '#ef4444', cancelButtonColor: '#334155'
            });
            if (!res.isConfirmed) return;
        } else {
            if (!confirm("¿Está seguro de limpiar todo y volver al formato en crudo?")) return;
        }
        window.resetViewerState(true);
        window.globalContext.flujoId = null;
        if (currentSheetName) window.loadSheet(currentSheetName);
        return;
    }

    // Modal de confirmación (Pisar cambios)
    if (typeof Swal !== 'undefined') {
        const res = await Swal.fire({
            title: '¿Aplicar Flujo?',
            text: '¿Desea aplicar este flujo? Esto sobreescribirá todas las variables en pantalla.',
            icon: 'warning', background: '#0f172a', color: '#f8fafc',
            showCancelButton: true, confirmButtonText: 'Sí, aplicar', confirmButtonColor: '#2563eb', cancelButtonColor: '#334155'
        });
        if (!res.isConfirmed) return;
    } else {
        if (!confirm("¿Desea aplicar este flujo? Esto sobreescribirá todas las columnas y fórmulas actuales.")) return;
    }

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

    if (typeof Swal !== 'undefined') {
        const res = await Swal.fire({
            title: '¿Eliminar Configuración?',
            text: '¿Estás seguro de eliminar toda la configuración guardada? Esto borrará permanentemente el mapeo y reglas.',
            icon: 'error', background: '#0f172a', color: '#f8fafc',
            showCancelButton: true, confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444', cancelButtonColor: '#334155'
        });
        if (!res.isConfirmed) return;
    } else {
        if (!confirm("¿Estás seguro de eliminar toda la configuración guardada para esta hoja? Esto borrará el mapeo y las reglas.")) {
            return;
        }
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

    // [NUEVO] Asegurar que el caché de nomenclatura global esté precargado para el Scanner de Visibilidad
    if (typeof loadNomenclature === 'function' && typeof nomenclatureCache !== 'undefined' && nomenclatureCache.length === 0) {
        console.log("📦 [BOOT] Precargando Caché Global de Nomenclatura...");
        await loadNomenclature();
    }

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
                        
                        // [QA-FIX] Mapeo resiliente por índice para soportar nombres de hoja dinámicos (Ej: fechas)
                        const storedSheets = Object.keys(payload.sheets);
                        const currentFileSheets = window.currentSheetList || [window.currentSheetName];
                        
                        let mappedStore = {};
                        
                        currentFileSheets.forEach((currentName, idx) => {
                            if (payload.sheets[currentName]) {
                                // Coincidencia exacta
                                mappedStore[currentName] = payload.sheets[currentName];
                            } else if (idx < storedSheets.length) {
                                // Coincidencia por índice (Fallback)
                                console.warn(`[FLUJOS] Nombre de hoja difiere. Mapeando plantilla de '${storedSheets[idx]}' a '${currentName}' (Índice ${idx})`);
                                mappedStore[currentName] = payload.sheets[storedSheets[idx]];
                            }
                        });
                        
                        // Si sobraron hojas en el payload que no matchearon (por si acaso)
                        storedSheets.forEach(stName => {
                            if (!Object.values(mappedStore).includes(payload.sheets[stName])) {
                                mappedStore[stName] = payload.sheets[stName];
                            }
                        });

                        // [CRITICAL NORMALIZATION FIX] Garantizar formato V8 estricto
                        Object.keys(mappedStore).forEach(sName => {
                            if (mappedStore[sName] && mappedStore[sName].pipelines) {
                                Object.keys(mappedStore[sName].pipelines).forEach(vId => {
                                    if (Array.isArray(mappedStore[sName].pipelines[vId])) {
                                        mappedStore[sName].pipelines[vId] = {
                                            masterField: null,
                                            rules: mappedStore[sName].pipelines[vId]
                                        };
                                    }
                                });
                            }
                        });

                        window.sheetConfigStore = mappedStore;
                        console.warn("🪲 [DEBUG] sheetConfigStore asignado:", window.sheetConfigStore);
                        console.warn("🪲 [DEBUG] window.currentSheetName es:", window.currentSheetName);
                        
                        // Reactivar el estado solo para la hoja actual (Virgin State para las demas)
                        if (typeof loadSheetState === 'function' && window.currentSheetName) {
                            console.warn(`🪲 [DEBUG] Ejecutando loadSheetState('${window.currentSheetName}')`);
                            loadSheetState(window.currentSheetName);
                            console.warn("🪲 [DEBUG] window.columnMapping DESPUÉS de loadSheetState:", window.columnMapping);
                        } else {
                            console.warn("🪲 [DEBUG] No se ejecutó loadSheetState! typeof loadSheetState:", typeof loadSheetState, "currentSheetName:", window.currentSheetName);
                        }
                    } else {
                        console.warn("🪲 [DEBUG] Flujo NO es isMultiSheet o no tiene sheets!");
                        console.log("⚠️ [FLUJOS] Fallback: Hidratando formato Legacy Plano");
                        
                        // 1. Offset y EndOffset
                        if (payload.offset) {
                            window.currentOffset = payload.offset;
                            window.offsetSelectionMode = false;
                        }
                        if (payload.endOffset) {
                            window.currentEndOffset = payload.endOffset;
                            window.endOffsetSelectionMode = false;
                        }

                        // 2. Arrays Virtuales y Calculados
                        if (payload.virtualColumns) window.virtualColumns = payload.virtualColumns;
                        if (payload.computedColumns) window.computedColumns = payload.computedColumns;

                        // 3. Mapping
                        if (payload.columnMapping) window.columnMapping = payload.columnMapping;

                        // 4. Pipelines ETL (Con Normalización V8 In-Place para prevenir Crashes)
                        if (payload.draftPipelines) {
                            let normDraft = {};
                            Object.keys(payload.draftPipelines).forEach(vId => {
                                let item = payload.draftPipelines[vId];
                                if (Array.isArray(item)) {
                                    normDraft[vId] = { masterField: null, rules: item };
                                } else {
                                    normDraft[vId] = item;
                                }
                            });
                            window.draftPipelines = normDraft;
                        }

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

                    // [V5/V8] Hydrate Computed Columns from Backend (Modern First, Legacy Fallback)
                    if (resultV3.data.computedCols && Array.isArray(resultV3.data.computedCols)) {
                        window.computedColumns = resultV3.data.computedCols;
                        console.log("✅ [V8] Columnas Calculadas recuperadas (Modern Payload):", window.computedColumns.length);
                    } else if (resultV3.data.reglas_procesamiento.computedColumns) {
                        window.computedColumns = Array.isArray(resultV3.data.reglas_procesamiento.computedColumns)
                            ? resultV3.data.reglas_procesamiento.computedColumns
                            : [];
                        console.log("✅ [V5] Columnas Calculadas recuperadas (Legacy):", window.computedColumns.length);
                    }
                    
                    // [V8] Hydrate Draft Pipelines (AI Abstract Syntax Trees for Ghost/Virtual Columns)
                    if (resultV3.data.draftPipelines) {
                        window.draftPipelines = resultV3.data.draftPipelines;
                        console.log("✅ [V8] Draft Pipelines (Reglas IA en RAM) recuperados:", Object.keys(window.draftPipelines).length);
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
                    if (!window.draftPipelines) window.draftPipelines = {}; // [V8 HYBRID MERGE] Evitar aplastar el AST cargado en V3

                    // 3. RECONSTRUIR PIPELINES MULTI-HOJA
                    for (const m of resultV4.mapeos) {
                        const rulesArr = (m.mapeo_reglas_aplicadas || []).map(r => ({
                            id: r.regla_id,
                            nombre_regla: r.reglas_limpieza ? r.reglas_limpieza.nombre_regla : 'Regla Desconocida',
                            tipo_regex: r.reglas_limpieza ? r.reglas_limpieza.tipo_regex : 'unknown',
                            descripcion: ""
                        }));

                        let vColId = `col_${m.columna_origen_index}`; // Map DB integer to valid proxy string

                        // [QA BUGFIX: DESACOPLE DE GHOSTS]
                        // Si la columna física está secuestrada por un Placeholder en memoria, restaurar el Surrogate Key real.
                        // Esto previene que el UI pierda la pista del ID dinámico y re-inyecte duplicados ("nueva vacía").
                        if (window.virtualColumns) {
                            const ghost = window.virtualColumns.find(v => v.dataIdx === m.columna_origen_index && v.isGhostPlaceholder);
                            if (ghost) {
                                vColId = ghost.id; // Volver a col_ph_17000xxxx
                            }
                        }

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
                    <input type="text" id="${targetIdPrefix}SearchInput" placeholder="Filtrar datos..." oninput="if(window._searchT) clearTimeout(window._searchT); window._searchT = setTimeout(() => ${onSearchCallbackName}(), 400)" 
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
