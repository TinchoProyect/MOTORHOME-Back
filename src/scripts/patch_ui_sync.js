const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const updatedJsLogic = `
        window.applyFilterVacio = (colId) => {
            if (!colId || !window.v4GridApi) return;
            
            // 1. Hardcore Empirical DOM Injection
            const headerCells = document.querySelectorAll('.ag-header-cell');
            let targetCell = null;
            for (let i=0; i<headerCells.length; i++) {
                if (headerCells[i].getAttribute('col-id') === colId) { targetCell = headerCells[i]; break; }
            }
            if (targetCell) {
                const filterInput = targetCell.querySelector('input.ag-input-field-input');
                if (filterInput) {
                    if (!filterInput.value) {
                        filterInput.value = '[vacio]';
                    } else if (!filterInput.value.includes('[vacio]')) {
                        filterInput.value += ' [vacio]';
                    }
                    console.log('VIGÍA UI: Inyectando texto en DOM Real para sincronizar el Floating Filter de', colId);
                    
                    // Disparar los eventos que lee AG-Grid en crudo para simular el tipeo del humano.
                    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
                    filterInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            
            // 2. Set Model for Preset Consistency (Background sync)
            let currentModel = window.v4GridApi.getFilterModel();
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
                toast.fire({ icon: 'success', title: 'Filtro [VACIO] inyectado y acoplado: ' + colId });
            }
        };`;

const regex = /window\.applyFilterVacio = \(colId\) => \{[\s\S]*?toast\.fire\(\{ icon: 'success', title: 'Filtro \[VACIO\] aplicado: ' \+ colId \}\);\s*\}\s*\};/;
if (html.match(regex)) {
    html = html.replace(regex, updatedJsLogic.trimStart());
    fs.writeFileSync('src/views/monitor_proveedores.html', html);
    console.log('UI sync updated.');
} else {
    console.log('Could not match original applyFilterVacio');
}
