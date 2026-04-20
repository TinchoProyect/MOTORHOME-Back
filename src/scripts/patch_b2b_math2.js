const fs = require('fs');

// ==== 1. Patch HTML UI ====
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// Title change
html = html.replace('Generar Pedidos (B2B Checkout)', 'Gestión de Pedidos (B2B Checkout)');
html = html.replace(\`<button onclick="if(window.openB2BCheckout) window.openB2BCheckout(); else alert('Módulo de pedidos en inicialización...');" class="submenu-item text-left py-2 text-[11px] text-slate-500 hover:text-blue-400 text-xs">Generar pedidos</button>\`, \`<button onclick="if(window.openB2BCheckout) window.openB2BCheckout(); else alert('Módulo de pedidos en inicialización...');" class="submenu-item text-left py-2 text-[11px] text-slate-500 hover:text-blue-400 text-xs">Gestión de Pedidos</button>\`);

// Panel widths
html = html.replace('w-1/3 border-r border-slate-800 bg-slate-900/50 p-4', 'w-1/4 border-r border-slate-800 bg-slate-900/50 p-4');

// Table Headers
const tHStart = '<table class="w-full text-left border-collapse whitespace-nowrap">';
const newHeaders = \`<table class="w-full text-left border-collapse whitespace-nowrap">
                            <thead class="bg-slate-950/40 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Cód / SKU</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Precio Ref.</th>
                                    <th class="p-3 text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-slate-800 text-center w-32 bg-emerald-900/10">Cantidad</th>
                                    <th class="p-3 text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 text-center">KG Totales</th>
                                    <th class="p-3 text-[10px] font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800 text-right">Precio Total</th>
                                </tr>
                            </thead>
                            <tbody id="b2bItemsBody">
                                <!-- Rehydrated via JS -->
                            </tbody>
                            <tfoot id="b2bFooter" class="bg-slate-950/80 sticky bottom-0 hidden backdrop-blur-md">
                                <tr>
                                    <td colspan="4" class="p-4 text-xs font-bold text-slate-400 text-right uppercase tracking-widest border-t border-slate-800">Totales Estimados</td>
                                    <td class="p-4 text-sm font-bold text-blue-400 text-center border-t border-slate-800" id="b2bTotalKg">0.00 Kg</td>
                                    <td class="p-4 text-sm font-bold text-purple-400 text-right border-t border-slate-800" id="b2bTotalPrice">$0.00</td>
                                </tr>
                            </tfoot>
                        </table>\`;

const tRegex = /<table class="w-full text-left border-collapse whitespace-nowrap">[\\s\\S]*?<\\/tbody>\\s*<\\/table>/;
if(tRegex.test(html)) {
    html = html.replace(tRegex, newHeaders);
    console.log("Patched HTML Table and Footer");
} else {
    console.log("Failed to patch HTML Table");
}

fs.writeFileSync('src/views/monitor_proveedores.html', html);


// ==== 2. Patch JS Controller ====
let js = fs.readFileSync('src/views/js/pedidos_b2b_ui.js', 'utf8');

const jsRenderRegex = /window\\.renderB2BActiveItems = function\\(\\)[\\s\\S]*?(?=window\\.updateB2BQty = function)/;
const newRender = \`window.renderB2BActiveItems = function() {
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
        if(headerOpts) headerOpts.style.display = 'flex';
        if(emptyState) emptyState.classList.add('hidden');
        if(footer) footer.classList.remove('hidden');
        
        let sumKg = 0;
        let sumPrice = 0;
        
        tbody.innerHTML = '';
        activeItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/30 border-b border-slate-800/50";
            
            // Clean Math: real price parsing and kg parsing
            const priceRef = parseFloat(item.precio_unitario) || 0;
            const qty = parseInt(item.cantidad) || 1;
            
            let unitLabel = item.unidad_medida || '';
            // Parse multiplier for kilos/liters, else 1
            let kgMult = 1;
            const matchList = String(unitLabel).match(/[\\\\d.,]+/g);
            if (matchList && matchList.length > 0) {
                kgMult = parseFloat(matchList[matchList.length - 1].replace(',', '.'));
                if (isNaN(kgMult) || kgMult <= 0) kgMult = 1;
            }
            
            let isKgOrLts = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');
            const totalItemKg = qty * kgMult;
            const totalItemPrice = qty * priceRef;
            
            if(isKgOrLts) sumKg += totalItemKg;
            sumPrice += totalItemPrice;
            
            tr.innerHTML = \\\`
                <td class="p-3 text-xs font-mono text-slate-400">\\\${item.codigo_producto}</td>
                <td class="p-3 text-xs font-bold text-slate-200 whitespace-normal min-w-[200px]">\\\${item.producto_descripcion}</td>
                <td class="p-3 text-xs text-slate-400 text-right">\\$\\\${priceRef.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})} <span class="text-[9px] uppercase tracking-widest block opacity-50">\\\${unitLabel}</span></td>
                <td class="p-3 bg-emerald-900/10 border-l border-emerald-900/30">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="window.updateB2BQty('\\\${item._system_id}', -1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">-</button>
                        <input type="number" onchange="window.setB2BQty('\\\${item._system_id}', this.value)" value="\\\${qty}" class="w-14 bg-slate-950 border border-slate-700 text-center text-emerald-400 font-bold px-1 py-1 outline-none rounded focus:border-emerald-500 hide-arrows" />
                        <button onclick="window.updateB2BQty('\\\${item._system_id}', 1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">+</button>
                    </div>
                    <div class="text-center mt-1"><button onclick="window.removeB2BItem('\\\${item._system_id}')" class="text-[9px] text-rose-500 hover:text-rose-400 uppercase tracking-widest">Eliminar</button></div>
                </td>
                <td class="p-3 text-xs font-bold text-blue-400 text-center bg-blue-900/10">\\\${isKgOrLts ? totalItemKg.toFixed(2) + ' Kg' : '--'}</td>
                <td class="p-3 text-sm font-bold text-purple-400 text-right bg-purple-900/10">\\$\\\${totalItemPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            \\\`;
            tbody.appendChild(tr);
        });
        
        document.getElementById('b2bTotalKg').innerText = sumKg > 0 ? sumKg.toFixed(2) + ' Kg' : '--';
        document.getElementById('b2bTotalPrice').innerText = '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
        
    } else {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tbody) tbody.innerHTML = '';
        if(footer) footer.classList.add('hidden');
        if(headerOpts) headerOpts.style.display = 'none';
        const docName = document.getElementById('b2bActiveProviderName');
        if(docName) docName.innerText = "Proveedor Vacío";
        const docCount = document.getElementById('b2bActiveItemCount');
        if(docCount) docCount.innerText = "0 ítems";
    }
};

\`;

if(jsRenderRegex.test(js)) {
    js = js.replace(jsRenderRegex, newRender);
    console.log("Patched render function inside JS");
}

const jsPdfRegex = /window\\.generateB2BPdf = async function\\(\\)[\\s\\S]*?(?=else \\{)/;
const newPdf = \`window.generateB2BPdf = async function() {
    const cart = getB2BCart();
    const pid = window.activeB2BProvider;
    if(!cart || !pid) return;
    
    const activeItems = cart.filter(x => x.proveedor_id === pid);
    if(activeItems.length === 0) return;
    
    const docType = document.getElementById('b2bDocType').value;
    const provName = activeItems[0].proveedor_nombre;
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    
    const tableBody = [];
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
        let kgMult = 1;
        const unitLabel = i.unidad_medida || '';
        const matchList = String(unitLabel).match(/[\\\\d.,]+/g);
        if (matchList && matchList.length > 0) {
            kgMult = parseFloat(matchList[matchList.length - 1].replace(',', '.'));
            if (isNaN(kgMult) || kgMult <= 0) kgMult = 1;
        }
        let isKg = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');
        
        const price = parseFloat(i.precio_unitario) || 0;
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
                            { text: 'Emisor:\\n', style: 'boldText' },
                            'LAMDA Motorhome\\n',
                            'Departamentos de Compras'
                        ]
                    },
                    {
                        width: '50%',
                        text: [
                            { text: 'Proveedor Receptor:\\n', style: 'boldText' },
                            provName + '\\n',
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
                text: 'Notas Adicionales:\\nEl total de Kilogramos/Litros requeridos de insumos pesados asume: ' + sumKg.toFixed(2) + ' Kg/Lt',
                style: 'footerNotes',
                margin: [0, 20, 0, 0]
            },
            {
                text: 'Este documento ha sido generado de manera automática y electrónica.',
                style: 'footerNotes',
                margin: [0, 20, 0, 0]
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
        
        pdfMake.createPdf(docDefinition).download(docType.replace(/[\\\\s]+/g, '_') + '_' + provName.replace(/[\\\\s]+/g, '_') + '_' + dateStr.replace(/[\\\\/]+/g, '') + '.pdf');
        
        if (window.Swal) window.Swal.fire({ icon: 'success', title: 'PDF Generado', text: 'El documento se ha descargado y el pedido ha sido procesado.', background: '#0f172a', color: '#10b981'});
        
        let newCart = cart.filter(x => x.proveedor_id !== pid);
        saveB2BCart(newCart);
        window.activeB2BProvider = null;
        window.renderB2BProviders();
        if (window.updateB2BItemIndicator) window.updateB2BItemIndicator();
    }
\`;

if(jsPdfRegex.test(js)) {
    js = js.replace(jsPdfRegex, newPdf);
    console.log("Patched pdf generation");
}

fs.writeFileSync('src/views/js/pedidos_b2b_ui.js', js);
