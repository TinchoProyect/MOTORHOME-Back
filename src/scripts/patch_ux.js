const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// 1. Insert onCellContextMenu and onCellFocused in gridOptions
const gridOptionsHandlers = `
                    onCellContextMenu: (event) => {
                        event.event.preventDefault();
                        if (!event.column) return;
                        window.lamdaLastColId = event.column.getColId();
                        const ctxMenu = document.getElementById('lamdaContextMenu');
                        if (ctxMenu) {
                            ctxMenu.style.left = event.event.clientX + 'px';
                            ctxMenu.style.top = event.event.clientY + 'px';
                            ctxMenu.classList.remove('hidden');
                        }
                    },
                    onCellFocused: (event) => {
                        if (event.column) {
                            window.lamdaLastColId = event.column.getColId();
                        }
                    },
                    onFilterChanged: () => {`;

html = html.replace('onFilterChanged: () => {', gridOptionsHandlers.trimStart());

// 2. Insert DOM right before </body>
const ctxDOM = `
    <!-- LAMDA CONTEXT MENU -->
    <div id="lamdaContextMenu" class="hidden fixed z-[9999] glass-panel border border-fuchsia-500/50 rounded-lg shadow-2xl py-1 min-w-[200px]">
        <button id="lamdaCtxFilterVacio" class="w-full text-left px-4 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-fuchsia-500/20 flex items-center gap-2">
            <i data-lucide="filter" class="w-4 h-4 text-fuchsia-400"></i>
            Filtrar Vacíos (Alt+V)
        </button>
    </div>
</body>`;

html = html.replace('</body>', ctxDOM.trimStart());

// 3. Insert global logic right before closing </script> in the main script block
const jsLogic = `
        // LAMDA UX - Vacio Shortcuts
        window.lamdaLastColId = null;
        
        window.hideLamdaContextMenu = () => {
            const el = document.getElementById('lamdaContextMenu');
            if (el) el.classList.add('hidden');
        };
        
        document.addEventListener('click', () => {
            window.hideLamdaContextMenu();
        });
        
        window.applyFilterVacio = (colId) => {
            if (!colId || !window.v4GridApi) return;
            let currentModel = window.v4GridApi.getFilterModel();
            
            // Build text filter model
            let colFilter = currentModel[colId] || { filterType: 'text', type: 'contains', filter: '' };
            if (!colFilter.filter) {
                colFilter.filter = '[vacio]';
            } else if (!colFilter.filter.includes('[vacio]')) {
                colFilter.filter += ' [vacio]';
            }
            
            currentModel[colId] = colFilter;
            window.v4GridApi.setFilterModel(currentModel);
            window.v4GridApi.onFilterChanged();
            
            // Visual feedback
            const toast = Swal.mixin({
                toast: true, position: 'bottom-end',
                showConfirmButton: false, timer: 1500,
                background: '#0f172a', color: '#a855f7'
            });
            toast.fire({ icon: 'success', title: 'Filtro [VACIO] aplicado: ' + colId });
        };
        
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('lamdaCtxFilterVacio')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.applyFilterVacio(window.lamdaLastColId);
                window.hideLamdaContextMenu();
            });
            
            document.addEventListener('keydown', (e) => {
                // ALT + V
                if (e.altKey && (e.key === 'v' || e.key === 'V')) {
                    e.preventDefault();
                    if (window.lamdaLastColId) {
                        window.applyFilterVacio(window.lamdaLastColId);
                    } else if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            });
        });
    </script>
`;

html = html.replace('    </script>\n</body>', jsLogic.trimStart() + '\n</body>');

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('UX patch successful');
