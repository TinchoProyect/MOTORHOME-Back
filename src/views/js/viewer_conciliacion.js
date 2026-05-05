// ============================================================================
// [ETAPA 3] ESCRITORIO DE CONCILIACIÓN DUAL (HITL)
// ============================================================================

window.currentConciliacion = {
    facturaId: null,
    facturaData: null,
    pedidoId: null,
    matchReport: null
};

window.openConciliacionModal = async function(facturaId) {
    if (!window.Swal) return;

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

        // 3. Renderizar Cuadrante Izquierdo (Factura)
        document.getElementById('concil_fac_nro').innerText = factura.numero_comprobante || 'S/N';
        document.getElementById('concil_fac_total').innerText = '$ ' + (window.formatCurrency ? window.formatCurrency(factura.importe_total) : factura.importe_total);
        document.getElementById('concil_fac_fecha').innerText = factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString() : '-';

        const facTbody = document.getElementById('concil_fac_articulos');
        facTbody.innerHTML = '';
        const articulos = factura.articulos || [];
        
        if (articulos.length === 0) {
            facTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">Sin detalle de artículos extraído.</td></tr>`;
        } else {
            articulos.forEach(art => {
                facTbody.innerHTML += `
                    <tr class="hover:bg-slate-800/30">
                        <td class="px-3 py-2 font-mono text-[10px] text-slate-400">${art.codigo || '-'}</td>
                        <td class="px-3 py-2 text-[10px] text-slate-300 line-clamp-1" title="${art.descripcion}">${art.descripcion || '-'}</td>
                        <td class="px-3 py-2 font-mono text-[10px] text-center text-blue-400 font-bold">${art.cantidad || 0}</td>
                        <td class="px-3 py-2 font-mono text-[10px] text-right text-slate-400">$${art.precio_unitario || 0}</td>
                    </tr>
                `;
            });
        }

        // 4. Poblar Selector Derecho
        const sel = document.getElementById('concil_pedido_select');
        sel.innerHTML = '<option value="">-- Buscar Recepciones / Pedidos Ingresados --</option>';
        if (recepciones && recepciones.length > 0) {
            recepciones.forEach(r => {
                const f = new Date(r.fecha_recepcion).toLocaleDateString();
                const num = r.numero_remito ? `Remito ${r.numero_remito}` : 'Recepción S/N';
                
                let descItems = [];
                if (r.recepciones_fisicas_items && r.recepciones_fisicas_items.length > 0) {
                    descItems = r.recepciones_fisicas_items
                        .map(i => i.pedidos_b2b_items?.producto_descripcion)
                        .filter(Boolean);
                }
                
                let snippet = '';
                let fullTooltip = '';
                if (descItems.length > 0) {
                    const firstTwo = descItems.slice(0, 2).join(', ');
                    snippet = ` (${firstTwo}${descItems.length > 2 ? '...' : ''})`;
                    fullTooltip = descItems.join(' | ');
                } else {
                    snippet = ' (Sin detalle)';
                    fullTooltip = 'Sin detalle de artículos';
                }

                sel.innerHTML += `<option value="${r.id}" title="${fullTooltip}">${num} del ${f}${snippet}</option>`;
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
    const pedidoId = document.getElementById('concil_pedido_select').value;
    if (!pedidoId) {
        document.getElementById('concil_empty_state').classList.remove('hidden');
        document.getElementById('concil_match_content').classList.add('hidden');
        document.getElementById('btn_aprobar_conciliacion').disabled = true;
        document.getElementById('btn_aprobar_conciliacion').classList.add('cursor-not-allowed', 'opacity-50');
        return;
    }

    window.currentConciliacion.pedidoId = pedidoId; // Este pedidoId en realidad guarda el recepcionId ahora
    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    // Simulate Match
    try {
        const res = await fetch(`${backendBaseUrl}/api/facturas/${window.currentConciliacion.facturaId}/match`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ recepcionId: pedidoId, confirm: false })
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
            const hasDesvioPrecio = row.desvios.some(d => d.includes('Precio'));
            const hasFaltante = row.desvios.some(d => d.includes('Faltante'));
            
            if (hasDesvioPrecio) errPrec++;
            if (hasFaltante) errCant++;

            const cantClass = hasFaltante ? 'text-red-400 font-bold bg-red-500/10' : 'text-emerald-400';
            const priceClass = hasDesvioPrecio ? 'text-red-400 font-bold bg-red-500/10' : 'text-slate-400';
            const statusIcon = row.status === 'OK' 
                ? '<i data-lucide="check" class="w-4 h-4 text-emerald-500 mx-auto"></i>' 
                : '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500 mx-auto" title="'+row.desvios.join(' | ')+'"></i>';

            let logisticaHtml = '-';
            if (row.pedido) {
                logisticaHtml = `<span class="text-[9px] text-slate-500 block">${row.pedido.codigo}</span><span class="line-clamp-1" title="${row.pedido.descripcion}">${row.pedido.descripcion}</span>`;
            } else {
                logisticaHtml = `<span class="text-red-400 italic text-[10px]">No hallado en Pedido</span>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-slate-800/30">
                    <td class="px-3 py-2 text-[10px] text-slate-300 leading-tight">${logisticaHtml}</td>
                    <td class="px-3 py-2 font-mono text-[10px] text-center ${cantClass}">${row.recibido}</td>
                    <td class="px-3 py-2 font-mono text-[10px] text-right ${priceClass}">$${row.pedido ? row.pedido.precio_unitario : 0}</td>
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
    const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    Swal.fire({
        title: 'Confirmando...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const res = await fetch(`${backendBaseUrl}/api/facturas/${window.currentConciliacion.facturaId}/match`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ recepcionId: window.currentConciliacion.pedidoId, confirm: true })
        });
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);

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
                                        <td class="px-3 py-2 text-center font-bold text-blue-400">${art.cantidad || 0}</td>
                                        <td class="px-3 py-2 text-right font-mono text-amber-400">$${art.precio_unitario || 0}</td>
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
