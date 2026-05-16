// recepciones_history_ui.js
// Interfaz para visualizar el historial inmutable de recepciones físicas

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

window.openReceptionHistory = async function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-start mb-4 pb-4 shrink-0">
                <div>
                    <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <i data-lucide="history" class="w-5 h-5 text-indigo-400"></i> Historial de Recepciones
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">Registro inmutable de ingresos físicos de mercadería</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.loadReceptionHistory()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar
                    </button>
                </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-slate-800 mb-4 shrink-0">
                <button id="tabRhPendientes" onclick="window.switchReceptionTab('PENDIENTES')" class="px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-2 transition-colors">
                    <i data-lucide="inbox" class="w-4 h-4"></i> Pendientes de Facturar
                </button>
                <button id="tabRhConciliados" onclick="window.switchReceptionTab('CONCILIADOS')" class="px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-transparent text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <i data-lucide="archive" class="w-4 h-4"></i> Conciliados / Histórico
                </button>
            </div>

            <!-- Content Area -->
            <div id="receptionHistoryContainer" class="flex-1 w-full overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <div class="flex items-center justify-center h-full text-blue-400">
                    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i> Cargando historial...
                </div>
            </div>
            
            <!-- Bottom StatusBar -->
            <div class="pt-4 flex justify-between items-center shrink-0 border-t border-slate-800 mt-2">
                <span class="text-[10px] text-slate-500 font-mono" id="rhCountStatus">Inicializando...</span>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.rhTabState = 'PENDIENTES'; // Inicializar estado
    await window.loadReceptionHistory();
}

window.switchReceptionTab = function(tab) {
    window.rhTabState = tab;
    
    const tabPendientes = document.getElementById('tabRhPendientes');
    const tabConciliados = document.getElementById('tabRhConciliados');
    
    if (tab === 'PENDIENTES') {
        tabPendientes.className = "px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-2 transition-colors";
        tabConciliados.className = "px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-transparent text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors";
    } else {
        tabConciliados.className = "px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-2 transition-colors";
        tabPendientes.className = "px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 border-transparent text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors";
    }
    
    if (window.receptionHistoryCache) {
        renderReceptionHistoryCards(window.receptionHistoryCache);
    }
}

window.loadReceptionHistory = async function() {
    const statusLabel = document.getElementById('rhCountStatus');
    if (statusLabel) statusLabel.innerText = "Consultando base de datos...";

    try {
        const ts = new Date().getTime();
        const res = await fetch(`${API_BASE}/api/recepcion/historial?_t=${ts}`);
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        window.receptionHistoryCache = result.data || [];
        renderReceptionHistoryCards(window.receptionHistoryCache);
        
    } catch(e) {
        console.error("[RECEPCION_HISTORY] Error al cargar:", e);
        if (statusLabel) statusLabel.innerText = "Error al cargar el historial.";
        
        document.getElementById('receptionHistoryContainer').innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-red-500">
                <i data-lucide="alert-triangle" class="w-10 h-10 mb-2"></i>
                <p>Error de conexión al obtener el historial.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

function renderReceptionHistoryCards(data) {
    const container = document.getElementById('receptionHistoryContainer');
    const statusLabel = document.getElementById('rhCountStatus');
    
    if(!container) return;

    let filteredData = [];
    if (window.rhTabState === 'PENDIENTES') {
        filteredData = data.filter(r => r.estado_conciliacion !== 'CONCILIADA' && r.estado !== 'Anulada');
    } else {
        filteredData = data.filter(r => r.estado_conciliacion === 'CONCILIADA' || r.estado === 'Anulada');
    }

    if (statusLabel) statusLabel.innerText = `Mostrando ${filteredData.length} registros en esta solapa`;

    if (filteredData.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-500">
                <i data-lucide="inbox" class="w-12 h-12 mb-4 opacity-50"></i>
                <p class="text-sm font-bold tracking-widest uppercase">Sin recepciones registradas</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let temporalGroups = {};
    
    filteredData.forEach(rec => {
        let monthYear = "Fecha Desconocida";
        if (rec.fecha_recepcion) {
            const d = new Date(rec.fecha_recepcion);
            const formatter = new Intl.DateTimeFormat('es-AR', { year: 'numeric', month: 'long' });
            let fStr = formatter.format(d);
            monthYear = fStr.charAt(0).toUpperCase() + fStr.slice(1);
        }
        if (!temporalGroups[monthYear]) temporalGroups[monthYear] = [];
        temporalGroups[monthYear].push(rec);
    });

    let cardsHtml = '';
    
    // Sort temporal groups (descending roughly by checking the first element's date)
    const sortedTemporalKeys = Object.keys(temporalGroups).sort((a, b) => {
        if (a === "Fecha Desconocida") return 1;
        if (b === "Fecha Desconocida") return -1;
        return new Date(temporalGroups[b][0].fecha_recepcion) - new Date(temporalGroups[a][0].fecha_recepcion);
    });

    sortedTemporalKeys.forEach(tKey => {
        cardsHtml += `
            <div class="mt-6 mb-4">
                <h4 class="text-sm font-bold text-indigo-400 border-b border-slate-800 pb-2 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <i data-lucide="calendar" class="w-4 h-4"></i> ${tKey}
                </h4>
                <div class="space-y-4">
        `;

        temporalGroups[tKey].forEach(rec => {
            const fecha = new Date(rec.fecha_recepcion);
            const fechaFormat = fecha.toLocaleDateString('es-AR') + ' ' + fecha.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
            
            const provData = rec.pedidos_b2b_cabecera || {};
            const provName = (provData.proveedores && provData.proveedores.nombre) ? provData.proveedores.nombre : 'Proveedor Desconocido';
            const docType = provData.tipo_documento || 'Orden';
            const remito = rec.numero_remito || 'S/N';
            
            let colorEstado = 'bg-slate-800 text-slate-400 border-slate-700';
            let isAnulada = rec.estado === 'Anulada';
            if (rec.estado === 'Recepción Completa') colorEstado = 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
            if (rec.estado === 'Recepción Parcial') colorEstado = 'bg-amber-900/30 text-amber-400 border-amber-500/50';
            if (isAnulada) colorEstado = 'bg-red-900/50 text-red-400 border-red-500/50 line-through';

            const opacityClass = isAnulada ? 'opacity-50 grayscale' : '';

            cardsHtml += `
                <div class="relative w-full bg-slate-800/20 border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/40 transition-colors flex flex-col md:flex-row md:items-center justify-between group overflow-hidden shadow-sm gap-4 ${opacityClass}">
                    
                    <div class="flex-1 flex flex-col justify-center">
                        <div class="flex items-center gap-3 mb-1">
                            <span class="text-sm font-black text-white tracking-tight flex items-center gap-2">
                                <i data-lucide="truck" class="w-4 h-4 text-slate-400"></i> ${provName}
                            </span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${colorEstado}">${rec.estado}</span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${rec.estado_conciliacion === 'CONCILIADA' ? 'bg-indigo-900/30 text-indigo-400 border-indigo-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'}">${rec.estado_conciliacion || 'PENDIENTE'}</span>
                        </div>
                        <div class="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                            <span title="ID de Recepción">REC: ${rec.id.split('-')[0]}</span>
                            <span title="Remito Declarado" class="text-blue-300 font-bold bg-blue-900/20 px-1 rounded">RTO: ${remito}</span>
                            <span title="Pedido Origen">PED: ${rec.pedido_id.split('-')[0]} (${docType})</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-6 shrink-0">
                        <div class="flex flex-col items-end opacity-70">
                            <span class="text-[10px] text-slate-400 font-mono flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> ${fechaFormat}</span>
                        </div>

                        <div class="flex items-center gap-2">
                            ${!isAnulada ? `
                            <button onclick="window.anularReception('${rec.id}')" class="px-3 py-2 bg-amber-600/10 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1" title="Anular esta Recepción (Soft Delete)">
                                <i data-lucide="ban" class="w-4 h-4"></i> Anular
                            </button>
                            ` : ''}
                            <button onclick="window.revertirReception('${rec.id}')" class="px-3 py-2 bg-red-600/10 text-red-400 hover:bg-red-700 hover:text-white border border-red-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1" title="Revertir y Eliminar Físicamente">
                                <i data-lucide="undo-2" class="w-4 h-4"></i> Revertir
                            </button>
                            <button onclick="window.viewReceptionDetails('${rec.id}', '${provName}', '${remito}')" class="px-3 py-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1" title="Ver Detalle de Ítems">
                                <i data-lucide="list-checks" class="w-4 h-4"></i> Ver Ítems
                            </button>
                        </div>
                    </div>
                    
                    ${rec.notas ? `<div class="absolute bottom-0 right-0 p-1 mr-2 opacity-50 text-[9px] text-slate-500 italic max-w-xs truncate" title="${rec.notas}">Notas: ${rec.notas}</div>` : ''}
                </div>
            `;
        });
        
        cardsHtml += `
                </div> <!-- End of space-y-4 -->
            </div> <!-- End of temporal block -->
        `;
    });
    
    container.innerHTML = cardsHtml;
    if (window.lucide) window.lucide.createIcons();
}

window.viewReceptionDetails = async function(recepcionId, provName, remito) {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in slide-in-from-right-4 duration-300 p-2">
            <div class="flex justify-between items-start mb-6 border-b border-slate-800 pb-4 shrink-0">
                <div class="flex items-center gap-4">
                    <button onclick="window.openReceptionHistory()" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors group" title="Volver al Historial">
                        <i data-lucide="arrow-left" class="w-5 h-5 group-hover:-translate-x-1 transition-transform"></i>
                    </button>
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            Detalle de Recepción Física
                        </h3>
                        <div class="flex items-center gap-3 mt-1">
                            <p class="text-[10px] uppercase tracking-widest text-indigo-400 font-bold">PROVEEDOR: ${provName}</p>
                            <span class="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 rounded">REMITO: ${remito}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex-1 flex items-center justify-center text-blue-400" id="recDetLoader">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i>
            </div>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    try {
        const ts = new Date().getTime();
        const res = await fetch(`${API_BASE}/api/recepcion/historial/${recepcionId}/items?_t=${ts}`);
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        renderReceptionItemsDetail(result.data, provName);
    } catch (e) {
        console.error("Error al cargar detalle de recepción:", e);
        document.getElementById('recDetLoader').innerHTML = `<p class="text-red-500 text-sm">Error al cargar los ítems.</p>`;
    }
}

function renderReceptionItemsDetail(items, provName) {
    const loader = document.getElementById('recDetLoader');
    if (!loader) return;
    
    if (!items || items.length === 0) {
        loader.innerHTML = `<p class="text-slate-500 text-sm uppercase tracking-widest">Sin ítems registrados.</p>`;
        return;
    }

    let html = `
        <div class="w-full bg-slate-900 border border-slate-800/50 rounded-xl overflow-hidden flex flex-col shadow-2xl h-full">
            <div class="overflow-x-auto w-full custom-scrollbar flex-1 relative h-full">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead class="bg-slate-950 sticky top-0 z-10 shadow-md">
                        <tr>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Cód / SKU</th>
                            <th class="w-full p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción de Mercadería</th>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-center">Esperado</th>
                            <th class="p-4 text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-900/50 text-center bg-emerald-900/20 border-l border-emerald-900/30">Físico Recibido</th>
                            <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-center">Trazabilidad</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/50">
    `;

    items.forEach(i => {
        const ped = i.pedidos_b2b_items || {};
        const cod = ped.producto_codigo || 'N/A';
        const desc = ped.producto_descripcion || 'Sin descripción';
        const unit = ped.unidad_ref || 'U';
        
        const esperado = Number(i.cantidad_esperada);
        const recibido = Number(i.cantidad_recibida);
        
        let iconHtml = '';
        if (recibido === 0) iconHtml = '<i data-lucide="x-circle" class="w-4 h-4 inline mr-1 text-red-500"></i>';
        else if (recibido < esperado) iconHtml = '<i data-lucide="alert-circle" class="w-4 h-4 inline mr-1 text-amber-500"></i>';
        else iconHtml = '<i data-lucide="check-circle-2" class="w-4 h-4 inline mr-1 text-emerald-500"></i>';

        html += `
            <tr class="hover:bg-slate-800/50 transition-colors">
                <td class="p-4 text-xs font-mono text-slate-400">#${cod}</td>
                <td class="p-4 text-xs font-bold text-slate-200">${desc} <span class="text-[9px] text-slate-500 font-mono ml-2">${unit}</span></td>
                <td class="p-4 text-sm font-mono text-slate-400 text-center border-l border-slate-800/30">${esperado}</td>
                <td class="p-4 text-sm font-black text-emerald-400 font-mono text-center bg-emerald-900/10 border-l border-emerald-900/30 shadow-inner">
                    ${iconHtml} ${recibido}
                </td>
                <td class="p-4 text-center border-l border-slate-800/30">
                    <button onclick="window.printZplLabel('${i.id}', '${desc.replace(/'/g, "\\'")}', '${provName.replace(/'/g, "\\'")}', ${recibido})" class="px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 rounded text-[10px] font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-1" title="Imprimir Etiquetas Zebra (ZPL)">
                        <i data-lucide="printer" class="w-3 h-3"></i> Imprimir Lote
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    loader.outerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

window.anularReception = async function(recepcionId) {
    if (!window.Swal) {
        alert("SweetAlert2 no está cargado.");
        return;
    }

    const { value: motivo } = await Swal.fire({
        title: 'Anular Recepción',
        input: 'text',
        inputLabel: 'Motivo de la anulación (Obligatorio)',
        inputPlaceholder: 'Ej: Error humano de doble carga...',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Anular Definitivamente',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc',
        inputValidator: (value) => {
            if (!value || value.trim().length < 5) {
                return 'Debes proporcionar un motivo válido y claro.'
            }
        }
    });

    if (motivo) {
        Swal.fire({ title: 'Procesando Anulación...', background: '#0f172a', color: '#f8fafc', didOpen: () => Swal.showLoading() });
        
        try {
            const res = await fetch(`${API_BASE}/api/recepcion/anular`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recepcion_id: recepcionId, motivo: motivo.trim() })
            });
            
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            
            Swal.fire({
                icon: 'success', 
                title: 'Recepción Anulada', 
                text: `El pedido fue re-calculado y ahora se encuentra en estado: ${result.estado_pedido}`,
                background: '#0f172a', 
                color: '#10b981'
            });
            
            // Recargar datos
            window.loadReceptionHistory();
            if (window.loadActiveOrders) window.loadActiveOrders(); // Update "Pedidos Activos" in background if open

        } catch (e) {
            console.error("Error al anular recepción:", e);
            Swal.fire({
                icon: 'error', 
                title: 'Fallo al Anular', 
                text: e.message,
                background: '#0f172a', 
                color: '#ef4444'
            });
        }
    }
}

window.revertirReception = async function(recepcionId) {
    if (!window.Swal) {
        alert("SweetAlert2 no está cargado.");
        return;
    }

    const result = await Swal.fire({
        title: 'REVERSIÓN DESTRUCTIVA',
        text: 'Esta acción eliminará FÍSICAMENTE la recepción de la base de datos, revertirá el inventario, y retrocederá el estado del pedido a su punto original. Esta acción NO se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#b91c1c',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Destruir y Revertir',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Ejecutando Reversión...', background: '#0f172a', color: '#f8fafc', didOpen: () => Swal.showLoading() });
        
        try {
            const res = await fetch(`${API_BASE}/api/recepcion/revertir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recepcion_id: recepcionId })
            });
            
            const reqResult = await res.json();
            if (!reqResult.success) throw new Error(reqResult.error);
            
            Swal.fire({
                icon: 'success', 
                title: 'Recepción Revertida', 
                text: `Se ha purgado el registro e inventario. El pedido retrocedió al estado: ${reqResult.estado_pedido}`,
                background: '#0f172a', 
                color: '#10b981'
            });
            
            // Recargar datos
            window.loadReceptionHistory();
            if (window.loadActiveOrders) window.loadActiveOrders(); // Update "Pedidos Activos"
            if (window.loadInventory) window.loadInventory(); // Opcional

        } catch (e) {
            console.error("Error al revertir recepción:", e);
            Swal.fire({
                icon: 'error', 
                title: 'Fallo al Revertir', 
                text: e.message,
                background: '#0f172a', 
                color: '#ef4444'
            });
        }
    }
}

// Generador de etiquetas ZPL para la recepción física (Zero Clicks / Zebra Browser Print SDK)
window.printZplLabel = function(itemId, itemName, provName, quantity) {
    if (!quantity || quantity <= 0) return;
    
    // Extracción de Short Hash (Primeros 8 caracteres del UUID)
    const shortId = itemId.substring(0, 8);
    
    // Limpieza básica para evitar romper el ZPL
    const safeItemName = (itemName || '').substring(0, 30).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const safeProvName = (provName || '').substring(0, 30).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const cantidadPar = quantity % 2 === 0 ? quantity : quantity + 1;
    const pairs = Math.ceil(cantidadPar / 2);
    
    let zplData = '';
    for (let i = 0; i < pairs; i++) {
        zplData += `^XA
^LH0,0 ^LT0
^CF0,30 ^FO23,10^FD${safeItemName}^FS
^CF0,20 ^FO23,45^FD${safeProvName}^FS
^BY2,2,40 ^FO23,90^BCN,60,Y,N,N ^FD${shortId}^FS

^CF0,30 ^FO443,10^FD${safeItemName}^FS
^CF0,20 ^FO443,45^FD${safeProvName}^FS
^BY2,2,40 ^FO443,90^BCN,60,Y,N,N ^FD${shortId}^FS
^XZ\n`;
    }
    
    // Impresión asíncrona mediante Zebra Browser Print SDK
    try {
        if (typeof window.BrowserPrint === 'undefined') {
            throw new Error("El SDK Zebra Browser Print no se ha cargado. Verifica el archivo js/BrowserPrint.js.");
        }

        console.log("[ZPL] Solicitando lista de dispositivos locales a Zebra Browser Print...");
        
        window.BrowserPrint.getLocalDevices(function(deviceList) {
            console.log("[ZPL] Lista de dispositivos detectados:", deviceList);
            
            let printers = [];
            if (Array.isArray(deviceList)) {
                printers = deviceList;
            } else if (deviceList && deviceList['printer']) {
                printers = deviceList['printer'];
            }

            if (printers.length === 0) {
                return Swal.fire({
                    icon: 'error',
                    title: 'Sin Impresoras',
                    text: 'Browser Print no detectó ninguna impresora instalada en el sistema.',
                    background: '#0f172a',
                    color: '#ef4444'
                });
            }

            // Buscar impresora Zebra/ZDesigner, sino agarrar la primera o la default
            let targetDevice = printers.find(p => p.name.toLowerCase().includes('zebra') || p.name.toLowerCase().includes('zdesigner'));
            if (!targetDevice) {
                targetDevice = printers[0]; // Fallback a la primera disponible
            }

            console.log("[ZPL] Impresora seleccionada para enviar trabajo:", targetDevice.name);

            if (targetDevice && targetDevice.connection !== undefined) {
                targetDevice.send(zplData, function(success) {
                    console.log("[ZPL] Trabajo enviado exitosamente a", targetDevice.name);
                    Swal.fire({
                        icon: 'success',
                        title: 'Enviado a Cola',
                        text: 'Etiquetas despachadas a: ' + targetDevice.name,
                        background: '#0f172a',
                        color: '#10b981',
                        timer: 2000,
                        showConfirmButton: false
                    });
                }, function(error) {
                    console.error("[ZPL] Error enviando datos a la impresora (" + targetDevice.name + "):", error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Fallo de Impresión',
                        text: 'Fallo al escribir en [' + targetDevice.name + ']: ' + (error || 'Error desconocido del Spooler'),
                        background: '#0f172a',
                        color: '#ef4444'
                    });
                });
            } else {
                throw new Error("El dispositivo seleccionado no posee una conexión válida.");
            }
        }, function(error) {
            console.error("[ZPL] Error localizando dispositivos:", error);
            Swal.fire({
                icon: 'error',
                title: 'Servicio Zebra No Detectado',
                text: 'No se pudo conectar con el motor de impresión local. Asegúrese de que la aplicación Zebra Browser Print esté ejecutándose.',
                background: '#0f172a',
                color: '#ef4444'
            });
        }, "printer");

    } catch(e) {
        console.error("[ZPL] Excepción de Motor:", e);
        Swal.fire({
            icon: 'error',
            title: 'Fallo de Motor ZPL',
            text: e.message,
            background: '#0f172a',
            color: '#ef4444'
        });
    }
};
