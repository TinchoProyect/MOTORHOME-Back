/**
 * VIEWER COMPUTED - Módulo Satélite de Cálculos
 * Se encarga de gestionar columnas calculadas (Precio - Descuento, etc.)
 */

console.log("%c 🧮 VIEWER COMPUTED: READY ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px;");

// Almacén global de columnas calculadas
window.computedColumns = [];

// --- ABRIR MODAL Y CARGAR OPCIONES ---
function openCalculationModal(fromRuleWorkshop = false) {
    const selectA = document.getElementById('calcFieldA');
    const selectB = document.getElementById('calcFieldB');

    // Limpiar opciones previas
    selectA.innerHTML = '';
    selectB.innerHTML = '';
    
    // Purga de multiclonados anteriores
    document.querySelectorAll('.calc-source-dyn').forEach((el, i) => { if(i>0) el.parentElement.remove(); });
    
    // V5: Obtener columnas procesadas visual y estructuralmente (Fase 1 completada)
    let hasOptions = false;

    if (window.virtualColumns) {
        window.virtualColumns.forEach((vCol) => {
            const vColId = vCol.id;
            let termName = null;

            // 1. Check if it's currently actively mapped in draft mode
            if (window.draftPipelines && window.draftPipelines[vColId]) {
                const pipe = window.draftPipelines[vColId];
                termName = pipe.masterField?.nombre_campo || pipe.colName;

                // V5 Resolve Generic Names ("Campo ID 5a6b...") back to Human Readable via Master Dictionary
                if (termName && termName.startsWith('Campo ID') && pipe.masterField?.id && window.masterDictionary) {
                    const realField = window.masterDictionary.find(f => f.id === pipe.masterField.id);
                    if (realField) termName = realField.nombre_campo;
                }
            }
            // 2. Fallback to confirmed global mapping (can sometimes be the UUID in V4 DB!)
            else if (window.columnMapping) {
                termName = window.columnMapping[vColId];
                if (termName && termName.length === 36 && termName.includes('-') && window.masterDictionary) {
                    const realField = window.masterDictionary.find(f => f.id === termName);
                    if (realField) termName = realField.nombre_campo;
                }
            }

            // Validar que no sea ignorada ni sea ella misma una columna calculada ya resuelta (evitar recursión inf.)
            if (termName && termName !== 'Ignorar Columna' && !vCol.isCalculated) {
                const optionA = document.createElement('option');
                optionA.value = vColId; // Usamos la ID virtual

                // Mostrar si es la columna nativa o un clon/fantasma
                const suffix = (typeof vCol.dataIdx !== 'number' && vCol.dataIdx === null) ? '' : (vColId.includes('clone') ? ' (Clon)' : ' (Ref)');

                optionA.text = `${termName}${suffix}`;

                const optionB = optionA.cloneNode(true);

                selectA.appendChild(optionA);
                selectB.appendChild(optionB);
                hasOptions = true;
            }
        });
    }

    if (!hasOptions) {
        console.warn("⚠️ Primero debés mapear variables (ej: 'Precio Base' y 'Descuento') en el visor para usarlas como operandos.");
    }

    // [New] Dynamic UI For Operations
    const selOp = document.getElementById('calcOperation');
    if (selOp) {
        selOp.onchange = () => {
            const opValue = selOp.value;
            const labelA = document.getElementById('calcLabelA') || document.getElementById('calcFieldA').previousElementSibling;
            const containerB = document.getElementById('calcFieldB_container') || document.getElementById('calcFieldB').parentElement;
            const containerTol = document.getElementById('calcTolerateEmpty') ? document.getElementById('calcTolerateEmpty').parentElement : null;
            const cloneAddBtn = document.getElementById('cloneAddBtnContainer');
            
            if (opValue === 'CLONE') {
                if(labelA) labelA.innerText = "Columna Origen (Clonada)";
                if(containerB) containerB.style.display = 'none';
                if(containerTol) containerTol.style.display = 'none';
                if(cloneAddBtn) cloneAddBtn.style.display = 'block';
            } else {
                if(labelA) labelA.innerText = "Precio Base (A)";
                if(containerB) containerB.style.display = 'block';
                if(containerTol) containerTol.style.display = 'flex';
                if(cloneAddBtn) cloneAddBtn.style.display = 'none';
                // Reset clones on math operation
                document.querySelectorAll('.calc-source-dyn').forEach((el, i) => { if(i>0) el.parentElement.remove(); });
            }
        };
        // Limpiamos la basura visual del estado anterior forzándolo al disparar el trigger
        setTimeout(() => selOp.onchange(), 50);
    }
}

// [NUEVO V8.5] UI Dinámica para Clones Multicolumna
window.addCloneSourceUI = function() {
    const container = document.getElementById('calcOperandsContainer');
    if(!container) return;
    const baseSel = document.getElementById('calcFieldA');
    if(!baseSel) return;
    
    // Find how many currently exist
    const count = document.querySelectorAll('.calc-source-dyn').length + 1;
    
    const wrapper = document.createElement('div');
    wrapper.className = "space-y-1 relative";
    
    const label = document.createElement('label');
    label.className = "text-[10px] font-bold text-slate-500 uppercase flex justify-between";
    label.innerHTML = `Origen (REF ${count}) <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-400 font-bold"><i data-lucide="x" class="w-3 h-3 inline"></i></button>`;
    
    const sel = document.createElement('select');
    sel.className = "calc-source-dyn w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none";
    sel.innerHTML = baseSel.innerHTML; // Copy options
    sel.value = "";
    
    wrapper.appendChild(label);
    wrapper.appendChild(sel);
    container.appendChild(wrapper);
    if(window.lucide) lucide.createIcons();
};

// --- GUARDAR LA NUEVA COLUMNA ---
function saveComputedColumn(closeModal = true) {
    if (!window._activeComputedContext) return;

    const op = document.getElementById('calcOperation').value;
    const nameInput = document.getElementById('calcColName') ? document.getElementById('calcColName').value.trim() : null;
    const tolerateEmpty = document.getElementById('calcTolerateEmpty') ? document.getElementById('calcTolerateEmpty').checked : true;
    
    let operandsList = [];

    if (op === 'CLONE') {
        const selects = document.querySelectorAll('.calc-source-dyn');
        selects.forEach(s => {
            if(s.value && s.value.trim() !== '') operandsList.push(s.value);
        });
        
        if (operandsList.length === 0) {
            alert("Por favor completá al menos una Columna Origen a Clonar.");
            return;
        }
    } else {
        const vColIdA = document.getElementById('calcFieldA') ? document.getElementById('calcFieldA').value : null;
        const vColIdB = document.getElementById('calcFieldB') ? document.getElementById('calcFieldB').value : null;
        
        if (!vColIdA || !vColIdB) {
            alert("Por favor completá todos los operandos.");
            return;
        }
        if (vColIdA === vColIdB) {
            alert("Elegí columnas distintas para el cálculo.");
            return;
        }
        operandsList = [vColIdA, vColIdB];
    }

    const targetMasterField = { ...window._activeComputedContext.masterField };
    if (nameInput) targetMasterField.nombre_campo = nameInput;

    if (!Array.isArray(window.computedColumns)) {
        window.computedColumns = [];
    }

    // Actualizar en memoria
    if (window._activeComputedContext.originalCompId) {
        const id = window._activeComputedContext.originalCompId;
        const idx = window.computedColumns.findIndex(c => c.id === id);
        if (idx !== -1) {
            window.computedColumns[idx].masterField = targetMasterField;
            window.computedColumns[idx].macro = op || 'PRICE_MINUS_DISCOUNT_PERCENT';
            window.computedColumns[idx].operands = operandsList;
            window.computedColumns[idx].tolerateEmpty = tolerateEmpty;
            console.log("✅ Columna Calculada Actualizada:", window.computedColumns[idx]);
        } else if (id.startsWith('col_ph_')) {
            // [V5.20 FIX UX] Convert Ghost Placeholder natively into a Computed Column
            // Remove from virtualColumns so it doesn't render as physical anymore
            const ghostIdx = window.virtualColumns.findIndex(c => c.id === id);
            if (ghostIdx !== -1) {
                window.virtualColumns.splice(ghostIdx, 1);
            }
            
            // Push to computed array
            window.computedColumns.push({
                id: id,
                masterField: targetMasterField,
                macro: op || 'PRICE_MINUS_DISCOUNT_PERCENT',
                operands: operandsList,
                tolerateEmpty: tolerateEmpty
            });
            console.log("✅ Ghost Column convertido exitosamente a Columna Calculada!");
        }
    } else {
        // Ajouter en memoria
        window.computedColumns.push({
            id: 'comp_' + Date.now(),
            masterField: targetMasterField, // Destination
            macro: op || 'PRICE_MINUS_DISCOUNT_PERCENT', // V5 Rule constant for now (hardcoded map to UI Operation)
            operands: operandsList,
            tolerateEmpty: tolerateEmpty
        });
        console.log("✅ Columna Calculada Añadida al V5 Engine:", window.computedColumns);
    }

    // Cerrar el Workshop y forzar el volcado de reglas del Pipeline (si es que se asignaron reglas extra)
    if (closeModal && window.viewerRuleWorkshop) {
        if (typeof window.viewerRuleWorkshop.applyMapping === 'function') {
            window.viewerRuleWorkshop.applyMapping(); // Automáticamente cierra el panel
        } else {
            window.viewerRuleWorkshop.close();
        }
        // Limpiar busqueda
        window._activeComputedContext = null;
    }

    // Disparar Render Phase 1 & Phase 2 in-place (V5 Canvas)
    if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
        window.renderVirtualTable(window.currentSheetData);
    }

    // Disparar Autoguardado silencioso de estado (Engine V5)
    if (typeof window.saveSimulationConfig === 'function') {
        window.saveSimulationConfig(null, false);
    }
}

// --- BORRAR COLUMNA ---
function deleteComputedColumn(indexStr) {
    const idx = parseInt(indexStr, 10);
    if (Array.isArray(window.computedColumns) && !isNaN(idx) && idx >= 0 && idx < window.computedColumns.length) {
        window.computedColumns.splice(idx, 1);

        console.log(`🗑️ Columna Calculada eliminada en el Engine.`);

        if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
            window.renderVirtualTable(window.currentSheetData);
        }
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, false); // Autoguardado silencioso
        }
    }
}

function editComputedColumn(vColId) {
    if (!window.computedColumns) return;
    
    // Buscar la configuración de esta columna en nuestros registros
    const compConfig = window.computedColumns.find(c => c.id === vColId || c.masterField?.nombre_campo === vColId);
    if (!compConfig) {
        console.warn("⚠️ [EDIT.COMPUTED] Columna calculada no encontrada en engine.", vColId);
        return;
    }

    // Inyectar el estado antes de abrir la UI para que la UX sepa re-hidratarse
    window._activeComputedContext = {
        masterField: compConfig.masterField,
        colName: compConfig.masterField?.nombre_campo || "Edición V5",
        colIndex: compConfig.id,
        originalCompId: compConfig.id // Fundamental para que el setTimeout sepa a quien pertenece
    };

    // Delegation to Workshop UX
    if (window.viewerRuleWorkshop) {
        window.viewerRuleWorkshop.open(compConfig.masterField, compConfig.id, compConfig.masterField?.nombre_campo || "Edición V5");
    }
}

// --- EXPOSICIÓN GLOBAL ---
window.ViewerUI = window.ViewerUI || {};
window.ViewerUI.deleteComputedColumn = deleteComputedColumn;

// Exponemos las funciones para que el HTML pueda llamarlas (onclick)
window.openCalculationModal = openCalculationModal;
window.saveComputedColumn = saveComputedColumn;
window.editComputedColumn = editComputedColumn;