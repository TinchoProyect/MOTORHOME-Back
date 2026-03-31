/**
 * VIEWER VISIBILITY MANAGER (V6)
 * Módulo Satélite para Arquitectura de Limpieza Visual del Layout.
 * Maneja el ocultamiento y muestra de columnas basándose en su ID Virtual (vColId).
 */

console.log("%c 👁️ VIEWER VISIBILITY: READY ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px;");

// Estado Local Activo
window.hiddenColumns = {};

const VisibilityManager = {
    /**
     * Oculta una columna visual
     */
    hideColumn(vColId) {
        if (!window.hiddenColumns) window.hiddenColumns = {};
        window.hiddenColumns[vColId] = true;
        
        console.log(`👁️ [VISIBILIDAD] Ocultando columna: ${vColId}`);
        
        this._triggerReRender();
        this._autoSave();
    },

    /**
     * Restaura una sola columna. Si recibe 'all', las restaura a todas.
     */
    showColumn(vColId) {
        if (!window.hiddenColumns) return;
        
        if (vColId === 'all') {
            window.hiddenColumns = {};
            console.log(`👁️ [VISIBILIDAD] Mostrando todas las columnas.`);
        } else {
            delete window.hiddenColumns[vColId];
            console.log(`👁️ [VISIBILIDAD] Revelando columna: ${vColId}`);
        }
        
        this._triggerReRender();
        this._autoSave();
    },

    /**
     * Dibuja los botones/pastillas arriba de la tabla para las variables ocultas.
     */
    renderHiddenPills(containerNode) {
        // En primer lugar asegurar un contenedor base
        let parent = containerNode;
        if (!parent) {
            let pillsCont = document.getElementById('visibilityPillsContainer');
            if (!pillsCont) {
                const excel = document.getElementById('excelContainer');
                if (excel && excel.parentNode) {
                    pillsCont = document.createElement('div');
                    pillsCont.id = 'visibilityPillsContainer';
                    pillsCont.className = 'flex flex-wrap gap-2 mb-2 w-full min-h-[5px]';
                    excel.parentNode.insertBefore(pillsCont, excel);
                }
            }
            parent = pillsCont;
        }

        if (!parent) return;

        parent.innerHTML = '';
        const hiddenKeys = Object.keys(window.hiddenColumns || {});
        
        // Ocultar individual (Solo si hay ocultas)
        if (hiddenKeys.length > 0) {
            const btnAll = document.createElement('button');
            btnAll.className = "text-[10px] bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded shadow-sm flex items-center transition-colors";
            btnAll.title = "Restaurar todo el espacio de trabajo";
            btnAll.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 mr-1.5 inline"></i> Mostrar Ocultas (${hiddenKeys.length})`;
            btnAll.onclick = () => this.showColumn('all');
            parent.appendChild(btnAll);
        }

        // [FIX] Función global: Ocultar todas las no mapeadas (Siempre visible)
        const btnHideUnmapped = document.createElement('button');
        btnHideUnmapped.className = "text-[10px] bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:text-red-300 text-slate-400 px-2 py-1.5 rounded shadow-sm flex items-center transition-colors ml-auto";
        btnHideUnmapped.title = "Esconder las columnas que no estás usando";
        btnHideUnmapped.innerHTML = `<i data-lucide="eye-off" class="w-3.5 h-3.5 mr-1.5 inline"></i> Ocultar Basura (No Mapeadas)`;
        btnHideUnmapped.onclick = () => this.hideAllUnmapped();
        parent.appendChild(btnHideUnmapped);

        if (window.lucide) window.lucide.createIcons({ root: parent });
    },

    /**
     * Oculta todas las variables físicas que no tengan Field Maestro asignado.
     */
    hideAllUnmapped() {
        if (!window.virtualColumns) return;
        if (!window.hiddenColumns) window.hiddenColumns = {};
        
        // Iteramos las físicas
        window.virtualColumns.forEach(vCol => {
            if (vCol.isCalculated) return;
            const j = vCol.id;
            
            // Check mapping
            const isMappedV4 = (window.draftPipelines && window.draftPipelines[j]);
            const isMappedV3 = (window.columnMapping && window.columnMapping[j] && window.columnMapping[j] !== 'Ignorar Columna');
            
            if (!isMappedV4 && !isMappedV3) {
                window.hiddenColumns[j] = true;
            }
        });
        
        console.log(`👁️ [VISIBILIDAD] Limpieza de Variables No Mapeadas completada.`);
        this._triggerReRender();
        this._autoSave();
    },

    /**
     * Conectada al Hook de Render
     */
    isHidden(vColId) {
        return window.hiddenColumns && window.hiddenColumns[vColId] === true;
    },

    /**
     * Load settings V3
     */
    hydrateSettings(savedHiddenColumnsMap) {
        if (savedHiddenColumnsMap && typeof savedHiddenColumnsMap === 'object') {
            window.hiddenColumns = { ...savedHiddenColumnsMap };
            console.log("✅ [V6] Columnas Ocultas recuperadas desde JSON V3.");
        } else {
            window.hiddenColumns = {};
        }
    },
    
    /**
     * Recovery V3 (Save)
     */
    serializeSettings() {
        return window.hiddenColumns || {};
    },

    _triggerReRender() {
        if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
            window.renderVirtualTable(window.currentSheetData);
        }
    },
    
    _autoSave() {
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }
    }
};

window.ViewerVisibilityManager = VisibilityManager;
