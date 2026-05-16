// ============================================================================
// [ETAPA 3] ESCRITORIO DE CONCILIACIÓN DUAL (HITL)
// ============================================================================

window.currentConciliacion = {
    facturaId: null,
    facturaData: null,
    pedidoId: null,
    matchReport: null
};

window.openConciliacionModalMulti = async function(facturasIds) {
    if (!facturasIds || facturasIds.length === 0) return;
    if (facturasIds.length === 1) return window.openConciliacionModal(facturasIds[0]);

    if (!window.Swal) return;

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        Swal.fire({
            title: 'Ensamblando Facturas...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // 1. Obtener todas las facturas via Backend
        const facPromises = facturasIds.map(id => fetch(`${backendBaseUrl}/api/facturas/${id}`).then(res => res.json()));
        const facResults = await Promise.all(facPromises);
        
        let totalImporte = 0;
        let mergedArticulos = {};
        let numeros = [];

        facResults.forEach(res => {
            if (!res.success) throw new Error(res.error || "No se pudo obtener una factura");
            const fac = res.data;
            totalImporte += parseFloat(fac.importe_total || 0);
            if (fac.numero_comprobante) numeros.push(fac.numero_comprobante);

            (fac.articulos || []).forEach(art => {
                const key = art.codigo ? String(art.codigo).trim().toLowerCase() : String(art.descripcion).trim().toLowerCase();
                if (!mergedArticulos[key]) {
                    mergedArticulos[key] = { ...art, cantidad: 0, subtotal: 0, precio_unitario: parseFloat(art.precio_unitario || 0) };
                } else {
                    mergedArticulos[key].cantidad += parseFloat(art.cantidad || 0);
                    mergedArticulos[key].subtotal += parseFloat(art.subtotal || 0);
                    mergedArticulos[key].precio_unitario = parseFloat(art.precio_unitario || 0); // simplificacion
                }
            });
        });

        const virtualFactura = {
            id: facturasIds, // Guardamos el array como ID para la lógica posterior
            numero_comprobante: numeros.join(' + '),
            importe_total: totalImporte,
            fecha_emision: facResults[0].data.fecha_emision,
            articulos: Object.values(mergedArticulos)
        };

        window.currentConciliacion.facturaId = facturasIds;
        window.currentConciliacion.facturaData = virtualFactura;
        window.currentConciliacion.pedidoId = null;
        window.currentConciliacion.matchReport = null;

        // 2. Obtener Historial de Recepciones via Backend
        const pid = window.currentActiveProviderId || window.globalContext?.providerId;
        const resRec = await fetch(`${backendBaseUrl}/api/recepcion/provider/${pid}`);
        const recJson = await resRec.json();
        if (!recJson.success) throw new Error(recJson.error || "No se pudieron obtener las recepciones");
        const recepciones = recJson.data;

        Swal.close();

        // 3. Renderizar Cuadrante Izquierdo (Múltiples Facturas)
        document.getElementById('concil_fac_nro').innerText = numeros.join(' + ');
        const scrollContainer = document.getElementById('concil_left_scroll');
        scrollContainer.innerHTML = '';

        facResults.forEach((res, index) => {
            const fac = res.data;
            let total = window.formatCurrency ? window.formatCurrency(fac.importe_total || 0) : (fac.importe_total || 0);
            let fecha = fac.fecha_emision ? new Date(fac.fecha_emision).toLocaleDateString() : '-';
            let num = fac.numero_comprobante || 'S/N';
            
            let html = `
                <div class="mb-6 last:mb-0">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-bold text-slate-300"><i data-lucide="file-text" class="inline w-3 h-3 mr-1 text-slate-500"></i>Factura ${num}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <span class="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Importe Total</span>
                            <span class="font-mono font-bold text-amber-400 text-lg">$ ${total}</span>
                        </div>
                        <div class="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <span class="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Fecha Emisión</span>
                            <span class="font-mono text-slate-300 text-sm">${fecha}</span>
                        </div>
                    </div>
                    <div class="bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden shadow-inner">
                        <table class="w-full text-left text-xs text-slate-300 relative">
                            <thead class="text-[9px] uppercase text-slate-500 bg-slate-900 sticky top-0 shadow-sm border-b border-slate-800">
                                <tr>
                                    <th class="px-3 py-2 font-bold">Cód.</th>
                                    <th class="px-3 py-2 font-bold w-1/2">Descripción</th>
                                    <th class="px-3 py-2 font-bold text-center">Cant.</th>
                                    <th class="px-3 py-2 font-bold text-right">P.Unit</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50">
            `;
            
            const articulos = fac.articulos || [];
            if (articulos.length === 0) {
                html += `<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">Sin detalle de artículos extraído.</td></tr>`;
            } else {
                articulos.forEach(art => {
                    let c = window.formatCurrency ? window.formatCurrency(art.cantidad || 0) : (art.cantidad || 0);
                    let p = window.formatCurrency ? window.formatCurrency(art.precio_unitario || 0) : (art.precio_unitario || 0);
                    html += `
                        <tr class="hover:bg-slate-800/30">
                            <td class="px-3 py-2 font-mono text-xs text-slate-400">${art.codigo || '-'}</td>
                            <td class="px-3 py-2 text-xs text-slate-300 line-clamp-1" title="${art.descripcion}">${art.descripcion || '-'}</td>
                            <td class="px-3 py-2 font-mono text-lg text-center text-blue-400 font-bold">${c}</td>
                            <td class="px-3 py-2 font-mono text-lg font-bold text-right text-slate-200">$${p}</td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div></div>`;
            if (index < facResults.length - 1) {
                html += `<div class="w-full h-px bg-slate-800 my-6"></div>`;
            }
            scrollContainer.innerHTML += html;
        });
        if (window.lucide) window.lucide.createIcons();

        // 4. Poblar Selector Derecho
        const sel = document.getElementById('concil_pedido_select');
        sel.innerHTML = '<option value="">-- Buscar Recepciones / Pedidos Ingresados --</option>';
        if (recepciones && recepciones.length > 0) {
            const grouped = {};
            recepciones.forEach(r => {
                const key = r.numero_remito ? `REMITO_${r.numero_remito}` : `ID_${r.id}`;
                if (!grouped[key]) {
                    grouped[key] = { ids: [], fecha_recepcion: r.fecha_recepcion, numero_remito: r.numero_remito, items: [] };
                }
                grouped[key].ids.push(r.id);
                if (r.recepciones_fisicas_items && r.recepciones_fisicas_items.length > 0) {
                    grouped[key].items.push(...r.recepciones_fisicas_items);
                }
            });

            Object.values(grouped).forEach(g => {
                const f = new Date(g.fecha_recepcion).toLocaleDateString();
                const num = g.numero_remito ? `Remito ${g.numero_remito}` : 'Recepción S/N';
                let descItems = g.items.map(i => i.pedidos_b2b_items?.producto_descripcion).filter(Boolean);
                let snippet = '';
                let fullTooltip = '';
                if (descItems.length > 0) {
                    const firstTwo = descItems.slice(0, 2).join(', ');
                    snippet = ` (${firstTwo}${descItems.length > 2 ? '...' : ''})`;
                    fullTooltip = descItems.map(d => `• ${d}`).join('&#10;');
                } else {
                    snippet = ' (Sin detalle)';
                    fullTooltip = 'Sin detalle de artículos';
                }
                const valStr = JSON.stringify(g.ids);
                sel.innerHTML += `<option value='${valStr}' title="${fullTooltip}">${num} del ${f}${snippet}</option>`;
            });
        }

        // Reset Cuadrante Derecho
        document.getElementById('concil_empty_state').classList.remove('hidden');
        document.getElementById('concil_match_content').classList.add('hidden');
        document.getElementById('btn_aprobar_conciliacion').disabled = true;
        document.getElementById('btn_aprobar_conciliacion').classList.add('cursor-not-allowed', 'opacity-50');

        // Mostrar Modal
        const overlay = document.getElementById('visorConciliacionOverlay');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);

    } catch (e) {
        console.error("Error abriendo conciliación múltiple:", e);
        Swal.fire('Error', 'No se pudo inicializar la mesa de conciliación: ' + e.message, 'error');
    }
};

window.openConciliacionModal = async function(facturaId) {

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        Swal.fire({
            title: 'Abriendo Escritorio de Conciliación...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // 1. Obtener datos de la Factura via Backend
        const resFac = await fetch(`${backendBaseUrl}/api/facturas/${facturaId}`);
        const facJson = await resFac.json();
        if (!facJson.success) throw new Error(facJson.error || "No se pudo obtener la factura");
        const factura = facJson.data;

        window.currentConciliacion.facturaId = facturaId;
        window.currentConciliacion.facturaData = factura;
        window.currentConciliacion.pedidoId = null;
        window.currentConciliacion.matchReport = null;

        // 2. Obtener Historial de Recepciones via Backend
        const pid = window.currentActiveProviderId || window.globalContext?.providerId;
        const resRec = await fetch(`${backendBaseUrl}/api/recepcion/provider/${pid}`);
        const recJson = await resRec.json();
        if (!recJson.success) throw new Error(recJson.error || "No se pudieron obtener las recepciones");
        const recepciones = recJson.data;

        Swal.close();

        // 3. Renderizar Cuadrante Izquierdo (Factura Singular)
        document.getElementById('concil_fac_nro').innerText = factura.numero_comprobante || 'S/N';
        const scrollContainer = document.getElementById('concil_left_scroll');
        scrollContainer.innerHTML = '';

        let total = window.formatCurrency ? window.formatCurrency(factura.importe_total || 0) : (factura.importe_total || 0);
        let fecha = factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString() : '-';
        let num = factura.numero_comprobante || 'S/N';
        
        let html = `
            <div class="mb-6 last:mb-0">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-bold text-slate-300"><i data-lucide="file-text" class="inline w-3 h-3 mr-1 text-slate-500"></i>Factura ${num}</span>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                        <span class="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Importe Total</span>
                        <span class="font-mono font-bold text-amber-400 text-2xl">$ ${total}</span>
                    </div>
                    <div class="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                        <span class="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Fecha Emisión</span>
                        <span class="font-mono text-slate-300 text-sm">${fecha}</span>
                    </div>
                </div>
                <div class="bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden shadow-inner">
                    <table class="w-full text-left text-xs text-slate-300 relative">
                        <thead class="text-[9px] uppercase text-slate-500 bg-slate-900 sticky top-0 shadow-sm border-b border-slate-800">
                            <tr>
                                <th class="px-3 py-2 font-bold">Cód.</th>
                                <th class="px-3 py-2 font-bold w-1/2">Descripción</th>
                                <th class="px-3 py-2 font-bold text-center">Cant.</th>
                                <th class="px-3 py-2 font-bold text-center">Factor</th>
                                <th class="px-3 py-2 font-bold text-right">P.Unit</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/50">
        `;
        
        const articulos = factura.articulos || [];
        if (articulos.length === 0) {
            html += `<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">Sin detalle de artículos extraído.</td></tr>`;
        } else {
            articulos.forEach(art => {
                let c = window.formatCurrency ? window.formatCurrency(art.cantidad || 0) : (art.cantidad || 0);
                let p = window.formatCurrency ? window.formatCurrency(art.precio_unitario || 0) : (art.precio_unitario || 0);
                html += `
                    <tr class="hover:bg-slate-800/30">
                        <td class="px-3 py-2 font-mono text-xs text-slate-400">${art.codigo || '-'}</td>
                        <td class="px-3 py-2 text-xs text-slate-300 line-clamp-1" title="${art.descripcion}">${art.descripcion || '-'}</td>
                        <td class="px-3 py-2 font-mono text-2xl text-center text-blue-400 font-bold">${c}</td>
                        <td class="px-3 py-2 font-mono text-lg text-center text-amber-500/80">x${art.factor_conversion || 1}</td>
                        <td class="px-3 py-2 font-mono text-2xl font-bold text-right text-slate-200">$${p}</td>
                    </tr>
                `;
            });
        }
        html += `</tbody></table></div></div>`;
        scrollContainer.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // 4. Poblar Selector Derecho
        const sel = document.getElementById('concil_pedido_select');
        sel.innerHTML = '<option value="">-- Buscar Recepciones / Pedidos Ingresados --</option>';
        if (recepciones && recepciones.length > 0) {
            // Agrupar recepciones por numero_remito (Virtual Grouping)
            const grouped = {};
            recepciones.forEach(r => {
                const key = r.numero_remito ? `REMITO_${r.numero_remito}` : `ID_${r.id}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        ids: [],
                        fecha_recepcion: r.fecha_recepcion,
                        numero_remito: r.numero_remito,
                        items: []
                    };
                }
                grouped[key].ids.push(r.id);
                if (r.recepciones_fisicas_items && r.recepciones_fisicas_items.length > 0) {
                    grouped[key].items.push(...r.recepciones_fisicas_items);
                }
            });

            Object.values(grouped).forEach(g => {
                const f = new Date(g.fecha_recepcion).toLocaleDateString();
                const num = g.numero_remito ? `Remito ${g.numero_remito}` : 'Recepción S/N';
                
                let descItems = g.items
                    .map(i => i.pedidos_b2b_items?.producto_descripcion)
                    .filter(Boolean);
                
                let snippet = '';
                let fullTooltip = '';
                if (descItems.length > 0) {
                    const firstTwo = descItems.slice(0, 2).join(', ');
                    snippet = ` (${firstTwo}${descItems.length > 2 ? '...' : ''})`;
                    fullTooltip = descItems.map(d => `• ${d}`).join('&#10;');
                } else {
                    snippet = ' (Sin detalle)';
                    fullTooltip = 'Sin detalle de artículos';
                }

                // Guardamos el array de IDs en el value
                const valStr = JSON.stringify(g.ids);
                sel.innerHTML += `<option value='${valStr}' title="${fullTooltip}">${num} del ${f}${snippet}</option>`;
            });
        }

        // Reset Cuadrante Derecho
        document.getElementById('concil_empty_state').classList.remove('hidden');
        document.getElementById('concil_match_content').classList.add('hidden');
        document.getElementById('btn_aprobar_conciliacion').disabled = true;
        document.getElementById('btn_aprobar_conciliacion').classList.add('cursor-not-allowed', 'opacity-50');

        // Mostrar Modal
        const overlay = document.getElementById('visorConciliacionOverlay');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);

    } catch (e) {
        console.error("Error abriendo conciliación:", e);
        Swal.fire('Error', 'No se pudo inicializar la mesa de conciliación: ' + e.message, 'error');
    }
};

window.closeVisorConciliacion = function() {
    const overlay = document.getElementById('visorConciliacionOverlay');
    overlay.classList.add('opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 300);
};

window.onConciliacionPedidoChange = async function() {
    const recepcionesIdsStr = document.getElementById('concil_pedido_select').value;
    if (!recepcionesIdsStr) {
        document.getElementById('concil_empty_state').classList.remove('hidden');
        document.getElementById('concil_match_content').classList.add('hidden');
        document.getElementById('btn_aprobar_conciliacion').disabled = true;
        document.getElementById('btn_aprobar_conciliacion').classList.add('cursor-not-allowed', 'opacity-50');
        return;
    }

    let recepcionesIds = [];
    try {
        recepcionesIds = JSON.parse(recepcionesIdsStr);
    } catch (e) {
        // Fallback for single non-JSON ID
        recepcionesIds = [recepcionesIdsStr];
    }

    window.currentConciliacion.recepcionesIds = recepcionesIds; // Actualizado a array
    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    // Simulate Match
    try {
        const isMulti = Array.isArray(window.currentConciliacion.facturaId);
        const url = isMulti 
            ? `${backendBaseUrl}/api/facturas/match-multi`
            : `${backendBaseUrl}/api/facturas/${window.currentConciliacion.facturaId}/match`;
            
        const bodyPayload = isMulti
            ? { facturasIds: window.currentConciliacion.facturaId, recepcionesIds: recepcionesIds, confirm: false }
            : { recepcionesIds: recepcionesIds, confirm: false };

        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(bodyPayload)
        });
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);

        window.currentConciliacion.matchReport = data.matchReport;
        window.currentConciliacion.unmatchedPedidoItems = data.unmatchedPedidoItems || [];

        // Render Match
        document.getElementById('concil_empty_state').classList.add('hidden');
        document.getElementById('concil_match_content').classList.remove('hidden');

        window.renderMatchReport();

    } catch (e) {
        console.error("Error validando pedido:", e);
        Swal.fire('Error de Motor', 'No se pudo procesar el cruce: ' + e.message, 'error');
    }
};

window.renderMatchReport = function() {
    const tbody = document.getElementById('concil_match_tbody');
    tbody.innerHTML = '';
    
    let errPrec = 0;
    let errCant = 0;

    window.currentConciliacion.matchReport.forEach((row, index) => {
        const hasFaltante = (row.desvios || []).some(d => d.includes('Faltante'));
        if (hasFaltante || !row.pedido) errCant++;

        const cantClass = (hasFaltante || !row.pedido) ? 'text-red-400 font-bold bg-red-500/10' : 'text-emerald-400';
        
        // Lógica de Semáforo Financiero
        let priceClass = 'text-emerald-400';
        let deltaHtml = '<span class="text-slate-500 font-mono text-2xl">-</span>';
        let statusIcon = '<i data-lucide="check" class="w-4 h-4 text-emerald-500 mx-auto" title="Match Perfecto"></i>';
        
        if (row.pedido && row.delta_monto !== undefined) {
            const deltaMonto = parseFloat(row.delta_monto);
            const deltaPct = parseFloat(row.delta_porcentaje);
            
            const isMarginal = (Math.abs(deltaPct) <= 0.5 || Math.abs(deltaMonto) <= 25.0) && deltaMonto !== 0;
            
            if (isMarginal) {
                // AMARILLO (Redondeo/Marginal)
                priceClass = 'text-amber-400 font-bold bg-amber-500/10';
                deltaHtml = `<span class="text-amber-400 font-bold font-mono text-2xl" title="Diferencia Marginal / Redondeo">${deltaMonto > 0 ? '+' : '-'}$${window.formatCurrency ? window.formatCurrency(Math.abs(deltaMonto)) : Math.abs(deltaMonto)} (${deltaPct > 0 ? '+' : ''}${deltaPct}%)</span>`;
                statusIcon = '<i data-lucide="check-circle" class="w-4 h-4 text-amber-500 mx-auto" title="Aprobado con Tolerancia"></i>';
            } else if (deltaMonto > 25.0) {
                // ROJO (Sobreprecio)
                priceClass = 'text-red-400 font-bold bg-red-500/10';
                deltaHtml = `<span class="text-red-400 font-bold font-mono text-2xl" title="Alerta: Nos cobran de más">+$${window.formatCurrency ? window.formatCurrency(deltaMonto) : deltaMonto} (+${deltaPct}%)</span>`;
                statusIcon = `<div onclick="window.confirmarConciliacion()" class="cursor-pointer hover:scale-125 transition-transform bg-red-500/20 rounded-full p-1 inline-block border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse"><i data-lucide="alert-triangle" class="w-5 h-5 text-red-500 mx-auto" title="Click para gestionar y asentar esta diferencia a favor"></i></div>`;
                errPrec++;
            } else if (deltaMonto < -25.0) {
                // VERDE (Ahorro)
                priceClass = 'text-emerald-400 font-bold bg-emerald-500/10';
                deltaHtml = `<span class="text-emerald-400 font-bold font-mono text-2xl" title="Ahorro: Nos cobran más barato">-$${window.formatCurrency ? window.formatCurrency(Math.abs(deltaMonto)) : Math.abs(deltaMonto)} (${deltaPct}%)</span>`;
                statusIcon = '<i data-lucide="check" class="w-4 h-4 text-emerald-500 mx-auto" title="Ahorro Detectado"></i>';
            } else {
                // EXACTO ($0)
                priceClass = 'text-emerald-400';
                deltaHtml = `<span class="text-emerald-400 font-mono text-2xl">$0.00 (0%)</span>`;
            }
        }

        // Si hay faltante, el icono general de la fila también debe ser una alerta roja
        if (!row.pedido) {
            statusIcon = '<i data-lucide="x-circle" class="w-4 h-4 text-red-500 mx-auto" title="No hallado en Pedido"></i>';
        } else if (hasFaltante) {
            statusIcon = `<div onclick="window.confirmarConciliacion()" class="cursor-pointer hover:scale-125 transition-transform bg-amber-500/20 rounded-full p-1 inline-block border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse"><i data-lucide="alert-triangle" class="w-5 h-5 text-amber-500 mx-auto" title="Faltante físico. Click para gestionar"></i></div>`;
        }

        let logisticaHtml = '-';
        if (row.pedido) {
            const facDesc = row.pedido.factor_conversion > 1 ? ` (x${row.pedido.factor_conversion})` : '';
            const pCodigo = row.pedido.producto_codigo || row.pedido.codigo || 'S/C';
            const pDesc = row.pedido.producto_descripcion || row.pedido.descripcion || 'Sin descripción';
            logisticaHtml = `<span class="text-[10px] text-slate-500 block">${pCodigo}</span><span class="line-clamp-1 text-xs" title="${pDesc}">${pDesc}${facDesc}</span>`;
        } else {
            let options = `<option value="">[Seleccionar Artículo Manualmente]</option>`;
            if (window.currentConciliacion.unmatchedPedidoItems && window.currentConciliacion.unmatchedPedidoItems.length > 0) {
                window.currentConciliacion.unmatchedPedidoItems.forEach(u => {
                    const desc = u.producto_descripcion || u.descripcion || 'Sin descripción';
                    options += `<option value="${u.id}">${desc}</option>`;
                });
            } else {
                options += `<option disabled>No hay artículos físicos sobrantes</option>`;
            }
            logisticaHtml = `<select class="w-full bg-slate-900 border border-slate-700 rounded text-xs text-slate-300 p-1 mt-1 outline-none focus:border-indigo-500 transition-colors cursor-pointer" onchange="window.applyManualMatch(${index}, this.value)">${options}</select>`;
        }

        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/30 transition-colors">
                <td class="px-3 py-2 text-slate-300 leading-tight w-1/3">${logisticaHtml}</td>
                <td class="px-3 py-2 font-mono text-2xl text-center ${cantClass}">${row.pedido ? row.recibido : '-'}</td>
                <td class="px-3 py-2 font-mono text-2xl font-bold text-right ${priceClass}">$${row.pedido ? (window.formatCurrency ? window.formatCurrency(row.pedido.precio_unitario) : row.pedido.precio_unitario) : 0}</td>
                <td class="px-3 py-2 text-right">${deltaHtml}</td>
                <td class="px-3 py-2 text-center cursor-help">${statusIcon}</td>
            </tr>
        `;
    });

    document.getElementById('concil_desvios_precio').innerText = errPrec;
    document.getElementById('concil_desvios_cant').innerText = errCant;

    if (window.lucide) window.lucide.createIcons();

    // Habilitar botón de aprobación (HITL SIEMPRE DECIDE)
    const btn = document.getElementById('btn_aprobar_conciliacion');
    btn.disabled = false;
    btn.classList.remove('cursor-not-allowed', 'opacity-50');
    btn.classList.add('hover:bg-emerald-600', 'hover:text-white', 'hover:border-emerald-500', 'text-emerald-500');

    if (errPrec > 0 || errCant > 0) {
        btn.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4"></i> Aprobar con Desvíos';
        btn.classList.add('bg-amber-600/20', 'text-amber-500', 'border-amber-500/30');
        btn.classList.remove('hover:bg-emerald-600');
        btn.classList.add('hover:bg-amber-600');
    } else {
        btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Confirmar Match Perfecto';
        btn.className = 'px-4 py-2 bg-emerald-600/20 text-emerald-500 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white hover:border-emerald-500';
    }
    if (window.lucide) window.lucide.createIcons();
};

window.applyManualMatch = function(rowIndex, pedidoItemId) {
    if (!pedidoItemId) return; // Si selecciona la opción vacía, ignorar
    
    const row = window.currentConciliacion.matchReport[rowIndex];
    const pedido = window.currentConciliacion.unmatchedPedidoItems.find(p => p.id === pedidoItemId);
    
    if (!pedido || !row) return;

    const cantF = parseFloat(row.factura.cantidad || 0);
    const precioF = parseFloat(row.factura.precio_unitario || 0);

    const cantR = parseFloat(pedido.cantR || 0);
    const precioP = parseFloat(pedido.valor_unitario_ref || 0);
    const factorConversion = parseFloat(pedido.factor_conversion || 1);

    // Lógica Matemática Idéntica a Backend
    let normalizedCantR = cantR;
    const ratioQty = cantR > 0 ? cantF / cantR : 0;
    const ratioPrice = precioF > 0 ? precioP / precioF : 0;
    let isAsymmetricUnit = false;
    
    if (ratioQty > 1.2 && ratioPrice > 1.2 && Math.abs(ratioQty - ratioPrice) / ratioPrice < 0.20) {
        isAsymmetricUnit = true;
    } else if (factorConversion > 1.1 && ratioQty >= factorConversion * 0.8 && ratioQty <= factorConversion * 1.2) {
        isAsymmetricUnit = true;
    }

    if (isAsymmetricUnit) {
        const factorToUse = factorConversion > 1.1 ? factorConversion : ratioPrice;
        normalizedCantR = cantR * factorToUse;
    }

    const cantDelta = cantF - normalizedCantR;
    const precioDelta = precioF - precioP;
    
    const desviosLocales = [];
    if (cantDelta > 0) desviosLocales.push(`Faltante Físico: Facturado ${cantF}, Recibido ${normalizedCantR}`);
    else if (cantDelta < 0) desviosLocales.push(`Sobrante Físico: Facturado ${cantF}, Recibido ${normalizedCantR}`);

    if (Math.abs(precioDelta) > 5.0) {
        desviosLocales.push(`Desvío Precio: Facturado a $${precioF.toFixed(2)} (Pactado Equiv: $${precioP.toFixed(2)})`);
    }

    row.pedido = { 
        ...pedido, 
        precio_unitario: precioP, 
        factor_conversion: factorConversion 
    };
    row.recibido = normalizedCantR; 
    row.normalizedCantR = normalizedCantR;
    row.delta_cantidad = cantDelta;
    row.delta_monto = precioDelta;
    row.delta_porcentaje = (precioP > 0) ? ((precioDelta / precioP) * 100).toFixed(2) : 0;
    row.desvios = desviosLocales;
    row.status = desviosLocales.length > 0 ? 'OBSERVADO_POR_DESVIOS' : 'OK';

    // Eliminar el ítem matcheado del pool de sobrantes para evitar doble asignación
    window.currentConciliacion.unmatchedPedidoItems = window.currentConciliacion.unmatchedPedidoItems.filter(p => p.id !== pedidoItemId);

    // Re-renderizar la tabla al instante
    window.renderMatchReport();
};

window.confirmarConciliacion = async function() {
    const errPrec = parseInt(document.getElementById('concil_desvios_precio').innerText) || 0;
    const errCant = parseInt(document.getElementById('concil_desvios_cant').innerText) || 0;

    let chargeDifference = false;

    if (errPrec > 0 || errCant > 0) {
        let totalDiferencia = 0;
        let detallesDesvioHTML = '';
        
        window.recalcDesvios = function() {
            let newTotal = 0;
            const items = document.querySelectorAll('.desvio-item');
            items.forEach(el => {
                const delta = parseFloat(el.getAttribute('data-delta'));
                const input = el.querySelector('.manual-qty-input');
                const qty = parseFloat(input.value) || 0;
                const subtotal = delta * qty;
                newTotal += subtotal;
                
                el.querySelector('.subtotal-display').innerText = '+$' + (window.formatCurrency ? window.formatCurrency(subtotal) : subtotal.toFixed(2));
                
                const idx = parseInt(el.getAttribute('data-index'));
                if (window.currentConciliacion.matchReport[idx].factura) {
                    window.currentConciliacion.matchReport[idx].factura.cantidad_calculada = qty;
                }
            });
            
            const totalEl = document.getElementById('total_diferencia_display');
            if (totalEl) {
                totalEl.innerText = '$' + (window.formatCurrency ? window.formatCurrency(newTotal) : newTotal.toFixed(2));
            }
        };

        if (window.currentConciliacion && window.currentConciliacion.matchReport) {
            let itemsHTML = '';
            window.currentConciliacion.matchReport.forEach((item, index) => {
                if (item.delta_monto && parseFloat(item.delta_monto) > 0) {
                    const cant = parseFloat(item.factura?.cantidad || 0);
                    const factor = parseFloat(item.pedido?.factor_conversion || 1);
                    const cantTotalRef = cant * factor;
                    
                    if (item.factura) item.factura.cantidad_calculada = cantTotalRef;
                    
                    const difTotalItem = parseFloat(item.delta_monto) * cantTotalRef;
                    totalDiferencia += difTotalItem;
                    
                    const desc = item.factura?.descripcion || item.pedido?.producto_descripcion || 'Artículo sin descripción';
                    const pFacturado = window.formatCurrency ? window.formatCurrency(item.factura?.precio_unitario || 0) : parseFloat(item.factura?.precio_unitario || 0).toFixed(2);
                    const pPactado = window.formatCurrency ? window.formatCurrency(item.pedido?.precio_unitario || 0) : parseFloat(item.pedido?.precio_unitario || 0).toFixed(2);
                    const dUnitario = window.formatCurrency ? window.formatCurrency(item.delta_monto) : parseFloat(item.delta_monto).toFixed(2);
                    const dTotal = window.formatCurrency ? window.formatCurrency(difTotalItem) : difTotalItem.toFixed(2);
                    
                    const unidadRef = item.pedido?.unidad_ref || 'Kilos';
                    const pBulto = parseFloat(item.pedido?.precio_unitario || 0) * factor;
                    const pBultoFmt = window.formatCurrency ? window.formatCurrency(pBulto) : pBulto.toFixed(2);
                    
                    itemsHTML += `
                        <div class="mb-4 p-3 bg-slate-800/80 rounded border border-slate-700/50 text-left text-xs shadow-inner desvio-item" data-index="${index}" data-delta="${item.delta_monto}">
                            <div class="font-bold text-slate-200 mb-3 border-b border-slate-700/80 pb-1.5 flex items-center">
                                <i data-lucide="package" class="w-4 h-4 mr-2 text-slate-400"></i> <span class="text-sm tracking-wide">${desc}</span>
                            </div>
                            
                            <!-- Comparativa en dos columnas -->
                            <div class="grid grid-cols-2 gap-4 mb-3">
                                <!-- Columna 1: Pactado / Físico -->
                                <div class="bg-slate-900/40 p-2.5 rounded border border-slate-700/30">
                                    <div class="text-emerald-400 font-bold mb-2 border-b border-emerald-900/30 pb-1 text-[10px] uppercase tracking-wider flex items-center"><i data-lucide="check-square" class="w-3 h-3 mr-1"></i> Mercadería Pactada</div>
                                    <div class="flex justify-between py-0.5"><span class="text-slate-500">Precio (${unidadRef}):</span> <span class="text-slate-200 font-medium">$${pPactado}</span></div>
                                    ${factor !== 1 ? `<div class="flex justify-between py-0.5"><span class="text-slate-500">Precio (Bulto):</span> <span class="text-slate-400">$${pBultoFmt}</span></div>` : ''}
                                    <div class="flex justify-between py-0.5"><span class="text-slate-500">${unidadRef} por Bulto:</span> <span class="text-slate-200">${factor}</span></div>
                                </div>

                                <!-- Columna 2: Factura -->
                                <div class="bg-red-900/10 p-2.5 rounded border border-red-900/20">
                                    <div class="text-red-400 font-bold mb-2 border-b border-red-900/30 pb-1 text-[10px] uppercase tracking-wider flex items-center"><i data-lucide="file-text" class="w-3 h-3 mr-1"></i> Factura Recibida</div>
                                    <div class="flex justify-between py-0.5"><span class="text-slate-500">Precio (${unidadRef}):</span> <span class="text-red-400 font-bold">$${pFacturado}</span></div>
                                    <div class="flex justify-between py-0.5"><span class="text-slate-500">Bultos Facturados:</span> <span class="text-slate-200">${cant}</span></div>
                                </div>
                            </div>

                            <!-- Sección de Cálculo y Diferencia -->
                            <div class="bg-slate-900/80 p-2.5 rounded border border-slate-700/80">
                                <div class="text-[10px] text-slate-400 uppercase tracking-widest mb-2 font-bold flex items-center"><i data-lucide="calculator" class="w-3 h-3 mr-1"></i> Fórmula de Desvío</div>
                                
                                <div class="grid grid-cols-[1fr_auto_1fr_auto_1.2fr] items-center gap-2 text-center">
                                    <!-- Diferencia Unitaria -->
                                    <div class="bg-slate-800 rounded p-1.5 border border-slate-700/50">
                                        <div class="text-slate-500 text-[10px] mb-0.5">Dif. Unitaria</div>
                                        <div class="text-amber-400 font-bold">+$${dUnitario}</div>
                                    </div>
                                    
                                    <div class="text-slate-500 font-bold">×</div>
                                    
                                    <!-- Cantidad Total Editable -->
                                    <div class="bg-indigo-900/20 border border-indigo-500/30 rounded p-1.5 relative group">
                                        <div class="text-indigo-300 text-[10px] mb-1">Total ${unidadRef}</div>
                                        <input type="number" step="0.01" class="manual-qty-input w-full bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 font-bold focus:border-indigo-400 outline-none hover:border-slate-400 transition-colors" value="${cantTotalRef}" onchange="window.recalcDesvios()" onkeyup="window.recalcDesvios()">
                                        <div class="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-300 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-600">Puede corregir este valor</div>
                                    </div>
                                    
                                    <div class="text-slate-500 font-bold">=</div>
                                    
                                    <!-- Subtotal Diferencia -->
                                    <div class="bg-emerald-900/20 border border-emerald-500/30 rounded p-1.5">
                                        <div class="text-emerald-500 text-[10px] mb-0.5 uppercase tracking-wider">Sobreprecio</div>
                                        <div class="text-emerald-400 font-bold text-sm subtotal-display">+$${dTotal}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
            if (itemsHTML) {
                detallesDesvioHTML = `<div class="max-h-[250px] overflow-y-auto mb-4 pr-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800/50" id="desvios_container">${itemsHTML}</div>`;
            }
        }

        let textoDiferencia = '';
        if (totalDiferencia > 0) {
            textoDiferencia = `<p class="mb-4 text-slate-300 text-sm">El sobreprecio exacto calculado es de <strong class="text-red-400 text-lg ml-1" id="total_diferencia_display">$${window.formatCurrency ? window.formatCurrency(totalDiferencia) : totalDiferencia.toFixed(2)}</strong>.</p>`;
        }

        const result = await Swal.fire({
            title: 'Desvíos Detectados',
            html: `
                ${detallesDesvioHTML}
                ${textoDiferencia}
                <p class="text-sm text-slate-400 border-t border-slate-700/50 pt-4 mt-2">¿Desea asentar la diferencia de esta factura a su favor en la cuenta corriente del proveedor?</p>
            `,
            icon: 'warning',
            background: '#0f172a',
            color: '#f8fafc',
            width: '42em',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '<i data-lucide="check-circle" class="w-4 h-4 inline mr-1"></i> Cargar a Mi Favor',
            denyButtonText: 'Asumir Diferencia',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#059669',
            denyButtonColor: '#d97706',
            cancelButtonColor: '#475569',
            customClass: {
                confirmButton: 'flex items-center gap-2',
                htmlContainer: 'px-2'
            },
            didOpen: () => {
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        });

        if (result.isDismissed) {
            return; // Usuario canceló la operación
        }
        
        if (result.isConfirmed) {
            chargeDifference = true;
        }
    }

    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    Swal.fire({
        title: 'Confirmando...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: async () => { 
            Swal.showLoading(); 
            try {
                const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                const isMulti = Array.isArray(window.currentConciliacion.facturaId);
                
                // 1. Confirmar el Match y mutar estado
                const urlMatch = isMulti
                    ? `${backendBaseUrl}/api/facturas/match-multi`
                    : `${backendBaseUrl}/api/facturas/${window.currentConciliacion.facturaId}/match`;
                    
                const bodyMatch = isMulti
                    ? { facturasIds: window.currentConciliacion.facturaId, recepcionesIds: window.currentConciliacion.recepcionesIds, confirm: true }
                    : { recepcionesIds: window.currentConciliacion.recepcionesIds, confirm: true };

                const res1 = await fetch(urlMatch, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyMatch)
                });
                const data1 = await res1.json();
                if (!data1.success) throw new Error(data1.error);

                // 2. Transaccionar con Cuenta Corriente (Etapa 4 real)
                const urlConfirm = isMulti
                    ? `${backendBaseUrl}/api/facturas/confirmar-multi`
                    : `${backendBaseUrl}/api/facturas/${window.currentConciliacion.facturaId}/confirmar`;
                    
                const bodyConfirm = isMulti
                    ? { facturasIds: window.currentConciliacion.facturaId, recepcionesIds: window.currentConciliacion.recepcionesIds, matchReport: window.currentConciliacion.matchReport, chargeDifference }
                    : { recepcionesIds: window.currentConciliacion.recepcionesIds, matchReport: window.currentConciliacion.matchReport, chargeDifference };

                const res2 = await fetch(urlConfirm, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyConfirm)
                });
                const data2 = await res2.json();
                
                if (!data2.success) throw new Error(data2.error);

                Swal.fire({
                    icon: 'success',
                    title: 'Conciliación Guardada',
                    text: 'El dictamen del operador ha sido persistido.',
                    background: '#1e293b', color: '#f8fafc',
                    timer: 2000,
                    showConfirmButton: false
                });

                window.closeVisorConciliacion();

                // Refrescar
                if (window.exploreSupplierFiles && window.currentDriveFolderId) {
                    window.exploreSupplierFiles(window.currentDriveFolderId, 'facturas');
                }
            } catch (e) {
                Swal.fire('Error', 'No se pudo guardar la conciliación: ' + e.message, 'error');
            }
        }
    });
};

window.viewFacturaDetails = async function(facturaId) {
    if (!window.Swal) return;

    try {
        Swal.fire({
            title: 'Cargando Detalles...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const resFac = await fetch(`${backendBaseUrl}/api/facturas/${facturaId}`);
        const facJson = await resFac.json();
        if (!facJson.success) throw new Error(facJson.error || "No se pudo obtener la factura");
        const factura = facJson.data;

        let articulosHtml = '';
        if (factura.articulos && factura.articulos.length > 0) {
            articulosHtml = `
                <div class="mt-4 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                    <div class="max-h-64 overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left text-xs text-slate-300 relative">
                            <thead class="bg-slate-950 text-[10px] uppercase text-slate-500 sticky top-0 shadow-sm border-b border-slate-700">
                                <tr>
                                    <th class="px-3 py-2">Cód.</th>
                                    <th class="px-3 py-2">Descripción</th>
                                    <th class="px-3 py-2 text-center">Cant.</th>
                                    <th class="px-3 py-2 text-right">P.Unit</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50">
                                ${factura.articulos.map(art => `
                                    <tr class="hover:bg-slate-800/50">
                                        <td class="px-3 py-2 font-mono text-[10px] text-slate-400">${art.codigo || '-'}</td>
                                        <td class="px-3 py-2 line-clamp-1" title="${art.descripcion}">${art.descripcion || '-'}</td>
                                        <td class="px-3 py-2 text-center font-bold text-blue-400">${window.formatCurrency ? window.formatCurrency(art.cantidad || 0) : (art.cantidad || 0)}</td>
                                        <td class="px-3 py-2 text-right font-mono text-amber-400">$${window.formatCurrency ? window.formatCurrency(art.precio_unitario || 0) : (art.precio_unitario || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            articulosHtml = `<p class="text-sm text-amber-500 italic mt-4 text-center">No se detectó grilla de artículos en la extracción.</p>`;
        }

        Swal.fire({
            title: `Factura ${factura.numero_comprobante || 'S/N'}`,
            html: `
                <div class="text-left text-sm text-slate-300">
                    <p><strong>CUIT Emisor:</strong> ${factura.cuit_emisor || '-'}</p>
                    <p><strong>Fecha Emisión:</strong> ${factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString() : '-'}</p>
                    <p><strong>Importe Total:</strong> <span class="text-emerald-400 font-bold font-mono">$${window.formatCurrency ? window.formatCurrency(factura.importe_total) : factura.importe_total}</span></p>
                    <hr class="border-slate-700 my-3">
                    <h4 class="font-bold text-xs uppercase tracking-widest text-slate-400 mb-2">Detalle Extraído</h4>
                    ${articulosHtml}
                </div>
            `,
            background: '#1e293b', color: '#f8fafc',
            width: '600px',
            confirmButtonColor: '#334155',
            confirmButtonText: 'Cerrar'
        });

    } catch (e) {
        Swal.fire('Error', 'No se pudo cargar la factura: ' + e.message, 'error');
    }
};

window.viewConciliacionReport = async function(facturaId) {
    if (!window.Swal) return;

    try {
        Swal.fire({
            title: 'Cargando Reporte de Cruce...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const resFac = await fetch(`${backendBaseUrl}/api/facturas/${facturaId}`);
        const facJson = await resFac.json();
        if (!facJson.success) throw new Error(facJson.error || "No se pudo obtener la factura");
        const factura = facJson.data;

        if (!factura.match_report || factura.match_report.length === 0) {
            Swal.fire({
                title: 'Reporte No Estructurado',
                html: `
                    <p class="text-sm text-slate-300 mb-4">Esta factura (<strong>${factura.numero_comprobante || 'S/N'}</strong>) fue conciliada, pero no posee un log estructurado del cruce algorítmico (es posible que se haya forzado manualmente o conciliado en una versión anterior).</p>
                    <button onclick="Swal.close(); setTimeout(() => window.viewFacturaDetails('${factura.id}'), 300)" class="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-600 hover:text-white transition-colors uppercase font-bold text-xs tracking-widest">Ver Detalles de Extracción en su lugar</button>
                `,
                icon: 'info',
                background: '#1e293b', color: '#f8fafc',
                showConfirmButton: false,
                showCloseButton: true
            });
            return;
        }

        let reportHtml = `
            <div class="mt-4 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                <div class="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left text-xs text-slate-300 relative">
                        <thead class="bg-slate-950 text-[10px] uppercase text-slate-500 sticky top-0 shadow-sm border-b border-slate-700">
                            <tr>
                                <th class="px-3 py-2">Artículo</th>
                                <th class="px-3 py-2 text-center">Cant.</th>
                                <th class="px-3 py-2 text-right">Pactado</th>
                                <th class="px-3 py-2 text-right">Facturado</th>
                                <th class="px-3 py-2 text-right">Delta</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/50">
        `;

        factura.match_report.forEach(row => {
            const isError = row.status !== 'OK';
            const bgClass = isError ? 'bg-amber-900/10' : 'hover:bg-slate-800/50';
            const pactado = row.pedido ? row.pedido.precio_unitario : 0;
            const facturado = row.factura ? row.factura.precio_unitario : 0;
            const cant = row.recibido || (row.factura ? row.factura.cantidad : 0);
            const desc = row.factura ? row.factura.descripcion : (row.pedido ? row.pedido.descripcion : '-');
            
            reportHtml += `
                <tr class="${bgClass}">
                    <td class="px-3 py-2 line-clamp-2" title="${desc}">${desc}</td>
                    <td class="px-3 py-2 text-center font-bold text-blue-400">${window.formatCurrency ? window.formatCurrency(cant) : cant}</td>
                    <td class="px-3 py-2 text-right font-mono text-slate-400">$${window.formatCurrency ? window.formatCurrency(pactado) : pactado}</td>
                    <td class="px-3 py-2 text-right font-mono text-slate-200">$${window.formatCurrency ? window.formatCurrency(facturado) : facturado}</td>
                    <td class="px-3 py-2 text-right font-mono font-bold ${isError ? 'text-amber-400' : 'text-emerald-400'}">
                        ${row.delta_monto > 0 ? '+' : ''}$${window.formatCurrency ? window.formatCurrency(row.delta_monto) : row.delta_monto}
                    </td>
                </tr>
            `;
            if (row.desvios && row.desvios.length > 0) {
                reportHtml += `
                    <tr class="${bgClass}">
                        <td colspan="5" class="px-3 py-1 text-[10px] text-amber-500 italic pb-2 border-none">
                            <i data-lucide="alert-triangle" class="w-3 h-3 inline-block mr-1 mb-0.5"></i> ${row.desvios.join(' | ')}
                        </td>
                    </tr>
                `;
            }
        });

        reportHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        Swal.fire({
            title: `Reporte de Cruce - Factura ${factura.numero_comprobante || 'S/N'}`,
            html: `
                <div class="text-left text-sm text-slate-300">
                    <p><strong>Estado:</strong> <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${factura.status_conciliacion === 'CONCILIADO_OK' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'} uppercase">${factura.status_conciliacion}</span></p>
                    <p class="mt-2 text-xs text-slate-400 font-mono"><strong>Recepción Logística Vinculada:</strong> ${factura.pedido_b2b_id || 'N/A'}</p>
                    ${reportHtml}
                </div>
            `,
            background: '#1e293b', color: '#f8fafc',
            width: '800px',
            confirmButtonColor: '#334155',
            confirmButtonText: 'Cerrar',
            didOpen: () => {
                if (window.lucide) window.lucide.createIcons();
            }
        });

    } catch (e) {
        Swal.fire('Error', 'No se pudo cargar el reporte: ' + e.message, 'error');
    }
};
