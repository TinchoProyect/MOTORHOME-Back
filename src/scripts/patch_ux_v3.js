const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const jsLogic = `
    <script>
        // LAMDA UX - Vacio Shortcuts
        window.lamdaLastColId = null;
        
        window.hideLamdaContextMenu = () => {
            const el = document.getElementById('lamdaContextMenu');
            if (el) el.classList.add('hidden');
        };
        
        window.addEventListener('click', () => {
            window.hideLamdaContextMenu();
        }, true);
        
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
            
            if (window.Swal) {
                const toast = window.Swal.mixin({
                    toast: true, position: 'bottom-end',
                    showConfirmButton: false, timer: 1500,
                    background: '#0f172a', color: '#a855f7'
                });
                toast.fire({ icon: 'success', title: 'Filtro [VACIO] aplicado: ' + colId });
            }
        };
        
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('lamdaCtxFilterVacio')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.applyFilterVacio(window.lamdaLastColId);
                window.hideLamdaContextMenu();
            });
            
            window.addEventListener('keydown', (event) => {
                console.log("VIGÍA TECLADO [CAPTURA]: Tecla detectada ->", event.key, "Alt:", event.altKey);
                const e = event; // for old code
                // ALT + V or ALT + B
                if (e.altKey && (e.key === 'v' || e.key === 'V' || e.key === 'b' || e.key === 'B')) {
                    e.preventDefault();
                    if (window.lamdaLastColId) {
                        window.applyFilterVacio(window.lamdaLastColId);
                    } else if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            }, true);
        });
    </script>
`;

if (!html.includes('LAMDA UX - Vacio Shortcuts')) {
    html = html.replace('</body>', jsLogic + '\n</body>');
    fs.writeFileSync('src/views/monitor_proveedores.html', html);
    console.log('JS Logic Injected Successfully!');
} else {
    console.log('JS Logic already present.');
}
