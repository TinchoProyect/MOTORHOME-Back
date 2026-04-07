/**
 * VIEWER RULE WORKSHOP (V4)
 * Phase 3: The Right Panel and Rule Pipeline Builder
 */

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
}

// OPEN PANEL
export async function open(masterField, vColId, colName) {
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
        // [V5.14 FIX] Allow opening existing mapped columns without passing masterField
        if (window.draftPipelines && window.draftPipelines[vColId]) {
            masterField = window.draftPipelines[vColId].masterField;
        } else {
            console.warn("Workshop abierto sin masterField y sin pipeline previo.");
            return;
        }
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

    // Check if we need to CLONE or OVERWRITE
    let activeVColId = vColId;
    let hasConflict = false;

    // V4 Conflict (Pipeline)
    if (window.draftPipelines && window.draftPipelines[vColId] && masterField.id !== window.draftPipelines[vColId].masterField.id) {
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
                alert("No se puede clonar: la columna virtual original no fue encontrada.");
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

    // UI Updates
    document.getElementById('vrwCurrentMappingInfo').innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="flex flex-col">
                <span class="text-slate-400 text-xs">Enlazando columna:</span>
                <span class="text-white text-sm font-bold truncate max-w-[200px]" title="${colName}">"${colName}" <i data-lucide="arrow-right" class="w-3 h-3 text-emerald-400 inline mx-1"></i> ${masterField.nombre_campo}</span>
            </div>
            <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.unlinkCurrentCol()" class="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:shadow-lg shadow-red-900/20" title="Eliminar este mapeo y devolver a su estado original">
                <i data-lucide="unlink" class="w-3 h-3"></i> Quitar Mapeo
            </button>
        </div>
    `;
    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.remove('hidden', 'translate-x-full', 'opacity-0');
    }

    if (window.lucide) window.lucide.createIcons();
    
    // Validar en que modo corre: ¿Es una Columna Calculada existente o un Fantasma recién inyectado?
    const isEditingComputed = window.computedColumns && window.computedColumns.find(c => c.id === activeVColId);
    const isNewGhostComputed = window.virtualColumns && window.virtualColumns.find(c => c.id === activeVColId && c.isGhostPlaceholder === true);
    
    if (isEditingComputed || isNewGhostComputed || (window._activeComputedContext && window._activeComputedContext.colIndex === activeVColId)) {
        switchToComputedMode();
    } else {
        switchToStandardMode();
    }
    
    // [V5.x FIX] Repintar combobox filtrado por Scope (campo_maestro_id) para el campo abierto
    renderRuleSelector();

    renderPipeline();

    // Init AI Copilot UI dynamically (Cero Totem UI Injection)
    if (window.viewerAiUi && typeof window.viewerAiUi.init === 'function') {
        window.viewerAiUi.init();
    }

    // Trigger Preview Immediately
    triggerPreview();
}

/**
 * Switches the Workshop Panel visual state to Computed Editor 
 */
export function switchToComputedMode() {
    // BUG FIX Nº3: Mantenemos visible el modo estándar de reglas por debajo del panel matemático
    document.getElementById('vrwStandardMode').classList.remove('hidden');
    document.getElementById('vrwComputedMode').classList.remove('hidden');
    
    // Auto-Scroll to Top so the user doesn't miss the Math Formula Form
    const workshopScrollContainer = document.querySelector('#viewerRightPanel .custom-scrollbar');
    if (workshopScrollContainer) {
        workshopScrollContainer.scrollTop = 0;
    }
    
    const applyBtnTxt = document.getElementById('vrwBtnApplyText');
    if (applyBtnTxt) applyBtnTxt.innerText = "Guardar Ecuación";

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
                
                if (compConfig.macro === 'CLONE') {
                    // Si hay multiples origenes, recrear dropdowns y valorizarlos
                    for (let i = 1; i < compConfig.operands.length; i++) {
                        if (window.addCloneSourceUI) window.addCloneSourceUI();
                        // Al re-queryear tomará las dinamicas (y baseSel no cuenta en querySelectorAll en V8 normal, a menos que el codigo lo haya incluido. wait! calcFieldA SI tiene la clase)
                        const allSelects = document.querySelectorAll('.calc-source-dyn');
                        if (allSelects[i]) {
                            allSelects[i].value = compConfig.operands[i];
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
export function switchToStandardMode() {
    window._activeComputedContext = null;

    document.getElementById('vrwStandardMode').classList.remove('hidden');
    document.getElementById('vrwComputedMode').classList.add('hidden');

    const applyBtnTxt = document.getElementById('vrwBtnApplyText');
    if (applyBtnTxt) applyBtnTxt.innerText = "Enlazar Columna";

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
        alert("Atención: Selecciona una transformación del catálogo primero.");
        return;
    }

    const ruleId = selector.value;
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

        chip.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="bg-slate-800 text-slate-400 font-mono text-[9px] w-5 h-5 flex items-center justify-center rounded-full border border-slate-700">${index + 1}</div>
                <div>
                    <h4 class="text-xs font-bold text-emerald-400">${rule.nombre_regla}</h4>
                    <p class="text-[10px] text-slate-500 mt-0.5 leading-snug" title="${rule.descripcion || 'Regla de limpieza nativa.'}">${rule.descripcion || 'Regla de limpieza nativa.'}</p>
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
    let libretaDict = null;
    
    currentDraftPipeline.forEach((r, idx) => {
         let isDictRule = false;
         let dictObj = null;
         if (r.tipo === 'ast_conditional' && r.logica && r.logica[0]) {
             const cond = r.logica[0].condicion;
             const act = r.logica[0].accion;
             if (cond && cond.operador === 'IN_DICT_KEYS' && typeof cond.valor === 'object' && cond.valor !== null) {
                 isDictRule = true;
                 dictObj = cond.valor;
             } else if (act && act.tipo_accion === 'DICTIONARY_REPLACE' && typeof act.valor === 'object' && act.valor !== null) {
                 isDictRule = true;
                 dictObj = act.valor;
             }
         }

         if (isDictRule) {
             libretaRuleIdx = idx;
             libretaDict = dictObj;
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
    if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) {
        physicalIdx = parseInt(physicalIdx.replace('col_', ''), 10);
    }
    if (isNaN(physicalIdx) || physicalIdx < 0) return;
    
    let misses = [];
    const rawRows = window.currentSheetData.slice(1);
    for(let row of rawRows) {
        let crudo = String(row[physicalIdx] || "");
        if (!crudo.trim()) continue;
        
        let outVal = crudo;
        let rejected = false;
        if (window.viewerETL && window.viewerETL.transformCell) {
            const tr = window.viewerETL.transformCell(crudo, currentDraftPipeline);
            outVal = String(tr.display || tr.result || "");
            rejected = tr.rejected;
        }
        
        let isUnmapped = libretaDict && libretaDict[crudo.trim()] === undefined;
        if (rejected || outVal.trim() === "" || (isUnmapped && outVal === crudo)) {
            misses.push(crudo.trim());
        }
    }
    
    let uniqueMisses = [...new Set(misses)].filter(x => x);
    if (uniqueMisses.length > 0) {
        const btnHtml = `
            <button id="vrwCacheMissBtn" onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.processCacheMiss('${encodeURIComponent(libretaPrompt)}', ${libretaRuleIdx})" class="w-full mt-3 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.2)] hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse hover:animate-none">
                <i data-lucide="rocket" class="w-4 h-4"></i> Procesar registros nuevos (${uniqueMisses.length})
            </button>
        `;
        container.insertAdjacentHTML('beforeend', btnHtml);
        if (window.lucide) window.lucide.createIcons();
    }
}

export async function processCacheMiss(encodedPrompt, ruleIdx) {
    if (!window.Swal) return;
    
    const originalPrompt = decodeURIComponent(encodedPrompt);
    const originalRule = currentDraftPipeline[ruleIdx];
    
    if (!originalRule || !originalRule.logica || (!originalRule.logica[0].condicion && !originalRule.logica[0].accion)) {
        Swal.fire("Error", "La libreta madre está corrupta o no tiene diccionario interno.", "error"); return;
    }
    
    let physicalIdx = activeContext.colIndex;
    if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) {
        physicalIdx = parseInt(physicalIdx.replace('col_', ''), 10);
    }
    
    let libretaDict = originalRule.logica && originalRule.logica[0] && originalRule.logica[0].condicion ? originalRule.logica[0].condicion.valor : null;
    if (!libretaDict && originalRule.logica && originalRule.logica[0] && originalRule.logica[0].accion) libretaDict = originalRule.logica[0].accion.valor;
    
    let misses = [];
    const rawRows = window.currentSheetData.slice(1);
    for(let row of rawRows) {
        let crudo = String(row[physicalIdx] || "");
        if (!crudo.trim()) continue;
        const tr = window.viewerETL.transformCell(crudo, currentDraftPipeline);
        let outVal = String(tr.display || tr.result || "");
        let isUnmapped = libretaDict && libretaDict[crudo.trim()] === undefined;
        
        if (tr.rejected || outVal.trim() === "" || (isUnmapped && outVal === crudo)) {
            misses.push(crudo.trim());
        }
    }
    let uniqueMisses = [...new Set(misses)].filter(x => x);
    
    if (uniqueMisses.length === 0) {
        Swal.fire("Todo Ok", "No hay registros nuevos o residuales que procesar.", "success"); return;
    }
    
    try {
        Swal.fire({
            title: 'Actualizando Libreta...',
            html: `Enviando ${uniqueMisses.length} registros huérfanos al Motor IA bajo la directiva:<br><i class="text-indigo-300 text-[11px] font-mono mt-2 block break-words">"${originalPrompt}"</i>`,
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); },
            background: '#0f172a', color: '#f8fafc'
        });
        
        const isCluster = originalRule.logica[0].accion && originalRule.logica[0].accion.tipo_accion === 'DICTIONARY_REPLACE';
        const payload = {
            column_name: activeContext.colName || "Columna",
            prompt: originalPrompt,
            samples: uniqueMisses.slice(0, 500),
            require_ast: false,
            literal_mode: !isCluster
        };
        
        let backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}/api/ai/discover-entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Fallo de servidor al resolver entidades.");
        
        const newDict = data.cluster;
        if (!newDict || Object.keys(newDict).length === 0) throw new Error("La IA evaluó los registros pero no formuló derivaciones nuevas.");
        
        // Ejecución Quirúrgica: Fusión (Mergeo Dict)
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
        
        if (originalRule.logica[0].condicion && typeof originalRule.logica[0].condicion.valor === 'object') {
            Object.assign(originalRule.logica[0].condicion.valor, mapToInject);
        }
        if (originalRule.logica[0].accion && typeof originalRule.logica[0].accion.valor === 'object') {
            Object.assign(originalRule.logica[0].accion.valor, mapToInject);
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

export function clearPipeline() {
    if (currentDraftPipeline.length === 0) return;
    
    if (confirm("¿Estás seguro de purgar todas las reglas de esta columna?")) {
        currentDraftPipeline = [];
        renderPipeline();
        triggerPreview();
    }
}

// FULL UNLINK ACTION (Destructive)
export async function unlinkCurrentCol() {
    const isClone = activeContext.colIndex && String(activeContext.colIndex).includes('_clone_');
    
    if (currentDraftPipeline.length > 0) {
        if (!confirm(`La columna "${activeContext.colName}" tiene ${currentDraftPipeline.length} reglas ETL aplicadas.\nAl quitar el mapeo se destruirán todas las reglas.\n\n¿Estás seguro de proceder?`)) {
            return;
        }
    } else {
        if (!confirm(`¿Deseas desvincular el campo maestro y devolver la columna "${activeContext.colName}" a su estado original?`)) {
            return;
        }
    }

    const vColId = activeContext.colIndex;
    console.log(`🗑️ [WORKSHOP] UX Unlink: Purgando mapeo de ${vColId}`);
    
    if (vColId) {
        // Purgar de los diccionarios de memoria
        if (window.draftPipelines) delete window.draftPipelines[vColId];
        if (window.processingRules) delete window.processingRules[vColId];
        if (window.columnMapping) delete window.columnMapping[vColId];

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
        alert("No hay reglas para auditar.");
        return;
    }
    
    const lastRule = currentDraftPipeline[currentDraftPipeline.length - 1];
    
    let residualSamples = [];
    let physicalIdx = activeContext.colIndex;
    if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) {
        physicalIdx = parseInt(physicalIdx.replace('col_', ''));
    }
    
    if (isNaN(physicalIdx) || physicalIdx < 0) return;
    
    try {
        const rawRows = window.currentSheetData.slice(1);
        for(let row of rawRows) {
            let crudo = String(row[physicalIdx] || "");
            if (!crudo.trim()) continue;
            
            let mutateResult = crudo;
            if (window.viewerETL && window.viewerETL.transformCell) {
               const tr = window.viewerETL.transformCell(crudo, currentDraftPipeline);
               mutateResult = String(tr.display || tr.result || "");
               if (tr.rejected || mutateResult.trim() === "" || mutateResult === crudo) {
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

    console.log(`✅ [WORKSHOP] Mapeo guardado en RAM: Columna ${activeContext.colIndex} -> ${activeContext.masterField.nombre_campo}`);

    // Commit visual changes in the main Table (Header naming)
    if (window.viewerETL && typeof window.viewerETL.commitColumnMapping === 'function') {
        window.viewerETL.commitColumnMapping(activeContext.colIndex, activeContext.masterField, currentDraftPipeline);
    }

    close();

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

export async function createLocalRule(searchStr, replaceStr, isRegex = false, colId = null) {
    if (!window.globalContext || !window.globalContext.providerId || !window.currentSheetName) {
        alert("Falta contexto del proveedor u hoja actual.");
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

        const payload = {
            proveedor_id: window.globalContext.providerId,
            nombre_hoja: window.currentSheetName,
            nombre_regla: `Reemplazo Local: ${searchStr} -> ${replaceStr}`,
            descripcion: 'Regla personalizada local',
            tipo_regex: `CUSTOM_REPLACE:${searchFormatted}|||${replaceStr}`
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

// [V5.22 UI] Direct Injection API from AI Copilot (Headless)
export async function createLocalRuleDirect(ruleObj) {
    if (!ruleObj) return false;
    
    console.log(`🤖 [WORKSHOP] Chofer IA Inyectando regla generada:`, ruleObj);
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

export function getActiveState() {
    return {
        isOpen: isPanelOpen,
        colIndex: activeContext.colIndex,
        colName: activeContext.colName,
        masterField: activeContext.masterField,
        pipeline: currentDraftPipeline
    };
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
    clearPipeline,
    auditResidues,
    processCacheMiss,
    unlinkCurrentCol
};

// Auto-initialize on load
initRuleWorkshop();
