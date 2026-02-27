/**
 * VIEWER COMPUTED - Módulo Satélite de Cálculos
 * Se encarga de gestionar columnas calculadas (Precio - Descuento, etc.)
 */

console.log("%c 🧮 VIEWER COMPUTED: READY ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px;");

// Almacén global de columnas calculadas
window.computedColumns = [];

// --- ABRIR MODAL Y CARGAR OPCIONES ---
function openCalculationModal(fromRuleWorkshop = false) {
    const modal = document.getElementById('calculationModal');
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
        alert("⚠️ Primero debés mapear variables (ej: 'Precio Base' y 'Descuento') en el visor para usarlas como operandos.");
        return;
    }

    modal.classList.remove('hidden');

    if (fromRuleWorkshop && window.viewerRuleWorkshop) {
        // En V5 un cálculo se añade en el contexto de una columna maestra destino activa en el Workshop
        window._activeComputedContext = window.viewerRuleWorkshop.getActiveState();
    } else {
        window._activeComputedContext = null;
    }
}

// --- GUARDAR LA NUEVA COLUMNA ---
function saveComputedColumn() {
    const nameInput = document.getElementById('calcColName').value;
    const op = document.getElementById('calcOperation').value;
    const vColIdA = document.getElementById('calcFieldA').value;
    const vColIdB = document.getElementById('calcFieldB').value;

    if (!vColIdA || !vColIdB) {
        alert("Por favor completá todos los operandos.");
        return;
    }

    if (vColIdA === vColIdB) {
        alert("Elegí columnas distintas para el cálculo.");
        return;
    }

    let targetMasterField = null;

    if (window._activeComputedContext) {
        targetMasterField = window._activeComputedContext.masterField;
    } else {
        // Fallback for V3 (not strictly needed in V5)
        targetMasterField = { nombre_campo: nameInput || "Columna Calculada" };
    }

    if (!Array.isArray(window.computedColumns)) {
        window.computedColumns = [];
    }

    // Ajouter en memoria
    window.computedColumns.push({
        id: 'comp_' + Date.now(),
        masterField: targetMasterField, // Destination
        macro: 'PRICE_MINUS_DISCOUNT_PERCENT', // V5 Rule constant for now (hardcoded map to UI Operation)
        operands: [vColIdA, vColIdB]
    });

    console.log("✅ Columna Calculada Añadida al V5 Engine:", window.computedColumns);

    // Cerrar modal
    document.getElementById('calculationModal').classList.add('hidden');

    // Cerrar el Workshop si venimos de ahi
    if (window._activeComputedContext && window.viewerRuleWorkshop) {
        window.viewerRuleWorkshop.close();
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

// --- EXPOSICIÓN GLOBAL ---
window.ViewerUI = window.ViewerUI || {};
window.ViewerUI.deleteComputedColumn = deleteComputedColumn;

// Exponemos las funciones para que el HTML pueda llamarlas (onclick)
window.openCalculationModal = openCalculationModal;
window.saveComputedColumn = saveComputedColumn;