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
    backdrop.className = "fixed top-24 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300 opacity-100 pointer-events-none flex items-start justify-center";
    backdrop.innerHTML = `
        <div class="bg-blue-900/90 border border-blue-400 text-blue-100 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl shadow-blue-500/20 animate-bounce">
            <i data-lucide="mouse-pointer-click" class="w-5 h-5"></i>
            <span class="text-sm font-bold tracking-wide">Selecciona cualquier celda o encabezado para enlazar "${masterField.nombre_campo}"</span>
            <button onclick="if(window.viewerMapper) window.viewerMapper.cancelMapping()" class="ml-2 text-blue-300 hover:text-white pointer-events-auto"><i data-lucide="x-circle" class="w-4 h-4"></i></button>
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

        // Determinar nombre de la columna buscando el th
        let colName = `Columna ${colIndex}`;
        const thead = tableContainer.querySelector('thead');
        if (thead) {
            const th = thead.querySelectorAll('th')[colIndex];
            if (th) {
                const spanNodes = th.querySelectorAll('span');
                if (spanNodes.length > 0) {
                    colName = spanNodes[0].innerText || colName;
                } else if (th.innerText.trim() !== "") {
                    colName = th.innerText.trim();
                }
            }
        }

        executeMappingPhaseTwo(colIndex, colName);
    };

    // Pulse effect on wrapper
    tableContainer.classList.add('cursor-crosshair');
}

// PHASE 2: Click on Excel Column
function executeMappingPhaseTwo(colIndex, colName) {
    if (!selectedMasterField) return;
    console.log(`🎯 [MAPPER] Phase 2: Enlazando Columna ${colIndex} a ${selectedMasterField.nombre_campo}`);

    // UI FOCUS MODE
    const tableContainer = document.getElementById('excelContainer');
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
            cell.classList.add('relative', 'z-50', 'bg-slate-800', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');
        }
    });
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
    cancelMapping
};
