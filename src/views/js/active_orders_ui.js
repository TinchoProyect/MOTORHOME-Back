// active_orders_ui.js

window.activeOrdersGridApi = null;

document.addEventListener('DOMContentLoaded', () => {
    // Inicialización al cargar DOM si es necesario.
});

window.openActiveOrders = function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    if (window.activeOrdersGridApi && typeof window.activeOrdersGridApi.destroy === 'function') {
        window.activeOrdersGridApi.destroy();
        window.activeOrdersGridApi = null;
    }

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-start mb-4 border-b border-slate-800 pb-4">
                <div>
                    <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <i data-lucide="archive" class="w-5 h-5 text-emerald-400"></i> Histórico de Pedidos Emitidos
                    </h3>
                    <p class="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mt-1">SISTEMA REPOSITORIO DOCUMENTAL (CAPA 3)</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.purgeTestOrdersB2B()" class="px-3 py-2 bg-red-900/30 hover:bg-red-600 border border-red-500/30 text-red-300 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all" title="Purgar tests">
                        <i data-lucide="flame" class="w-4 h-4"></i> Purgar Datos
                    </button>
                    <button onclick="window.loadActiveOrders()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar
                    </button>
                </div>
            </div>

            <!-- Content Area: AG-Grid Viewer -->
            <div class="flex-1 w-full glass-panel border border-slate-800/50 rounded-xl overflow-hidden relative shadow-2xl bg-slate-900">
                <div id="activeOrdersGrid" class="ag-theme-alpine-dark w-full h-full"></div>
            </div>
            
            <!-- Bottom StatusBar -->
            <div class="pt-2 flex justify-between items-center shrink-0">
                <span class="text-[10px] text-slate-500 font-mono" id="aoCountStatus">0 Registros Listados</span>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    initActiveOrdersGrid();
    window.loadActiveOrders();
}

function initActiveOrdersGrid() {
    const gridOptions = {
        columnDefs: [
            { 
                headerCheckboxSelection: true,
                checkboxSelection: true,
                showDisabledCheckboxes: true,
                width: 50,
                pinned: 'left'
            },
            {
                field: 'fecha_recepcion_estimada',
                headerName: 'Llegada Estimada',
                width: 220,
                editable: true,
                cellEditor: 'agDateCellEditor',
                valueFormatter: params => {
                    if(!params.value) return 'Sin asignar';
                    const d = new Date(params.value);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                    const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
                    const str = formatter.format(d);
                    // Capitalize first letter
                    return str.charAt(0).toUpperCase() + str.slice(1);
                },
                cellStyle: { backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.3)' }
            },
            {
                field: 'estado',
                headerName: 'Estado',
                width: 140,
                editable: true,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: {
                    values: ['Emitido', 'RECIBIDO', 'CANCELADO']
                },
                cellRenderer: params => {
                    let c = 'bg-slate-800 text-slate-400';
                    const val = params.value || 'Emitido'; // Fallback
                    if (val === 'Emitido') c = 'bg-blue-900/30 text-blue-400 border-blue-500/50';
                    if (val === 'RECIBIDO') c = 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
                    if (val === 'CANCELADO') c = 'bg-red-900/30 text-red-400 border-red-500/50';
                    return `<span class="px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-widest ${c}">${val}</span>`;
                }
            },
            {
                field: 'tipo_documento',
                headerName: 'Tipo',
                width: 170,
                cellRenderer: params => {
                    const tipo = params.value === 'Orden de Pedido' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : 'bg-blue-900/30 text-blue-400 border-blue-500/50';
                    return `<span class="px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-widest ${tipo}">${params.value}</span>`;
                }
            },
            {
                field: 'proveedores.nombre',
                headerName: 'Entidad Receptora',
                flex: 1,
                cellRenderer: params => `<span class="font-bold text-slate-300 text-xs">${params.value || 'Desconocido'}</span>`
            },
            {
                field: 'id', 
                headerName: 'ID Transacción', 
                width: 320,
                cellRenderer: params => `<span class="font-mono text-[10px] text-slate-500">${params.value}</span>`
            },
            {
                field: 'created_at',
                headerName: 'Fecha Emisión',
                width: 160,
                valueFormatter: params => {
                    if(!params.value) return '--';
                    const d = new Date(params.value);
                    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
                }
            },
            {
                headerName: 'Volumetría',
                width: 130,
                cellRenderer: params => {
                    const items = params.data.pedidos_b2b_items || [];
                    return `<span class="text-[11px] text-slate-400 font-mono">${items.length} SKUs</span>`;
                }
            },
            {
                headerName: 'Acciones',
                width: 150,
                pinned: 'right',
                cellRenderer: params => {
                    const id = params.data.id;
                    return `
                        <div class="flex items-center gap-2 justify-center h-full">
                            <button onclick="window.viewB2BItems('${id}')" class="px-3 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30 rounded text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1" title="Visualizar Ítems">
                                <i data-lucide="binoculars" class="w-3.5 h-3.5"></i> Skus
                            </button>
                            <button onclick="window.reprintB2B('${id}')" class="px-3 py-1 bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 border border-purple-500/30 rounded text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                                <i data-lucide="printer" class="w-3.5 h-3.5"></i> PDF
                            </button>
                        </div>
                    `;
                }
            }
        ],
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true
        },
        rowData: [],
        rowHeight: 45,
        headerHeight: 40,
        animateRows: true,
        rowSelection: 'multiple',
        suppressRowClickSelection: true,
        onGridReady: params => {
            window.activeOrdersGridApi = params.api;
            if (window.lucide) window.lucide.createIcons();
            params.api.sizeColumnsToFit();
        },
        onModelUpdated: params => {
            const statusLabel = document.getElementById('b2bActiveOrdersStatus');
            if (statusLabel) {
                const total = params.api.getDisplayedRowCount();
                const selected = params.api.getSelectedRows().length;
                let txt = `Mostrando ${total} pedidos auditados`;
                if (selected > 0) txt += ` (${selected} Seleccionados)`;
                statusLabel.innerText = txt;
            }
        },
        onSelectionChanged: params => {
            const statusLabel = document.getElementById('b2bActiveOrdersStatus');
            if (statusLabel) {
                const total = params.api.getDisplayedRowCount();
                const selected = params.api.getSelectedRows().length;
                let txt = `Mostrando ${total} pedidos auditados`;
                if (selected > 0) txt += ` (${selected} Seleccionados)`;
                statusLabel.innerText = txt;
            }
        },
        onCellValueChanged: async (params) => {
            if (params.colDef.field === 'estado' || params.colDef.field === 'fecha_recepcion_estimada') {
                const id = params.data.id;
                const field = params.colDef.field;
                const newVal = params.newValue;
                
                try {
                    const obj = {};
                    obj[field] = newVal;
                    const { error } = await window.supabaseClient.from('pedidos_b2b_cabecera').update(obj).eq('id', id);
                    if (error) {
                        console.error("Error updating B2B Order field", error);
                        // Revert manually if needed, for now just log
                    } else {
                        console.log(`B2B Tracking updated: ${field} = ${newVal}`);
                    }
                } catch(e) {
                    console.error(e);
                }
            }
        }
    };

    const eGridDiv = document.querySelector('#activeOrdersGrid');
    window.activeOrdersGridApi = agGrid.createGrid(eGridDiv, gridOptions);
}

window.loadActiveOrders = async function() {
    const statusLabel = document.getElementById('aoCountStatus');
    if (statusLabel) statusLabel.innerText = "Cargando registros...";
    
    try {
        const res = await fetch('http://localhost:5655/api/b2b/pedidos');
        const d = await res.json();
        
        if (d.success) {
            window.activeOrdersCache = d.pedidos || [];
            if(window.activeOrdersGridApi) {
                if (typeof window.activeOrdersGridApi.setGridOption === 'function') {
                    window.activeOrdersGridApi.setGridOption('rowData', d.pedidos);
                } else if (typeof window.activeOrdersGridApi.setRowData === 'function') {
                    window.activeOrdersGridApi.setRowData(d.pedidos);
                }
                setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
            }
        } else {
            console.error("Error cargando pedidos:", d.error);
            const statusLabel = document.getElementById('b2bActiveOrdersStatus');
            if (statusLabel) statusLabel.innerText = "Error de Conexión Capa 3.";
        }
    } catch(e) {
        console.error("Fetch Exception:", e);
        if (statusLabel) statusLabel.innerText = "Fallo General de Red.";
    }
}

window.reprintB2B = function(pedido_id) {
    if(!window.activeOrdersCache) return;
    const orderData = window.activeOrdersCache.find(x => x.id === pedido_id);
    if(!orderData) {
        alert("Registro no pre-cargado en memoria.");
        return;
    }
    
    // Adaptar la estructura al formato que lee pdfMake (window.generateB2BPdf orginalmente lee del backend UI, le inyectamos array simulado)
    const items = orderData.pedidos_b2b_items || [];
    
    let simulatedCart = [];
    items.forEach(i => {
        simulatedCart.push({
            _system_id: i.id,
            proveedor_id: orderData.proveedor_id,
            proveedor_nombre: orderData.proveedores ? orderData.proveedores.nombre : 'Desconocido',
            codigo_producto: i.producto_codigo,
            producto_descripcion: i.producto_descripcion,
            precio_unitario: i.valor_unitario_ref,
            cantidad: i.cantidad,
            unidad_medida: i.unidad_ref,
            cant_bult: 1, // Fallback visual
            cant_valor: 1 // Fallback visual
        });
    });
    
    if(window.generateB2BPdf) {
        window.generateB2BPdf(
            orderData.proveedor_id,
            orderData.proveedores ? orderData.proveedores.nombre : 'Desconocido',
            orderData.tipo_documento,
            simulatedCart
        ).then(() => {
            console.log(`[Re-Impresión] PDF Documento reconstruido para ID ${pedido_id}`);
        }).catch(err => {
            console.error("Error de renderizado PDF Forense", err);
        });
    } else {
        alert("El motor PDF no está online, asegure que pedidos_b2b_ui se cargue antes.");
    }
}

window.viewB2BItems = function(pedido_id) {
    if(!window.activeOrdersCache) return;
    const orderData = window.activeOrdersCache.find(x => x.id === pedido_id);
    if(!orderData) return;
    
    const items = orderData.pedidos_b2b_items || [];
    if(items.length === 0) {
        Swal.fire({
            icon: 'info', title: 'Sin Ítems', text: 'Esta transacción no tiene mercadería asociada.', background: '#0f172a', color: '#cbd5e1'
        });
        return;
    }
    
    let tableHtml = `
        <div class="overflow-x-auto w-full custom-scrollbar max-h-96">
            <table class="w-full text-left border-collapse whitespace-nowrap">
                <thead class="bg-slate-900 sticky top-0 z-10">
                    <tr>
                        <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700">Cód / SKU</th>
                        <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700">Descripción</th>
                        <th class="p-3 text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-slate-700 text-center bg-emerald-900/10">Catidad</th>
                        <th class="p-3 text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-slate-700 text-center">Unidad</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    items.forEach(i => {
        tableHtml += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-800/50">
                <td class="p-3 text-xs font-mono text-slate-300">${i.producto_codigo}</td>
                <td class="p-3 text-[11px] text-slate-400 max-w-[200px] truncate" title="${i.producto_descripcion}">${i.producto_descripcion}</td>
                <td class="p-3 text-[11px] font-bold text-emerald-400 text-center bg-emerald-900/5">${parseFloat(i.cantidad).toLocaleString('es-AR')}</td>
                <td class="p-3 text-[11px] text-blue-400 text-center uppercase tracking-wider">${i.unidad_ref}</td>
            </tr>
        `;
    });
    
    tableHtml += `</tbody></table></div>`;
    
    Swal.fire({
        title: 'Manifiesto de Remito',
        html: tableHtml,
        width: '800px',
        background: '#0f172a',
        color: '#f8fafc',
        showConfirmButton: true,
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Cerrar Visor'
    });
}

window.purgeTestOrdersB2B = async function() {
    if (!window.Swal || !window.activeOrdersGridApi) return;
    
    const selectedRows = window.activeOrdersGridApi.getSelectedRows();
    if (selectedRows.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin Selección',
            text: 'Debes tildar (checkbox) al menos una fila para ejecutar la purga.',
            background: '#0f172a', color: '#cbd5e1'
        });
        return;
    }

    const idsToPurge = selectedRows.map(r => r.id);
    
    const result = await Swal.fire({
        title: 'Purga Selectiva (Capa 3)',
        text: `¿Confirmás la destrucción absoluta de ${selectedRows.length} pedido(s)? Sus ítems serán eliminados en cascada de la base maestra.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Pulverizar Registros',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    });
    
    if (result.isConfirmed) {
        Swal.fire({
            title: 'Aniquilando...',
            background: '#0f172a',
            color: '#f8fafc',
            didOpen: () => Swal.showLoading()
        });
        
        try {
            // Delega la purga al Backend Node.js para atravesar las políticas RLS
            const response = await fetch('http://localhost:5655/api/b2b/pedidos/purga', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToPurge })
            });
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Fallo desconocido en la API');
            }
            
            Swal.fire({
                icon: 'success',
                title: 'Purga Ejecutada',
                text: data.message || 'Registros erradicados exitosamente.',
                background: '#0f172a',
                color: '#10b981'
            });
            window.loadActiveOrders();
            
        } catch(e) {
            console.error("Fallo purgando pruebas:", e);
            Swal.fire({
                icon: 'error',
                title: 'Bloqueo Backend',
                text: 'La API local rechazó el comando de purga. Asegúrese de que el servidor está corriendo.',
                background: '#0f172a',
                color: '#ef4444'
            });
        }
    }
};
