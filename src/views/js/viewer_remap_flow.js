/**
 * VIEWER REMAP FLOW (V5)
 * Dynamic component for transferring ETL configuration pipelines between columns.
 * Prevents logic monolithic structure and separation of concerns.
 */

window.isRemappingFlow = false;
window.remapSourceVColId = null;

window.startColumnRemap = function(sourceVColId, sourceName) {
    if (window.offsetSelectionMode) {
        if (typeof Swal !== 'undefined') Swal.fire("Acción Bloqueada", "No puedes reasignar columnas mientras defines el Inicio.", "warning");
        return;
    }

    if (window.isMappingMode) {
        // En caso de que el mapper regular esté activo
        if (window.viewerMapper && window.viewerMapper.cancelMapping) window.viewerMapper.cancelMapping();
    }

    // Cerrar el Taller de Reglas si estuviese abierto para evitar retención de estado fantasma
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.close === 'function') {
        window.viewerRuleWorkshop.close();
    }

    window.isRemappingFlow = true;
    window.remapSourceVColId = sourceVColId;
    
    console.log(`🧭 [REMAP FLOW] Fase 1: Iniciada. Moviendo tubería desde: ${sourceVColId} (${sourceName})`);

    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    // Reset old backdrop si existiera
    let backdrop = document.getElementById('mapperBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mapperBackdrop';
        tableContainer.appendChild(backdrop);
    }
    
    // UI TOAST (Modo Flotante Informativo)
    backdrop.className = "fixed bottom-8 right-8 z-[100] transition-opacity duration-300 opacity-100 pointer-events-none flex items-end justify-end";
    backdrop.innerHTML = `
        <div class="bg-indigo-950/90 border border-indigo-500 text-indigo-100 px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl shadow-indigo-500/30 animate-pulse pointer-events-auto">
            <i data-lucide="arrow-left-right" class="w-5 h-5 text-indigo-400"></i>
            <span class="text-sm font-bold tracking-wide">Selecciona la NEUVA columna para asignarle el flujo de "${sourceName}"</span>
            <div class="w-px h-5 bg-indigo-700/50 mx-1"></div>
            <button onclick="window.cancelRemapFlow()" class="ml-2 text-indigo-300 hover:text-white transition-colors" title="Cancelar Redirección"><i data-lucide="x-circle" class="w-5 h-5"></i></button>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons({ root: backdrop });

    // Delegación de Clics
    tableContainer.onclick = function(e) {
        if (!window.isRemappingFlow) return;

        const cell = e.target.closest('td, th');
        if (!cell || !tableContainer.contains(cell)) return;

        e.stopPropagation();

        const tr = cell.closest('tr');
        if (!tr) return;

        const colIndex = Array.from(tr.children).indexOf(cell);

        // Identificar VColId de la nueva columna o instanciar su índice
        let targetVColId = `col_${colIndex}`;
        const thead = tableContainer.querySelector('thead');
        if (thead) {
            const th = thead.querySelectorAll('th')[colIndex];
            if (th && th.dataset.colId) {
                targetVColId = th.dataset.colId;
            }
        }

        window.executeRemapTransfer(targetVColId);
    };

    // Cambiar cursor estéticamente
    tableContainer.classList.add('cursor-crosshair');
};

window.executeRemapTransfer = function(targetVColId) {
    const sourceVColId = window.remapSourceVColId;
    
    if (!sourceVColId || !window.draftPipelines || !window.draftPipelines[sourceVColId]) {
        console.error("❌ [REMAP FLOW] Error crítico: No se encuentra pipeline origen.");
        window.cancelRemapFlow();
        return;
    }

    if (sourceVColId === targetVColId) {
        console.warn("⚠️ [REMAP FLOW] Mismo origen y destino ignorado.");
        window.cancelRemapFlow();
        return;
    }
    
    // Transferencia de Inteligencia (Deep Copy preventivo pero referencial a Reactividad)
    window.draftPipelines[targetVColId] = JSON.parse(JSON.stringify(window.draftPipelines[sourceVColId]));
    
    // Transferencia de Diccionario de Mapeo Primario (Vínculo Maestro Crítico)
    if (window.columnMapping && window.columnMapping[sourceVColId]) {
        window.columnMapping[targetVColId] = window.columnMapping[sourceVColId];
    }
    
    // Transferencia de Reglas Nativas Heredadas (si existen)
    if (window.processingRules && window.processingRules[sourceVColId]) {
        window.processingRules[targetVColId] = JSON.parse(JSON.stringify(window.processingRules[sourceVColId]));
    }
    
    // Si la nueva columna seleccionada tenía configuraciones previas, las aplastamos porque el usuario explícitamente reasignó un master.
    
    // Limpieza de Residuos del Origen
    delete window.draftPipelines[sourceVColId];
    if (window.columnMapping) delete window.columnMapping[sourceVColId];
    if (window.processingRules) delete window.processingRules[sourceVColId];
    
    console.log(`✅ [REMAP FLOW] Tubería ETL transferida: ${sourceVColId} ➔ ${targetVColId}`);

    window.cancelRemapFlow();

    // Invocar Renderizado Total para reflejar la transferencia visualmente
    if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
        window.renderVirtualTable(window.currentSheetData);
    }
};

window.cancelRemapFlow = function() {
    window.isRemappingFlow = false;
    window.remapSourceVColId = null;
    
    const tableContainer = document.getElementById('excelContainer');
    if (tableContainer) {
        tableContainer.classList.remove('cursor-crosshair');
        // Remover Listener (Respaldo en caso de que mapping regular lo restaure)
        tableContainer.onclick = null;
        
        let backdrop = document.getElementById('mapperBackdrop');
        if (backdrop) {
            backdrop.remove();
        }
    }
    console.log('🛑 [REMAP FLOW] Cancelado / Limpiado.');
};
