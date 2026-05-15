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

        // Render Match
        document.getElementById('concil_empty_state').classList.add('hidden');
        document.getElementById('concil_match_content').classList.remove('hidden');

        const tbody = document.getElementById('concil_match_tbody');
        tbody.innerHTML = '';
        
        let errPrec = 0;
        let errCant = 0;

        data.matchReport.forEach(row => {
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
                logisticaHtml = `<span class="text-red-400 italic text-xs">No hallado en Pedido</span>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-slate-800/30">
                    <td class="px-3 py-2 text-slate-300 leading-tight">${logisticaHtml}</td>
                    <td class="px-3 py-2 font-mono text-2xl text-center ${cantClass}">${row.recibido}</td>
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

    } catch (e) {
        console.error("Error validando pedido:", e);
        Swal.fire('Error de Motor', 'No se pudo procesar el cruce: ' + e.message, 'error');
    }
};

window.confirmarConciliacion = async function() {
    const errPrec = parseInt(document.getElementById('concil_desvios_precio').innerText) || 0;
    const errCant = parseInt(document.getElementById('concil_desvios_cant').innerText) || 0;

    let chargeDifference = false;

    if (errPrec > 0 || errCant > 0) {
        let totalDiferencia = 0;
        if (window.currentConciliacion && window.currentConciliacion.matchReport) {
            window.currentConciliacion.matchReport.forEach(item => {
                if (item.delta_monto && parseFloat(item.delta_monto) > 0) {
                    const cant = parseFloat(item.factura?.cantidad || 0);
                    totalDiferencia += (parseFloat(item.delta_monto) * cant);
                }
            });
        }

        let textoDiferencia = '';
        if (totalDiferencia > 0) {
            textoDiferencia = `Hemos detectado un sobreprecio aproximado de $${window.formatCurrency ? window.formatCurrency(totalDiferencia) : totalDiferencia.toFixed(2)}. `;
        }

        const result = await Swal.fire({
            title: 'Desvíos Detectados',
            text: `${textoDiferencia}¿Desea asentar la diferencia de esta factura a su favor en la cuenta corriente del proveedor?`,
            icon: 'warning',
            background: '#0f172a',
            color: '#f8fafc',
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
