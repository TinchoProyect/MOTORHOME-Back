// active_orders_ui.js

document.addEventListener('DOMContentLoaded', () => {
    // Inicialización al cargar DOM si es necesario.
});

window.openActiveOrders = function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-start mb-6 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <i data-lucide="archive" class="w-5 h-5 text-emerald-400"></i> Pedidos Confirmados
                    </h3>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.purgeTestOrdersB2B()" class="px-3 py-2 bg-red-900/30 hover:bg-red-600 border border-red-500/30 text-red-300 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all" title="Purgar tests">
                        <i data-lucide="flame" class="w-4 h-4"></i> Purgar Seleccionados
                    </button>
                    <button onclick="window.loadActiveOrders()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar
                    </button>
                </div>
            </div>

            <!-- Content Area: Cards Wrapper -->
            <div id="activeOrdersCardsContainer" class="flex-1 w-full overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <div class="flex items-center justify-center h-full text-blue-400">
                    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i> Cargando pedidos...
                </div>
            </div>
            
            <!-- Bottom StatusBar -->
            <div class="pt-4 flex justify-between items-center shrink-0 border-t border-slate-800 mt-2">
                <span class="text-[10px] text-slate-500 font-mono" id="aoCountStatus">Inicializando...</span>
                <span class="text-[10px] text-slate-600 font-mono" id="aoSelectedStatus">0 Seleccionados</span>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.loadActiveOrders();
}

window.renderActiveOrdersCards = function(data) {
    const container = document.getElementById('activeOrdersCardsContainer');
    const statusLabel = document.getElementById('aoCountStatus');
    const selectedStatus = document.getElementById('aoSelectedStatus');
    
    if(!container) return; // If user navigated away

    if (statusLabel) statusLabel.innerText = `Mostrando ${data.length} pedidos confirmados`;
    if (selectedStatus) selectedStatus.innerText = `0 Seleccionados`;

    if (data.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-500">
                <i data-lucide="inbox" class="w-12 h-12 mb-4 opacity-50"></i>
                <p class="text-sm font-bold tracking-widest uppercase">Sin pedidos activos</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let cardsHtml = '';
    
    data.forEach(order => {
        // Date Formatter
        let fechaLlegadaHuman = 'Sin asignar';
        if (order.fecha_recepcion_estimada) {
            const d = new Date(order.fecha_recepcion_estimada);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
            let fStr = formatter.format(d);
            fechaLlegadaHuman = fStr.charAt(0).toUpperCase() + fStr.slice(1);
        }

        let fechaEmision = '--';
        if (order.created_at) {
            const d = new Date(order.created_at);
            fechaEmision = d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
        }

        const skuCount = order.pedidos_b2b_items ? order.pedidos_b2b_items.length : 0;
        const proveedorNombre = order.proveedores ? order.proveedores.nombre : 'Desconocido';
        
        let colorEstado = 'bg-slate-800 text-slate-400 border-slate-700';
        const st = order.estado || 'Emitido';
        if (st === 'Emitido') colorEstado = 'bg-blue-900/30 text-blue-400 border-blue-500/50';
        if (st === 'RECIBIDO') colorEstado = 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
        if (st === 'CANCELADO') colorEstado = 'bg-red-900/30 text-red-400 border-red-500/50';

        cardsHtml += `
            <div class="relative w-full bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg hover:border-blue-500/30 transition-colors flex items-center justify-between group overflow-hidden">
                <!-- Checkbox -->
                <div class="absolute inset-y-0 left-0 w-12 flex items-center justify-center border-r border-slate-800/50 bg-slate-950/20">
                    <input type="checkbox" value="${order.id}" class="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-600/50 bg-slate-800 b2b-order-checkbox cursor-pointer" onchange="window.updateB2BSelectionUI()">
                </div>
                
                <!-- Main Body -->
                <div class="pl-14 flex-1 flex flex-col justify-center">
                    <div class="flex items-center gap-4 mb-2">
                        <span class="text-xl font-black text-white tracking-tight">${proveedorNombre}</span>
                        <span class="px-2 py-0.5 rounded border text-[9px] uppercase font-bold tracking-widest ${colorEstado}">${st}</span>
                        <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800/50 text-slate-400 uppercase tracking-widest border border-slate-700/50">${order.tipo_documento || 'Orden'}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xs font-mono">
                        <div class="flex items-center gap-1.5 text-blue-400">
                            <i data-lucide="calendar-clock" class="w-4 h-4 opacity-80"></i>
                            <span class="font-bold">${fechaLlegadaHuman}</span>
                        </div>
                        <div class="w-px h-3 bg-slate-700"></div>
                        <div class="flex items-center gap-1.5 text-slate-400">
                            <i data-lucide="package" class="w-4 h-4 opacity-70"></i>
                            <span>${skuCount} SKUs</span>
                        </div>
                    </div>
                </div>

                <!-- Secondary Metadata (Minimized) -->
                <div class="hidden lg:flex flex-col items-end pr-8 justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    <span class="text-[9px] text-slate-500 font-mono tracking-widest uppercase">ID: ${order.id.split('-')[0]}...</span>
                    <span class="text-[9px] text-slate-500 font-mono">Emitido: ${fechaEmision}</span>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2 shrink-0">
                    <button onclick="window.viewB2BItems('${order.id}')" class="px-4 py-3 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex flex-col items-center gap-1" title="Visualizar Ítems Nativos">
                        <i data-lucide="layout-list" class="w-4 h-4"></i>
                        <span>Detalles</span>
                    </button>
                    <button onclick="window.reprintB2B('${order.id}')" class="px-4 py-3 bg-purple-600/10 text-purple-400 hover:bg-purple-600 hover:text-white border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex flex-col items-center gap-1">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                        <span>PDF</span>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;
    if (window.lucide) window.lucide.createIcons();
};

window.updateB2BSelectionUI = function() {
    const selected = document.querySelectorAll('.b2b-order-checkbox:checked').length;
    const selectedStatus = document.getElementById('aoSelectedStatus');
    if (selectedStatus) {
        selectedStatus.innerText = `${selected} Seleccionados`;
    }
};

window.returnToOrdersList = function() {
    window.openActiveOrders();
};

window.loadActiveOrders = async function() {
    const statusLabel = document.getElementById('aoCountStatus');
    if (statusLabel) statusLabel.innerText = "Cargando registros Capa 3...";
    
    try {
        const res = await fetch('http://localhost:5655/api/b2b/pedidos');
        const d = await res.json();
        
        if (d.success) {
            window.activeOrdersCache = d.pedidos || [];
            window.renderActiveOrdersCards(window.activeOrdersCache);
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

window.viewB2BItems = function(pedido_id) {
    if(!window.activeOrdersCache) return;
    const orderData = window.activeOrdersCache.find(x => x.id === pedido_id);
    if(!orderData) return;
    
    const items = orderData.pedidos_b2b_items || [];
    const proveedorNombre = orderData.proveedores ? orderData.proveedores.nombre : 'Desconocido';
    
    // Inject SPA inside reportDisplay
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    let html = `
        <div class="h-full flex flex-col animate-in slide-in-from-right-4 duration-300 p-2">
            <!-- Header SPA -->
            <div class="flex justify-between items-start mb-6 border-b border-slate-800 pb-4 shrink-0">
                <div class="flex items-center gap-4">
                    <button onclick="window.returnToOrdersList()" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors group" title="Volver al Listado">
                        <i data-lucide="arrow-left" class="w-5 h-5 group-hover:-translate-x-1 transition-transform"></i>
                    </button>
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            Manifesto de Remito
                        </h3>
                        <p class="text-[10px] uppercase tracking-widest text-blue-400 font-bold mt-1">PROVEEDOR: ${proveedorNombre}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 pt-2">
                    <span class="text-xs font-mono text-slate-500">ID: ${orderData.id}</span>
                </div>
            </div>

            <div class="flex-1 w-full bg-slate-900 border border-slate-800/50 rounded-xl overflow-hidden flex flex-col shadow-2xl relative">
    `;

    if (items.length === 0) {
        html += `
            <div class="flex flex-col items-center justify-center p-12 text-slate-500 h-full">
                <i data-lucide="package-x" class="w-12 h-12 mb-4 opacity-50"></i>
                <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Esta transacción no tiene mercadería asociada</p>
            </div>
        `;
    } else {
        html += `
            <div class="overflow-x-auto w-full custom-scrollbar flex-1 relative h-full">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead class="bg-slate-950 sticky top-0 z-10">
                        <tr>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Cód / SKU</th>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción de Mercadería</th>
                            <th class="p-4 text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-slate-800 text-right bg-emerald-900/10">Cantidad Física</th>
                            <th class="p-4 text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 text-center">Unidad Operativa</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/50">
        `;
        
        items.forEach(i => {
            html += `
                <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="p-4 text-xs font-mono text-slate-300">#${i.producto_codigo}</td>
                    <td class="p-4 text-xs font-bold text-slate-200 max-w-sm truncate" title="${i.producto_descripcion}">${i.producto_descripcion}</td>
                    <td class="p-4 text-xs font-bold text-emerald-400 text-right bg-emerald-900/5 font-mono">${parseFloat(i.cantidad).toLocaleString('es-AR')}</td>
                    <td class="p-4 text-center">
                        <span class="text-[9px] text-blue-400 border border-blue-500/20 bg-blue-500/5 rounded px-2 py-1 uppercase tracking-widest font-bold">${i.unidad_ref}</span>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    html += `
            </div>
        </div>
    `;
    
    reportDisplay.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.purgeTestOrdersB2B = async function() {
    const checkboxes = document.querySelectorAll('.b2b-order-checkbox:checked');
    if (checkboxes.length === 0) {
        if(window.Swal) {
            Swal.fire({
                icon: 'info',
                title: 'Sin Selección',
                text: 'Debes tildar (checkbox) al menos una tarjeta para ejecutar la purga.',
                background: '#0f172a', color: '#cbd5e1'
            });
        } else {
             alert('Debes tildar al menos una tarjeta.');
        }
        return;
    }

    const idsToPurge = Array.from(checkboxes).map(cb => cb.value);
    
    const result = window.Swal ? await Swal.fire({
        title: 'Purga Selectiva',
        text: `¿Confirmás la destrucción absoluta de ${idsToPurge.length} pedido(s)? Sus ítems serán eliminados en cascada de la base maestra.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Pulverizar Registros',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    }) : { isConfirmed: confirm(`¿Purgar ${idsToPurge.length} elementos?`) };
    
    if (result.isConfirmed) {
        if(window.Swal) Swal.fire({ title: 'Aniquilando...', background: '#0f172a', color: '#f8fafc', didOpen: () => Swal.showLoading() });
        
        try {
            const response = await fetch('http://localhost:5655/api/b2b/pedidos/purga', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToPurge })
            });
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Fallo desconocido en la API');
            }
            
            if(window.Swal) {
                Swal.fire({
                    icon: 'success', title: 'Purga Ejecutada', text: data.message || 'Registros erradicados exitosamente.',
                    background: '#0f172a', color: '#10b981'
                });
            }
            window.loadActiveOrders();
            
        } catch(e) {
            console.error("Fallo purgando pruebas:", e);
            if(window.Swal) {
                Swal.fire({
                    icon: 'error', title: 'Bloqueo Backend', text: 'La API local rechazó el comando de purga. Asegúrese de que el servidor está corriendo.',
                    background: '#0f172a', color: '#ef4444'
                });
            } else { alert("Fallo purga: " + e.message); }
        }
    }
};
