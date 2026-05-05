window.openCuentaCorriente = async function(providerId, providerName) {
    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

    Swal.fire({
        title: `Cuenta Corriente: ${providerName}`,
        html: `
            <div class="flex flex-col text-left gap-4" style="min-height: 400px;">
                <!-- Widget Saldo -->
                <div class="flex items-center justify-between p-4 bg-slate-900 rounded-xl border border-slate-700">
                    <div>
                        <p class="text-xs text-slate-400 font-mono tracking-widest uppercase">Saldo Deudor Total</p>
                        <h3 id="cc_saldo_total" class="text-4xl font-bold text-amber-500 font-mono">Cargando...</h3>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <i data-lucide="landmark" class="w-6 h-6 text-amber-500"></i>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="flex border-b border-slate-700 mb-2">
                    <button id="tab_cc_movimientos" class="px-4 py-2 border-b-2 border-amber-500 text-amber-400 text-sm font-bold tracking-wide flex items-center gap-2" onclick="switchCCTab('movimientos')">
                        <i data-lucide="arrow-left-right" class="w-4 h-4"></i> Movimientos
                    </button>
                    <button id="tab_cc_recepciones" class="px-4 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-300 text-sm font-bold tracking-wide flex items-center gap-2" onclick="switchCCTab('recepciones')">
                        <i data-lucide="package-check" class="w-4 h-4"></i> Logística Conciliada
                    </button>
                </div>

                <!-- Content -->
                <div id="cc_content_movimientos" class="overflow-y-auto max-h-[400px] custom-scrollbar border border-slate-800 rounded bg-slate-900/50">
                    <table class="w-full text-xs text-left">
                        <thead class="sticky top-0 bg-slate-800 text-slate-400 font-mono">
                            <tr>
                                <th class="p-2">Fecha</th>
                                <th class="p-2">Concepto</th>
                                <th class="p-2">Factura</th>
                                <th class="p-2 text-right">Crédito (+)</th>
                                <th class="p-2 text-right">Débito (-)</th>
                            </tr>
                        </thead>
                        <tbody id="cc_tbody_movimientos" class="divide-y divide-slate-800 text-slate-300">
                            <tr><td colspan="5" class="p-4 text-center">Cargando...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div id="cc_content_recepciones" class="hidden overflow-y-auto max-h-[400px] custom-scrollbar border border-slate-800 rounded bg-slate-900/50">
                    <table class="w-full text-xs text-left">
                        <thead class="sticky top-0 bg-slate-800 text-slate-400 font-mono">
                            <tr>
                                <th class="p-2">Fecha</th>
                                <th class="p-2">Nº Remito</th>
                                <th class="p-2">Pedido B2B</th>
                                <th class="p-2 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody id="cc_tbody_recepciones" class="divide-y divide-slate-800 text-slate-300">
                            <tr><td colspan="4" class="p-4 text-center">Cargando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `,
        width: '800px',
        background: '#0f172a',
        color: '#f8fafc',
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#334155',
        didOpen: async () => {
            if (window.lucide) window.lucide.createIcons();
            
            try {
                const res = await fetch(`${backendBaseUrl}/api/cuenta-corriente/proveedor/${providerId}`);
                const data = await res.json();
                
                if (!data.success) throw new Error(data.error);

                // Render Saldo
                const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
                document.getElementById('cc_saldo_total').innerText = formatter.format(data.saldoTotal);
                
                // Render Movimientos
                const tbMovs = document.getElementById('cc_tbody_movimientos');
                if (data.movimientos.length === 0) {
                    tbMovs.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">No hay movimientos financieros registrados.</td></tr>';
                } else {
                    tbMovs.innerHTML = data.movimientos.map(m => {
                        const date = new Date(m.fecha_movimiento).toLocaleDateString('es-AR');
                        const fact = m.facturas_raw ? `${m.facturas_raw.tipo_comprobante} ${m.facturas_raw.punto_venta}-${m.facturas_raw.numero_comprobante}` : '-';
                        return `
                            <tr class="hover:bg-slate-800/50">
                                <td class="p-2 font-mono text-[10px] text-slate-400">${date}</td>
                                <td class="p-2 font-bold">${m.tipo_movimiento}</td>
                                <td class="p-2 text-slate-400">${fact}</td>
                                <td class="p-2 text-right text-red-400 font-mono">${m.monto_credito > 0 ? formatter.format(m.monto_credito) : '-'}</td>
                                <td class="p-2 text-right text-emerald-400 font-mono">${m.monto_debito > 0 ? formatter.format(m.monto_debito) : '-'}</td>
                            </tr>
                        `;
                    }).join('');
                }

                // Render Recepciones
                const tbRec = document.getElementById('cc_tbody_recepciones');
                if (!data.recepciones || data.recepciones.length === 0) {
                    tbRec.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 italic">No hay recepciones logísticas conciliadas.</td></tr>';
                } else {
                    tbRec.innerHTML = data.recepciones.map(r => {
                        const date = new Date(r.fecha_recepcion).toLocaleDateString('es-AR');
                        const pedido = r.pedidos_b2b_cabecera ? r.pedidos_b2b_cabecera.codigo : '-';
                        return `
                            <tr class="hover:bg-slate-800/50">
                                <td class="p-2 font-mono text-[10px] text-slate-400">${date}</td>
                                <td class="p-2 font-bold text-slate-300">${r.numero_remito || 'S/R'}</td>
                                <td class="p-2 text-blue-400 font-mono">${pedido}</td>
                                <td class="p-2 text-center">
                                    <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${r.estado_conciliacion === 'CONCILIADA' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}">
                                        ${r.estado_conciliacion}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }

            } catch (err) {
                console.error(err);
                document.getElementById('cc_saldo_total').innerText = 'ERROR';
                document.getElementById('cc_tbody_movimientos').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-400">Error: ${err.message}</td></tr>`;
            }
        }
    });
};

window.switchCCTab = function(tabName) {
    const btnMovs = document.getElementById('tab_cc_movimientos');
    const btnRecs = document.getElementById('tab_cc_recepciones');
    const contentMovs = document.getElementById('cc_content_movimientos');
    const contentRecs = document.getElementById('cc_content_recepciones');

    if (tabName === 'movimientos') {
        btnMovs.className = "px-4 py-2 border-b-2 border-amber-500 text-amber-400 text-sm font-bold tracking-wide flex items-center gap-2";
        btnRecs.className = "px-4 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-300 text-sm font-bold tracking-wide flex items-center gap-2";
        contentMovs.classList.remove('hidden');
        contentRecs.classList.add('hidden');
    } else {
        btnRecs.className = "px-4 py-2 border-b-2 border-amber-500 text-amber-400 text-sm font-bold tracking-wide flex items-center gap-2";
        btnMovs.className = "px-4 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-300 text-sm font-bold tracking-wide flex items-center gap-2";
        contentRecs.classList.remove('hidden');
        contentMovs.classList.add('hidden');
    }
};
