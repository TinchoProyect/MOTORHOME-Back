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
    if (!masterField) {
        // [V5.14 FIX] Allow opening existing mapped columns without passing masterField
        if (window.draftPipelines && window.draftPipelines[vColId]) {
            masterField = window.draftPipelines[vColId].masterField;
        } else {
            console.warn("Workshop abierto sin masterField y sin pipeline previo.");
            return;
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

            if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
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
            if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
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
        <span class="text-slate-400">Enlazando columna:</span>
        <span class="text-white text-sm">"${colName}" <i data-lucide="arrow-right" class="w-3 h-3 inline"></i> ${masterField.nombre_campo}</span>
    `;

    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.remove('hidden', 'translate-x-full', 'opacity-0');
    }

    // Shrink excelContainer so scrollbar is visible
    const excelContainer = document.getElementById('excelContainer');
    if (excelContainer) {
        excelContainer.style.paddingRight = '400px'; // Panel width + margin
        excelContainer.style.transition = 'padding-right 0.3s ease-in-out';
    }

    if (window.lucide) window.lucide.createIcons();
    
    // Validar en que modo corre: ¿Es una Columna Calculada existente o un Fantasma recién inyectado?
    const isEditingComputed = window.computedColumns && window.computedColumns.find(c => c.id === activeVColId);
    const isNewGhostComputed = window.virtualColumns && window.virtualColumns.find(c => c.id === activeVColId && c.isCalculated === true);
    
    if (isEditingComputed || isNewGhostComputed || (window._activeComputedContext && window._activeComputedContext.colIndex === activeVColId)) {
        switchToComputedMode();
    } else {
        switchToStandardMode();
    }
    
    // [V5.x FIX] Repintar combobox filtrado por Scope (campo_maestro_id) para el campo abierto
    renderRuleSelector();

    renderPipeline();

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
            originalCompId: null
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
            if (compConfig && compConfig.operands && compConfig.operands.length === 2) {
                const elA = document.getElementById('calcFieldA');
                const elB = document.getElementById('calcFieldB');
                const elOp = document.getElementById('calcOperation');
                const elColName = document.getElementById('calcColName');
                const elTol = document.getElementById('calcTolerateEmpty');
                
                if (elA) elA.value = compConfig.operands[0];
                if (elB) elB.value = compConfig.operands[1];
                if (elOp) elOp.value = compConfig.macro;
                if (elColName) elColName.value = compConfig.masterField?.nombre_campo || "";
                if (elTol) elTol.checked = compConfig.tolerateEmpty !== false;
            }
        }, 50);
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
        if (typeof renderVirtualTable === 'function' && window.currentSheetData) {
            renderVirtualTable(window.currentSheetData);
        }
    }

    // Restore excelContainer width
    const excelContainer = document.getElementById('excelContainer');
    if (excelContainer) {
        excelContainer.style.paddingRight = '0px';
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

    if (currentDraftPipeline.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (flowLine) flowLine.classList.add('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (flowLine) flowLine.classList.remove('hidden');

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

// BIND TO VIEWER CORE & PREVIEW
function triggerPreview() {
    if (window.viewerETL && typeof window.viewerETL.previewColumn === 'function') {
        window.viewerETL.previewColumn(activeContext.colIndex, currentDraftPipeline);
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
        if (typeof window.saveSimulationConfig === 'function') {
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
                    if (window.renderVirtualTable && window.viewerState && window.viewerState.data) {
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

export function getActiveState() {
    return {
        isOpen: isPanelOpen,
        colIndex: activeContext.colIndex,
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
    switchToStandardMode
};

// Auto-initialize on load
initRuleWorkshop();
