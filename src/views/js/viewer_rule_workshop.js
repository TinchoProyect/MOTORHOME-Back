/**
 * VIEWER RULE WORKSHOP (V4)
 * Phase 3: The Right Panel and Rule Pipeline Builder
 */

// [Fase 5.2] Helper determinista para resolver el crudo de columnas calculadas/fantasmas iterativamente
export function resolveRawValueForRow(row, targetColId) {
    let physicalIdx = targetColId;

    if (window.computedColumns) {
        const comp = window.computedColumns.find(c => c.id === targetColId);
        if (comp && comp.operands && comp.operands.length > 0) {
            let opA = comp.operands[0];
            return resolveRawValueForRow(row, opA); 
        }
    }

    if (typeof physicalIdx === 'string') {
        if (window.virtualColumns) {
            const vCol = window.virtualColumns.find(c => c.id === physicalIdx);
            if (vCol && vCol.dataIdx !== undefined && vCol.dataIdx !== null) {
                physicalIdx = vCol.dataIdx;
            }
        }
    }

    if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) {
        let pId = parseInt(physicalIdx.replace('col_', ''), 10);
        if (!isNaN(pId)) physicalIdx = pId;
    }

    if (typeof physicalIdx !== 'number' || isNaN(physicalIdx) || physicalIdx < 0) return "";
    return String(row[physicalIdx] || "");
}

let isPanelOpen = false;
let currentDraftPipeline = [];
let activeContext = {
    masterField: null,
    colIndex: null,
    colName: null
};

// Available Rules Catalog (Fetched from API)
let catalogRules = [];

// Live Search State for Custom Rules
window.activeCustomSearch = { text: "", colIndex: null };

export async function initRuleWorkshop() {
    console.log('🔗 [WORKSHOP] Inicializado');
    await loadRuleCatalog();
}

async function loadRuleCatalog() {
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        let queryParams = "";
        if (window.globalContext && window.globalContext.providerId && window.currentSheetName) {
            queryParams = `?providerId=${window.globalContext.providerId}&sheetName=${encodeURIComponent(window.currentSheetName)}`;
        }

        const response = await fetch(`${backendUrl}/api/mapping/rules${queryParams}`);
        if (response.ok) {
            catalogRules = await response.json();
            
            console.log(`✅ [WORKSHOP] Catálogo de reglas cargado: ${catalogRules.length} reglas.`);
            renderRuleSelector();
        } else {
            console.error(`❌ [WORKSHOP] Error HTTP cargando reglas: ${response.status}`);
        }
    } catch (err) {
        console.error("Error cargando catálogo de reglas:", err);
    }
}

function renderRuleSelector() {
    const selector = document.getElementById('vrwRuleSelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">Seleccionar transformación...</option>';

    const currentMasterId = activeContext.masterField ? activeContext.masterField.id : null;

    // Filtrar aislando el scope y luego ordenar dando prioridad a las reglas estrella
    const filteredRules = catalogRules.filter(rule => {
        if (rule.campo_maestro_id && rule.campo_maestro_id !== currentMasterId) {
            // [V5.20 UX] Excepción: Hacemos que la regla de Formato (Ej. format_number) sea Universal
            if (rule.tipo === 'format_number' || String(rule.nombre_regla).toLowerCase().includes('formato')) {
                return true;
            }
            return false; 
        }
        return true;
    });

    filteredRules.sort((a, b) => {
        const aIsSpecific = (a.campo_maestro_id === currentMasterId && currentMasterId);
        const bIsSpecific = (b.campo_maestro_id === currentMasterId && currentMasterId);
        if (aIsSpecific && !bIsSpecific) return -1;
        if (!aIsSpecific && bIsSpecific) return 1;
        return 0; // Mantiene el orden original si ambas son (o no son) especificas
    });

    filteredRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule.id;
        option.textContent = rule.nombre_regla;
        if (rule.campo_maestro_id === currentMasterId && currentMasterId) {
            option.textContent = `★ ${rule.nombre_regla}`; // Destacar regla particular
        }
        
        selector.appendChild(option);
    });

    // Inyectar Regla Local Bespoke (COMBINE_NUMERIC)
    const bespokeOption = document.createElement('option');
    bespokeOption.value = 'BESPOKE_COMBINE_NUMERIC';
    bespokeOption.textContent = '⚡ Resolver duplicados por combinación';
    bespokeOption.className = 'font-bold text-amber-400 bg-amber-900/20';
    selector.appendChild(bespokeOption);

    const hashOption = document.createElement('option');
    hashOption.value = 'BESPOKE_COMBINE_HASH';
    hashOption.textContent = '⚡ Resolver duplicados por texto (Hash)';
    hashOption.className = 'font-bold text-fuchsia-400 bg-fuchsia-900/20';
    selector.appendChild(hashOption);

    const discountOption = document.createElement('option');
    discountOption.value = 'BESPOKE_MATH_DISCOUNT';
    discountOption.textContent = '⚡ Aplicar Descuento Fijo (%)';
    discountOption.className = 'font-bold text-cyan-400 bg-cyan-900/20';
    selector.appendChild(discountOption);

    // [REQ QA] Inyección de Regla de Limpieza Local (Scoping Exclusivo)
    // Sólo debe existir y ser visible si la columna destino es "código"
    if (currentMasterId || activeContext.masterField) {
        const targetName = String(activeContext.masterField.nombre_campo || '').toLowerCase().trim();
        // Fallback: el API puede devolver IDs alfanuméricos como diccionarios, o nombres directos.
        if (targetName === 'código' || targetName === 'codigo') {
            const strictNumericOption = document.createElement('option');
            strictNumericOption.value = 'BESPOKE_STRICT_NUMERIC';
            strictNumericOption.textContent = '⚡ Validador Numérico Estricto (Limpieza)';
            strictNumericOption.className = 'font-bold text-rose-400 bg-rose-900/20';
            strictNumericOption.title = 'Conserva la celda solo si es 100% números. Vacía si contiene letras o símbolos.';
            selector.appendChild(strictNumericOption);
        }
    }
}

// OPEN PANEL
export async function open(masterField, vColId, colName) {
    if (window.checkFlujoMutationGuard) {
        const isSafeToEdit = await window.checkFlujoMutationGuard();
        if (!isSafeToEdit) return; // User cancelled or aborted
    }

    // Normalización Urgente (Bug Mapeo Duplicado)
    if (vColId !== null && vColId !== undefined) {
        let strId = String(vColId);
        if (!isNaN(strId) && strId.trim() !== '') {
            vColId = 'col_' + strId;
        } else {
            vColId = strId;
        }
    }

    if (!masterField) {
        // Validación de existencia en pipeline previo
        if (window.draftPipelines && window.draftPipelines[vColId] && window.draftPipelines[vColId].masterField) {
            masterField = window.draftPipelines[vColId].masterField;
        } else if (window.columnMapping && window.columnMapping[vColId] && window.columnMapping[vColId] !== 'Ignorar Columna') {
            // [UX FIX] Cobertura Extrema: Rehidratar masterField desde un Mapeo Primario puro
            masterField = { id: window.columnMapping[vColId] };
        }
    }

    // [V8 ARCHITECTURE STRICT SHIELD] Validador Universal de Capa 2
    // Todo acceso al Taller de Transformación REQUIERE vinculación granítica (Capa 2 confirmada).
    let isMasterLinked = false;
    
    if (masterField && masterField.id) {
        // 1. Verificación Empírica Estricta: Cruce con Diccionario Maestro
        // Un campo maestro real DEBE existir en masterDictionary.
        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
            const match = window.masterDictionary.find(m => 
                String(m.id) === String(masterField.id) || 
                String(m.nombre_campo) === String(masterField.nombre_campo) ||
                String(m.nombre_campo) === String(masterField.id)
            );
            if (match) {
                isMasterLinked = true;
                // Saneamiento estructural
                masterField.id = match.id;
                masterField.nombre_campo = match.nombre_campo;
            }
        }
    }

    // BLOQUEO ESTRUCTURAL: Carece de Capa 2 (Solo Mapeo Primario o Nulo)
    if (!isMasterLinked) {
        console.error("🚨 VIGÍA DE ALERTA ROJA - ACCESO RECHAZADO: Columna sin Vinculación Maestra (Solo Mapeo Primario detectado).", { masterField, vColId });
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: '<span style="color: #e2e8f0; font-weight: 800; letter-spacing: 0.05em;">ACCESO BLOQUEADO</span>',
                html: '<span style="color: #94a3b8; font-size: 13px;">Para acceder al Taller de Transformación, primero debe vincular esta columna mapeada a una Columna Maestra.</span>',
                background: 'rgba(15, 23, 42, 0.85)',
                backdrop: 'rgba(0, 0, 0, 0.65)',
                customClass: {
                    popup: 'border border-slate-700/50 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md rounded-xl',
                    confirmButton: 'bg-blue-600/80 hover:bg-blue-500 text-white font-bold tracking-widest text-[11px] uppercase border border-blue-500/50 backdrop-blur-sm'
                },
                confirmButtonText: 'Entendido'
            });
        }
        return; // Interceptor de Flujo
    }

    // [NEW] Prevención Estricta de Doble Mapeo (Validación 1 a 1)
    if (masterField) {
        let isAlreadyMapped = false;
        
        // [FIX] Validar si la edición viene del propio dueño de la columna
        const isSelfEdit = (window.draftPipelines && window.draftPipelines[vColId] && window.draftPipelines[vColId].masterField?.id === masterField.id) || 
                           (window.columnMapping && window.columnMapping[vColId] && (window.columnMapping[vColId] === masterField.id || window.columnMapping[vColId] === masterField.nombre_campo)) ||
                           (window.computedColumns && window.computedColumns.find(c => c.id === vColId && c.masterField?.id === masterField.id));

        if (!isSelfEdit) {
            if (window.draftPipelines) {
                for (const [id, pipe] of Object.entries(window.draftPipelines)) {
                    if (id !== vColId && pipe.masterField && pipe.masterField.id === masterField.id) {
                        isAlreadyMapped = true;
                        break;
                    }
                }
            }
            
            if (!isAlreadyMapped && window.columnMapping) {
                for (const [id, term] of Object.entries(window.columnMapping)) {
                    if (id !== vColId && (term === masterField.nombre_campo || term === masterField.id)) {
                        isAlreadyMapped = true;
                        break;
                    }
                }
            }
    
            if (isAlreadyMapped) {
                if (window.viewerMapper && typeof window.viewerMapper.cancelMapping === 'function') {
                    window.viewerMapper.cancelMapping();
                }
                if (typeof Swal !== 'undefined') {
                    const result = await Swal.fire({
                        title: 'Mapeo Duplicado Detectado',
                        text: `El campo orgánico "${masterField.nombre_campo}" ya se encuentra asignado a otra columna oculta o existente.`,
                        icon: 'warning',
                        background: '#0f172a',
                        color: '#f8fafc',
                        showCancelButton: true,
                        confirmButtonText: 'Forzar reasignación',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#2563eb',
                        cancelButtonColor: '#334155'
                    });
                    
                    if (!result.isConfirmed) return;

                    // Limpieza Forzada de Mapeos Ocultos/Anteriores
                    if (window.draftPipelines) {
                        for (const k of Object.keys(window.draftPipelines)) {
                            if (window.draftPipelines[k].masterField?.id === masterField.id) {
                                delete window.draftPipelines[k];
                            }
                        }
                    }
                    if (window.columnMapping) {
                        for (const k of Object.keys(window.columnMapping)) {
                            if (window.columnMapping[k] === masterField.nombre_campo || window.columnMapping[k] === masterField.id) {
                                delete window.columnMapping[k];
                            }
                        }
                    }
                    if (window.computedColumns) {
                        const idx = window.computedColumns.findIndex(c => c.masterField?.id === masterField.id);
                        if (idx !== -1) window.computedColumns.splice(idx, 1);
                    }

                    // Se limpió correctamente, continuamos a montar el taller
                    if (window.viewerRender && window.viewerRender.updateHeaders) window.viewerRender.updateHeaders();
                    
                    // [Fix N° 1] Eliminar Estado Fantasma Inmortal en DB
                    if (typeof window.saveSheetState === 'function') {
                        window.saveSheetState(window.currentSheetName || null, false);
                    }
                    if (window.VigiaLogger) {
                        window.VigiaLogger.success("STATE", "Mapeos Fantasmas pre-existentes purgados de la memoria y validados en Base de Datos.", { field: masterField.nombre_campo });
                    }
                } else {
                    alert(`El campo "${masterField.nombre_campo}" ya está asignado a otra columna. Desvincúlalo primero.`);
                    return;
                }
            }
        }
    }

    // --- [BUGFIX UI/UX] Restaurar Persistencia de Apagado de Editor Matemático ---
    try {
        const lsGlobKey = 'LAMDA_MATH_OPTOUT_' + (window.globalContext && window.globalContext.providerName ? window.globalContext.providerName.replace(/\s+/g,'_') : 'GLOBAL');
        const storedStr = localStorage.getItem(lsGlobKey);
        if (storedStr) {
            const arr = JSON.parse(storedStr);
            if (!window.m_optOutComputed) window.m_optOutComputed = new Set();
            arr.forEach(id => window.m_optOutComputed.add(id));
        }
    } catch(e) { console.warn("No se pudo leer LocalStorage para Math Opt-Out", e); }
    // ---------------------------------------------------------------------------------

    // Check if we need to CLONE or OVERWRITE
    let activeVColId = vColId;
    let hasConflict = false;

    // V4 Conflict (Pipeline)
    if (window.draftPipelines && window.draftPipelines[vColId] && window.draftPipelines[vColId].masterField && masterField.id !== window.draftPipelines[vColId].masterField.id) {
        hasConflict = true;
    }
    // V3 Conflict (Legacy Mapping)
    else if (window.columnMapping && window.columnMapping[vColId] && window.columnMapping[vColId] !== 'Ignorar Columna') {
        const mappedTerm = window.columnMapping[vColId];
        if (mappedTerm.toUpperCase() !== masterField.nombre_campo.toUpperCase()) {
            hasConflict = true;
        }
    }

    if (hasConflict) {
        // [V5.16 UX] 4-Way Overwrite/Clone/Edit/Delete Dialog
        let userAction = null;

        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                title: 'Menú de Mapeo',
                html: `<div class="text-sm text-slate-300 mb-4">La columna visual <b>${colName}</b> ya se encuentra mapeada. ¿Qué deseas hacer con esta columna?</div>
                    <div class="flex flex-col gap-2">
                        <button id="btnClone" class="w-full text-left px-4 py-3 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/50 text-blue-100 rounded-lg font-bold text-sm transition-all"><i data-lucide="copy" class="w-4 h-4 inline mr-2 align-text-bottom"></i> Clonar (Extraer Paralelo)</button>
                        <button id="btnReplace" class="w-full text-left px-4 py-3 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/50 text-orange-100 rounded-lg font-bold text-sm transition-all"><i data-lucide="file-minus" class="w-4 h-4 inline mr-2 align-text-bottom"></i> Reemplazar (Borra reglas previas)</button>
                        <button id="btnEdit" class="w-full text-left px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-100 rounded-lg font-bold text-sm transition-all"><i data-lucide="edit-3" class="w-4 h-4 inline mr-2 align-text-bottom"></i> Editar (Abre Taller conservando reglas)</button>
                        <button id="btnDelete" class="w-full text-left px-4 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-100 rounded-lg font-bold text-sm transition-all"><i data-lucide="trash-2" class="w-4 h-4 inline mr-2 align-text-bottom"></i> Eliminar (Quita el mapeo sin abrir nada)</button>
                    </div>
                `,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Cancelar',
                background: '#0f172a',
                color: '#f8fafc',
                didOpen: () => {
                    if (window.lucide) window.lucide.createIcons({ root: Swal.getPopup() });
                    const popup = Swal.getPopup();
                    popup.querySelector('#btnClone').onclick = () => { userAction = 'clone'; Swal.close(); };
                    popup.querySelector('#btnReplace').onclick = () => { userAction = 'replace'; Swal.close(); };
                    popup.querySelector('#btnEdit').onclick = () => { userAction = 'edit'; Swal.close(); };
                    popup.querySelector('#btnDelete').onclick = () => { userAction = 'delete'; Swal.close(); };
                }
            });
        } else {
            // Fallback for native alerts
            const action = prompt(`La columna ${colName} ya está mapeada. Escribe 'clonar', 'reemplazar', 'editar', o 'eliminar':`, 'editar');
            if (action) userAction = action.toLowerCase().trim();
        }

        if (!userAction) return; // Cancelled completely

        if (userAction === 'delete' || userAction === 'eliminar') {
            console.log(`🗑️ [WORKSHOP] User deleted mapping on ${vColId} via 4-Way Menu`);
            if (window.draftPipelines) delete window.draftPipelines[vColId];
            if (window.processingRules) delete window.processingRules[vColId];
            if (window.columnMapping) delete window.columnMapping[vColId];

            // If it's a clone natively, remove the column altogether
            if (vColId.includes('_clone_') && window.virtualColumns) {
                const idx = window.virtualColumns.findIndex(v => v.id === vColId);
                if (idx !== -1) window.virtualColumns.splice(idx, 1);
            }

            if (typeof window.triggerSafeRender === 'function') {
                window.triggerSafeRender();
            } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
                window.renderVirtualTable(window.currentSheetData);
            }
            if (typeof window.saveSheetState === 'function') {
                window.saveSheetState(window.currentSheetName);
            }

            // Silent server save to persist deletion
            if (typeof window.saveSimulationConfig === 'function') {
                window.saveSimulationConfig(null, true);
            }

            return; // Abort workshop open
        }

        if (userAction === 'clone' || userAction === 'clonar') {
            // Validation: Cannot clone if no virtual column found
            const vColObj = window.virtualColumns ? window.virtualColumns.find(v => v.id === vColId) : null;
            if (!vColObj) {
                if (typeof Swal !== 'undefined') {
                    await Swal.fire({
                        title: 'Clonación Fallida',
                        text: 'La columna virtual original no fue encontrada.',
                        icon: 'error',
                        background: '#0f172a', color: '#f8fafc'
                    });
                } else {
                    alert("No se puede clonar: la columna virtual original no fue encontrada.");
                }
                return;
            }

            // Trigger cloning process
            let cloneCounter = 1;
            let newVColId = `${vColId}_clone_${cloneCounter}`;
            while (window.virtualColumns.find(v => v.id === newVColId)) {
                cloneCounter++;
                newVColId = `${vColId}_clone_${cloneCounter}`;
            }

            // Inyectar el nuevo objeto virtualColumns justo después del original
            const idx = window.virtualColumns.findIndex(v => v.id === vColId);
            window.virtualColumns.splice(idx + 1, 0, { id: newVColId, dataIdx: vColObj.dataIdx });

            console.log(`🪄 [WORKSHOP] Clonación UX Confirmada: Se creó ${newVColId} a partir de ${vColId}`);
            activeVColId = newVColId;

            // Forzar render de la tabla virtual para mostrar la nueva columna ahora visualmente
            if (typeof window.triggerSafeRender === 'function') {
                window.triggerSafeRender();
            } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
                window.renderVirtualTable(window.currentSheetData);
            }
        }
        else if (userAction === 'replace' || userAction === 'reemplazar') {
            // Reemplazar: Limpiar config antigua localmente antes de montar la nueva
            console.log(`🔨 [WORKSHOP] Reemplazo UX Confirmado: Sobreescribiendo mapeo en ${vColId}`);
            if (window.draftPipelines) delete window.draftPipelines[vColId];
            if (window.processingRules) delete window.processingRules[vColId];
            if (window.columnMapping) delete window.columnMapping[vColId];
        }
        else if (userAction === 'edit' || userAction === 'editar') {
            console.log(`📝 [WORKSHOP] Edición UX Confirmada: Abriendo Taller conservando reglas previas en ${vColId}`);
            // No se borran ni modifican diccionarios, así 'currentDraftPipeline' puede heredar abajo
        }
    }

    activeContext = { masterField, colIndex: activeVColId, colName };
    isPanelOpen = true;

    // Retrieve draft pipeline if it already exists in memory for this column
    if (window.draftPipelines && window.draftPipelines[activeVColId]) {
        currentDraftPipeline = [...window.draftPipelines[activeVColId].rules];
    } else {
        currentDraftPipeline = [];
    }

    // [V5.20 Requerimiento UI: Trazabilidad Triple]
    let origenTexto = "Origen Desconocido";
    if (activeVColId.startsWith('col_ph_')) {
        origenTexto = "Fantasma: " + (colName || 'Sin Nombre');
    } else if (activeVColId.startsWith('comp_')) {
        origenTexto = "Columna Calculada";
    } else if (activeVColId.startsWith('col_clone_')) {
        origenTexto = "Columna Clonada";
    } else {
        const vCol = window.virtualColumns ? window.virtualColumns.find(c => c.id === activeVColId) : null;
        if (vCol && vCol.dataIdx !== undefined) {
             let physicalColNumber = parseInt(vCol.dataIdx) + 1;
             origenTexto = `Col ${physicalColNumber}`;
        } else if (activeVColId.startsWith('col_')) {
             let n = activeVColId.replace('col_', '');
             if (!isNaN(n)) origenTexto = `Col ${parseInt(n) + 1}`;
        }
    }

    const primaryMappingName = colName ? colName : "Sin Mapeo Primario";
    const masterDestName = masterField ? masterField.nombre_campo : "Sin Destino";

    // UI Updates
    document.getElementById('vrwCurrentMappingInfo').innerHTML = `
        <div class="flex flex-row items-center justify-between w-full gap-4">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-slate-400 text-xs mb-1">Trazabilidad de la Columna:</span>
                <div class="flex items-center gap-2 text-[11px] font-mono bg-slate-950/50 p-1.5 rounded border border-slate-700/50 w-full overflow-hidden flex-wrap">
                    <span class="text-slate-300 font-bold bg-slate-800 px-2 py-0.5 rounded shadow-sm shrink-0" title="Base: ${activeVColId}">[${origenTexto}]</span>
                    <i data-lucide="arrow-right" class="w-3 h-3 text-slate-500 shrink-0"></i>
                    <span class="text-emerald-300 font-bold bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-500/20 truncate max-w-[150px] shadow-sm shrink-0" title="Mapeo Primario: ${primaryMappingName}">${primaryMappingName}</span>
                    <i data-lucide="arrow-right" class="w-3 h-3 text-blue-400 shrink-0"></i>
                    <span class="text-blue-300 font-bold bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/20 truncate min-w-[50px] flex-1 shadow-sm shrink-0" title="Columna Maestra: ${masterDestName}">${masterDestName}</span>
                </div>
            </div>
            <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.unlinkCurrentCol()" class="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:shadow-lg shadow-red-900/20" title="Romper la vinculación maestra de esta columna">
                <i data-lucide="unlink" class="w-3 h-3"></i> Desvincular
            </button>
        </div>
    `;
    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.remove('hidden', 'translate-x-full', 'opacity-0');
    }

    if (window.lucide) window.lucide.createIcons();
    
    // [Garbage Collection Inicial] Si existe un contexto ajeno/sucio remanente, limpiarlo.
    if (window._activeComputedContext && window._activeComputedContext.colIndex !== activeVColId) {
        window._activeComputedContext = null;
    }

    // BUG FIX UI/UX: Inicialización Estricta de Estado del Toggle Matemático
    // Evaluamos si estrictamente estamos frente a una columna matemática/virtual (Virtual/Fantasma)
    const isComputedConfig = window.computedColumns && window.computedColumns.find(c => c.id === activeVColId);
    const isVirtualPlaceholder = window.virtualColumns && window.virtualColumns.find(c => c.id === activeVColId && (c.isGhostPlaceholder === true || c.isCalculated === true));
    
    // [QA BUGFIX] Detección estructural: si el ID empieza con col_ph_, es un ghost por definición
    const isGhostById = activeVColId && activeVColId.startsWith('col_ph_');
    
    // [QA FIX] Validation of Origin: Only default to math if not a raw physical column
    let isPhysicallyPhantom = false;
    let isNativeRaw = window.rawHeaders !== undefined && window.rawHeaders[activeVColId] !== undefined;

    if (!isNativeRaw && window.currentSheetData && window.currentSheetData.length > 0) {
        const vCol = window.virtualColumns ? window.virtualColumns.find(c => c.id === activeVColId) : null;
        let dataIdx = -1;
        if (vCol && vCol.dataIdx !== undefined) dataIdx = vCol.dataIdx;
        else if (String(activeVColId).startsWith('col_')) dataIdx = parseInt(String(activeVColId).replace('col_', '').replace('ph_', ''));
        
        if (!isNaN(dataIdx)) {
            // Check signature of Injection
            if (window.currentSheetData[0] && window.currentSheetData[0][dataIdx] === 'NUEVA (VACÍA)') {
                isPhysicallyPhantom = true;
            }
            else if (vCol && vCol.isGhostPlaceholder) {
                isPhysicallyPhantom = true;
            }
            else if (dataIdx >= window.currentSheetData[0].length) {
               // Out of bounds detection for physical phantom
               isPhysicallyPhantom = true;
            }
        }
    }
    
    // VIGÍA DE QA EXIGIDO
    console.error("🚨 VIGÍA DE ALERTA ROJA - DIAGNÓSTICO UI - Evaluando Columna:", activeVColId, {isNativeRaw, isComputedConfig, isVirtualPlaceholder, isGhostById, isPhysicallyPhantom});

    // Modificación de Bugfix (Exigencia QA): El Editor Matemático no debe encenderse por defecto
    // solo por ser una columna vacía (Ghost/Phantom). Solo debe encenderse si tiene una configuración
    // matemática activa guardada (isComputedConfig) o si el usuario clickeó forzarlo.
    let isMathOptOut = false;
    if (window.m_optOutComputed) {
        if (window.m_optOutComputed.has(activeVColId)) isMathOptOut = true;
        if (masterField && (window.m_optOutComputed.has(masterField.id) || window.m_optOutComputed.has(masterField.nombre_campo))) isMathOptOut = true;
    }

    if (!isMathOptOut && (isComputedConfig || (window._activeComputedContext && window._activeComputedContext.colIndex === activeVColId))) {
        switchToComputedMode();
    } else {
        switchToStandardMode(false);
    }
    
    // [V5.x FIX] Repintar combobox filtrado por Scope (campo_maestro_id) para el campo abierto
    renderRuleSelector();

    renderPipeline();

    // Init AI Copilot UI dynamically (Cero Totem UI Injection)
    if (window.viewerAiUi && typeof window.viewerAiUi.init === 'function') {
        window.viewerAiUi.init();
        if (typeof window.viewerAiUi.setActiveMasterField === 'function') {
            window.viewerAiUi.setActiveMasterField(masterField);
        }
    } else {
        if (window.originalConsoleLog) window.originalConsoleLog("🚨 VIGÍA DEPURADOR CRÍTICO: window.viewerAiUi NO EXISTE o init no es función. El archivo js pudo fallar su parseo inicial.");
        if (typeof alert !== 'undefined') alert("🚨 VIGÍA DEPURADOR: El módulo Chofer IA no se exportó correctamente. Bloqueado en fase 0.");
    }

    // Trigger Preview Immediately
    triggerPreview();
}

/**
 * Switches the Workshop Panel visual state to Computed Editor 
 */
export function switchToComputedMode(forceUserActivate = false) {
    if (forceUserActivate && activeContext && activeContext.colIndex) {
        if (window.m_optOutComputed) {
            window.m_optOutComputed.delete(activeContext.colIndex);
        }
    }

    // BUG FIX Nº3: Mantenemos visible el modo estándar de reglas por debajo del panel matemático
    document.getElementById('vrwStandardMode').classList.remove('hidden');
    document.getElementById('vrwComputedMode').classList.remove('hidden');
    
    // Auto-Scroll to Top so the user doesn't miss the Math Formula Form
    const workshopScrollContainer = document.querySelector('#viewerRightPanel .custom-scrollbar');
    if (workshopScrollContainer) {
        workshopScrollContainer.scrollTop = 0;
    }
    
    const applyBtnTxt = document.getElementById('vrwBtnApplyText');
    if (applyBtnTxt) applyBtnTxt.innerText = "Guardar cambios";

    const applyBtn = document.getElementById('vrwBtnApply');
    if (applyBtn) {
        applyBtn.onclick = () => { if(window.saveComputedColumn) window.saveComputedColumn(); };
        applyBtn.className = "flex-grow py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.3)] border border-purple-400/20 flex items-center justify-center gap-2";
    }

    // Purgar / Configurar contexto
    if (!window._activeComputedContext) {
        window._activeComputedContext = {
            masterField: activeContext.masterField,
            colName: activeContext.colName || "Columna Fantasma",
            colIndex: activeContext.colIndex,
            originalCompId: (activeContext.colIndex && activeContext.colIndex.startsWith('col_ph_')) ? activeContext.colIndex : null
        };
        // Reset inputs since it's a new calc
        if (document.getElementById('calcColName')) document.getElementById('calcColName').value = activeContext.masterField?.nombre_campo || "Descuento";
    }

    // Poblar options
    if (window.openCalculationModal) window.openCalculationModal(true);
    
    // BUG FIX Nº1: Rehidratar el estado guardado si estamos editando
    if (window._activeComputedContext && window._activeComputedContext.originalCompId) {
        setTimeout(() => {
            const cId = window._activeComputedContext.originalCompId;
            const compConfig = window.computedColumns ? window.computedColumns.find(c => c.id === cId) : null;
            if (compConfig && compConfig.operands && compConfig.operands.length >= 1) {
                const elA = document.getElementById('calcFieldA');
                const elB = document.getElementById('calcFieldB');
                const elOp = document.getElementById('calcOperation');
                const elColName = document.getElementById('calcColName');
                const elTol = document.getElementById('calcTolerateEmpty');
                
                if (elOp) {
                    elOp.value = compConfig.macro;
                    // [V7] Forzar actualización de Interfaz (Dynamic UI) luego de hidratar el valor
                    if (typeof elOp.onchange === 'function') elOp.onchange();
                    else elOp.dispatchEvent(new Event('change'));
                }
                
                // Op A es la primera de cualquier tipo (CLONE o Normal)
                if (elA && compConfig.operands[0]) elA.value = compConfig.operands[0];
                
                if (compConfig.macro === 'CLONE' || compConfig.macro === 'CLONE_SEMANTIC') {
                    // Si hay multiples origenes, recrear dropdowns y valorizarlos
                    for (let i = 1; i < compConfig.operands.length; i++) {
                        if (compConfig.macro === 'CLONE_SEMANTIC' && i === compConfig.operands.length - 1) {
                            const elSemanticKey = document.getElementById('calcFieldSemanticKey');
                            if (elSemanticKey) elSemanticKey.value = compConfig.operands[i];
                        } else {
                            if (window.addCloneSourceUI) window.addCloneSourceUI();
                            // Al re-queryear tomará las dinamicas
                            const allSelects = document.querySelectorAll('.calc-source-dyn');
                            if (allSelects[i]) {
                                allSelects[i].value = compConfig.operands[i];
                            }
                        }
                    }
                } else if (compConfig.operands.length === 2 && elB) {
                    elB.value = compConfig.operands[1];
                }

                if (elColName) elColName.value = compConfig.masterField?.nombre_campo || "";
                if (elTol) elTol.checked = compConfig.tolerateEmpty !== false;
            }
        }, 100); // 100ms offset para garantizar que openCalculationModal ya insertó el DOM base.
    }
}

/**
 * Switches the Workshop Panel back to Standard ETL Rules
 */
export function switchToStandardMode(userOptOut = true) {
    window._activeComputedContext = null;

    // [QA BUGFIX] Limpieza profunda del estado matemático si el usuario desactiva el editor
    if (window.computedColumns && activeContext && activeContext.colIndex) {
        window.computedColumns = window.computedColumns.filter(c => c.id !== activeContext.colIndex);
    }

    // Guardar preferencia del usuario en esta sesión si lo apagó manualmente
    if (userOptOut && activeContext && activeContext.colIndex) {
        window.m_optOutComputed = window.m_optOutComputed || new Set();
        window.m_optOutComputed.add(activeContext.colIndex);
        
        let pKey = activeContext.colIndex;
        if (activeContext.masterField && activeContext.masterField.id) {
            window.m_optOutComputed.add(activeContext.masterField.id);
            pKey = activeContext.masterField.id;
        } else if (activeContext.colName) {
             window.m_optOutComputed.add(activeContext.colName);
             pKey = activeContext.colName;
        }
        
        try {
            const cacheKey = 'LAMDA_MATH_OPTOUT_' + (window.globalContext && window.globalContext.providerName ? window.globalContext.providerName.replace(/\s+/g,'_') : 'GLOBAL');
            const dataStr = localStorage.getItem(cacheKey);
            let pArr = dataStr ? JSON.parse(dataStr) : [];
            if (!pArr.includes(pKey)) {
                pArr.push(pKey);
                localStorage.setItem(cacheKey, JSON.stringify(pArr));
            }
        } catch(e) { console.warn("Fallo persisitiendo UI OptOut", e); }
    }

    document.getElementById('vrwStandardMode').classList.remove('hidden');
    document.getElementById('vrwComputedMode').classList.add('hidden');

    const applyBtnTxt = document.getElementById('vrwBtnApplyText');
    if (applyBtnTxt) applyBtnTxt.innerText = "Guardar cambios";

    const applyBtn = document.getElementById('vrwBtnApply');
    if (applyBtn) {
        applyBtn.onclick = () => { window.viewerRuleWorkshop.applyMapping(); };
        applyBtn.className = "flex-grow py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-400/20 flex items-center justify-center gap-2";
    }
}

// CLOSE PANEL
export function close() {
    // [UX: Absolute Persistence] Auto-commit to memory BEFORE destroying the context if there are rules
    if (activeContext.colIndex && activeContext.masterField && currentDraftPipeline && currentDraftPipeline.length > 0) {
        if (!window.draftPipelines) window.draftPipelines = {};
        console.log("🛡️ [WORKSHOP] Auto-commit por cierre de panel. Persistiendo reglas...");
        window.draftPipelines[activeContext.colIndex] = {
            masterField: activeContext.masterField,
            colName: activeContext.colName || 'Pendiente',
            rules: [...currentDraftPipeline]
        };
        if (window.viewerETL && typeof window.viewerETL.commitColumnMapping === 'function') {
            window.viewerETL.commitColumnMapping(activeContext.colIndex, activeContext.masterField, currentDraftPipeline);
        }
    }

    isPanelOpen = false;
    currentDraftPipeline = [];
    activeContext = { masterField: null, colIndex: null, colName: null };
    window._activeComputedContext = null; // Bug Fix N°1: Resetear contexto de calculadora para no contaminar próximos clicks

    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => panel.classList.add('hidden'), 300);
    }

    // Reset live search and force clean render
    if (window.activeCustomSearch && window.activeCustomSearch.text !== "") {
        window.activeCustomSearch.text = "";
        if (typeof window.triggerSafeRender === 'function') {
            window.triggerSafeRender();
        } else if (typeof renderVirtualTable === 'function' && window.currentSheetData) {
            renderVirtualTable(window.currentSheetData);
        }
    }

    if (window.viewerMapper) {
        window.viewerMapper.cancelMapping();
    }
}

// PIPELINE MANAGEMENT
export function addSelectedRule() {
    const selector = document.getElementById('vrwRuleSelector');
    if (!selector || !selector.value) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Atención',
                text: 'Selecciona una transformación del catálogo primero.',
                icon: 'warning',
                background: '#0f172a', color: '#f8fafc'
            });
        } else {
            alert("Atención: Selecciona una transformación del catálogo primero.");
        }
        return;
    }

    const ruleId = selector.value;
    
    // CASO A: Reglas Bespoke Locales
    if (ruleId === 'BESPOKE_STRICT_NUMERIC') {
        const strictRule = {
            id: 'BESPOKE_STRICT_NUMERIC',
            tipo: 'validate_numeric_strict',
            tipo_regex: 'VALIDATE_NUMERIC_STRICT',
            nombre_regla: 'Validador Numérico Estricto',
            descripcion: 'Limpieza Excluyente: Conserva el valor únicamente si contiene dígitos numéricos puros. Si la celda contiene al menos una letra, símbolo o espacio, se vaciará por completo.',
            campo_maestro_id: activeContext.masterField ? activeContext.masterField.id : null
        };
        console.log(`➕ [WORKSHOP] Añadiendo Regla Dinámica (Scoping Exclusivo): ${strictRule.nombre_regla}`);
        currentDraftPipeline.push(strictRule);
        renderPipeline();
        selector.value = "";
        triggerPreview();
        return;
    }

    if (ruleId === 'BESPOKE_COMBINE_NUMERIC') {
        promptCombineNumericRule();
        selector.value = "";
        return;
    }
    if (ruleId === 'BESPOKE_COMBINE_HASH') {
        promptCombineHashRule();
        selector.value = "";
        return;
    }
    if (ruleId === 'BESPOKE_MATH_DISCOUNT') {
        promptMathDiscountRule();
        selector.value = "";
        return;
    }
    // ruleId from DOM is a string, rule.id from DB is an int.
    const ruleObj = catalogRules.find(r => r.id.toString() === ruleId);

    if (ruleObj) {
        console.log(`➕ [WORKSHOP] Añadiendo Regla: ${ruleObj.nombre_regla} (ID: ${ruleObj.id})`);
        // We push a clone
        currentDraftPipeline.push({ ...ruleObj });
        renderPipeline();
        selector.value = ""; // reset

        triggerPreview();
    } else {
        console.error(`❌ [WORKSHOP] Regla ID ${ruleId} no encontrada en catálogo.`);
    }
}

export function removeRule(index) {
    currentDraftPipeline.splice(index, 1);
    renderPipeline();
    triggerPreview();
}

// [V5.21 UX] Move Rules Up/Down
export function moveRuleUp(index) {
    if (index > 0) {
        const temp = currentDraftPipeline[index];
        currentDraftPipeline[index] = currentDraftPipeline[index - 1];
        currentDraftPipeline[index - 1] = temp;
        renderPipeline();
        triggerPreview();
    }
}

export function moveRuleDown(index) {
    if (index < currentDraftPipeline.length - 1) {
        const temp = currentDraftPipeline[index];
        currentDraftPipeline[index] = currentDraftPipeline[index + 1];
        currentDraftPipeline[index + 1] = temp;
        renderPipeline();
        triggerPreview();
    }
}

// RENDER
function renderPipeline() {
    const container = document.getElementById('vrwRulesPipeline');
    const emptyState = document.getElementById('vrwEmptyState');
    const flowLine = document.getElementById('vrwFlowLine');
    const countBadge = document.getElementById('vrwRuleCount');

    if (!container) return;

    // Reset components (keeping empty state in DOM for hiding/showing)
    const existingChips = container.querySelectorAll('.vrw-rule-chip');
    existingChips.forEach(c => c.remove());

    countBadge.textContent = `${currentDraftPipeline.length} reglas`;

    const auditContainer = document.getElementById('vrwAuditContainer');

    if (currentDraftPipeline.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (flowLine) flowLine.classList.add('hidden');
        if (auditContainer) auditContainer.classList.add('hidden');
        
        const oldGatillo = document.getElementById('vrwCacheMissBtn');
        if (oldGatillo) oldGatillo.remove();
        
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (flowLine) flowLine.classList.remove('hidden');
    if (auditContainer) {
        auditContainer.classList.remove('hidden');
        renderCacheMissGatillo(auditContainer);
    }

    currentDraftPipeline.forEach((rule, index) => {
        const chip = document.createElement('div');
        chip.className = "vrw-rule-chip bg-slate-950 border border-emerald-500/30 p-2.5 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-right-4";

        const intentBadge = rule.fromAI && rule.promptData && rule.promptData.intent
            ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase flex-shrink-0">${rule.promptData.intent}</span>`
            : '';

        chip.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="bg-slate-800 text-slate-400 font-mono text-[9px] w-5 h-5 flex items-center justify-center rounded-full border border-slate-700">${index + 1}</div>
                <div class="min-w-0 pr-2">
                    <h4 class="text-xs font-bold text-emerald-400 flex items-center break-words whitespace-normal">${rule.nombre_regla} ${intentBadge}</h4>
                    <p class="text-[10px] text-slate-500 mt-0.5 leading-snug break-words whitespace-normal" title="${rule.descripcion || 'Regla de limpieza nativa.'}">${rule.descripcion || 'Regla de limpieza nativa.'}</p>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.moveRuleUp(${index})" class="text-slate-600 hover:text-blue-400 transition-colors bg-slate-900 hover:bg-blue-500/10 p-1.5 rounded-md border border-transparent hover:border-blue-500/30 ${index === 0 ? 'opacity-30 pointer-events-none' : ''}" title="Subir Regla">
                    <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.moveRuleDown(${index})" class="text-slate-600 hover:text-blue-400 transition-colors bg-slate-900 hover:bg-blue-500/10 p-1.5 rounded-md border border-transparent hover:border-blue-500/30 ${index === currentDraftPipeline.length - 1 ? 'opacity-30 pointer-events-none' : ''}" title="Bajar Regla">
                    <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.removeRule(${index})" class="text-slate-600 hover:text-red-400 transition-colors bg-slate-900 hover:bg-red-500/10 p-1.5 rounded-md border border-transparent hover:border-red-500/30 ml-2" title="Eliminar Regla">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
        container.appendChild(chip);
    });

    if (window.lucide) window.lucide.createIcons();
}

async function renderCacheMissGatillo(container) {
    let libretaRuleIdx = -1;
    let libretaPrompt = "";
    
    currentDraftPipeline.forEach((r, idx) => {
         let isDictRule = false;
         if (r.tipo === 'ast_conditional' && r.logica) {
             for (const b of r.logica) {
                 if ((b.condicion && b.condicion.operador === 'IN_DICT_KEYS') || (b.accion && b.accion.tipo_accion === 'DICTIONARY_REPLACE')) {
                     isDictRule = true; break;
                 }
             }
         }

         if (isDictRule) {
             libretaRuleIdx = idx;
             if (r.nombre_regla && r.nombre_regla.includes(':')) {
                 let pStart = r.nombre_regla.indexOf(':') + 1;
                 libretaPrompt = r.nombre_regla.substring(pStart).trim();
             } else {
                 libretaPrompt = r.nombre_regla || "Completar Diccionario";
             }
         }
    });

    const oldBtn = document.getElementById('vrwCacheMissBtn');
    if (oldBtn) oldBtn.remove();
    
    if (libretaRuleIdx === -1) return;
    if (!window.currentSheetData) return;
    
    let physicalIdx = activeContext.colIndex;
    if (physicalIdx === null || physicalIdx === undefined) return;
    
    let codeDataIdx = -1;
    let codePipeline = [];
    if (window.virtualColumns && window.draftPipelines) {
        for (const vCol of window.virtualColumns) {
            const draft = window.draftPipelines[vCol.id];
            if (draft && draft.masterField) {
                const lowerName = String(draft.masterField.nombre_campo || "").toLowerCase().trim();
                if (lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku') {
                    codeDataIdx = vCol.dataIdx;
                    codePipeline = draft.rules || [];
                    break;
                }
            }
        }
    }

    let globalDict = new Set();
    let globalDropped = new Set();
    currentDraftPipeline.forEach(r => {
        if (r.tipo === 'ast_conditional' && r.logica) {
            r.logica.forEach(b => {
                if (b.condicion && b.condicion.operador === 'IN_DICT_KEYS' && b.condicion.valor) {
                    Object.keys(b.condicion.valor).forEach(k => globalDict.add(k.trim()));
                }
                if (b.condicion && b.condicion.operador === 'IN_LIST' && b.condicion.valor) {
                    b.condicion.valor.forEach(k => globalDropped.add(k.trim()));
                }
            });
        }
    });

    let misses = [];
    let totalAuditable = [];
    const rawRows = window.currentSheetData.slice(1);
    for(let row of rawRows) {
        if (codeDataIdx >= 0) {
            let skuVal = resolveRawValueForRow(row, codeDataIdx);
            if (!skuVal || !String(skuVal).trim()) continue;
            
            if (window.viewerETL && window.viewerETL.transformCell && codePipeline.length > 0) {
                const skuTr = window.viewerETL.transformCell(skuVal, codePipeline, row);
                if (skuTr.rejected || !String(skuTr.display || skuTr.result || "").trim()) {
                    continue; // Logically dead due to Master SKU filtering
                }
            }
        }

        let crudo = resolveRawValueForRow(row, physicalIdx);
        if (!crudo.trim()) continue;
        const crudoClean = crudo.trim();
        totalAuditable.push(crudoClean);
        
        let isAlreadyMapped = false;
        if (window.viewerETL && window.viewerETL.transformCell && currentDraftPipeline.length > 0) {
            const cellTr = window.viewerETL.transformCell(crudo, currentDraftPipeline, row);
            if (cellTr && cellTr.result !== undefined && cellTr.result !== null && String(cellTr.result).trim() !== '') {
                 isAlreadyMapped = true;
            }
        }
        
        const crudoLower = crudoClean.toLowerCase();
        if (isAlreadyMapped || globalDict.has(crudoLower) || globalDropped.has(crudoLower)) {
            continue; // Mapped firmly
        }
        
        misses.push(crudoClean);
    }
    
    let uniqueMisses = [...new Set(misses)].filter(x => x);
    let uniqueTotal = [...new Set(totalAuditable)].filter(x => x);
    
    if (uniqueMisses.length >= 0) {
        const btnHtml = `
            <button id="vrwCacheMissBtn" onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.promptScopeModal('${encodeURIComponent(libretaPrompt).replace(/'/g, '%27')}', ${libretaRuleIdx}, ${uniqueMisses.length}, ${uniqueTotal.length})" class="px-3 py-1.5 ${uniqueMisses.length > 0 ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)] hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse hover:animate-none cursor-pointer' : 'bg-slate-800/80 text-slate-500 border-slate-700/50 cursor-pointer hover:bg-slate-700 transition'} border rounded text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0">
                <i data-lucide="${uniqueMisses.length > 0 ? 'rocket' : 'check-circle'}" class="w-3.5 h-3.5"></i> Procesar Pendientes (${uniqueMisses.length})
            </button>
        `;
        container.insertAdjacentHTML('beforeend', btnHtml);
        if (window.lucide) window.lucide.createIcons();
    }
}

export function promptScopeModal(encodedPrompt, ruleIdx, missesCount, totalCount) {
    if (!window.Swal) return;
    
    if (missesCount === 0 && totalCount === 0) {
        Swal.fire("Vacío", "No hay registros detectables para evaluar.", "warning");
        return;
    }

    Swal.fire({
        title: '<span class="text-indigo-400 font-bold flex items-center gap-2"><i class="fas fa-microchip"></i> Alcance de Inferencia IA</span>',
        html: `
            <div class="text-left text-sm text-slate-300 mt-2 space-y-4 font-sans">
                <p>El Motor IA ejecutará la directiva seleccionada. ¿Qué subconjunto de datos desea someter a inferencia analítica?</p>
                <div class="p-3 bg-slate-900/50 border ${missesCount > 0 ? 'border-emerald-500/50 hover:bg-slate-800' : 'border-slate-700/50 opacity-50'} rounded cursor-pointer transition relative" id="swalBtnMisses" style="${missesCount === 0 ? 'pointer-events:none' : ''}">
                    <div class="font-bold text-emerald-400">Sólo Registros Pendientes (${missesCount} ítems)</div>
                    <div class="text-[10px] text-slate-400 mt-1 leading-relaxed">Evalúa únicamente los artículos nuevos o huérfanos que aún no poseen mapeo oficial. Recomendado para optimizar costos de IA y preservar progresos previos.</div>
                </div>
                <div class="p-3 bg-slate-900/50 border border-slate-700/50 rounded cursor-pointer hover:bg-rose-950/30 hover:border-rose-900/50 transition opacity-80" id="swalBtnTotal">
                    <div class="font-bold text-rose-500">Sobrescribir Columna Completa (${totalCount} ítems)</div>
                    <div class="text-[10px] text-slate-500 mt-1 leading-relaxed">Re-evalúa absolutamente todos los artículos de principio a fin, provocando la destrucción del progreso manual actual sobre la libreta. (Acción destructiva).</div>
                </div>
            </div>
        `,
        background: '#0f172a',
        showConfirmButton: false,
        showDenyButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        customClass: {
            cancelButton: 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded text-xs font-bold'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            processCacheMiss(encodedPrompt, ruleIdx, false);
        } else if (result.isDenied) {
            processCacheMiss(encodedPrompt, ruleIdx, true);
        }
    });

    setTimeout(() => {
        const popup = Swal.getPopup();
        if(popup) {
            const btnMiss = popup.querySelector('#swalBtnMisses');
            const btnTotal = popup.querySelector('#swalBtnTotal');
            if(btnMiss) btnMiss.onclick = () => Swal.clickConfirm();
            if(btnTotal) btnTotal.onclick = () => Swal.clickDeny();
        }
    }, 50);
}

export async function processCacheMiss(encodedPrompt, ruleIdx, processAll = false) {
    if (!window.Swal) return;
    
    const originalPrompt = decodeURIComponent(encodedPrompt);
    const originalRule = currentDraftPipeline[ruleIdx];
    
    if (!originalRule || !originalRule.logica || (!originalRule.logica[0].condicion && !originalRule.logica[0].accion)) {
        Swal.fire("Error", "La libreta madre está corrupta o no tiene lógica interna.", "error"); return;
    }
    
    let physicalIdx = activeContext.colIndex;
    if (physicalIdx === null || physicalIdx === undefined) return;
    
    let codeDataIdx = -1;
    let codePipeline = [];
    if (window.virtualColumns && window.draftPipelines) {
        for (const vCol of window.virtualColumns) {
            const draft = window.draftPipelines[vCol.id];
            if (draft && draft.masterField) {
                const lowerName = String(draft.masterField.nombre_campo || "").toLowerCase().trim();
                if (lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku') {
                    codeDataIdx = vCol.dataIdx;
                    codePipeline = draft.rules || [];
                    break;
                }
            }
        }
    }

    let globalDict = new Set();
    let globalDropped = new Set();
    currentDraftPipeline.forEach(r => {
        if (r.tipo === 'ast_conditional' && r.logica) {
            r.logica.forEach(b => {
                if (b.condicion && b.condicion.operador === 'IN_DICT_KEYS' && b.condicion.valor) {
                    Object.keys(b.condicion.valor).forEach(k => globalDict.add(String(k).trim().toLowerCase()));
                }
                if (b.condicion && b.condicion.operador === 'IN_LIST' && b.condicion.valor) {
                    b.condicion.valor.forEach(k => globalDropped.add(String(k).trim().toLowerCase()));
                }
            });
        }
    });

    let misses = [];
    const rawRows = window.currentSheetData.slice(1);
    for(let row of rawRows) {
        if (codeDataIdx >= 0) {
            let skuVal = resolveRawValueForRow(row, codeDataIdx);
            if (!skuVal || !String(skuVal).trim()) continue;
            
            if (window.viewerETL && window.viewerETL.transformCell && codePipeline.length > 0) {
                const skuTr = window.viewerETL.transformCell(skuVal, codePipeline, row);
                if (skuTr.rejected || !String(skuTr.display || skuTr.result || "").trim()) {
                    continue;
                }
            }
        }

        let crudo = resolveRawValueForRow(row, physicalIdx);
        if (!crudo.trim()) continue;
        const crudoClean = crudo.trim();
        
        if (!processAll) {
            let isAlreadyMapped = false;
            if (window.viewerETL && window.viewerETL.transformCell && currentDraftPipeline.length > 0) {
                const cellTr = window.viewerETL.transformCell(crudo, currentDraftPipeline, row);
                if (cellTr && cellTr.result !== undefined && cellTr.result !== null && String(cellTr.result).trim() !== '') {
                     isAlreadyMapped = true;
                }
            }
            
            const crudoLower = crudoClean.toLowerCase();
            if (isAlreadyMapped || globalDict.has(crudoLower) || globalDropped.has(crudoLower)) continue;
        }
        
        misses.push(crudoClean);
    }
    
    let uniqueMisses = [...new Set(misses)].filter(x => x);
    
    if (uniqueMisses.length === 0) {
        Swal.fire("Todo Ok", "No hay registros que procesar.", "success"); return;
    }
    
    try {
        Swal.fire({
            title: 'Actualizando Libreta...',
            html: `Enviando ${uniqueMisses.length} registros huérfanos al Motor IA bajo la directiva:<br><i class="text-indigo-300 text-[11px] font-mono mt-2 block break-words">"${originalPrompt}"</i>`,
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); },
            background: '#0f172a', color: '#f8fafc'
        });
        
        const ruleName = originalRule.nombre_regla || "";
        const isCazaRubros = ruleName.includes('[IA] Caza Rubros') || ruleName.includes('Caza-rubros') || /CLONE_SEMANTIC/i.test(originalPrompt);
        const isLiteral = ruleName.includes('[IA] Limpieza Literal');
        const isCluster = originalRule.logica[0].accion && originalRule.logica[0].accion.tipo_accion === 'DICTIONARY_REPLACE' && !isLiteral && !isCazaRubros;
        
        let apiEndpoint = '/api/ai/discover-entities';
        if (isCazaRubros) {
            apiEndpoint = '/api/ai/categorize-rubros';
        }
        
        const payload = {
            column_name: activeContext.colName || "Columna",
            prompt: originalPrompt,
            samples: uniqueMisses.slice(0, 500),
            require_ast: false,
            literal_mode: isLiteral
        };
        
        let backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}${apiEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Fallo de servidor al resolver entidades.");
        
        let newDict = data.cluster;
        if (!newDict || Object.keys(newDict).length === 0) throw new Error("La IA evaluó los registros pero no formuló derivaciones nuevas.");
        
        if (window.Swal) Swal.close();
        
        const vCol = window.virtualColumns ? window.virtualColumns.find(c => c.dataIdx === physicalIdx || c.id === physicalIdx) : null;

        // [ENRUTAMIENTO CONDICIONAL PERSISTENTE]
        if (isCazaRubros && window.viewerAiUi && typeof window.viewerAiUi._displaySemanticAuditTray === 'function') {
            // Caza Rubros devuelve translationMap { "sku": "Rubro|ARGUMENTO|Razón" }
            const clusterMap = {};
            window.viewerAiUi.argumentationMap = {};
            for (const [rawKey, valString] of Object.entries(newDict)) {
                const parts = String(valString).split('|ARGUMENTO|');
                const rubro = parts[0];
                const arg = parts.length > 1 ? parts[1] : '';
                
                if (!clusterMap[rubro]) clusterMap[rubro] = [];
                clusterMap[rubro].push(rawKey);
                if (arg) window.viewerAiUi.argumentationMap[rawKey] = arg;
            }
            window.viewerAiUi._crystalizeMergeMode = !processAll; // [FIX 1 QA] Transferir la decisión de merge
            await window.viewerAiUi._displaySemanticAuditTray(clusterMap, originalPrompt, vCol, ruleIdx);
            return;
        }
        if (isLiteral && window.viewerAiUi && typeof window.viewerAiUi._displayLiteralModal === 'function') {
            await window.viewerAiUi._displayLiteralModal(newDict, originalPrompt, vCol, ruleIdx);
            return;
        }

        // Si no es Caza Rubros ni Literal, procesamos MapToInject para el modal genérico (Consenso/Fusión)
        let mapToInject = {};
        if (isCluster) {
            Object.keys(newDict).forEach(master => {
                 newDict[master].forEach(rVal => {
                      mapToInject[rVal] = master;
                 });
            });
        } else {
            mapToInject = newDict;
        }

        // Delegar a la UI Original de Consenso si existe, garantizando continuidad de funcionalidad
        if (isCluster && window.viewerAiUi && typeof window.viewerAiUi._displayConsensusModal === 'function') {
             await window.viewerAiUi._displayConsensusModal(newDict, originalPrompt, vCol, ruleIdx);
             return;
        }

        // [Fase 5.2] Modal Fallback LAMDA
        const clusterMap = {};
        Object.entries(mapToInject).forEach(([raw, clean]) => {
            if (!clusterMap[clean]) clusterMap[clean] = [];
            clusterMap[clean].push(raw);
        });

        let accordionHtml = Object.keys(clusterMap).map((masterVal, gIdx) => {
             const rawValues = clusterMap[masterVal];
             if (!Array.isArray(rawValues)) return '';
             
             let childrenHtml = rawValues.map((val, idx) => `
                <div class="flex items-center gap-2 mb-1.5 pl-3 p-1.5 border-l-2 border-slate-700/50 hover:bg-slate-800/50 transition">
                    <input type="checkbox" id="gatillo_chk_${gIdx}_${idx}" data-raw="${val.replace(/"/g, '&quot;')}" value="${masterVal.replace(/"/g, '&quot;')}" checked class="gatillo-raw-chk form-checkbox h-3.5 w-3.5 text-amber-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer">
                    <label for="gatillo_chk_${gIdx}_${idx}" class="text-[11px] text-slate-400 cursor-pointer select-none truncate font-mono pl-1">${val.replace(/</g, "&lt;")}</label>
                    <button type="button" class="ml-auto flex items-center gap-1 px-2 py-0.5 bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20 rounded transition-colors text-[9px] font-bold uppercase tracking-wider hitl-view-row-btn" data-raw="${val.replace(/"/g, '&quot;')}">
                        <i data-lucide="eye" class="w-3 h-3"></i> Ver fila completa
                    </button>
                </div>
                <div id="row_preview_${gIdx}_${idx}" class="hidden w-full mt-1 p-2 bg-slate-950 border border-slate-700/50 rounded-lg text-left text-[10px] text-slate-300 font-mono overflow-x-auto"></div>
             `).join('');

             return `
             <div class="mb-3 bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden">
                 <div class="bg-amber-950/20 p-2 border-b border-amber-500/10 flex items-center justify-between hover:bg-slate-800/40 transition">
                     <label class="flex items-center gap-2 cursor-pointer w-full" for="gatillo_global_${gIdx}">
                         <input type="checkbox" id="gatillo_global_${gIdx}" class="gatillo-global-chk form-checkbox h-4 w-4 text-amber-500 rounded border-amber-500/50 bg-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer" checked data-group="${gIdx}">
                         <span class="text-xs font-bold text-amber-500 font-mono tracking-wide truncate pr-2 select-none">${masterVal.replace(/</g, "&lt;")}</span>
                     </label>
                     <span class="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold shrink-0 shadow-sm border border-amber-500/10">${rawValues.length} sugerencias</span>
                 </div>
                 <div class="p-2 py-1 bg-slate-950/30">
                    ${childrenHtml}
                 </div>
             </div>
             `;
        }).join('');

        const resultModal = await window.Swal.fire({
            title: 'Validar Fusión de Datos',
            html: `<div class="text-[11px] text-slate-400 mb-3 text-left">La IA resolvió los registros aislados de forma no destructiva. Desmarca las sugerencias que no desees aprender:</div>
                   <div class="max-h-[350px] overflow-y-auto text-left custom-scrollbar pr-1" id="gatillo_checkbox_container">
                      ${accordionHtml}
                   </div>`,
            showCancelButton: true,
            confirmButtonText: '<i data-lucide="merge" class="w-4 h-4 inline mt-0.5"></i> Aprobar Carga',
            cancelButtonText: 'Descartar',
            confirmButtonColor: '#f59e0b',
            background: '#0f172a', color: '#f8fafc',
            width: '600px',
            didOpen: () => {
                const container = document.getElementById('gatillo_checkbox_container');
                if (!container) return;
                container.addEventListener('change', (e) => {
                    if (e.target.classList.contains('gatillo-global-chk')) {
                        const isChecked = e.target.checked;
                        const groupIdx = e.target.getAttribute('data-group');
                        const childChecks = container.querySelectorAll(`.gatillo-raw-chk[id^="gatillo_chk_${groupIdx}_"]`);
                        childChecks.forEach(chk => chk.checked = isChecked);
                        e.target.indeterminate = false;
                    } else if (e.target.classList.contains('gatillo-raw-chk')) {
                        const parts = e.target.id.split('_');
                        if (parts.length >= 4) {
                            const groupIdx = parts[2];
                            const parentChk = container.querySelector(`#gatillo_global_${groupIdx}`);
                            if (parentChk) {
                                const childChecks = container.querySelectorAll(`.gatillo-raw-chk[id^="gatillo_chk_${groupIdx}_"]`);
                                const allChecked = Array.from(childChecks).every(c => c.checked);
                                const someChecked = Array.from(childChecks).some(c => c.checked);
                                parentChk.checked = allChecked;
                                parentChk.indeterminate = someChecked && !allChecked;
                            }
                        }
                    }
                });

                container.addEventListener('click', (e) => {
                    if (e.target.closest('.hitl-view-row-btn')) {
                        const btn = e.target.closest('.hitl-view-row-btn');
                        const rawVal = btn.getAttribute('data-raw');
                        const previewDiv = btn.parentElement.nextElementSibling;
                        
                        if (!previewDiv.classList.contains('hidden')) {
                            previewDiv.classList.add('hidden');
                            return;
                        }
                        
                        // Hide all other previews first to keep it clean
                        container.querySelectorAll('[id^="row_preview_"]').forEach(el => el.classList.add('hidden'));
                        
                        // Find row in window.currentSheetData
                        let targetRow = null;
                        const headers = window.currentSheetData[0];
                        if (window.currentSheetData && window.currentSheetData.length > 1) {
                            targetRow = window.currentSheetData.slice(1).find(r => {
                                const val = resolveRawValueForRow(r, physicalIdx);
                                return val && val.trim() === rawVal.trim();
                            });
                        }
                        
                        if (targetRow && headers) {
                            let html = '<table class="w-full text-left border-collapse"><tbody>';
                            for (let i = 0; i < headers.length; i++) {
                                html += `<tr class="border-b border-slate-800"><td class="py-1 pr-2 text-indigo-400 opacity-80">${headers[i]}:</td><td class="py-1 break-all">${targetRow[i] !== undefined && targetRow[i] !== null ? targetRow[i] : ''}</td></tr>`;
                            }
                            html += '</tbody></table>';
                            previewDiv.innerHTML = html;
                            previewDiv.classList.remove('hidden');
                        } else {
                            previewDiv.innerHTML = '<span class="text-slate-500">No se pudo encontrar la fila original en memoria.</span>';
                            previewDiv.classList.remove('hidden');
                        }
                    }
                });
                if (window.lucide) window.lucide.createIcons();
            }
        });

        if (!resultModal.isConfirmed) {
            Swal.fire({
                title: 'Cancelado', 
                text: 'La libreta no fue alterada.', 
                icon: 'info', 
                background: '#0f172a', color: '#f8fafc', timer: 1500, showConfirmButton: false
            });
            return;
        }

        let userApprovedMap = {};
        document.querySelectorAll('.gatillo-raw-chk').forEach(chk => {
             if (chk.checked) {
                 userApprovedMap[chk.getAttribute('data-raw')] = chk.value;
             } else {
                 userApprovedMap[chk.getAttribute('data-raw')] = ""; // Explicitly mapped to empty
             }
        });

        if (Object.keys(userApprovedMap).length === 0) return;
        
        if (originalRule.logica[0].condicion && typeof originalRule.logica[0].condicion.valor === 'object') {
            Object.assign(originalRule.logica[0].condicion.valor, userApprovedMap);
        }
        if (originalRule.logica[0].accion && typeof originalRule.logica[0].accion.valor === 'object') {
            Object.assign(originalRule.logica[0].accion.valor, userApprovedMap);
        }
        
        renderPipeline();
        triggerPreview();
        
        Swal.fire({
            title: '¡Caché Actualizada!', 
            html: `Se han fusionado de forma determinista los registros faltantes en la libreta.<br>Se procederá a auto-guardar en la DB...`, 
            icon: 'success',
            background: '#0f172a', color: '#f8fafc', timer: 2500, showConfirmButton: false
        });
        
        setTimeout(() => { if (typeof window.saveSimulationConfig === 'function') window.saveSimulationConfig(null, true); }, 2500);

    } catch (e) {
        console.error(e);
        Swal.fire({title: 'Fallo Operativo', text: `Error de IA: ${e.message}`, icon: 'error', background: '#0f172a', color: '#f8fafc'});
    }
}

// BIND TO VIEWER CORE & PREVIEW
function triggerPreview() {
    if (window.viewerETL && typeof window.viewerETL.previewColumn === 'function') {
        window.viewerETL.previewColumn(activeContext.colIndex, currentDraftPipeline);
    }
}

export async function clearPipeline() {
    if (currentDraftPipeline.length === 0) return;
    
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Purgar todas las reglas?',
            text: "Se eliminarán todas las transformaciones asignadas a esta columna.",
            icon: 'warning',
            background: '#0f172a', color: '#f8fafc',
            showCancelButton: true,
            confirmButtonText: 'Sí, purgar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155'
        });
        if (!result.isConfirmed) return;
    } else {
        if (!confirm("¿Estás seguro de purgar todas las reglas de esta columna?")) return;
    }
    
    currentDraftPipeline = [];
    renderPipeline();
    triggerPreview();
}

// FULL UNLINK ACTION (Destructive)
export async function unlinkCurrentCol() {
    const isClone = activeContext.colIndex && String(activeContext.colIndex).includes('_clone_');
    
    if (currentDraftPipeline.length > 0) {
        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({
                title: '¿Destruir Taller de Reglas?',
                text: `La columna "${activeContext.colName}" tiene ${currentDraftPipeline.length} reglas ETL aplicadas. Al desvincular se destruirán de forma irreversible.`,
                icon: 'warning',
                background: '#0f172a', color: '#f8fafc',
                showCancelButton: true,
                confirmButtonText: 'Sí, destruir todo',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#334155'
            });
            if (!result.isConfirmed) return;
        } else {
            if (!confirm(`La columna "${activeContext.colName}" tiene ${currentDraftPipeline.length} reglas ETL aplicadas.\nAl desvincular se destruirán todas las reglas.\n\n¿Estás seguro de proceder?`)) return;
        }
    } else {
        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({
                title: '¿Desvincular Campo Maestro?',
                text: `La columna "${activeContext.colName}" volverá a su estado original.`,
                icon: 'question',
                background: '#0f172a', color: '#f8fafc',
                showCancelButton: true,
                confirmButtonText: 'Sí, desvincular',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#334155'
            });
            if (!result.isConfirmed) return;
        } else {
            if (!confirm(`¿Deseas desvincular el campo maestro y devolver la columna "${activeContext.colName}" a su estado original?`)) return;
        }
    }

    const vColId = activeContext.colIndex;
    console.log(`🗑️ [WORKSHOP] UX Unlink: Purgando mapeo de ${vColId}`);
    
    if (vColId) {
        // Purgar de los diccionarios de memoria la vinculación maestra, pero conservando el mapeo base local
        if (window.draftPipelines) delete window.draftPipelines[vColId];
        if (window.processingRules) delete window.processingRules[vColId];
        
        // Purgar si era computed (Calculada Matemática)
        if (window.computedColumns) {
            const idx = window.computedColumns.findIndex(c => c.id === vColId);
            if (idx !== -1) window.computedColumns.splice(idx, 1);
        }

        // Purgar si era una columna Virtual/Clonada
        if (isClone && window.virtualColumns) {
            const idx = window.virtualColumns.findIndex(v => v.id === vColId);
            if (idx !== -1) window.virtualColumns.splice(idx, 1);
        }

        // Forzar Refresh de la tabla (desaparece clon o vuelve azul)
        if (typeof window.triggerSafeRender === 'function') {
            window.triggerSafeRender();
        } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
            window.renderVirtualTable(window.currentSheetData);
        }
        
        // Guardar estado local
        if (typeof window.saveSheetState === 'function') {
            window.saveSheetState(window.currentSheetName);
        }

        // Guardar estado en Backend BD para que no reviva solo
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }
    }
    
    // Cerrar taller
    close();
}

// [PHASE 3] BUCLE DE AUDITORÍA ACTIVA
export async function auditResidues() {
    if (!window.currentSheetData) return;
    
    const promptTextContainer = document.getElementById('aiRulePromptPrompt');
    const userPrompt = promptTextContainer ? promptTextContainer.value : "Transformación libre";
    
    if (currentDraftPipeline.length === 0) {
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'No hay reglas para auditar.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
        else alert("No hay reglas para auditar.");
        return;
    }
    
    const lastRule = currentDraftPipeline[currentDraftPipeline.length - 1];
    
    let physicalIdx = activeContext.colIndex;
    if (physicalIdx === null || physicalIdx === undefined) {
        if (window.Swal) Swal.fire('Error', 'Contexto perdido. Reabre el taller.', 'error');
        return;
    }
    
    let residualSamples = [];
    
    try {
        const rawRows = window.currentSheetData.slice(1);
        for(let row of rawRows) {
            let crudo = resolveRawValueForRow(row, physicalIdx);
            if (!crudo.trim()) continue;
            
            let mutateResult = crudo;
            if (window.viewerETL && window.viewerETL.transformCell) {
               const tr = window.viewerETL.transformCell(crudo, currentDraftPipeline, row);
               // [BUG-FIX: Null/Empty Persistence] Un celda vaciada intencionalmente
               // (wasTransformed=true, resultado="") NO es un residuo. Es una transformación exitosa.
               // Solo clasificamos como residuo si: fue rechazada, O si el valor no cambió en absoluto.
               mutateResult = tr.wasTransformed ? (tr.display !== undefined ? tr.display : tr.result) : String(tr.display || tr.result || "");
               const isIntentionalEmpty = tr.wasTransformed && mutateResult === "";
               if (!isIntentionalEmpty && (tr.rejected || mutateResult === crudo)) {
                   residualSamples.push(crudo);
               }
            } else {
                if (crudo.trim() === "" || mutateResult === crudo) residualSamples.push(crudo);
            }
        }
        
        residualSamples = [...new Set(residualSamples)].filter(x => x.length > 0).slice(0, 10);
        
        if (residualSamples.length === 0) {
            Swal.fire({
                icon: 'success',
                title: 'Columna Limpia',
                text: 'La mutación detectada fue de 100%.',
                background: '#0f172a', color: '#f8fafc'
            });
            return;
        }
        
        Swal.fire({
            title: 'Diagnosticando...',
            html: `Hemos detectado ${residualSamples.length} patrones inactivos.<br>Consultando al Chofer IA para elaborar Regla Delta...`,
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); },
            background: '#0f172a', color: '#f8fafc'
        });
        
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const refinePayload = {
             colName: activeContext.colName || 'Columna',
             prompt: userPrompt,
             rule: lastRule,
             residuals: residualSamples
        };
        
        const response = await fetch(`${backendUrl}/api/ai/refine-rule`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(refinePayload)
        });
        
        const reqData = await response.json();
        
        if (response.ok && reqData.ast) {
            const ruleProp = reqData.ast;
            Swal.fire({
                title: 'Regla Delta Recomendada',
                html: `La IA propone inyectar un paso de <b>${ruleProp.accion?.tipo_accion || 'REGEX'}</b> para atacar los residuos detectados.<br><br>
                       <div class="p-3 bg-slate-900 border border-emerald-500/30 rounded text-left text-xs mb-2">
                       <b>Muestra Evadida:</b> <br><span class="text-slate-400">"${residualSamples[0]}"</span><br>
                       <b>Regla:</b> <span class="text-amber-400 font-mono">${ruleProp.valor || ruleProp.accion?.tipo_accion || '?'}</span>
                       </div>
                       ¿Apilar al final de la cola?`,
                showCancelButton: true,
                confirmButtonText: '<i data-lucide="plus" class="w-4 h-4 inline mt-0.5"></i> Agregar',
                cancelButtonText: 'Descartar',
                confirmButtonColor: '#10b981',
                background: '#0f172a', color: '#f8fafc'
            }).then((res) => {
                 if (res.isConfirmed) {
                     currentDraftPipeline.push({
                         id: `delta_${Date.now()}`,
                         nombre_regla: `[Delta IA] ${ruleProp.nombre_regla || ruleProp.accion}`,
                         descripcion: `Generado auto-mágicamente en auditoría iterativa`,
                         ...ruleProp
                     });
                     renderPipeline();
                     triggerPreview();
                 }
            });
            setTimeout(() => { if(window.lucide) window.lucide.createIcons(); }, 100);
        } else {
            throw new Error(reqData.error || "Falla en Refinamiento");
        }
        
    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'error', title: 'Fallo de IA', text: e.message, background: '#0f172a', color: '#f8fafc' });
    }
}

// APPLY MAPPING (SAVE to Memory Drafts)
export function applyMapping() {
    if (!window.draftPipelines) window.draftPipelines = {};

    window.draftPipelines[activeContext.colIndex] = {
        masterField: activeContext.masterField,
        colName: activeContext.colName,
        rules: [...currentDraftPipeline]
    };

    // [V8] Consumir _isNewTemp al mapear — la columna ya tiene draftPipeline y no necesita inmunidad
    if (window.virtualColumns) {
        const vc = window.virtualColumns.find(c => c.id === activeContext.colIndex);
        if (vc && vc._isNewTemp) {
            delete vc._isNewTemp;
        }
    }

    console.log(`✅ [WORKSHOP] Mapeo guardado en RAM: Columna ${activeContext.colIndex} -> ${activeContext.masterField.nombre_campo}`);

    // Commit visual changes in the main Table (Header naming)
    if (window.viewerETL && typeof window.viewerETL.commitColumnMapping === 'function') {
        window.viewerETL.commitColumnMapping(activeContext.colIndex, activeContext.masterField, currentDraftPipeline);
    }

    // [HERD IMMUNITY QA] Propagación Transversal (Manual) hacia Base de Datos Maestra
    if (activeContext.masterField && activeContext.masterField.id) {
        const payloadDict = {
            id: activeContext.masterField.id,
            termino: activeContext.masterField.nombre_campo || activeContext.colName,
            reglas_procesamiento: currentDraftPipeline,
            currentProviderId: window.globalContext ? window.globalContext.providerId : null
        };
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        fetch(`${backendUrl}/api/files/dictionary/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadDict)
        }).then(r => r.json()).then(res => {
            console.log("🌐 [HERD IMMUNITY] AST (Manual) perpetuado en Master Dictionary:", res);
        }).catch(err => console.error("Error perpetuando AST global manualmente:", err));
    }

    close();

    // [V9 FIX] Sincronizar Caché Maestro Local ANTES de disparar guardados al backend o simulaciones
    // Previene el bug donde el Simulador no ve las nuevas reglas porque lee un sheetConfigStore desfasado
    if (typeof window.saveSheetState === 'function' && window.currentSheetName) {
        window.saveSheetState(window.currentSheetName);
    }

    console.log('🛑 [VIGÍA] Botón Enlazar clickeado');
    console.log('🛑 [VIGÍA] Verificando window.saveSimulationConfig: ', typeof window.saveSimulationConfig);

    try {
        if (window.globalContext && window.globalContext.flujoId && window.globalContext.flujoId !== "CRUDO") {
            console.log("[WORKSHOP] Ejecutando autoguardado en plantilla ID:", window.globalContext.flujoId);
            let headerName = "Plantilla Activa";
            const selectEl = document.getElementById('headerFlujoSelect');
            if (selectEl && selectEl.options[selectEl.selectedIndex]) {
                headerName = selectEl.options[selectEl.selectedIndex].text;
            }
            if (typeof window._executeFlujoSave === 'function') {
                window._executeFlujoSave(window.globalContext.flujoId, headerName);
            }
        } else if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, false);
            console.log('🛑 [VIGÍA] Llamada a saveSimulationConfig ejecutada correctamente');
        } else {
            console.error('🛑 [VIGÍA FATAL] window.saveSimulationConfig NO EXISTE en el entorno global');
        }
    } catch (error) {
        console.error('🛑 [VIGÍA FATAL] Error en guardado: ', error);
    }
}

export async function createLocalRule(searchStr, replaceStr, isRegex = false, colId = null, rowUid = -1, skuContext = null) {
    if (!window.globalContext || !window.globalContext.providerId || !window.currentSheetName) {
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error', text: 'Falta contexto del proveedor u hoja actual.', icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Falta contexto del proveedor u hoja actual.");
        return false;
    }

    // [V5.19 UX] Rebuild Context for headless rule injection (Quick Rule Modal)
    if (!isPanelOpen && colId) {
        activeContext = {
            colIndex: colId,
            colName: colId,
            masterField: window.draftPipelines && window.draftPipelines[colId] ? window.draftPipelines[colId].masterField : { id: 0, nombre_campo: "N/A" }
        };
        currentDraftPipeline = window.draftPipelines && window.draftPipelines[colId] && window.draftPipelines[colId].rules
            ? [...window.draftPipelines[colId].rules]
            : [];
    }

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const searchFormatted = isRegex ? searchStr : searchStr;

        let targetRegexPayload = `CUSTOM_REPLACE:${searchFormatted}|||${replaceStr}`;
        let ruleNamePrefix = `Reemplazo Local:`;
        
        // [Local Override Phase]
        if (skuContext && skuContext.trim() !== "") {
            targetRegexPayload = `CUSTOM_OVERRIDE_SKU:${skuContext.trim()}|||${replaceStr}`;
            ruleNamePrefix = `Override por SKU [${skuContext.trim().substring(0, 15)}]:`;
        } else if (rowUid !== -1 && rowUid !== null && rowUid !== undefined) {
            targetRegexPayload = `CUSTOM_OVERRIDE_ROW:${rowUid}|||${replaceStr}`;
            ruleNamePrefix = `Sobre-escritura en Fila ${rowUid}:`;
        }

        const payload = {
            proveedor_id: window.globalContext.providerId,
            nombre_hoja: window.currentSheetName,
            nombre_regla: `${ruleNamePrefix} ${searchStr} -> ${replaceStr}`,
            descripcion: 'Regla personalizada determinista (Local Override)',
            tipo_regex: targetRegexPayload
        };

        console.log(`[VIGIA AUDITOR] 2. Creando Regla Local (createLocalRule) | Payload Backend:`, { target: searchFormatted, replace: replaceStr });

        const response = await fetch(`${backendUrl}/api/mapping/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();

            await loadRuleCatalog();

            if (data.rule) {
                console.log(`[VIGIA AUDITOR] 3. Regla Guardada OK. Inyectando en Pipeline RAM de la columna [${activeContext.colIndex}]`);

                currentDraftPipeline.push({ ...data.rule });
                renderPipeline();
                triggerPreview();

                // [V5.19 UX] Instantly persist the pipeline globally so the UI table updates if the workshop panel is closed
                if (!isPanelOpen && activeContext && activeContext.colIndex) {
                    if (!window.draftPipelines) window.draftPipelines = {};
                    window.draftPipelines[activeContext.colIndex] = {
                        masterField: activeContext.masterField,
                        colName: activeContext.colName,
                        rules: [...currentDraftPipeline]
                    };
                    console.log(`[VIGIA AUDITOR] 4. Disparando saveSimulationConfig() para refrescar grilla virtual.`);
                    if (typeof window.saveSimulationConfig === 'function') {
                        window.saveSimulationConfig(null, false);
                    }

                    // [V5.21 UX] Force a redraw of the Virtual Scroller so the newly injected RAM rule takes effect visually
                    if (typeof window.triggerSafeRender === 'function') {
                        console.log(`[VIGIA AUDITOR] 5. Forzando repintado seguro de la grilla virtual con los nuevos datos en RAM.`);
                        window.triggerSafeRender();
                    } else if (window.renderVirtualTable && window.viewerState && window.viewerState.data) {
                        console.log(`[VIGIA AUDITOR] 5. Forzando repintado de la grilla virtual con los nuevos datos en RAM.`);
                        window.renderVirtualTable(window.viewerState.data);
                    }
                }
            }
            return true;
        } else {
            console.error(`❌ [WORKSHOP] Error HTTP guardando regla custom: ${response.status}`);
            return false;
        }
    } catch (err) {
        console.error("Error creando regla local:", err);
        return false;
    }
}

// [V5.30 UX] Bespoke Rule: Combine Numeric (Inter-Column)
async function promptCombineNumericRule() {
    // Collect ALL columns from Virtual Guard (Not just mapped ones) to provide total freedom
    const headers = window.currentSheetData && window.currentSheetData[0] ? window.currentSheetData[0] : [];
    
    const availableCols = (window.virtualColumns || []).map(vCol => {
        if (String(vCol.id) === String(activeContext.colIndex)) return null;
        if (vCol.isGhostPlaceholder || vCol.isCalculated) return null; // Skip virtual UI blocks
        
        let displayName = "";
        const draft = window.draftPipelines && window.draftPipelines[vCol.id];
        
        if (draft && draft.masterField && draft.masterField.nombre_campo) {
            displayName = `[Enlazada] ${draft.masterField.nombre_campo}`;
        } else {
            const rawHeader = headers[vCol.dataIdx] ? String(headers[vCol.dataIdx]).trim() : `Columna ${vCol.dataIdx + 1}`;
            displayName = `[Crudo] ${rawHeader || 'Sin Nombre'}`;
        }
        
        return { id: vCol.id, name: displayName, isMapped: !!draft };
    }).filter(Boolean);

    if (availableCols.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'No hay contexto',
                text: 'No hay otras columnas en el archivo para combinar.',
                icon: 'warning',
                background: '#0f172a',
                color: '#f8fafc',
                customClass: { popup: 'border border-slate-700 shadow-2xl' }
            });
        }
        return;
    }

    // Ordenar: Mapeadas primero, luego crudas
    availableCols.sort((a, b) => (a.isMapped === b.isMapped ? 0 : a.isMapped ? -1 : 1));

    const optionsHtml = availableCols.map(c => `<option value="${c.id}" style="background-color: #0f172a; color: ${c.isMapped ? '#34d399' : '#94a3b8'}; text-transform: uppercase;">${c.name}</option>`).join('');

    const { value: selectedColId } = await Swal.fire({
        title: 'Seleccionar Origen',
        html: `
            <div style="text-align: left; margin-bottom: 24px; font-size: 13px; color: rgba(203, 213, 225, 0.8); line-height: 1.6; font-weight: 300;">
                Selecciona la columna secundaria (cruda o enlazada). El motor descartará cualquier carácter que no sea numérico y concatenará el resultado al código actual con un guion (-).
            </div>
            <div style="position: relative;">
                <i data-lucide="link" style="width: 16px; height: 16px; color: #34d399; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 10; pointer-events: none;"></i>
                <select id="swal-combine-col" style="width: 100%; background: rgba(2, 6, 23, 0.4); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px 16px 12px 36px; color: #d1fae5; appearance: none; outline: none; cursor: pointer; font-weight: 500; letter-spacing: 0.025em; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);">
                    <option value="" disabled selected>Elige una columna mapeada...</option>
                    ${optionsHtml}
                </select>
                <i data-lucide="chevron-down" style="width: 16px; height: 16px; color: #64748b; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); z-index: 10; pointer-events: none;"></i>
            </div>
        `,
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#ffffff',
        customClass: {
            title: 'text-white font-light tracking-wide text-xl',
            confirmButton: 'bg-emerald-600/80 hover:bg-emerald-500 text-white border border-emerald-400/30 rounded-lg shadow-lg px-6 py-2 transition-all',
            cancelButton: 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-lg px-6 py-2 transition-all'
        },
        showCancelButton: true,
        confirmButtonText: 'Aplicar Fusión',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const val = document.getElementById('swal-combine-col').value;
            if (!val) Swal.showValidationMessage('Debes seleccionar una columna');
            return val;
        },
        didOpen: () => {
            if (window.lucide) window.lucide.createIcons();
            const popup = Swal.getPopup();
            if (popup) {
                popup.style.backdropFilter = 'blur(16px)';
                popup.style.WebkitBackdropFilter = 'blur(16px)';
                popup.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                popup.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.5)';
                popup.style.borderRadius = '1rem';
            }
        }
    });

    if (selectedColId) {
        const sourceName = availableCols.find(c => c.id === selectedColId)?.name || 'Otra columna';
        const ruleObj = {
            tipo: 'combine_numeric',
            nombre_regla: `Fusionar Cód + Núms de [${sourceName}]`,
            descripcion: 'Regla Avanzada: Extrae caracteres numéricos (0-9) de la columna referenciada y los concatena con un guion (-).',
            target_col_id: selectedColId,
            source_col_id: activeContext.colIndex,
            disabled: false
        };
        
        console.log(`⚡ [WORKSHOP] Aplicando Regla Combine Numeric | Target: ${selectedColId}`);
        currentDraftPipeline.push({ ...ruleObj });
        renderPipeline();
        triggerPreview();
    }
}

// [V5.30 UX] Bespoke Rule: Combine Hash (Text to Numeric)
async function promptCombineHashRule() {
    const headers = window.currentSheetData && window.currentSheetData[0] ? window.currentSheetData[0] : [];
    
    const availableCols = (window.virtualColumns || []).map(vCol => {
        if (String(vCol.id) === String(activeContext.colIndex)) return null;
        if (vCol.isGhostPlaceholder || vCol.isCalculated) return null;
        
        let displayName = "";
        const draft = window.draftPipelines && window.draftPipelines[vCol.id];
        
        if (draft && draft.masterField && draft.masterField.nombre_campo) {
            displayName = `[Enlazada] ${draft.masterField.nombre_campo}`;
        } else {
            const rawHeader = headers[vCol.dataIdx] ? String(headers[vCol.dataIdx]).trim() : `Columna ${vCol.dataIdx + 1}`;
            displayName = `[Crudo] ${rawHeader || 'Sin Nombre'}`;
        }
        
        return { id: vCol.id, name: displayName, isMapped: !!draft };
    }).filter(Boolean);

    if (availableCols.length === 0) {
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'No hay contexto', text: 'No hay otras columnas en el archivo para combinar.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
        return;
    }

    // Ordenar: Mapeadas primero, luego crudas
    availableCols.sort((a, b) => (a.isMapped === b.isMapped ? 0 : a.isMapped ? -1 : 1));

    const optionsHtml = availableCols.map(c => `<option value="${c.id}" style="background-color: #0f172a; color: ${c.isMapped ? '#d946ef' : '#94a3b8'}; text-transform: uppercase;">${c.name}</option>`).join('');

    const { value: selectedColId } = await Swal.fire({
        title: 'Seleccionar Origen (Hash)',
        html: `
            <div style="text-align: left; margin-bottom: 24px; font-size: 13px; color: rgba(203, 213, 225, 0.8); line-height: 1.6; font-weight: 300;">
                Selecciona la columna secundaria (ej. Descripción). El motor convertirá su texto en una huella numérica única (Hash Determinista) y la enlazará a los registros duplicados.
            </div>
            <div style="position: relative;">
                <i data-lucide="hash" style="width: 16px; height: 16px; color: #d946ef; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 10; pointer-events: none;"></i>
                <select id="swal-combine-hash" style="width: 100%; background: rgba(2, 6, 23, 0.4); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px 16px 12px 36px; color: #fdf4ff; appearance: none; outline: none; cursor: pointer; font-weight: 500; letter-spacing: 0.025em; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);">
                    <option value="" disabled selected>Elige una columna de texto...</option>
                    ${optionsHtml}
                </select>
                <i data-lucide="chevron-down" style="width: 16px; height: 16px; color: #64748b; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); z-index: 10; pointer-events: none;"></i>
            </div>
        `,
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#ffffff',
        customClass: {
            title: 'text-white font-light tracking-wide text-xl',
            confirmButton: 'bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white border border-fuchsia-400/30 rounded-lg shadow-lg px-6 py-2 transition-all',
            cancelButton: 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-lg px-6 py-2 transition-all'
        },
        showCancelButton: true,
        confirmButtonText: 'Generar Hash',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const val = document.getElementById('swal-combine-hash').value;
            if (!val) Swal.showValidationMessage('Debes seleccionar una columna');
            return val;
        },
        didOpen: () => {
            if (window.lucide) window.lucide.createIcons();
            const popup = Swal.getPopup();
            if (popup) {
                popup.style.backdropFilter = 'blur(16px)';
                popup.style.WebkitBackdropFilter = 'blur(16px)';
                popup.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                popup.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.5)';
                popup.style.borderRadius = '1rem';
            }
        }
    });

    if (selectedColId) {
        const sourceName = availableCols.find(c => c.id === selectedColId)?.name || 'Otra columna';
        const ruleObj = {
            tipo: 'combine_hash',
            nombre_regla: `Sufijo Hash desde [${sourceName}]`,
            descripcion: 'Regla Avanzada: Transforma el texto de la columna origen en un identificador numérico único (DJB2) y lo concatena con un guion (-).',
            target_col_id: selectedColId,
            source_col_id: activeContext.colIndex,
            disabled: false
        };
        
        console.log(`⚡ [WORKSHOP] Aplicando Regla Combine Hash | Target: ${selectedColId}`);
        currentDraftPipeline.push({ ...ruleObj });
        renderPipeline();
        triggerPreview();
    }
}

// [V5.22 UI] Direct Injection API from AI Copilot (Headless)
export async function createLocalRuleDirect(ruleObj, clearFirst = false) {
    if (!ruleObj) return false;
    
    console.log(`🤖 [WORKSHOP] Chofer IA Inyectando regla generada:`, ruleObj);
    
    if (clearFirst) {
        currentDraftPipeline.length = 0; // Se asegura destrucción pura de residuos (Falla 2 QA)
    }
    
    currentDraftPipeline.push({ ...ruleObj });
    renderPipeline();
    triggerPreview();
    
    // Si la consola está abierta, se ve visualmente. Si estuviese cerrada (modal inyección rápida), se forzaría guardado
    if (!isPanelOpen && activeContext && activeContext.colIndex) {
        if (!window.draftPipelines) window.draftPipelines = {};
        window.draftPipelines[activeContext.colIndex] = {
            masterField: activeContext.masterField,
            colName: activeContext.colName,
            rules: [...currentDraftPipeline]
        };
        if (typeof window.triggerSafeRender === 'function') window.triggerSafeRender();
    }
    return true;
}

export async function updateLocalRuleDictionary(ruleIdx, newDictionary, logicaAppend = null) {
    if (ruleIdx < 0 || ruleIdx >= currentDraftPipeline.length) {
        console.error("🤖 [WORKSHOP] Índice de regla inválido para updateLocalRuleDictionary.");
        return false;
    }
    
    let targetRule = currentDraftPipeline[ruleIdx];
    if (!targetRule || !targetRule.logica || targetRule.logica.length === 0) {
        console.error("🤖 [WORKSHOP] La regla objetivo no posee bloque de lógica válido.");
        return false;
    }

    console.log(`🤖 [WORKSHOP] Chofer IA actualizando regla existente [Idx: ${ruleIdx}]:`, targetRule.nombre_regla);

    // Merge in-place dictionary (condicion.valor AND accion.valor for dictionaries)
    for (let i = 0; i < targetRule.logica.length; i++) {
        let b = targetRule.logica[i];
        if (b.condicion && b.condicion.operador === 'IN_DICT_KEYS' && typeof b.condicion.valor === 'object') {
            Object.assign(b.condicion.valor, newDictionary);
        }
        if (b.accion && b.accion.tipo_accion === 'DICTIONARY_REPLACE' && typeof b.accion.valor === 'object') {
            Object.assign(b.accion.valor, newDictionary);
        }
        
        // If there's append logic (e.g., dropped list items), we handle it
        if (logicaAppend && logicaAppend.dropped && b.condicion && b.condicion.operador === 'IN_LIST' && b.accion && b.accion.tipo_accion === 'DROP') {
             b.condicion.valor = [...new Set([...(b.condicion.valor || []), ...logicaAppend.dropped])];
        }
    }
    
    // Si logicaAppend.dropped existe pero no había un bloque IN_LIST previo, hay que agregarlo
    if (logicaAppend && logicaAppend.dropped && logicaAppend.dropped.length > 0) {
         let hasDropBlock = targetRule.logica.some(b => b.condicion && b.condicion.operador === 'IN_LIST' && b.accion && b.accion.tipo_accion === 'DROP');
         if (!hasDropBlock) {
             let dropBlock = {
                 condicion: { operador: "IN_LIST", valor: logicaAppend.dropped },
                 accion: { tipo_accion: "DROP", valor: null }
             };
             let defaultIdx = targetRule.logica.findIndex(b => b.condicion && b.condicion.operador === "DEFAULT");
             if (defaultIdx === -1) {
                 targetRule.logica.push(dropBlock);
             } else {
                 targetRule.logica.splice(defaultIdx, 0, dropBlock);
             }
         }
    }

    renderPipeline();
    triggerPreview();
    
    if (!isPanelOpen && activeContext && activeContext.colIndex) {
        if (!window.draftPipelines) window.draftPipelines = {};
        window.draftPipelines[activeContext.colIndex] = {
            masterField: activeContext.masterField,
            colName: activeContext.colName,
            rules: [...currentDraftPipeline]
        };
        if (typeof window.triggerSafeRender === 'function') window.triggerSafeRender();
    }
    return true;
}

export function getActiveState() {
    return {
        isOpen: isPanelOpen,
        colIndex: activeContext.colIndex,
        colName: activeContext.colName,
        masterField: activeContext.masterField,
        pipeline: currentDraftPipeline
    };
}

// [V5.31 UX] Bespoke Rule: Math Discount
async function promptMathDiscountRule() {
    const { value: percentageValue } = await Swal.fire({
        title: 'Porcentaje de Descuento',
        html: `
            <div style="text-align: left; margin-bottom: 24px; font-size: 13px; color: rgba(203, 213, 225, 0.8); line-height: 1.6; font-weight: 300;">
                Ingresa el valor numérico del porcentaje que se reducirá de la celda actual (ej. 10.5, 20, 5).
                <br><br><span style="color: #94a3b8;">La celda conservará su estado original si ocurre un error (no generará un fallo NaN) y el resultado se limitará a 2 decimales.</span>
            </div>
            <div style="position: relative;">
                <i data-lucide="percent" style="width: 16px; height: 16px; color: #06b6d4; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 10;"></i>
                <input id="swal-math-discount-input" type="number" step="0.01" placeholder="Ej: 15.5" style="width: 100%; background: rgba(2, 6, 23, 0.4); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px 16px 12px 36px; color: #cffafe; outline: none; font-weight: 500;">
            </div>
        `,
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#ffffff',
        customClass: {
            title: 'text-white font-light tracking-wide text-xl',
            confirmButton: 'bg-cyan-600/80 hover:bg-cyan-500 text-white border border-cyan-400/30 rounded-lg shadow-lg px-6 py-2 transition-all',
            cancelButton: 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-lg px-6 py-2 transition-all'
        },
        showCancelButton: true,
        confirmButtonText: 'Aplicar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const val = document.getElementById('swal-math-discount-input').value;
            if (!val || isNaN(parseFloat(val))) {
                Swal.showValidationMessage('Debes ingresar un número válido.');
            }
            return parseFloat(val);
        },
        didOpen: () => {
            if (window.lucide) window.lucide.createIcons();
            const popup = Swal.getPopup();
            if (popup) {
                popup.style.backdropFilter = 'blur(16px)';
                popup.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                popup.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.5)';
                popup.style.borderRadius = '1rem';
            }
        }
    });

    if (percentageValue !== undefined) {
        const ruleObj = {
            tipo: 'math_discount',
            nombre_regla: `Aplicar Descuento (${percentageValue}%)`,
            descripcion: `Regla Matemática: Reduce el valor numérico extraíble de la celda en un ${percentageValue}%. Mantiene nulos si es texto.`,
            percentage: percentageValue,
            disabled: false
        };
        
        console.log(`⚡ [WORKSHOP] Aplicando Regla Math Discount | Pct: ${percentageValue}%`);
        currentDraftPipeline.push({ ...ruleObj });
        renderPipeline();
        triggerPreview();
    }
}

window.viewerRuleWorkshop = {
    init: initRuleWorkshop,
    open,
    close,
    addSelectedRule,
    removeRule,
    moveRuleUp,
    moveRuleDown,
    applyMapping,
    getActiveState,
    createLocalRule,
    switchToComputedMode,
    switchToStandardMode,
    createLocalRuleDirect,
    updateLocalRuleDictionary,
    clearPipeline,
    auditResidues,
    processCacheMiss,
    promptScopeModal,
    unlinkCurrentCol
};

// Auto-initialize on load
initRuleWorkshop();
