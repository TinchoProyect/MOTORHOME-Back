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
                    <div class="flex flex-col items-end gap-2">
                        <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <i data-lucide="landmark" class="w-5 h-5 text-amber-500"></i>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.imprimirCuentaCorriente('${providerName.replace(/'/g, "\\'")}')" class="px-3 py-1 bg-slate-600/20 hover:bg-slate-600/40 text-slate-300 border border-slate-500/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1" title="Exportar a PDF / Imprimir Estado de Cuenta">
                                <i data-lucide="printer" class="w-3 h-3"></i> Imprimir PDF
                            </button>
                            <button onclick="window.abrirModalPagoEfectivo('${providerId}', '${providerName.replace(/'/g, "\\'")}')" class="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1">
                                <i data-lucide="banknote" class="w-3 h-3"></i> Pago Efectivo
                            </button>
                        </div>
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
                                <th class="p-2 text-center w-20">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="cc_tbody_movimientos" class="divide-y divide-slate-800 text-slate-300">
                            <tr><td colspan="6" class="p-4 text-center">Cargando...</td></tr>
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

                window.currentCCData = data; // Save globally for PDF printing

                // Render Saldo
                const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
                document.getElementById('cc_saldo_total').innerText = formatter.format(data.saldoTotal);
                
                // Render Movimientos
                const tbMovs = document.getElementById('cc_tbody_movimientos');
                if (data.movimientos.length === 0) {
                    tbMovs.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No hay movimientos financieros registrados.</td></tr>';
                } else {
                    tbMovs.innerHTML = data.movimientos.map(m => {
                        const date = new Date(m.fecha_movimiento).toLocaleDateString('es-AR');
                        const fact = m.facturas_raw ? `${m.facturas_raw.tipo_comprobante} ${m.facturas_raw.punto_venta}-${m.facturas_raw.numero_comprobante}` : '-';
                        const isOmitido = m.es_omitido;
                        
                        const rowClass = isOmitido ? 'opacity-50 line-through bg-slate-900/80 hover:bg-slate-800/80' : 'hover:bg-slate-800/50';
                        const tagHtml = isOmitido ? '<br><span class="text-[9px] bg-slate-700 px-1 rounded text-slate-300 no-underline inline-block mt-1">OMITIDO</span>' : '';
                        
                        return `
                            <tr class="${rowClass}">
                                <td class="p-2 font-mono text-[10px] text-slate-400">${date}</td>
                                <td class="p-2 font-bold">${m.tipo_movimiento} ${tagHtml}</td>
                                <td class="p-2 text-slate-400">${fact}</td>
                                <td class="p-2 text-right text-red-400 font-mono">${m.monto_credito > 0 ? formatter.format(m.monto_credito) : '-'}</td>
                                <td class="p-2 text-right text-emerald-400 font-mono">${m.monto_debito > 0 ? formatter.format(m.monto_debito) : '-'}</td>
                                <td class="p-2 text-center">
                                    <button onclick="window.toggleOmitirMovimiento('${m.id}', ${isOmitido}, '${providerId}', '${providerName}')" 
                                            class="p-1 rounded ${isOmitido ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'}" 
                                            title="${isOmitido ? 'Restaurar Saldo' : 'Omitir del Saldo (Histórico)'}">
                                        <i data-lucide="${isOmitido ? 'rotate-ccw' : 'eye-off'}" class="w-4 h-4"></i>
                                    </button>
                                </td>
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

                if (window.lucide) window.lucide.createIcons();

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

window.toggleOmitirMovimiento = async function(movId, currentState, providerId, providerName) {
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const newState = !currentState;
        const res = await fetch(backendBaseUrl + '/api/cuenta-corriente/' + movId + '/omitir', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ es_omitido: newState })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Recargar el modal para actualizar el saldo y la tabla visualmente
        window.openCuentaCorriente(providerId, providerName);
    } catch(err) {
        console.error('Error al cambiar estado de omision:', err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, background: '#0f172a', color: '#f8fafc' });
    }
};

window.abrirModalPagoEfectivo = async function(providerId, providerName) {
    const today = new Date().toISOString().split('T')[0];
    const { value: formValues } = await Swal.fire({
        title: 'Registrar Pago en Efectivo',
        html: `
            <div class="flex flex-col gap-4 text-left">
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha del Pago</label>
                    <input type="date" id="pago_efectivo_fecha" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-white" value="${today}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Monto Abonado ($)</label>
                    <input type="number" step="0.01" id="pago_efectivo_monto" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-white" placeholder="0.00">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Observaciones / Ref.</label>
                    <input type="text" id="pago_efectivo_obs" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-white" placeholder="Ej. Pago a fletero, recibo N°...">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Registrar Pago',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#059669',
        background: '#0f172a',
        color: '#f8fafc',
        preConfirm: () => {
            const fecha = document.getElementById('pago_efectivo_fecha').value;
            const monto = document.getElementById('pago_efectivo_monto').value;
            const obs = document.getElementById('pago_efectivo_obs').value;
            if (!fecha || !monto || parseFloat(monto) <= 0) {
                Swal.showValidationMessage('Debe ingresar una fecha y un monto mayor a 0');
                return false;
            }
            return { fecha, monto, obs };
        }
    });

    if (formValues) {
        try {
            const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            
            Swal.fire({
                title: 'Registrando...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); },
                background: '#0f172a', color: '#f8fafc'
            });

            const res = await fetch(backendBaseUrl + '/api/cuenta-corriente/efectivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proveedor_id: providerId,
                    fecha_pago: formValues.fecha,
                    monto_pago: formValues.monto,
                    observaciones: formValues.obs
                })
            });
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            Swal.fire({ icon: 'success', title: 'Pago Registrado', timer: 1500, showConfirmButton: false, background: '#0f172a', color: '#f8fafc' });
            
            setTimeout(() => {
                window.openCuentaCorriente(providerId, providerName);
            }, 1500);

        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message, background: '#0f172a', color: '#f8fafc' });
        }
    }
};

window.imprimirCuentaCorriente = function(providerName) {
    if (!window.currentCCData || !window.currentCCData.movimientos) {
        Swal.fire('Error', 'No hay datos cargados para imprimir.', 'error');
        return;
    }
    
    const data = window.currentCCData;
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    
    let rowsHtml = '';
    data.movimientos.forEach(m => {
        if (m.es_omitido) return; // Excluimos los omitidos del reporte formal
        
        const date = new Date(m.fecha_movimiento).toLocaleDateString('es-AR');
        let fact = m.facturas_raw ? `${m.facturas_raw.tipo_comprobante} ${m.facturas_raw.punto_venta}-${m.facturas_raw.numero_comprobante}` : '-';
        if (m.observaciones && m.observaciones.includes('Lote')) fact += ' (Lote)';
        
        const cred = m.monto_credito > 0 ? formatter.format(m.monto_credito) : '';
        const deb = m.monto_debito > 0 ? formatter.format(m.monto_debito) : '';
        
        rowsHtml += `
            <tr class="border-b border-gray-200 text-sm hover:bg-gray-50">
                <td class="py-3 px-2 text-gray-600 font-mono text-xs">${date}</td>
                <td class="py-3 px-2 font-bold text-gray-800 text-xs">${m.tipo_movimiento}</td>
                <td class="py-3 px-2 text-gray-600 text-xs">${fact}</td>
                <td class="py-3 px-2 text-right text-red-600 font-mono">${cred}</td>
                <td class="py-3 px-2 text-right text-green-600 font-mono">${deb}</td>
            </tr>
        `;
    });
    
    if (!rowsHtml) {
        rowsHtml = `<tr><td colspan="5" class="py-6 text-center text-gray-500 italic">No hay movimientos registrados.</td></tr>`;
    }

    const printWin = window.open('', '_blank');
    const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Estado de Cuenta - ${providerName}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    @page { margin: 15mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body class="bg-white text-gray-900 p-8 font-sans">
            <div class="max-w-4xl mx-auto">
                <div class="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900 uppercase tracking-tight">Estado de Cuenta</h1>
                        <h2 class="text-xl text-gray-600 mt-1 font-semibold">${providerName}</h2>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-gray-500 uppercase tracking-widest mb-1">Fecha de Emisión</p>
                        <p class="font-mono font-bold text-lg">${new Date().toLocaleDateString('es-AR')}</p>
                    </div>
                </div>
                
                <div class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200 flex justify-between items-center">
                    <div>
                        <p class="text-sm text-gray-500 uppercase tracking-widest font-bold">Saldo Deudor Total</p>
                        <p class="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">Sujeto a conciliación final por ambas partes</p>
                    </div>
                    <div class="text-4xl font-mono font-bold text-gray-900">
                        ${formatter.format(data.saldoTotal)}
                    </div>
                </div>
                
                <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wide border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    Detalle de Movimientos Financieros
                </h3>
                
                <table class="w-full text-left border-collapse mb-12">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 text-[10px] uppercase tracking-wider border-y border-gray-300">
                            <th class="py-3 px-2 font-bold">Fecha</th>
                            <th class="py-3 px-2 font-bold">Concepto</th>
                            <th class="py-3 px-2 font-bold">Comprobante / Ref.</th>
                            <th class="py-3 px-2 font-bold text-right">Crédito (+)</th>
                            <th class="py-3 px-2 font-bold text-right">Débito (-)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                
                <div class="pt-6 border-t border-gray-300 text-[10px] text-gray-500 text-center max-w-2xl mx-auto">
                    <p class="font-bold text-gray-600 mb-1">DOCUMENTO GENERADO AUTOMÁTICAMENTE POR SISTEMA DE GESTIÓN LAMDA.</p>
                    <p>Las "Notas de Débito Internas" reflejadas en este reporte representan diferencias a favor de LAMDA (por devoluciones, sobreprecios o faltantes conciliados) y operan como saldo compensatorio a la espera de la emisión formal de la Nota de Crédito correspondiente por parte de su firma.</p>
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        // Descomentar si se desea que se cierre automáticamente tras imprimir:
                        // window.close(); 
                    }, 500);
                }
            </script>
        </body>
        </html>
    `;
    
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
};
