
function sanitizeLatAmPrice(priceObj) {
    if(!priceObj) return 0;
    if(typeof priceObj === 'number') return priceObj;
    let s = String(priceObj);
    if(s.includes(',') && s.includes('.')) {
        // e.g. 14.862,77 -> 14862.77
        s = s.replace(/\./g, '').replace(/,/g, '.');
    } else if(s.includes(',')) {
        // e.g. 14862,77
        s = s.replace(/,/g, '.');
    }
    return parseFloat(s) || 0;
}

function parseUnitScale(unitStr) {
    if (!unitStr) return 1;
    let s = String(unitStr).replace(/,/g, '.');
    const matches = [...s.matchAll(/(\d+(?:\.\d+)?)/g)];
    if (matches.length === 0) return 1;
    if (matches.length === 1) return parseFloat(matches[0][1]);
    let bult = parseFloat(matches[0][1]);
    let val = parseFloat(matches[1][1]);
    return bult * val;
}

// pedidos_b2b_ui.js

window.activeB2BProvider = null;

window.openB2BCheckout = function() {
    const modal = document.getElementById('b2bCheckoutModal');
    if(modal) {
        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        window.renderB2BProviders();
    }
}

window.closeB2BCheckout = function() {
    const modal = document.getElementById('b2bCheckoutModal');
    if(modal) modal.classList.add('hidden');
}

function getB2BCart() {
    try {
        const c = localStorage.getItem('lamda_b2b_cart');
        if (!c) return [];
        let parsed = JSON.parse(c);
        if (!Array.isArray(parsed)) return [];
        // Robust filtering against nulls
        parsed = parsed.filter(i => i && typeof i === 'object' && i._system_id && i.proveedor_id);
        return parsed;
    } catch(e) {
        console.error("Cart parse error:", e);
        return [];
    }
}

function saveB2BCart(cart) {
    localStorage.setItem('lamda_b2b_cart', JSON.stringify(cart));
}

window.renderB2BProviders = function() {
    let cart = [];
    try {
       cart = getB2BCart();
    } catch(e) {
       console.error("Error retrieving B2B Cart at render:", e);
    }
    const tabsContainer = document.getElementById('b2bProviderTabs');
    const emptyState = document.getElementById('b2bEmptyState');
    const tbody = document.getElementById('b2bItemsBody');
    const headerOpts = document.getElementById('b2bGenerateOptions');
    
    if(!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    if(!cart || !Array.isArray(cart) || cart.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tbody) tbody.innerHTML = '';
        if(headerOpts) headerOpts.style.display = 'none';
        const docName = document.getElementById('b2bActiveProviderName');
        if(docName) docName.innerText = "Seleccione un Proveedor";
        const docCount = document.getElementById('b2bActiveItemCount');
        if(docCount) docCount.innerText = "0 ítems en el carrito";
        return;
    }
    
    const provs = {};
    cart.forEach(item => {
        if(!item || !item.proveedor_id) return;
        if(!provs[item.proveedor_id]) {
            provs[item.proveedor_id] = { id: item.proveedor_id, name: item.proveedor_nombre || 'Desconocido', count: 0 };
        }
        provs[item.proveedor_id].count++;
    });
    
    let isFirst = true;
    for(let pid in provs) {
        const p = provs[pid];
        const btn = document.createElement('button');
        const isActive = window.activeB2BProvider === pid || (isFirst && !window.activeB2BProvider);
        if(isActive) window.activeB2BProvider = pid;
        
        btn.className = `w-full text-left p-3 rounded-lg border ${isActive ? 'bg-emerald-900/30 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'} flex items-center justify-between transition-colors mb-2`;
        btn.onclick = () => {
            window.activeB2BProvider = pid;
            window.renderB2BProviders();
        };
        
        btn.innerHTML = `<div class="flex flex-col"><span class="text-xs font-bold ${isActive ? 'text-emerald-400' : 'text-slate-300'}">${p.name}</span><span class="text-[10px] text-slate-500">${p.count} ítems</span></div> ${isActive ? '<i data-lucide="chevron-right" class="w-4 h-4 text-emerald-500"></i>' : ''}`;
        tabsContainer.appendChild(btn);
        isFirst = false;
    }
    
    if(window.lucide) window.lucide.createIcons();
    window.renderB2BActiveItems();
};

window.renderB2BActiveItems = function() {
    const cart = getB2BCart();
    const pid = window.activeB2BProvider;
    const emptyState = document.getElementById('b2bEmptyState');
    const tbody = document.getElementById('b2bItemsBody');
    const footer = document.getElementById('b2bFooter');
    const headerOpts = document.getElementById('b2bGenerateOptions');
    
    if(!pid) return;
    
    const activeItems = cart.filter(x => x.proveedor_id === pid);
    
    if(activeItems.length > 0) {
        document.getElementById('b2bActiveProviderName').innerText = activeItems[0].proveedor_nombre;
        document.getElementById('b2bActiveItemCount').innerText = activeItems.length + " ítems listos para emisión";
        if (headerOpts) headerOpts.style.display = 'flex';
        if (emptyState) emptyState.classList.add('hidden');
        if (footer) footer.classList.remove('hidden');
        
        let sumKg = 0;
        let sumPrice = 0;

        tbody.innerHTML = '';
        activeItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/30 border-b border-slate-800/50";
            
            const priceRef = sanitizeLatAmPrice(item.precio_unitario) || 0;
            const qty = parseInt(item.cantidad) || 1;
            
                        let unitLabel = item.unidad_medida || '';
            let kgMult = parseUnitScale(unitLabel);
            
            let isKgOrLts = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');
            const totalItemKg = qty * kgMult;
            const totalItemPrice = qty * priceRef;
            
            if(isKgOrLts) sumKg += totalItemKg;
            sumPrice += totalItemPrice;
            
            tr.innerHTML = `
                <td class="p-4 text-xs font-mono text-slate-400">${item.codigo_producto}</td>
                <td class="p-4 text-xs font-bold text-slate-200 whitespace-normal min-w-[200px]">${item.producto_descripcion}</td>
                <td class="p-4 text-xs text-slate-400 text-right">$${priceRef.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})} <span class="text-[9px] uppercase tracking-widest block opacity-50">${unitLabel}</span></td>
                <td class="p-4 bg-emerald-900/10 border-l border-emerald-900/30 p-2">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.updateB2BQty('${item._system_id}', -1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">-</button>
                        <input type="number" onchange="window.setB2BQty('${item._system_id}', this.value)" value="${qty}" class="w-16 bg-slate-950 border border-slate-700 text-center text-emerald-400 font-bold px-2 py-1 outline-none min-h-[30px] rounded focus:border-emerald-500 hide-arrows" />
                        <button onclick="window.updateB2BQty('${item._system_id}', 1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">+</button>
                    </div>
                    <div class="text-center mt-1"><button onclick="window.removeB2BItem('${item._system_id}')" class="text-[9px] text-rose-500 hover:text-rose-400 uppercase tracking-widest">Eliminar</button></div>
                </td>
                <td class="p-4 text-xs font-bold text-blue-400 text-center bg-blue-900/10">${isKgOrLts ? totalItemKg.toFixed(2) + ' Kg/Lt' : '--'}</td>
                <td class="p-4 text-sm font-bold text-purple-400 text-right bg-purple-900/10">$${totalItemPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            `;
            tbody.appendChild(tr);
        });

        const b2bTotalKg = document.getElementById('b2bTotalKg');
        if (b2bTotalKg) b2bTotalKg.innerText = sumKg > 0 ? sumKg.toFixed(2) + ' Kg/Lt' : '--';
        const b2bTotalPrice = document.getElementById('b2bTotalPrice');
        if (b2bTotalPrice) b2bTotalPrice.innerText = '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});

    } else {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tbody) tbody.innerHTML = '';
        if (footer) footer.classList.add('hidden');
        if (headerOpts) headerOpts.style.display = 'none';
        document.getElementById('b2bActiveProviderName').innerText = "Proveedor Vacío";
        document.getElementById('b2bActiveItemCount').innerText = "0 ítems";
    }
};

window.updateB2BQty = function(id, delta) {
    const cart = getB2BCart();
    const item = cart.find(x => x._system_id === id);
    if(item) {
        let n = parseInt(item.cantidad) + delta;
        if(n < 1) n = 1;
        item.cantidad = n;
        saveB2BCart(cart);
        window.renderB2BActiveItems();
    }
};

window.setB2BQty = function(id, val) {
    const cart = getB2BCart();
    const item = cart.find(x => x._system_id === id);
    if(item) {
        let n = parseInt(val);
        if(isNaN(n) || n < 1) n = 1;
        item.cantidad = n;
        saveB2BCart(cart);
        window.renderB2BActiveItems();
    }
};

window.removeB2BItem = function(id) {
    let cart = getB2BCart();
    cart = cart.filter(x => x._system_id !== id);
    saveB2BCart(cart);
    window.renderB2BProviders();
};

window.generateB2BPdf = async function() {
    const cart = getB2BCart();
    const pid = window.activeB2BProvider;
    if(!cart || !pid) return;
    
    const activeItems = cart.filter(x => x.proveedor_id === pid);
    if(activeItems.length === 0) return;
    
    const docType = document.getElementById('b2bDocType').value; // 'Orden de Pedido' o 'Solicitud de Presupuesto'
    const provName = activeItems[0].proveedor_nombre;
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    
    // Preparar Array de Tabla PDF
    const tableBody = [];
    // Cabecera Tabla
    tableBody.push([
        { text: 'Código', style: 'tableHeader' },
        { text: 'Descripción', style: 'tableHeader' },
        { text: 'Unidad Ref.', style: 'tableHeader', alignment: 'center' },
        { text: 'Precio U.', style: 'tableHeader', alignment: 'right' },
        { text: 'Cant. Pedida', style: 'tableHeader', alignment: 'center' },
        { text: 'Subtotal', style: 'tableHeader', alignment: 'right' }
    ]);
    
    let sumKg = 0;
    let sumPrice = 0;

    activeItems.forEach(i => {
        const unitLabel = i.unidad_medida || '';
        let kgMult = parseUnitScale(unitLabel);
        
        let isKg = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');
        
        const price = sanitizeLatAmPrice(i.precio_unitario) || 0;
        const qty = parseInt(i.cantidad) || 1;
        
        const totalKg = qty * kgMult;
        const totalPrc = qty * price;
        
        if (isKg) sumKg += totalKg;
        sumPrice += totalPrc;

        tableBody.push([
            { text: i.codigo_producto, style: 'tableRow' },
            { text: i.producto_descripcion, style: 'tableRowDesc' },
            { text: unitLabel, style: 'tableRow', alignment: 'center' },
            { text: '$' + price.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRow', alignment: 'right' },
            { text: String(qty), style: 'tableRowQty', alignment: 'center' },
            { text: '$' + totalPrc.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRowBoxed', alignment: 'right' }
        ]);
    });
    
    tableBody.push([
        { text: 'TOTAL GENERAL', style: 'tableFooterMsg', colSpan: 5, alignment: 'right' },
        {}, {}, {}, {},
        { text: '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableFooterSum', alignment: 'right' }
    ]);

    const docDefinition = {
        content: [
            { text: 'Sistema de Aprovisionamiento LAMDA', style: 'topHeader', alignment: 'right' },
            { text: docType.toUpperCase(), style: 'mainTitle' },
            {
                columns: [
                    {
                        width: '50%',
                        text: [
                            { text: 'Emisor:\n', style: 'boldText' },
                            'LAMDA Motorhome\n',
                            'Departamentos de Compras'
                        ]
                    },
                    {
                        width: '50%',
                        text: [
                            { text: 'Proveedor Receptor:\n', style: 'boldText' },
                            provName + '\n',
                            'Fecha: ' + dateStr
                        ],
                        alignment: 'right'
                    }
                ],
                margin: [0, 0, 0, 30]
            },
            {
                table: {
                    headerRows: 1,
                    widths: ['15%', '40%', '15%', '10%', '8%', '12%'],
                    body: tableBody
                },
                layout: {
                    hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 2 : 1; },
                    vLineWidth: function (i, node) { return 0; },
                    hLineColor: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 'black' : '#e2e8f0'; },
                    paddingLeft: function(i, node) { return 4; },
                    paddingRight: function(i, node) { return 4; },
                    paddingTop: function(i, node) { return 6; },
                    paddingBottom: function(i, node) { return 6; }
                }
            },
            {
                text: 'Notas Adicionales:\nEl total estimado de Kilogramos/Litros brutos de esta orden asciende a: ' + sumKg.toFixed(2) + ' Kg/Lt',
                style: 'footerNotes',
                margin: [0, 20, 0, 0]
            },
            {
                text: 'Este documento ha sido generado de manera automática y electrónica por LAMDA Sistemas.',
                style: 'footerNotes',
                margin: [0, 10, 0, 0]
            }
        ],
        styles: {
            topHeader: { fontSize: 8, color: '#666666' },
            mainTitle: { fontSize: 22, bold: true, margin: [0, 20, 0, 20], color: '#0f172a' },
            boldText: { bold: true, fontSize: 11, color: '#334155' },
            tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#334155', margin: [0, 4, 0, 4] },
            tableRow: { fontSize: 8, color: '#475569'},
            tableRowDesc: { fontSize: 8, color: '#0f172a', bold: true },
            tableRowQty: { fontSize: 10, color: '#0f172a', bold: true },
            tableRowBoxed: { fontSize: 9, color: '#0f172a', bold: true },
            tableFooterMsg: { fontSize: 10, bold: true, color: '#0f172a', margin: [0, 6, 0, 6] },
            tableFooterSum: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 6, 0, 6] },
            footerNotes: { fontSize: 8, italics: true, color: '#94a3b8' }
        },
        defaultStyle: {
            font: 'Roboto'
        }
    };

    if(window.pdfMake) {
        // Enviar silenciosamente la persistencia a BD (Endpoint no bloqueante)
        const dbPayload = {
            proveedor_id: pid,
            tipo_documento: docType,
            items: activeItems.map(i => ({ 
                producto_codigo: i.codigo_producto, 
                producto_descripcion: i.producto_descripcion,
                cantidad: i.cantidad,
                valor_unitario_ref: i.precio_unitario,
                unidad_ref: i.unidad_medida
            }))
        };
        
        try {
            fetch('http://localhost:5655/api/b2b/generar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dbPayload)
            });
        } catch(e) {}
        
        pdfMake.createPdf(docDefinition).download(docType.replace(/\\s+/g, '_') + '_' + provName.replace(/\\s+/g, '_') + '_' + dateStr.replace(/\\//g, '') + '.pdf');
        
        if (window.Swal) window.Swal.fire({ icon: 'success', title: 'PDF Generado', text: 'El documento se ha descargado y el pedido ha sido procesado.', background: '#0f172a', color: '#10b981'});
        
        // Purge completed order from cart
        let newCart = cart.filter(x => x.proveedor_id !== pid);
        saveB2BCart(newCart);
        window.activeB2BProvider = null;
        window.renderB2BProviders();
        if (window.updateB2BItemIndicator) window.updateB2BItemIndicator();
    } else {
        alert("Librería de PDF no cargada.");
    }
};
