/**
 * VIEWER MAPPER ENGINE (V4)
 * Phase 2: Visual Focus Mode
 */

let isMappingMode = false;
let selectedMasterField = null;
let activeFocusCol = null;

// INIT BINDING
export function initMapper() {
    console.log('🔗 [MAPPER] Engine Inicializado');
}

// TOGGLE MAPPING MODE
export function toggleMappingState() {
    // 1. Blocker: Prevent Mapping if Offset Mode is active
    if (window.offsetSelectionMode) {
        if (typeof Swal !== 'undefined') {
            Swal.fire("Acción Bloqueada", "No puedes mapear columnas mientras defines el Inicio de Lectura. Confirma el inicio primero.", "warning");
        } else {
            alert("No puedes mapear columnas mientras defines el Inicio de Lectura.");
        }
        return;
    }

    isMappingMode = !isMappingMode;
    const btnMap = document.getElementById("btnMappingMode");

    if (isMappingMode) {
        if (btnMap) {
            btnMap.classList.replace('bg-slate-800', 'bg-blue-600');
            btnMap.classList.replace('text-slate-300', 'text-white');
            btnMap.classList.add('animate-pulse');
        }
        // Auto-open left panel if closed
        if (window.viewerLeftPanel && typeof window.viewerLeftPanel.toggle === 'function') {
            const aside = document.getElementById('viewerLeftPanel');
            if (aside && aside.classList.contains('-translate-x-full')) {
                window.viewerLeftPanel.toggle();
            }
        }
        console.log('🎯 [MAPPER] Modo activado. Esperando selección en panel izquierdo...');
    } else {
        cancelMapping();
        if (btnMap) {
            btnMap.classList.replace('bg-blue-600', 'bg-slate-800');
            btnMap.classList.replace('text-white', 'text-slate-300');
            btnMap.classList.remove('animate-pulse');
        }
        console.log('🛑 [MAPPER] Modo desactivado.');
    }
}

// PHASE 1: Click on Master Field
export function activatePointerMode(masterField) {
    if (window.mappingMode) {
        console.warn('🎯 [MAPPER] Clic ignorado: Modo V3 (Formateo) está activo.');
        return;
    }

    isMappingMode = true;
    selectedMasterField = masterField;
    console.log(`🎯 [MAPPER] Phase 1 OK. Esperando clic en Excel para: ${masterField.nombre_campo}`);

    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    // Reset old backdrop if exists
    let backdrop = document.getElementById('mapperBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mapperBackdrop';
        tableContainer.appendChild(backdrop);
    }
    // FASE 1: Floating Toast (Sin oscurecer la pantalla, sin bloquear clics)
    backdrop.className = "fixed bottom-8 right-8 z-[100] transition-opacity duration-300 opacity-100 pointer-events-none flex items-end justify-end";
    backdrop.innerHTML = `
        <div class="bg-blue-900/90 border border-blue-400 text-blue-100 px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl shadow-blue-500/20 animate-bounce pointer-events-auto">
            <i data-lucide="mouse-pointer-click" class="w-5 h-5"></i>
            <span class="text-sm font-bold tracking-wide">Selecciona cualquier celda para enlazar "${masterField.nombre_campo}"</span>
            <div class="w-px h-5 bg-blue-700/50 mx-1"></div>
            <button onclick="if(window.viewerMapper) window.viewerMapper.createComputedColumn()" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-bold transition-all shadow-lg flex items-center gap-2 border border-purple-400 hover:scale-105">
                <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Crear Columna Calculada
            </button>
            <button onclick="if(window.viewerMapper) window.viewerMapper.cancelMapping()" class="ml-2 text-blue-300 hover:text-white" title="Cancelar"><i data-lucide="x-circle" class="w-5 h-5"></i></button>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: backdrop });

    // Table Delegation for Clicks (Phase 2)
    tableContainer.onclick = (e) => {
        if (!selectedMasterField) return;

        const cell = e.target.closest('td, th');
        if (!cell || !tableContainer.contains(cell)) return;

        e.stopPropagation();

        const tr = cell.closest('tr');
        if (!tr) return;

        const colIndex = Array.from(tr.children).indexOf(cell);

        // Determinar nombre y vColId buscándolo en el th
        let vColId = `col_${colIndex}`;
        let colName = `Columna ${colIndex}`;
        const thead = tableContainer.querySelector('thead');
        if (thead) {
            const th = thead.querySelectorAll('th')[colIndex];
            if (th) {
                vColId = th.dataset.colId || vColId;
                const spanNodes = th.querySelectorAll('span');
                if (spanNodes.length > 0) {
                    colName = spanNodes[0].innerText || colName;
                } else if (th.innerText.trim() !== "") {
                    colName = th.innerText.trim();
                }
            }
        }

        executeMappingPhaseTwo(vColId, colName, colIndex);
    };

    // Pulse effect on wrapper
    tableContainer.classList.add('cursor-crosshair');
}

// PHASE 2: Click on Excel Column
function executeMappingPhaseTwo(vColId, colName, visualColIndex) {
    if (!selectedMasterField) return;
    console.log(`🎯 [MAPPER] Phase 2: Enlazando Columna visual ${vColId} a ${selectedMasterField.nombre_campo}`);

    // UI FOCUS MODE
    const tableContainer = document.getElementById('excelContainer');
    enterFocusMode(tableContainer, visualColIndex);

    // CALL RIGHT PANEL (Taller de Reglas)
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.open === 'function') {
        window.viewerRuleWorkshop.open(selectedMasterField, vColId, colName);
    } else {
        console.warn("⚠️ Taller de Reglas no encontrado. Abortando Modo Foco.");
        cancelMapping();
    }
}

// VISUALS: Focus Mode
function enterFocusMode(tableContainer, targetColIndex) {
    activeFocusCol = targetColIndex;

    const backdrop = document.getElementById('mapperBackdrop');
    if (backdrop) {
        backdrop.innerHTML = ''; // Remove the central message
        // FASE 2: Modo Foco Real (Oscurece la tabla para aislar la columna)
        backdrop.className = "absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity duration-300 opacity-100 pointer-events-none";
    }

    const rows = tableContainer.querySelectorAll('tr');
    rows.forEach(row => {
        const cell = row.children[targetColIndex];
        if (cell) {
            if (!cell.dataset.originalClassesFocused) {
                cell.dataset.originalClassesFocused = cell.className;
            }
            cell.classList.add('relative', 'z-[60]', 'bg-slate-800', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');
        }
    });
}

export function createComputedColumn() {
    if (!selectedMasterField) return;

    // 1. Create Ghost Column Instantly
    const newVColId = 'col_calc_' + Date.now();
    const colName = selectedMasterField.nombre_campo || 'Col. Calculada';

    if (!window.virtualColumns) window.virtualColumns = [];

    window.virtualColumns.push({
        id: newVColId,
        dataIdx: null,
        isCalculated: true // Flag to identify it's computed
    });

    console.log(`🪄 [MAPPER] Columna Fantasma Creada: ${newVColId} destino: ${colName}`);

    // Call phase 2 bypassing physical click
    // We can't apply focus to physical table, so we just open the workshop
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.open === 'function') {
        window.viewerRuleWorkshop.open(selectedMasterField, newVColId, colName);
    } else {
        console.warn("⚠️ Taller de Reglas no encontrado.");
    }

    cancelMapping();
}

export function cancelMapping() {
    isMappingMode = false;
    selectedMasterField = null;
    activeFocusCol = null;

    // Quitar visual highlight de Phase 1 en Panel Izquierdo
    document.querySelectorAll('#tab-content div').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-900/20'));

    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    tableContainer.onclick = null; // Clean delegation
    tableContainer.classList.remove('cursor-crosshair');

    const backdrop = document.getElementById('mapperBackdrop');
    if (backdrop) backdrop.remove();

    // Revert focus column
    const rows = tableContainer.querySelectorAll('tr');
    rows.forEach(row => {
        Array.from(row.children).forEach(cell => {
            cell.classList.remove('relative', 'z-50', 'bg-slate-800', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');
            if (cell.dataset.originalClassesFocused) {
                cell.className = cell.dataset.originalClassesFocused;
            }
        });
    });
}

// Export global to window
window.viewerMapper = {
    init: initMapper,
    toggleMappingState,
    activatePointerMode,
    createComputedColumn,
    cancelMapping
};
