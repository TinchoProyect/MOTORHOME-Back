const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const replacement = `
    <script>
        // LAMDA UX - Vacio Shortcuts (V4 - Focus Header Fix)
        window.lamdaLastColId = null;
        
        window.hideLamdaContextMenu = () => {
            const el = document.getElementById('lamdaContextMenu');
            if (el) el.classList.add('hidden');
        };
        
        window.addEventListener('click', () => window.hideLamdaContextMenu(), true);
        
        window.applyFilterVacio = (colId) => {
            if (!colId || !window.v4GridApi) return;
            
            const headerCells = document.querySelectorAll('.ag-header-cell');
            let targetCell = null;
            for (let i=0; i<headerCells.length; i++) {
                if (headerCells[i].getAttribute('col-id') === colId) { targetCell = headerCells[i]; break; }
            }
            if (targetCell) {
                const filterInput = targetCell.querySelector('input.ag-input-field-input');
                if (filterInput) {
                    if (!filterInput.value) filterInput.value = '[vacio]';
                    else if (!filterInput.value.includes('[vacio]')) filterInput.value += ' [vacio]';
                    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
                    filterInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            
            let currentModel = window.v4GridApi.getFilterModel();
            let colFilter = currentModel[colId] || { filterType: 'text', type: 'contains', filter: '' };
            if (!colFilter.filter) colFilter.filter = '[vacio]';
            else if (!colFilter.filter.includes('[vacio]')) colFilter.filter += ' [vacio]';
            
            currentModel[colId] = colFilter;
            window.v4GridApi.setFilterModel(currentModel);
            window.v4GridApi.onFilterChanged();
            
            if (window.Swal) {
                const toast = window.Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500, background: '#0f172a', color: '#a855f7' });
                toast.fire({ icon: 'success', title: 'Filtro [VACIO] acoplado: ' + colId });
            }
        };
        
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('lamdaCtxFilterVacio')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.applyFilterVacio(window.lamdaLastColId);
                window.hideLamdaContextMenu();
            });
            
            // Evento Mouse Global (Atrapa Header y Celdas por igual)
            document.addEventListener('contextmenu', (e) => {
                const headerCell = e.target.closest('.ag-header-cell');
                const dataCell = e.target.closest('.ag-cell');
                
                if (headerCell || dataCell) {
                    e.preventDefault();
                    let targetColId = null;
                    if (headerCell) targetColId = headerCell.getAttribute('col-id');
                    if (dataCell) targetColId = dataCell.getAttribute('col-id');
                    
                    if (targetColId) {
                        window.lamdaLastColId = targetColId;
                        const ctxMenu = document.getElementById('lamdaContextMenu');
                        if (ctxMenu) {
                            ctxMenu.style.left = e.clientX + 'px';
                            ctxMenu.style.top = e.clientY + 'px';
                            ctxMenu.classList.remove('hidden');
                        }
                    }
                }
            }, true);
            
            // Evento Teclado Global Fuerte
            window.addEventListener('keydown', (event) => {
                if (event.altKey && (event.key === 'v' || event.key === 'V' || event.key === 'b' || event.key === 'B')) {
                    event.preventDefault();
                    
                    // 1. Prioridad Máxima: Si el usuario está escribiendo exactamente en un input de filtro
                    const activeEl = document.activeElement;
                    if (activeEl && activeEl.tagName === 'INPUT') {
                        const headerCell = activeEl.closest('.ag-header-cell');
                        if (headerCell) {
                            const colId = headerCell.getAttribute('col-id');
                            return window.applyFilterVacio(colId);
                        }
                    }
                    
                    // 2. Prioridad Secundaria: Última celda tocada/focuseada
                    if (window.lamdaLastColId) {
                        return window.applyFilterVacio(window.lamdaLastColId);
                    } 
                    
                    // 3. Fallback: Primera Columna Visible
                    if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            }, true);
        });
    </script>
`;

const startIdx = html.indexOf('<script>\n        // LAMDA UX - Vacio Shortcuts');
if (startIdx !== -1) {
    const endIdx = html.indexOf('</script>', startIdx) + 9;
    html = html.substring(0, startIdx) + replacement.trim() + html.substring(endIdx);
    fs.writeFileSync('src/views/monitor_proveedores.html', html);
    console.log('Patch V4 (Header Awareness) inyectado exitosamente.');
} else {
    console.log('Error: V1 script signature not found!');
}
