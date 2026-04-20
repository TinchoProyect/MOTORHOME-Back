const fs = require('fs');

// ==== 1. Patch HTML UI ====
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// Title change
html = html.replace('Generar Pedidos (B2B Checkout)', 'Gestión de Pedidos (B2B Checkout)');
html = html.replace('<button onclick="if(window.openB2BCheckout) window.openB2BCheckout(); else alert(\\'Módulo de pedidos en inicialización...\\');" class="submenu-item text-left py-2 text-[11px] text-slate-500 hover:text-blue-400 text-xs">Generar pedidos</button>', '<button onclick="if(window.openB2BCheckout) window.openB2BCheckout(); else alert(\\'Módulo de pedidos en inicialización...\\');" class="submenu-item text-left py-2 text-[11px] text-slate-500 hover:text-blue-400 text-xs">Gestión de Pedidos</button>');

// Panel widths
html = html.replace('w-1/3 border-r border-slate-800 bg-slate-900/50 p-4', 'w-1/4 border-r border-slate-800 bg-slate-900/50 p-4');

const tHStart = '<table class="w-full text-left border-collapse whitespace-nowrap">';
const newHeaders = tHStart + '\\n' +
'                            <thead class="bg-slate-950/40 sticky top-0 z-10 backdrop-blur-md">\\n' +
'                                <tr>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Cód / SKU</th>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción</th>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Precio Ref.</th>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-slate-800 text-center w-32 bg-emerald-900/10">Cantidad</th>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 text-center">KG Totales</th>\\n' +
'                                    <th class="p-3 text-[10px] font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800 text-right">Precio Total</th>\\n' +
'                                </tr>\\n' +
'                            </thead>\\n' +
'                            <tbody id="b2bItemsBody">\\n' +
'                                <!-- Rehydrated via JS -->\\n' +
'                            </tbody>\\n' +
'                            <tfoot id="b2bFooter" class="bg-slate-950/80 sticky bottom-0 hidden backdrop-blur-md">\\n' +
'                                <tr>\\n' +
'                                    <td colspan="4" class="p-4 text-xs font-bold text-slate-400 text-right uppercase tracking-widest border-t border-slate-800">Totales Estimados</td>\\n' +
'                                    <td class="p-4 text-sm font-bold text-blue-400 text-center border-t border-slate-800" id="b2bTotalKg">0.00 Kg</td>\\n' +
'                                    <td class="p-4 text-sm font-bold text-purple-400 text-right border-t border-slate-800" id="b2bTotalPrice">$0.00</td>\\n' +
'                                </tr>\\n' +
'                            </tfoot>\\n' +
'                        </table>';

const tRegex = /<table class="w-full text-left border-collapse whitespace-nowrap">[\s\S]*?<\/tbody>\s*<\/table>/;
if(tRegex.test(html)) {
    html = html.replace(tRegex, newHeaders);
    console.log("Patched HTML Table and Footer");
} else {
    console.log("Failed to patch HTML Table");
}

fs.writeFileSync('src/views/monitor_proveedores.html', html);


// ==== 2. Patch JS Controller ====
let js = fs.readFileSync('src/views/js/pedidos_b2b_ui.js', 'utf8');

const jsRenderRegex = /window\.renderB2BActiveItems = function\(\) \{[\s\S]*?(?=window\.updateB2BQty = function)/;
const newRender = "window.renderB2BActiveItems = function() {\\n" +
"    const cart = getB2BCart();\\n" +
"    const pid = window.activeB2BProvider;\\n" +
"    const emptyState = document.getElementById('b2bEmptyState');\\n" +
"    const tbody = document.getElementById('b2bItemsBody');\\n" +
"    const footer = document.getElementById('b2bFooter');\\n" +
"    const headerOpts = document.getElementById('b2bGenerateOptions');\\n" +
"    \\n" +
"    if(!pid) return;\\n" +
"    \\n" +
"    const activeItems = cart.filter(x => x.proveedor_id === pid);\\n" +
"    \\n" +
"    if(activeItems.length > 0) {\\n" +
"        document.getElementById('b2bActiveProviderName').innerText = activeItems[0].proveedor_nombre;\\n" +
"        document.getElementById('b2bActiveItemCount').innerText = activeItems.length + ' ítems listos para emisión';\\n" +
"        if(headerOpts) headerOpts.style.display = 'flex';\\n" +
"        if(emptyState) emptyState.classList.add('hidden');\\n" +
"        if(footer) footer.classList.remove('hidden');\\n" +
"        \\n" +
"        let sumKg = 0;\\n" +
"        let sumPrice = 0;\\n" +
"        \\n" +
"        tbody.innerHTML = '';\\n" +
"        activeItems.forEach(item => {\\n" +
"            const tr = document.createElement('tr');\\n" +
"            tr.className = 'hover:bg-slate-800/30 border-b border-slate-800/50';\\n" +
"            \\n" +
"            const priceRef = parseFloat(item.precio_unitario) || 0;\\n" +
"            const qty = parseInt(item.cantidad) || 1;\\n" +
"            \\n" +
"            let unitLabel = item.unidad_medida || '';\\n" +
"            let kgMult = 1;\\n" +
"            const matchList = String(unitLabel).match(/[\\\\d.,]+/g);\\n" +
"            if (matchList && matchList.length > 0) {\\n" +
"                kgMult = parseFloat(matchList[matchList.length - 1].replace(',', '.'));\\n" +
"                if (isNaN(kgMult) || kgMult <= 0) kgMult = 1;\\n" +
"            }\\n" +
"            \\n" +
"            let isKgOrLts = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');\\n" +
"            const totalItemKg = qty * kgMult;\\n" +
"            const totalItemPrice = qty * priceRef;\\n" +
"            \\n" +
"            if(isKgOrLts) sumKg += totalItemKg;\\n" +
"            sumPrice += totalItemPrice;\\n" +
"            \\n" +
"            tr.innerHTML = '<td>' + item.codigo_producto + '</td>'; // placeholder for string literal\\n" +
"            tr.innerHTML = '\\n" +
"                <td class=\"p-3 text-xs font-mono text-slate-400\">' + item.codigo_producto + '</td>\\n" +
"                <td class=\"p-3 text-xs font-bold text-slate-200 whitespace-normal min-w-[200px]\">' + item.producto_descripcion + '</td>\\n" +
"                <td class=\"p-3 text-xs text-slate-400 text-right\">$' + priceRef.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' <span class=\"text-[9px] uppercase tracking-widest block opacity-50\">' + unitLabel + '</span></td>\\n" +
"                <td class=\"p-3 bg-emerald-900/10 border-l border-emerald-900/30\">\\n" +
"                    <div class=\"flex items-center justify-center gap-1\">\\n" +
"                        <button onclick=\"window.updateB2BQty(\\'' + item._system_id + '\\', -1)\" class=\"w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors\">-</button>\\n" +
"                        <input type=\"number\" onchange=\"window.setB2BQty(\\'' + item._system_id + '\\', this.value)\" value=\"' + qty + '\" class=\"w-14 bg-slate-950 border border-slate-700 text-center text-emerald-400 font-bold px-1 py-1 outline-none rounded focus:border-emerald-500 hide-arrows\" />\\n" +
"                        <button onclick=\"window.updateB2BQty(\\'' + item._system_id + '\\', 1)\" class=\"w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-colors\">+</button>\\n" +
"                    </div>\\n" +
"                    <div class=\"text-center mt-1\"><button onclick=\"window.removeB2BItem(\\'' + item._system_id + '\\')\" class=\"text-[9px] text-rose-500 hover:text-rose-400 uppercase tracking-widest\">Eliminar</button></div>\\n" +
"                </td>\\n" +
"                <td class=\"p-3 text-xs font-bold text-blue-400 text-center bg-blue-900/10\">' + (isKgOrLts ? totalItemKg.toFixed(2) + ' Kg/Lt' : '--') + '</td>\\n" +
"                <td class=\"p-3 text-sm font-bold text-purple-400 text-right bg-purple-900/10\">$' + totalItemPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>\\n" +
"            ';\\n" +
"            tbody.appendChild(tr);\\n" +
"        });\\n" +
"        \\n" +
"        document.getElementById('b2bTotalKg').innerText = sumKg > 0 ? sumKg.toFixed(2) + ' Kg/Lt' : '--';\\n" +
"        document.getElementById('b2bTotalPrice').innerText = '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});\\n" +
"        \\n" +
"    } else {\\n" +
"        if(emptyState) emptyState.classList.remove('hidden');\\n" +
"        if(tbody) tbody.innerHTML = '';\\n" +
"        if(footer) footer.classList.add('hidden');\\n" +
"        if(headerOpts) headerOpts.style.display = 'none';\\n" +
"        const docName = document.getElementById('b2bActiveProviderName');\\n" +
"        if(docName) docName.innerText = 'Proveedor Vacío';\\n" +
"        const docCount = document.getElementById('b2bActiveItemCount');\\n" +
"        if(docCount) docCount.innerText = '0 ítems';\\n" +
"    }\\n" +
"};\\n\\n";

if(jsRenderRegex.test(js)) {
    js = js.replace(jsRenderRegex, newRender);
    console.log("Patched render function inside JS");
}

const jsPdfRegex = /window\.generateB2BPdf = async function\(\) \{[\s\S]*?(?=else \{)/;
const newPdf = "window.generateB2BPdf = async function() {\\n" +
"    const cart = getB2BCart();\\n" +
"    const pid = window.activeB2BProvider;\\n" +
"    if(!cart || !pid) return;\\n" +
"    \\n" +
"    const activeItems = cart.filter(x => x.proveedor_id === pid);\\n" +
"    if(activeItems.length === 0) return;\\n" +
"    \\n" +
"    const docType = document.getElementById('b2bDocType').value;\\n" +
"    const provName = activeItems[0].proveedor_nombre;\\n" +
"    const now = new Date();\\n" +
"    const dateStr = now.toLocaleDateString();\\n" +
"    \\n" +
"    const tableBody = [];\\n" +
"    tableBody.push([\\n" +
"        { text: 'Código', style: 'tableHeader' },\\n" +
"        { text: 'Descripción', style: 'tableHeader' },\\n" +
"        { text: 'Unidad Ref.', style: 'tableHeader', alignment: 'center' },\\n" +
"        { text: 'Precio U.', style: 'tableHeader', alignment: 'right' },\\n" +
"        { text: 'Cant. Pedida', style: 'tableHeader', alignment: 'center' },\\n" +
"        { text: 'Subtotal', style: 'tableHeader', alignment: 'right' }\\n" +
"    ]);\\n" +
"    \\n" +
"    let sumKg = 0;\\n" +
"    let sumPrice = 0;\\n" +
"    \\n" +
"    activeItems.forEach(i => {\\n" +
"        let kgMult = 1;\\n" +
"        const unitLabel = i.unidad_medida || '';\\n" +
"        const matchList = String(unitLabel).match(/[\\\\d.,]+/g);\\n" +
"        if (matchList && matchList.length > 0) {\\n" +
"            kgMult = parseFloat(matchList[matchList.length - 1].replace(',', '.'));\\n" +
"            if (isNaN(kgMult) || kgMult <= 0) kgMult = 1;\\n" +
"        }\\n" +
"        let isKg = unitLabel.toLowerCase().includes('kg') || unitLabel.toLowerCase().includes('lt') || unitLabel.toLowerCase().includes('kilo');\\n" +
"        \\n" +
"        const price = parseFloat(i.precio_unitario) || 0;\\n" +
"        const qty = parseInt(i.cantidad) || 1;\\n" +
"        \\n" +
"        const totalKg = qty * kgMult;\\n" +
"        const totalPrc = qty * price;\\n" +
"        \\n" +
"        if (isKg) sumKg += totalKg;\\n" +
"        sumPrice += totalPrc;\\n" +
"        \\n" +
"        tableBody.push([\\n" +
"            { text: i.codigo_producto, style: 'tableRow' },\\n" +
"            { text: i.producto_descripcion, style: 'tableRowDesc' },\\n" +
"            { text: unitLabel, style: 'tableRow', alignment: 'center' },\\n" +
"            { text: '$' + price.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRow', alignment: 'right' },\\n" +
"            { text: String(qty), style: 'tableRowQty', alignment: 'center' },\\n" +
"            { text: '$' + totalPrc.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableRowBoxed', alignment: 'right' }\\n" +
"        ]);\\n" +
"    });\\n" +
"    \\n" +
"    tableBody.push([\\n" +
"        { text: 'TOTAL GENERAL', style: 'tableFooterMsg', colSpan: 5, alignment: 'right' },\\n" +
"        {}, {}, {}, {},\\n" +
"        { text: '$' + sumPrice.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}), style: 'tableFooterSum', alignment: 'right' }\\n" +
"    ]);\\n" +
"    \\n" +
"    const docDefinition = {\\n" +
"        content: [\\n" +
"            { text: 'Sistema de Aprovisionamiento LAMDA', style: 'topHeader', alignment: 'right' },\\n" +
"            { text: docType.toUpperCase(), style: 'mainTitle' },\\n" +
"            {\\n" +
"                columns: [\\n" +
"                    {\\n" +
"                        width: '50%',\\n" +
"                        text: [\\n" +
"                            { text: 'Emisor:\\\\n', style: 'boldText' },\\n" +
"                            'LAMDA Motorhome\\\\n',\\n" +
"                            'Departamentos de Compras'\\n" +
"                        ]\\n" +
"                    },\\n" +
"                    {\\n" +
"                        width: '50%',\\n" +
"                        text: [\\n" +
"                            { text: 'Proveedor Receptor:\\\\n', style: 'boldText' },\\n" +
"                            provName + '\\\\n',\\n" +
"                            'Fecha: ' + dateStr\\n" +
"                        ],\\n" +
"                        alignment: 'right'\\n" +
"                    }\\n" +
"                ],\\n" +
"                margin: [0, 0, 0, 30]\\n" +
"            },\\n" +
"            {\\n" +
"                table: {\\n" +
"                    headerRows: 1,\\n" +
"                    widths: ['15%', '40%', '15%', '10%', '8%', '12%'],\\n" +
"                    body: tableBody\\n" +
"                },\\n" +
"                layout: {\\n" +
"                    hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 2 : 1; },\\n" +
"                    vLineWidth: function (i, node) { return 0; },\\n" +
"                    hLineColor: function (i, node) { return (i === 0 || i === node.table.body.length || i === 1 || i === node.table.body.length - 1) ? 'black' : '#e2e8f0'; },\\n" +
"                    paddingLeft: function(i, node) { return 4; },\\n" +
"                    paddingRight: function(i, node) { return 4; },\\n" +
"                    paddingTop: function(i, node) { return 6; },\\n" +
"                    paddingBottom: function(i, node) { return 6; }\\n" +
"                }\\n" +
"            },\\n" +
"            {\\n" +
"                text: 'Notas Adicionales:\\\\nEl total de Kilogramos/Litros requeridos de insumos pesados asume: ' + sumKg.toFixed(2) + ' Kg/Lt',\\n" +
"                style: 'footerNotes',\\n" +
"                margin: [0, 20, 0, 0]\\n" +
"            },\\n" +
"            {\\n" +
"                text: 'Este documento ha sido generado de manera automática y electrónica.',\\n" +
"                style: 'footerNotes',\\n" +
"                margin: [0, 20, 0, 0]\\n" +
"            }\\n" +
"        ],\\n" +
"        styles: {\\n" +
"            topHeader: { fontSize: 8, color: '#666666' },\\n" +
"            mainTitle: { fontSize: 22, bold: true, margin: [0, 20, 0, 20], color: '#0f172a' },\\n" +
"            boldText: { bold: true, fontSize: 11, color: '#334155' },\\n" +
"            tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#334155', margin: [0, 4, 0, 4] },\\n" +
"            tableRow: { fontSize: 8, color: '#475569'},\\n" +
"            tableRowDesc: { fontSize: 8, color: '#0f172a', bold: true },\\n" +
"            tableRowQty: { fontSize: 10, color: '#0f172a', bold: true },\\n" +
"            tableRowBoxed: { fontSize: 9, color: '#0f172a', bold: true },\\n" +
"            tableFooterMsg: { fontSize: 10, bold: true, color: '#0f172a', margin: [0, 6, 0, 6] },\\n" +
"            tableFooterSum: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 6, 0, 6] },\\n" +
"            footerNotes: { fontSize: 8, italics: true, color: '#94a3b8' }\\n" +
"        },\\n" +
"        defaultStyle: {\\n" +
"            font: 'Roboto'\\n" +
"        }\\n" +
"    };\\n" +
"\\n" +
"    if(window.pdfMake) {\\n" +
"        const dbPayload = {\\n" +
"            proveedor_id: pid,\\n" +
"            tipo_documento: docType,\\n" +
"            items: activeItems.map(i => ({ \\n" +
"                producto_codigo: i.codigo_producto, \\n" +
"                producto_descripcion: i.producto_descripcion,\\n" +
"                cantidad: i.cantidad,\\n" +
"                valor_unitario_ref: i.precio_unitario,\\n" +
"                unidad_ref: i.unidad_medida\\n" +
"            }))\\n" +
"        };\\n" +
"        \\n" +
"        try {\\n" +
"            fetch('http://localhost:5655/api/b2b/generar', {\\n" +
"                method: 'POST',\\n" +
"                headers: { 'Content-Type': 'application/json' },\\n" +
"                body: JSON.stringify(dbPayload)\\n" +
"            });\\n" +
"        } catch(e) {}\\n" +
"        \\n" +
"        pdfMake.createPdf(docDefinition).download(docType.replace(/[\\\\s]+/g, '_') + '_' + provName.replace(/[\\\\s]+/g, '_') + '_' + dateStr.replace(/[\\\\/]+/g, '') + '.pdf');\\n" +
"        \\n" +
"        if (window.Swal) window.Swal.fire({ icon: 'success', title: 'PDF Generado', text: 'El documento se ha descargado y el pedido ha sido procesado.', background: '#0f172a', color: '#10b981'});\\n" +
"        \\n" +
"        let newCart = cart.filter(x => x.proveedor_id !== pid);\\n" +
"        saveB2BCart(newCart);\\n" +
"        window.activeB2BProvider = null;\\n" +
"        window.renderB2BProviders();\\n" +
"        if (window.updateB2BItemIndicator) window.updateB2BItemIndicator();\\n" +
"    }\\n";

if (jsPdfRegex.test(js)) {
    js = js.replace(jsPdfRegex, newPdf);
    console.log("Patched pdf generation");
}

fs.writeFileSync('src/views/js/pedidos_b2b_ui.js', js);
