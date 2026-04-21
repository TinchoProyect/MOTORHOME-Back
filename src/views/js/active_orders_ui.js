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

    let groups = {};
    data.forEach(order => {
        let fetchStr = order.fecha_recepcion_estimada || 'SinFecha';
        let provId = order.proveedor_id || 'SinProv';
        let gKey = `${provId}_${fetchStr}`;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(order);
    });

    let cardsHtml = '';
    
    Object.values(groups).forEach(groupArr => {
        let primaryOrder = groupArr[0];
        let fechaLlegadaHuman = 'Sin asignar';
        if (primaryOrder.fecha_recepcion_estimada) {
            const d = new Date(primaryOrder.fecha_recepcion_estimada);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
            let fStr = formatter.format(d);
            fechaLlegadaHuman = fStr.charAt(0).toUpperCase() + fStr.slice(1);
        }
        
        const proveedorNombre = primaryOrder.proveedores ? primaryOrder.proveedores.nombre : 'Desconocido';
        const totalSKUs = groupArr.reduce((acc, current) => acc + (current.pedidos_b2b_items ? current.pedidos_b2b_items.length : 0), 0);
        
        cardsHtml += `
            <div class="mb-5 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-slate-700 transition-colors">
                <!-- Group Header -->
                <div class="bg-slate-950/40 p-4 border-b border-slate-800/80 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <i data-lucide="truck" class="w-5 h-5 text-indigo-400"></i>
                        <span class="text-xl font-black text-white tracking-tight">${proveedorNombre}</span>
                        <span class="px-2 py-0.5 rounded border text-[9px] uppercase font-bold tracking-widest bg-indigo-900/30 text-indigo-400 border-indigo-500/50">Entrega Confirmada</span>
                    </div>
                    <div class="flex items-center gap-4 text-xs font-mono">
                        <div class="flex items-center gap-1.5 text-blue-400">
                            <i data-lucide="calendar-clock" class="w-4 h-4 opacity-80"></i>
                            <span class="font-bold">${fechaLlegadaHuman}</span>
                        </div>
                        <div class="w-px h-3 bg-slate-700"></div>
                        <div class="flex items-center gap-1.5 text-slate-400">
                            <i data-lucide="package" class="w-4 h-4 opacity-70"></i>
                            <span>${groupArr.length} Órdenes (${totalSKUs} SKUs)</span>
                        </div>
                    </div>
                </div>
                <!-- Sub-items -->
                <div class="p-2 space-y-2">
        `;
        
        groupArr.forEach(order => {
            let fechaEmision = '--';
            if (order.created_at) {
                const d = new Date(order.created_at);
                fechaEmision = d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
            }
            const skuCount = order.pedidos_b2b_items ? order.pedidos_b2b_items.length : 0;
            
            let colorEstado = 'bg-slate-800 text-slate-400 border-slate-700';
            const st = order.estado || 'Emitido';
            if (st === 'Emitido') colorEstado = 'bg-blue-900/30 text-blue-400 border-blue-500/50';
            if (st === 'RECIBIDO') colorEstado = 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
            if (st === 'CANCELADO') colorEstado = 'bg-red-900/30 text-red-400 border-red-500/50';

            cardsHtml += `
                <div class="relative w-full bg-slate-800/20 border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/40 transition-colors flex items-center justify-between group overflow-hidden pl-14 shadow-sm">
                    <!-- Checkbox -->
                    <div class="absolute inset-y-0 left-0 w-10 flex items-center justify-center border-r border-slate-700/50 bg-slate-900/20">
                        <input type="checkbox" value="${order.id}" class="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-600/50 bg-slate-700 b2b-order-checkbox cursor-pointer" onchange="window.updateB2BSelectionUI()">
                    </div>
                    
                    <div class="flex-1 flex flex-col justify-center">
                        <div class="flex items-center gap-3">
                            <span class="text-xs font-black text-slate-300 uppercase tracking-widest font-mono">ID: ${order.id.split('-')[0]}</span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${colorEstado}">${st}</span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800/50 text-slate-400 uppercase tracking-widest border border-slate-700/50">${order.tipo_documento || 'Orden'}</span>
                        </div>
                    </div>
                    
                    <div class="hidden lg:flex flex-col items-end pr-8 justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        <span class="text-[9px] text-slate-500 font-mono">Emitido: ${fechaEmision}</span>
                        <span class="text-[9px] text-slate-500 uppercase font-mono tracking-widest">${skuCount} SKUs</span>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="window.viewB2BItems('${order.id}')" class="px-3 py-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1" title="Ver Manifiesto">
                            <i data-lucide="layout-list" class="w-4 h-4"></i> Detalles
                        </button>
                        <button onclick="window.reprintB2B('${order.id}')" class="px-3 py-2 bg-purple-600/10 text-purple-400 hover:bg-purple-600 hover:text-white border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                            <i data-lucide="printer" class="w-4 h-4"></i> PDF
                        </button>
                        <button onclick="window.sendB2BWhatsAppActive('${order.id}')" class="px-3 py-2 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            WA
                        </button>
                    </div>
                </div>
            `;
        });
        
        cardsHtml += `
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
    
    // Auto-Cargar Catálogo Maestro si no está en la RAM para habilitar volumetrías (Resolución Heurística QA)
    if (!window._rawLamdaData) {
        try {
            const urlOp = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL + '/api/master-table/operativa' : 'http://localhost:5655/api/master-table/operativa';
            fetch(urlOp).then(r => r.json()).then(opJson => {
                window._rawLamdaData = opJson.data;
            }).catch(e => console.warn("Vigia: No se pudo inyectar el Master Catalog en background.", e));
        } catch(e) {}
    }

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
            cant_bult: i.cant_bult,
            cant_valor: i.cant_valor
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

window.sendB2BWhatsAppActive = function(pedido_id) {
    if(!window.activeOrdersCache) return;
    const orderData = window.activeOrdersCache.find(x => x.id === pedido_id);
    if(!orderData) {
        alert("Registro no pre-cargado en memoria.");
        return;
    }

    const items = orderData.pedidos_b2b_items || [];
    if(items.length === 0) {
        alert("Este pedido no contiene ítems para enviar.");
        return;
    }

    // Identificar variables
    const provName = orderData.proveedores ? orderData.proveedores.nombre : 'Desconocido';
    const docType = orderData.tipo_documento || 'Orden de Pedido';
    const shortOrderId = pedido_id.split('-')[0].toUpperCase();
    const safeOrderId = `#ORD-${shortOrderId}`;
    
    let docDate = new Date();
    if(orderData.created_at) {
        const dStr = typeof orderData.created_at === 'string' ? orderData.created_at : orderData.created_at;
        docDate = new Date(dStr);
    }
    const dateStr = docDate.toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});

    const lamdaPhone = (typeof CONFIG !== 'undefined' && CONFIG.LAMDA_PHONE) ? CONFIG.LAMDA_PHONE : '221 661 5746';

    let msg = `LAMDA - Dpto. de Compras - ${docType} ${safeOrderId} - ${dateStr} - Proveedor: ${provName}\n\nPedido:\n\n`;

    let sumKg = 0;

    items.forEach(i => {
        let rawUnit = (i.unidad_ref || '').toUpperCase();
        let unitLabel = rawUnit;
        if (rawUnit.includes('KILO') || rawUnit.includes('KG')) unitLabel = 'K';
        else if (rawUnit.includes('GRAMO') || rawUnit.includes('GR')) unitLabel = 'G';
        else if (rawUnit.includes('LITRO') || rawUnit.includes('LT')) unitLabel = 'L';
        else if (rawUnit.includes('UNID')) unitLabel = 'U';

        // Búsqueda Dinámica al Maestro ya que no existe fallback en este Schema Activo
        let rawBult = 1; let rawVal = 1;
        const parseVol = (v) => { if(!v) return null; const n = parseFloat(String(v).replace(',', '.').trim()); return isNaN(n)? null : n; };
        if (window._rawLamdaData) {
            const masterItem = window._rawLamdaData.find(r => {
                const p = r.datos_maestros || {};
                return (p.codigo === i.producto_codigo || p.sku === i.producto_codigo || r.codigo === i.producto_codigo || r.sku === i.producto_codigo);
            });
            if (masterItem) {
                const mp = masterItem.datos_maestros || {};
                rawBult = parseVol(mp.cant_bult) || parseVol(masterItem.cant_bult) || 1;
                rawVal = parseVol(mp.cant_valor) || parseVol(masterItem.cant_valor) || 1;
            }
        }
        
        const bult = (i.cant_bult && !isNaN(i.cant_bult)) ? parseFloat(i.cant_bult) : rawBult;
        const val = (i.cant_valor && !isNaN(i.cant_valor)) ? parseFloat(i.cant_valor) : rawVal;
        const kgMult = bult * val;
        
        let isKg = unitLabel === 'K' || unitLabel === 'L' || unitLabel === 'G' || rawUnit.includes('KG');
        
        const qty = parseInt(i.cantidad) || 1;
        const totalKg = qty * kgMult;
        
        if (isKg) sumKg += totalKg;
        
        let kgData = isKg ? ` - (${totalKg.toFixed(2)} Kg)` : '';
        
        msg += `\u2705 *Cod. ${i.producto_codigo}   Cant. ${qty}*\n`;
        msg += `${i.producto_descripcion} ${bult} x ${val}${kgData}\n\n`;
    });

    msg += `-----------------------------------\n`;
    msg += `Total Ítems: ${items.length}\n`;
    msg += `Total Kilos: ${sumKg.toFixed(2)} Kg\n`;
    msg += `-----------------------------------\n\n`;
    msg += `Pedido confirmado por: lamdaproveedorservicios@gmail.com`;
    msg += `\nCel. LAMDA: ${lamdaPhone}`;
    msg += `\nLAMDA Sistemas`;

    const uri = `https://wa.me/?text=` + encodeURIComponent(msg);
    window.open(uri, '_blank');
};

window.viewB2BItems = function(pedido_id) {
    if(!window.activeOrdersCache) return;
    const orderData = window.activeOrdersCache.find(x => x.id === pedido_id);
    if(!orderData) return;
    
    const items = orderData.pedidos_b2b_items || [];
    const proveedorNombre = orderData.proveedores ? orderData.proveedores.nombre : 'Desconocido';
    
    // Inject SPA inside reportDisplay
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    let sumTotalVol = 0;
    const parseVolForSum = (v) => { if(!v) return null; const n = parseFloat(String(v).replace(',', '.').trim()); return isNaN(n)? null : n; };
    
    items.forEach(i => {
        let rawBult = 1; let rawVal = 1;
        if (window._rawLamdaData) {
            const masterItem = window._rawLamdaData.find(r => {
                const p = r.datos_maestros || {};
                return (p.codigo === i.producto_codigo || p.sku === i.producto_codigo || r.codigo === i.producto_codigo || r.sku === i.producto_codigo);
            });
            if (masterItem) {
                const mp = masterItem.datos_maestros || {};
                rawBult = parseVolForSum(mp.cant_bult) || parseVolForSum(masterItem.cant_bult) || 1;
                rawVal = parseVolForSum(mp.cant_valor) || parseVolForSum(masterItem.cant_valor) || 1;
            }
        }
        const bulto = parseFloat(i.cant_bult) || rawBult;
        const valor = parseFloat(i.cant_valor) || rawVal;
        const pedida = parseFloat(i.cantidad) || 0;
        sumTotalVol += (pedida * bulto * valor);
    });

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
                            Detalle del Pedido
                        </h3>
                        <div class="flex items-center gap-3 mt-1">
                            <p class="text-[10px] uppercase tracking-widest text-blue-400 font-bold">PROVEEDOR: ${proveedorNombre}</p>
                            <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black text-emerald-400 font-mono tracking-widest flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                <i data-lucide="scale" class="w-3 h-3"></i> T. VOLUMETRÍA: ${sumTotalVol.toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 2})}
                            </span>
                        </div>
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
                    <thead class="bg-slate-950 sticky top-0 z-10 shadow-md">
                        <tr>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Cód / SKU</th>
                            <th class="w-full p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción de Mercadería</th>
                            <th class="py-4 pr-12 pl-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-left w-24 whitespace-nowrap" title="Presentación Física">Presentación</th>
                            <th class="p-4 text-[10px] font-bold text-blue-300 uppercase tracking-widest border-b border-blue-900/50 text-center bg-blue-900/10 border-l border-blue-900/30 shadow-inner">Cant. Pedida</th>
                            <th class="p-4 text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-900/50 text-right bg-emerald-900/20 border-l border-emerald-900/30 shadow-inner">T. Kilos</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/50">
        `;
        
        items.forEach(i => {
            const pedida = parseFloat(i.cantidad) || 0;
            
            // Búsqueda Dinámica Catálogo (Fallback para Schema Restrictivo)
            let rawBult = 1; let rawVal = 1;
            const parseVol = (v) => { if(!v) return null; const n = parseFloat(String(v).replace(',', '.').trim()); return isNaN(n)? null : n; };
            if (window._rawLamdaData) {
                const masterItem = window._rawLamdaData.find(r => {
                    const p = r.datos_maestros || {};
                    return (p.codigo === i.producto_codigo || p.sku === i.producto_codigo || r.codigo === i.producto_codigo || r.sku === i.producto_codigo);
                });
                if (masterItem) {
                    const mp = masterItem.datos_maestros || {};
                    rawBult = parseVol(mp.cant_bult) || parseVol(masterItem.cant_bult) || 1;
                    rawVal = parseVol(mp.cant_valor) || parseVol(masterItem.cant_valor) || 1;
                }
            }

            const bulto = parseFloat(i.cant_bult) || rawBult;
            const valor = parseFloat(i.cant_valor) || rawVal;
            const totalVol = pedida * bulto * valor;

            // Formateador de Unidad (Evitar palabras completas)
            let abrevUnit = (i.unidad_ref || 'U').trim();
            const upperRef = abrevUnit.toUpperCase();
            if (upperRef.includes('KILO') || upperRef === 'KILOGRAMO' || upperRef === 'K' || upperRef === 'KG') abrevUnit = 'Kg';
            else if (upperRef.includes('GRAMO') || upperRef === 'GR' || upperRef === 'G') abrevUnit = 'g';
            else if (upperRef.includes('LITRO') || upperRef === 'LT' || upperRef === 'L') abrevUnit = 'L';
            else if (upperRef.includes('UNID')) abrevUnit = 'U';

            html += `
                <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="p-4 text-xs font-mono text-slate-300">#${i.producto_codigo}</td>
                    <td class="p-4 text-xs font-bold text-slate-200 w-full truncate" title="${i.producto_descripcion}">${i.producto_descripcion}</td>
                    <td class="py-4 pr-12 pl-2 text-xs font-mono text-slate-500 text-left opacity-80 whitespace-nowrap">${bulto.toLocaleString('es-AR')} x ${valor.toLocaleString('es-AR')}</td>
                    <td class="p-4 text-sm font-black text-blue-300 text-center bg-blue-900/10 border-l border-blue-900/30 font-mono shadow-inner">${pedida.toLocaleString('es-AR')}</td>
                    <td class="p-4 text-right bg-emerald-900/20 border-l border-emerald-900/30 shadow-inner">
                        <span class="text-sm font-black text-emerald-400 font-mono tracking-tight">${totalVol.toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>
                        <span class="text-[10px] font-bold text-emerald-500/80 ml-1 uppercase tracking-widest">${abrevUnit}</span>
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
