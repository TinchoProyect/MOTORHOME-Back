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
            const labelA = document.getElementById('calcFieldA').previousElementSibling;
            const containerB = document.getElementById('calcFieldB').parentElement;
            const containerTol = document.getElementById('calcTolerateEmpty') ? document.getElementById('calcTolerateEmpty').parentElement : null;
            
            if (opValue === 'CLONE') {
                if(labelA) labelA.innerText = "Columna Origen (Clonada)";
                if(containerB) containerB.style.display = 'none';
                if(containerTol) containerTol.style.display = 'none';
            } else {
                if(labelA) labelA.innerText = "Precio Base (A)";
                if(containerB) containerB.style.display = 'block';
                if(containerTol) containerTol.style.display = 'flex';
            }
        };
        // Limpiamos la basura visual del estado anterior forzándolo al disparar el trigger
        setTimeout(() => selOp.onchange(), 50);
    }
}

// --- GUARDAR LA NUEVA COLUMNA ---
function saveComputedColumn() {
    const nameInput = document.getElementById('calcColName').value;
    const op = document.getElementById('calcOperation').value;
    const vColIdA = document.getElementById('calcFieldA').value;
    const vColIdB = document.getElementById('calcFieldB').value;
    const tolerateEmpty = document.getElementById('calcTolerateEmpty').checked;

    if (op === 'CLONE') {
        if (!vColIdA) {
            alert("Por favor completá la Columna Origen a Clonar.");
            return;
        }
    } else {
        if (!vColIdA || !vColIdB) {
            alert("Por favor completá todos los operandos.");
            return;
        }
        if (vColIdA === vColIdB) {
            alert("Elegí columnas distintas para el cálculo.");
            return;
        }
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
            window.computedColumns[idx].operands = [vColIdA, vColIdB];
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
                operands: [vColIdA, vColIdB],
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
            operands: [vColIdA, vColIdB],
            tolerateEmpty: tolerateEmpty
        });
        console.log("✅ Columna Calculada Añadida al V5 Engine:", window.computedColumns);
    }

    // Cerrar el Workshop y forzar el volcado de reglas del Pipeline (si es que se asignaron reglas extra)
    if (window.viewerRuleWorkshop) {
        if (typeof window.viewerRuleWorkshop.applyMapping === 'function') {
            window.viewerRuleWorkshop.applyMapping(); // Automáticamente cierra el panel
        } else {
            window.viewerRuleWorkshop.close();
        }
    }

    // Limpiar busqueda
    window._activeComputedContext = null;

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