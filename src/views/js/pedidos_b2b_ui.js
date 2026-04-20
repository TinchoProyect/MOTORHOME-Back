
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
        const catalogBtn = document.getElementById('b2bOpenCatalogBtn');
        if(catalogBtn) catalogBtn.style.display = 'none';
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
            
            // Fix: Sincronización reactiva de Scope B2B
            const overlay = document.getElementById('b2bCatalogOverlay');
            if (overlay && !overlay.classList.contains('hidden')) {
                window.openB2BCatalog();
            }
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
    
    const activeItems = cart.filter(x => String(x.proveedor_id) === String(pid));
    
    if(activeItems.length > 0) {
        document.getElementById('b2bActiveProviderName').innerText = activeItems[0].proveedor_nombre;
        document.getElementById('b2bActiveItemCount').innerText = activeItems.length + " ítems listos para emisión";
        if (headerOpts) headerOpts.style.display = 'flex';
        const catalogBtn = document.getElementById('b2bOpenCatalogBtn');
        if (catalogBtn) catalogBtn.style.display = 'flex';
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
            
            const bult = sanitizeLatAmPrice(item.cant_bult) || 1;
            const val = sanitizeLatAmPrice(item.cant_valor) || 1;
            const kgMult = bult * val;
            
            let unitLabel = item.unidad_medida || '';
            let isKgOrLts = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');
            const totalItemKg = qty * kgMult;
            const totalItemPrice = totalItemKg * priceRef;
            
            if(isKgOrLts) sumKg += totalItemKg;
            sumPrice += totalItemPrice;
            
            tr.innerHTML = `
                <td class="p-1 px-2 text-[10px] font-mono text-slate-400 border-r border-slate-800/30">${item.codigo_producto}</td>
                <td class="p-1 px-2 text-[10px] font-bold text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title="${item.producto_descripcion}">${item.producto_descripcion}</td>
                <td class="p-1 px-2 text-[10px] text-slate-400 text-right whitespace-nowrap">$${priceRef.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})} <span class="uppercase opacity-50 ml-1 whitespace-nowrap">${unitLabel}</span></td>
                <td class="p-1 bg-emerald-900/10 border-l border-r border-emerald-900/30">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="window.updateB2BQty('${item._system_id}', -1)" class="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">-</button>
                        <input type="number" onchange="window.setB2BQty('${item._system_id}', this.value)" value="${qty}" class="w-12 bg-slate-950 border border-slate-700 text-center text-emerald-400 font-bold px-1 py-0.5 outline-none text-[10px] rounded focus:border-emerald-500 hide-arrows" />
                        <button onclick="window.updateB2BQty('${item._system_id}', 1)" class="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">+</button>
                        <button onclick="window.removeB2BItem('${item._system_id}')" class="w-6 h-6 ml-3 text-red-400 hover:text-white bg-red-900/30 hover:bg-red-600 rounded shadow border border-red-500/20 flex items-center justify-center cursor-pointer transition-all" title="Eliminar Ítem">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </td>
                <td class="p-1 px-2 text-[10px] font-bold text-blue-400 text-center bg-blue-900/10 border-r border-slate-800/30">${isKgOrLts ? totalItemKg.toFixed(2) + ' Kg/Lt' : '--'}</td>
                <td class="p-1 px-2 text-[11px] font-bold text-purple-400 text-right bg-purple-900/10">$${totalItemPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
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
        const catalogBtn = document.getElementById('b2bOpenCatalogBtn');
        if (catalogBtn) catalogBtn.style.display = 'none';
        document.getElementById('b2bActiveProviderName').innerText = "Proveedor Vacío";
        document.getElementById('b2bActiveItemCount').innerText = "0 ítems";
        
        const b2bTotalKg = document.getElementById('b2bTotalKg');
        if (b2bTotalKg) b2bTotalKg.innerText = '--';
        const b2bTotalPrice = document.getElementById('b2bTotalPrice');
        if (b2bTotalPrice) b2bTotalPrice.innerText = '$0.00';
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
    
    // Reactividad en Panel Superior (Recalcular y Re-renderizar Fila/Contadores)
    window.renderB2BProviders();
    
    // Reactividad Inversa Hacia Panel Inferior (Catálogo B2B)
    const overlay = document.getElementById('b2bCatalogOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        const searchInput = document.getElementById('b2bCatalogSearch');
        const val = searchInput ? searchInput.value : '';
        if (window.renderB2BCatalog) window.renderB2BCatalog(val);
    }
};

window.emptyB2BOrder = function() {
    const pid = window.activeB2BProvider;
    if(!pid) return;

    if (window.Swal) {
        Swal.fire({
            title: '¿Vaciar Orden Activa?',
            text: "Se eliminarán masivamente todos los ítems y cálculos de este proveedor.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, Purge Masivo',
            cancelButtonText: 'Cancelar',
            background: '#0f172a',
            color: '#f8fafc'
        }).then((result) => {
            if (result.isConfirmed) {
                executeEnginePurge(pid);
            }
        });
    } else {
        if(confirm("Desea vaciar todos los registros del pedido actual?")) {
            executeEnginePurge(pid);
        }
    }
    
    function executeEnginePurge(providerId) {
        let cart = getB2BCart();
        cart = cart.filter(x => String(x.proveedor_id) !== String(providerId));
        saveB2BCart(cart);
        
        // Update Panel Superior
        window.renderB2BProviders();
        
        // Sincronización Inversa Reactiva con Catálogo (Restauración Masiva de SKUs)
        const overlay = document.getElementById('b2bCatalogOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            const searchInput = document.getElementById('b2bCatalogSearch');
            const val = searchInput ? searchInput.value : '';
            if (window.renderB2BCatalog) window.renderB2BCatalog(val);
        }
        
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Bandeja Purgada',
                toast: true,
                position: 'bottom-end',
                showConfirmButton: false,
                timer: 2500,
                background: '#0f172a',
                color: '#10b981'
            });
        }
    }
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
    
    const isPresupuesto = docType === 'Solicitud de Presupuesto';
    
    // Preparar Array de Tabla PDF
    const tableBody = [];
    
    // Cabecera Tabla
    const tableHeader = [
        { text: 'CÓDIGO (SKU)', style: 'tableHeaderBold' },
        { text: 'Descripción', style: 'tableHeader' },
        { text: 'C. Bult.', style: 'tableHeader', alignment: 'center' },
        { text: 'C. Val.', style: 'tableHeader', alignment: 'center' },
        { text: 'Unidad', style: 'tableHeader', alignment: 'center' },
        { text: 'Kg Totales', style: 'tableHeader', alignment: 'center' }
    ];
    tableHeader.push({ text: 'CANT. PEDIDA', style: 'tableHeaderBold', alignment: 'center' });
    if (!isPresupuesto) {
        tableHeader.push({ text: 'Precio U.', style: 'tableHeader', alignment: 'right' });
        tableHeader.push({ text: 'Subtotal', style: 'tableHeader', alignment: 'right' });
    }
    
    tableBody.push(tableHeader);
    
    let sumKg = 0;
    let sumPrice = 0;

    activeItems.forEach(i => {
        let rawUnit = (i.unidad_medida || '').toUpperCase();
        let unitLabel = rawUnit;
        if (rawUnit.includes('KILO') || rawUnit.includes('KG')) unitLabel = 'K';
        else if (rawUnit.includes('GRAMO') || rawUnit.includes('GR')) unitLabel = 'G';
        else if (rawUnit.includes('LITRO') || rawUnit.includes('LT')) unitLabel = 'L';
        else if (rawUnit.includes('UNID')) unitLabel = 'U';
        
        const bult = sanitizeLatAmPrice(i.cant_bult) || 1;
        const val = sanitizeLatAmPrice(i.cant_valor) || 1;
        const kgMult = bult * val;
        
        let isKg = unitLabel === 'K' || unitLabel === 'L' || unitLabel === 'G' || rawUnit.includes('KG');
        
        const price = sanitizeLatAmPrice(i.precio_unitario) || 0;
        const qty = parseInt(i.cantidad) || 1;
        
        const totalKg = qty * kgMult;
        const totalPrc = totalKg * price;
        
        if (isKg) sumKg += totalKg;
        sumPrice += totalPrc;

        const rowElements = [
            { text: i.codigo_producto, style: 'tableRowHighlight' },
            { text: i.producto_descripcion, style: 'tableRowDesc' },
            { text: String(bult), style: 'tableRow', alignment: 'center' },
            { text: String(val), style: 'tableRow', alignment: 'center' },
            { text: unitLabel, style: 'tableRow', alignment: 'center' },
            { text: isKg ? totalKg.toFixed(2) : '--', style: 'tableRowHighlightCenter', alignment: 'center' }
        ];
        
        rowElements.push({ text: String(qty), style: 'tableRowHighlightCenter', alignment: 'center' });
        
        if (!isPresupuesto) {
            rowElements.push({ text: '$' + price.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRow', alignment: 'right' });
            rowElements.push({ text: '$' + totalPrc.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRowBoxed', alignment: 'right' });
        }
        
        tableBody.push(rowElements);
    });
    
    // Fila 1: Total Kilos (Alineado bajo la columna KG Totales = índice 5)
    let kilosRow = [
        { text: 'TOTAL KILOS', style: 'tableFooterMsg', colSpan: 5, alignment: 'right' },
        {}, {}, {}, {},
        { text: sumKg.toFixed(2), style: 'tableFooterSum', alignment: 'center' }
    ];
    // Rellenamos el padding final
    if (isPresupuesto) {
        kilosRow.push({}); // Columna 6 (CANT. PEDIDA)
    } else {
        kilosRow.push({}); // Columna 6
        kilosRow.push({}); // Columna 7
        kilosRow.push({}); // Columna 8
    }
    tableBody.push(kilosRow);
    
    if (!isPresupuesto) {
        // Fila 2: Total General Neto
        tableBody.push([
            { text: 'TOTAL GENERAL NETO', style: 'tableFooterMsg', colSpan: 8, alignment: 'right' },
            {}, {}, {}, {}, {}, {}, {},
            { text: '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableFooterSum', alignment: 'right' }
        ]);
    }

    const docDefinition = {
        pageOrientation: 'landscape',
        content: [
            { text: 'Sistema de Aprovisionamiento LAMDA', style: 'topHeader', alignment: 'right' },
            { text: docType.toUpperCase(), style: 'mainTitle' },
            {
                columns: [
                    {
                        width: '50%',
                        text: [
                            { text: 'Emisor:\n', style: 'boldText' },
                            'LAMDA\n',
                            'Teléfono: 221 661 5746\n',
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
                margin: [0, 0, 0, 10]
            },
            {
                table: {
                    headerRows: 1,
                    widths: isPresupuesto ? ['auto', '40%', 'auto', 'auto', 'auto', 'auto', 'auto'] : ['auto', '40%', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                    body: tableBody
                },
                layout: {
                    hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 2 : 1; },
                    vLineWidth: function (i, node) { return 0; },
                    hLineColor: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 'black' : '#e2e8f0'; },
                    paddingLeft: function(i, node) { return 4; },
                    paddingRight: function(i, node) { return 4; },
                    paddingTop: function(i, node) { return 4; },
                    paddingBottom: function(i, node) { return 4; }
                }
            },
            {
                text: 'Notas Adicionales:\nEl total estimado de Kilogramos/Litros brutos de este documento asciende a: ' + sumKg.toFixed(2) + ' Kg/Lt',
                style: 'footerNotes',
                margin: [0, 10, 0, 0]
            },
            {
                text: 'Este documento ha sido generado de manera automática y electrónica por LAMDA Sistemas.',
                style: 'footerNotes',
                margin: [0, 5, 0, 0]
            }
        ],
        styles: {
            topHeader: { fontSize: 8, color: '#666666' },
            mainTitle: { fontSize: 16, bold: true, margin: [0, 5, 0, 10], color: '#0f172a' },
            boldText: { bold: true, fontSize: 11, color: '#334155' },
            tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#334155', margin: [0, 2, 0, 2] },
            tableHeaderBold: { bold: true, fontSize: 9, color: '#10b981', fillColor: '#1e293b', margin: [0, 2, 0, 2] },
            tableRow: { fontSize: 8, color: '#475569'},
            tableRowHighlight: { fontSize: 11, bold: true, color: '#0f172a' },
            tableRowHighlightCenter: { fontSize: 12, bold: true, color: '#0f172a', alignment: 'center' },
            tableRowDesc: { fontSize: 8, color: '#0f172a', bold: true },
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
        
        const safeDocType = docType ? docType.replace(/\s+/g, '_') : 'Doc';
        const safeProvName = provName ? provName.replace(/\s+/g, '_') : 'Prov';
        const safeDateStr = dateStr ? dateStr.replace(/\//g, '') : 'Fecha';
        
        try {
            pdfMake.createPdf(docDefinition).download(safeDocType + '_' + safeProvName + '_' + safeDateStr + '.pdf');
            if (window.Swal) window.Swal.fire({ icon: 'success', title: 'PDF Generado', text: 'El documento se ha descargado y el pedido ha sido procesado.', background: '#0f172a', color: '#10b981'});
        } catch(pdfErr) {
            console.error("PDF Generate Error", pdfErr);
            if (window.Swal) window.Swal.fire({ icon: 'info', title: '[En Desarrollo / Error PDF]', text: 'El PDF encontró una falla, pero el click fue detectado. Check consola.', background: '#0f172a', color: '#3b82f6'});
        }

        // ACCIÓN PROFILÁCTICA REMOVIDA: 
        // No se elimina el carrito localStorage automáticamente. QA exige re-verificación visual o un botón explícito de limpieza para no castigar al usuario.
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Transmisión Completada',
                text: 'El documento PDF fue ensamblado. La orden sigue activa en sistema.',
                background: '#0f172a',
                color: '#10b981',
                toast: true,
                position: 'bottom-end',
                showConfirmButton: false,
                timer: 4000
            });
        }
    } else {
        if (window.Swal) window.Swal.fire({ icon: 'info', title: '[En Desarrollo]', text: 'Simulación de Envío OK. La librería de PDF no está cargada en el DOM actual.', background: '#0f172a', color: '#3b82f6'});
    }
};

// ==========================================
// MÓDULO: CATÁLOGO EMPOTRADO SCÓPICO
// ==========================================
window.openB2BCatalog = async function() {
    const overlay = document.getElementById('b2bCatalogOverlay');
    const topPanel = document.getElementById('b2bTopPanel');
    const rowSplitter = document.getElementById('b2bRowSplitter');
    if (!overlay) return;
    
    // Configurar layout Split-View (Top Panel: 40vh, Bottom: flex-1)
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    if (rowSplitter) rowSplitter.classList.remove('hidden');
    
    if (topPanel) {
        topPanel.classList.remove('flex-1');
        // Limpiamos estilos inline previos si se cerró y abrió de nuevo
        topPanel.style.height = ''; 
        topPanel.classList.add('h-[40vh]', 'shrink-0');
    }
    
    // 🛡️ VIGÍA ESTRUCTURAL DE DOM (REQUERIMIENTO QA)
    setTimeout(() => {
        const parent = topPanel.parentElement;
        console.group("🛡️ [VIGÍA DE DOM] Auditoría de Layout (Split-View)");
        console.log("Contenedor Padre Clases:", parent.className);
        console.table({
            "Fila 1 (Top Panel)": {
                Ancho: topPanel.offsetWidth + "px",
                Alto: topPanel.offsetHeight + "px",
                Clases: topPanel.className,
                IsRow: topPanel.className.includes("flex-col") ? "No" : "Sí (Left/Right)"
            },
            "Fila 2 (Catálogo)": {
                Ancho: overlay.offsetWidth + "px",
                Alto: overlay.offsetHeight + "px",
                Clases: overlay.className,
                IsCol: overlay.className.includes("flex-col") ? "Sí" : "No"
            }
        });
        console.groupEnd();
    }, 100);
    
    // Lazy Fetch si la memoria operativa no está levantada en la ventana (ej. tras F5)
    if (!window._rawLamdaData) {
        document.getElementById('b2bCatalogSearch').value = '';
        const tbody = document.getElementById('b2bCatalogBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-blue-500 font-bold animate-pulse text-xs"><i data-lucide="loader-2" class="w-5 h-5 mx-auto mb-2 animate-spin"></i> Inicializando caché maestro...</td></tr>`;
        if (window.lucide) window.lucide.createIcons();
        
        try {
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            const opRes = await fetch(`${backendUrl}/api/master-table/operativa`);
            if (opRes.ok) {
                const opJson = await opRes.json();
                window._rawLamdaData = opJson.data;
            }
        } catch(e) {
            console.error("VIGÍA - Fallo Lazy Fetch B2B:", e);
        }
    }
    
    // Obtener info del proveedor activo desde el carrito actual
    const cart = getB2BCart();
    const pid = window.activeB2BProvider;
    const activeItems = cart.filter(x => String(x.proveedor_id) === String(pid));
    if(activeItems.length > 0) {
        document.getElementById('b2bCatalogProviderName').innerText = "PROVEEDOR: " + activeItems[0].proveedor_nombre;
    }
    
    document.getElementById('b2bCatalogSearch').value = '';
    window.renderB2BCatalog();
};

window.closeB2BCatalog = function() {
    const overlay = document.getElementById('b2bCatalogOverlay');
    const topPanel = document.getElementById('b2bTopPanel');
    const rowSplitter = document.getElementById('b2bRowSplitter');
    
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (rowSplitter) rowSplitter.classList.add('hidden');
    
    if (topPanel) {
        topPanel.style.height = '';
        topPanel.classList.remove('h-[40vh]', 'shrink-0');
        topPanel.classList.add('flex-1');
    }
};

window.renderB2BCatalog = function(searchTerm = '') {
    const pid = window.activeB2BProvider;
    
    // === VIGÍA DEPURADOR EXIGIDO (STRIKE 3) ===
    console.group("🛡️ [VIGÍA DEPURADOR B2B / RENDERING CATÁLOGO]");
    console.log("-> PID Activo (Scope):", pid);
    console.log("-> _rawLamdaData en Memoria:", window._rawLamdaData ? `Array ok: ${window._rawLamdaData.length} items` : 'UNDEFINED o Vacío');
    
    if(!pid || !window._rawLamdaData) {
        console.warn("-> ABORTO: Falta PID O la memoria global no se pudo inicializar.");
        console.groupEnd();
        return;
    }
    
    // Identificar qué ítems ya están en el carrito B2B
    const cart = getB2BCart();
    const cartSet = new Set(cart.filter(x => String(x.proveedor_id) === String(pid)).map(x => x._system_id));
    
    // Filtrar base maestra (scope aislación por PID)
    let scopedData = window._rawLamdaData.filter(r => {
        const rowPid = r._proveedor_id || r.proveedor_id;
        return String(rowPid) === String(pid) && !r._is_empty_skeleton;
    });
    
    console.log(`-> Data filtrada por Proveedor [${pid}]:`, scopedData.length, "items");
    
    if (searchTerm) {
        const processedFText = searchTerm.replace(/#/g, ' #');
        const tokens = processedFText.split(/\s+/).filter(t => t.length > 0 && t !== '#');
        
        scopedData = scopedData.filter(r => {
            const p = r.datos_maestros || {};
            const cod = String(p.codigo || p['código'] || p.sku || r.codigo || r['código'] || r.sku || r.id || r._system_id).toLowerCase();
            const desc = String(p.descripcion || p['descripción'] || r.descripcion || r['descripción'] || '').toLowerCase();
            const rub = String(p.rubro || r.rubro || '').toLowerCase();
            
            const fullText = `${cod} ${desc} ${rub}`;
            
            for (const token of tokens) {
                const isNeg = token.startsWith('#');
                const effectiveToken = token.replace(/#/g, '').toLowerCase();
                if (effectiveToken.length === 0) continue;
                
                const hasMatch = fullText.includes(effectiveToken);
                if (isNeg) {
                    if (hasMatch) return false;
                } else {
                    if (!hasMatch) return false;
                }
            }
            return true;
        });
        console.log(`-> Data pre-render (Tras Buscador '${searchTerm}'):`, scopedData.length, "items");
    }

    if (scopedData.length > 0) {
        console.log("-> Muestra (Top 3) empujada al TBody DOM:");
        console.table(scopedData.slice(0, 3));
    }
    console.groupEnd();
    
    const tbody = document.getElementById('b2bCatalogBody');
    const empty = document.getElementById('b2bCatalogEmpty');
    tbody.innerHTML = '';
    
    if (scopedData.length === 0) {
        empty.classList.remove('hidden');
        empty.classList.add('flex');
    } else {
        empty.classList.add('hidden');
        empty.classList.remove('flex');
        
        scopedData.forEach(item => {
            const sysId = item.id || item._system_id || null;
            const isAdded = sysId && cartSet.has(sysId);
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/30 transition-colors";
            
            const p = item.datos_maestros || {};
            const cod = p.codigo || p['código'] || p.sku || item.codigo || item['código'] || item.sku || (sysId ? sysId.split('-')[0] : 'N/A');
            const desc = p.descripcion || p['descripción'] || item.descripcion || item['descripción'] || 'Sin descripción';
            const uni = p.unidad || p.unidad_medida || item.unidad || item.unidad_medida || 'Unidad';
            const prc = sanitizeLatAmPrice(p.precio || item.precio) || 0;
            
            let actionHtml = '';
            if (isAdded) {
                actionHtml = `<div class="flex items-center justify-center bg-slate-800/80 border border-slate-700/50 rounded px-1.5 py-1 gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse"></span> <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">En Pedido</span></div>`;
            } else {
                actionHtml = `
                <div class="flex items-center gap-1 justify-between w-full">
                    <input type="number" id="b2bCatQty_${sysId}" value="1" min="1" class="w-8 bg-slate-950 border border-slate-700 text-center text-emerald-400 font-bold px-0.5 py-0.5 shadow-inner outline-none text-[9px] rounded focus:border-emerald-500 hide-arrows" />
                    <button onclick="window.addB2BCatalogItemRow('${sysId}')" class="flex-1 py-1 bg-emerald-600/20 hover:bg-emerald-600/50 text-emerald-400 shadow shadow-emerald-900/20 rounded text-[9px] font-bold uppercase tracking-widest transition-colors border border-emerald-500/30 flex items-center justify-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Add</button>
                </div>
                `;
            }
            
            tr.innerHTML = `
                <td class="p-1.5 border-b border-slate-800/50 w-28">
                    ${actionHtml}
                </td>
                <td class="p-1.5 text-[10px] font-mono text-slate-400 border-b border-slate-800/50">
                    ${cod}
                </td>
                <td class="p-1.5 text-[10px] font-bold text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px] border-b border-slate-800/50" title="${desc}">
                    ${desc}
                </td>
                <td class="p-1.5 text-[10px] font-bold text-slate-400 text-center border-b border-slate-800/50">
                    ${uni}
                </td>
                <td class="p-1.5 text-[10px] font-bold text-blue-400 text-center border-b border-slate-800/50 bg-blue-900/5">
                    ${item.datos_maestros?.cant_bult || item.cant_bult || 1}
                </td>
                <td class="p-1.5 text-[10px] font-bold text-purple-400 text-center border-b border-slate-800/50 bg-purple-900/5">
                    ${item.datos_maestros?.cant_valor || item.cant_valor || 1}
                </td>
                <td class="p-1.5 text-[10px] font-bold text-emerald-400 text-right border-b border-slate-800/50 bg-emerald-900/5">
                    $${prc.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    if(window.lucide) window.lucide.createIcons();
};

window.filterB2BCatalog = function() {
    const val = document.getElementById('b2bCatalogSearch').value;
    window.renderB2BCatalog(val);
};

window.addB2BCatalogItemRow = function(sysId) {
    const qtyInput = document.getElementById(`b2bCatQty_${sysId}`);
    let qty = qtyInput ? parseInt(qtyInput.value) : 1;
    if (isNaN(qty) || qty < 1) qty = 1;
    window.addB2BCatalogItem(sysId, qty);
};

window.addB2BCatalogItem = function(sysId, initQty = 1) {
    if(!window._rawLamdaData) return;
    const row = window._rawLamdaData.find(r => r.id === sysId || r._system_id === sysId);
    if(!row) return;
    
    let cart = getB2BCart();
    // Prevenir duplicados inyectados dos veces rápido
    if(cart.find(x => x._system_id === sysId)) return;
    
    const p = row.datos_maestros || {};
    
    cart.push({
        _system_id: row.id || row._system_id,
        proveedor_id: row.proveedor_id || row._proveedor_id || 'PROV-UNKNOWN',
        proveedor_nombre: row.nombre_proveedor || row._proveedor || row.proveedor || 'Sin Proveedor',
        codigo_producto: p.codigo || p['código'] || p.sku || row.codigo || row['código'] || row.sku || row.id || row._system_id,
        producto_descripcion: p.descripcion || p['descripción'] || row.descripcion || row['descripción'] || 'Sin descripción',
        precio_unitario: sanitizeLatAmPrice(p.precio || row.precio) || 0,
        cantidad: initQty,
        unidad_medida: p.unidad || p.unidad_medida || row.unidad || 'Unidad',
        cant_bult: p.cant_bult || row.cant_bult || 1,
        cant_valor: p.cant_valor || row.cant_valor || 1
    });
    
    saveB2BCart(cart);
    window.renderB2BActiveItems(); // Refresh fondo de carrito
    
    // Refresh grilla de catálogo
    const val = document.getElementById('b2bCatalogSearch').value;
    window.renderB2BCatalog(val);
    
    // Notificación minimalista in-dom (UX requirement)
    setTimeout(() => {
        if(window.updateB2BItemIndicator) window.updateB2BItemIndicator();
    }, 100);
};

// ==========================================
// MÓDULO: EXPANSIÓN Y REDIMENSIÓN DRAGGABLE (SPLITTERS)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Regulador Vertical (Eje X)
    const colSplitter = document.getElementById('b2bColSplitter');
    const providerTabs = document.getElementById('b2bProviderTabs');
    
    if (colSplitter && providerTabs) {
        let isResizingCol = false;
        colSplitter.addEventListener('pointerdown', (e) => {
            isResizingCol = true;
            document.body.style.cursor = 'col-resize';
            // Evitar selección accidental de texto mientras se arrastra
            document.body.style.userSelect = 'none';
            colSplitter.setPointerCapture(e.pointerId);
        });

        colSplitter.addEventListener('pointermove', (e) => {
            if (!isResizingCol) return;
            // El contenedor general se asume referenciado desde la izquierda.
            // getBoundingClientRect().left nos da el origen X del modal / parent container
            const containerLeft = colSplitter.parentElement.getBoundingClientRect().left;
            let newWidth = e.clientX - containerLeft;
            // Límites duros ergonómicos: min 150px, max 600px
            if (newWidth < 120) newWidth = 120;
            if (newWidth > 600) newWidth = 600;
            
            providerTabs.style.width = newWidth + 'px';
            // Remover la clase w-48 estática inicial de tailwind para que no colisione
            providerTabs.classList.remove('w-48');
        });

        colSplitter.addEventListener('pointerup', (e) => {
            isResizingCol = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            colSplitter.releasePointerCapture(e.pointerId);
        });
    }

    // 2. Regulador Horizontal (Eje Y)
    const rowSplitter = document.getElementById('b2bRowSplitter');
    const topPanel = document.getElementById('b2bTopPanel');
    
    if (rowSplitter && topPanel) {
        let isResizingRow = false;
        rowSplitter.addEventListener('pointerdown', (e) => {
            isResizingRow = true;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            rowSplitter.setPointerCapture(e.pointerId);
        });

        rowSplitter.addEventListener('pointermove', (e) => {
            if (!isResizingRow) return;
            
            // Para el Y, calculamos relativo al contenedor principal del modal (que arranca debajo del header B2B)
            // parentElement es el `<div class="flex-1 flex flex-col overflow-hidden">` (Split View content area)
            const containerTop = rowSplitter.parentElement.getBoundingClientRect().top;
            const containerHeight = rowSplitter.parentElement.getBoundingClientRect().height;
            
            let newHeight = e.clientY - containerTop;
            
            // Límites duros: min 100px para el Top Panel, y min 100px para el Catálogo (Bottom)
            if (newHeight < 100) newHeight = 100;
            if (newHeight > containerHeight - 100) newHeight = containerHeight - 100;
            
            topPanel.style.height = newHeight + 'px';
            // Removemos class base tailwind para no colisionar el inline style
            topPanel.classList.remove('h-[40vh]');
        });

        rowSplitter.addEventListener('pointerup', (e) => {
            isResizingRow = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            rowSplitter.releasePointerCapture(e.pointerId);
        });
    }
});

