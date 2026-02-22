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
    if (!isMappingMode) {
        console.warn('🎯 [MAPPER] Clic ignorado: Modo Mapeo inactivo.');
        return;
    }

    selectedMasterField = masterField;
    console.log(`🎯 [MAPPER] Phase 1 OK. Esperando clic en Excel para: ${masterField.nombre_campo}`);

    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

    // Reset old backdrop if exists
    let backdrop = document.getElementById('mapperBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mapperBackdrop';
        tableContainer.appendChild(backdrop);
    }
    backdrop.className = "absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity duration-300 opacity-100 flex items-start justify-center pt-20 pointer-events-none";
    backdrop.innerHTML = `
        <div class="bg-blue-900/90 border border-blue-400 text-blue-100 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl shadow-blue-500/20 animate-bounce">
            <i data-lucide="mouse-pointer-click" class="w-5 h-5"></i>
            <span class="text-sm font-bold tracking-wide">Selecciona la columna en el Excel para enlazar "${masterField.nombre_campo}"</span>
            <button onclick="if(window.viewerMapper) window.viewerMapper.cancelMapping()" class="ml-2 text-blue-300 hover:text-white pointer-events-auto"><i data-lucide="x-circle" class="w-4 h-4"></i></button>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: backdrop });

    // Make headers clickable
    const headers = tableContainer.querySelectorAll('thead th');
    headers.forEach((th, index) => {
        if (!th.dataset.originalClasses) th.dataset.originalClasses = th.className;
        th.className = "sticky top-0 bg-blue-600 text-white font-bold p-2 text-xs border border-blue-400 cursor-pointer hover:bg-blue-500 hover:shadow-lg transition-all z-50 animate-pulse";

        // Clone to remove old listeners just in case
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);

        newTh.onclick = (e) => {
            e.stopPropagation();
            if (selectedMasterField) {
                // Determine column name
                let colName = `Columna ${index}`;
                // First try to get text, excluding any spans if it's already mapped
                const spanNodes = newTh.querySelectorAll('span');
                if (spanNodes.length > 0) {
                    colName = spanNodes[0].innerText || colName;
                } else if (newTh.innerText.trim() !== "") {
                    colName = newTh.innerText.trim();
                }

                executeMappingPhaseTwo(index, colName);
            }
        };
    });
}

// PHASE 2: Click on Excel Column
function executeMappingPhaseTwo(colIndex, colName) {
    if (!selectedMasterField) return;
    console.log(`🎯 [MAPPER] Phase 2: Enlazando Columna ${colIndex} a ${selectedMasterField.nombre_campo}`);

    // UI FOCUS MODE
    const tableContainer = document.querySelector('.table-container');
    enterFocusMode(tableContainer, colIndex);

    // CALL RIGHT PANEL (Taller de Reglas)
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.open === 'function') {
        window.viewerRuleWorkshop.open(selectedMasterField, colIndex, colName);
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
        backdrop.classList.remove('pointer-events-none');
        backdrop.innerHTML = ''; // Remove the central message
    }

    const rows = tableContainer.querySelectorAll('tr');
    rows.forEach(row => {
        const cell = row.children[targetColIndex];
        if (cell) {
            if (!cell.dataset.originalClassesFocused) {
                cell.dataset.originalClassesFocused = cell.className;
            }
            cell.classList.add('relative', 'z-50', 'bg-slate-800', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');
        }
    });

    // Clean up headers pulse immediately
    cleanUpHeaders(tableContainer);
}

export function cancelMapping() {
    selectedMasterField = null;
    activeFocusCol = null;

    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

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

    cleanUpHeaders(tableContainer);
}

function cleanUpHeaders(tableContainer) {
    const headers = tableContainer.querySelectorAll('thead th');
    headers.forEach(th => {
        if (th.dataset.originalClasses) {
            th.className = th.dataset.originalClasses;
        }
        th.onclick = null;
    });
}

// Export global to window
window.viewerMapper = {
    init: initMapper,
    toggleMappingState,
    activatePointerMode,
    cancelMapping
};
