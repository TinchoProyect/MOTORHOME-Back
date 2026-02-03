/**
 * VIEWER COMPUTED - Módulo Satélite de Cálculos
 * Se encarga de gestionar columnas calculadas (Precio - Descuento, etc.)
 */

console.log("%c 🧮 VIEWER COMPUTED: READY ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px;");

// Almacén global de columnas calculadas
window.computedColumns = [];

// --- ABRIR MODAL Y CARGAR OPCIONES ---
function openCalculationModal() {
    const modal = document.getElementById('calculationModal');
    const selectA = document.getElementById('calcFieldA');
    const selectB = document.getElementById('calcFieldB');

    // Limpiar opciones previas
    selectA.innerHTML = '';
    selectB.innerHTML = '';

    // Obtener mapeo actual desde el Viewer Engine
    // (Nota: viewerState se expondrá en la Fase 3)
    let mapping = window.viewerState ? window.viewerState.mapping : {};

    // Generar opciones basadas en columnas ya mapeadas
    let hasOptions = false;

    if (mapping) {
        Object.keys(mapping).forEach(colIdx => {
            const termName = mapping[colIdx];
            // Solo mostramos columnas que tengan un nombre asignado (y no sean "Ignorar")
            if (termName && termName !== 'Ignorar Columna') {
                const optionA = document.createElement('option');
                optionA.value = colIdx; // Usamos el índice de la columna original
                optionA.text = `${termName} (Col ${parseInt(colIdx) + 1})`;

                const optionB = optionA.cloneNode(true);

                selectA.appendChild(optionA);
                selectB.appendChild(optionB);
                hasOptions = true;
            }
        });
    }

    if (!hasOptions) {
        alert("⚠️ Primero debés mapear las columnas (ej: 'Precio Base' y 'Descuento') en el visor para poder usarlas en el cálculo.");
        return;
    }

    modal.classList.remove('hidden');
}

// --- GUARDAR LA NUEVA COLUMNA ---
function saveComputedColumn() {
    const name = document.getElementById('calcColName').value;
    const op = document.getElementById('calcOperation').value;
    const idxA = document.getElementById('calcFieldA').value;
    const idxB = document.getElementById('calcFieldB').value;

    if (!name || !idxA || !idxB) {
        alert("Por favor completá todos los campos.");
        return;
    }

    if (idxA === idxB) {
        alert("Elegí columnas distintas para el cálculo.");
        return;
    }

    // Agregar a la lista global de cálculos
    window.computedColumns.push({
        id: 'comp_' + Date.now(),
        name: name,
        operation: op, // 'discount'
        sourceA: parseInt(idxA), // Índice columna Precio
        sourceB: parseInt(idxB)  // Índice columna Descuento
    });

    console.log("✅ Columna Calculada Agregada:", window.computedColumns);

    // Cerrar modal
    document.getElementById('calculationModal').classList.add('hidden');

    // Feedback visual en el botón
    const btn = document.getElementById('btnCalcMode');
    if (btn) {
        const originalHtml = btn.innerHTML;
        const originalClasses = btn.className;

        btn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Agregado`;
        btn.classList.remove('bg-slate-800', 'text-slate-300', 'hover:bg-slate-700');
        btn.classList.add('bg-purple-600', 'text-white', 'border-purple-500');

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.className = originalClasses;
            if (window.lucide) window.lucide.createIcons();
        }, 2000);
    }
}

// --- EXPOSICIÓN GLOBAL ---
// Exponemos las funciones para que el HTML pueda llamarlas (onclick)
window.openCalculationModal = openCalculationModal;
window.saveComputedColumn = saveComputedColumn;