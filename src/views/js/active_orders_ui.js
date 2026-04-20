// active_orders_ui.js

window.activeOrdersGridApi = null;

document.addEventListener('DOMContentLoaded', () => {
    // Inicialización al cargar DOM si es necesario.
});

window.openActiveOrders = function() {
    const modal = document.getElementById('activeOrdersModal');
    if(modal) {
        modal.classList.remove('hidden');
        if(!window.activeOrdersGridApi) {
            initActiveOrdersGrid();
        }
        window.loadActiveOrders();
    }
}

window.closeActiveOrders = function() {
    const modal = document.getElementById('activeOrdersModal');
    if(modal) {
        modal.classList.add('hidden');
    }
}

function initActiveOrdersGrid() {
    const gridOptions = {
        columnDefs: [
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
        onGridReady: params => {
            window.activeOrdersGridApi = params.api;
            if (window.lucide) window.lucide.createIcons();
            params.api.sizeColumnsToFit();
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
                window.activeOrdersGridApi.setRowData(d.pedidos);
                if (statusLabel) {
                    statusLabel.innerText = `${d.pedidos.length} Registros Auditados (Capa 3)`;
                }
                setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
            }
        } else {
            console.error("Error cargando pedidos:", d.error);
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
