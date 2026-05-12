// recepcion_fisica_ui.js
// Lógica para el módulo de Recepción Física de Mercadería

let recProvidersCache = [];
let recActiveProviderId = null;
let recActiveOrderId = null;
let recActiveOrderItems = [];

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

window.openReceptionModal = async () => {
    const modal = document.getElementById('receptionModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    await loadRecProviders();
};

window.closeReceptionModal = () => {
    const modal = document.getElementById('receptionModal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    resetReceptionUI();
};

const resetReceptionUI = () => {
    recActiveProviderId = null;
    recActiveOrderId = null;
    recActiveOrderItems = [];
    
    document.getElementById('recActiveProviderName').innerText = 'Seleccione un Proveedor';
    document.getElementById('recOrderSelectorContainer').style.display = 'none';
    document.getElementById('recOrderSelect').innerHTML = '<option value="">Seleccione un pedido...</option>';
    
    document.getElementById('recEmptyState').style.display = 'flex';
    document.getElementById('recItemsTable').style.display = 'none';
    document.getElementById('recBottomBar').style.display = 'none';
    
    document.getElementById('recRemitoInput').value = '';
    document.getElementById('recNotasInput').value = '';

    // Remove active styles from tabs
    document.querySelectorAll('.rec-provider-tab').forEach(t => {
        t.classList.remove('bg-blue-600/20', 'border-blue-500/30', 'text-blue-400');
        t.classList.add('bg-slate-900', 'border-slate-800', 'text-slate-400');
    });
};

const loadRecProviders = async () => {
    try {
        const container = document.getElementById('recProviderTabs');
        container.innerHTML = '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">Proveedores</p><div class="p-2 text-xs text-slate-500">Cargando...</div>';
        
        // Obtenemos todos los proveedores desde el global context si existe, o desde la api.
        if (window.currentSuppliers && window.currentSuppliers.length > 0) {
            recProvidersCache = window.currentSuppliers;
        } else if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient.from('proveedores').select('*').order('nombre', { ascending: true });
            if (error) throw new Error(error.message);
            recProvidersCache = data || [];
            window.currentSuppliers = recProvidersCache; // Poblar caché
        } else {
            throw new Error("El caché global de proveedores no está inicializado y Supabase no está disponible. Recarga la página.");
        }
        
        container.innerHTML = '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">Proveedores</p>';
        
        if (recProvidersCache.length === 0) {
            container.innerHTML += '<div class="p-2 text-xs text-slate-500">No hay proveedores con catálogos B2B.</div>';
            return;
        }

        recProvidersCache.forEach(prov => {
            const btn = document.createElement('button');
            btn.className = `rec-provider-tab w-full text-left p-3 rounded-lg border bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-all flex flex-col`;
            btn.innerHTML = `
                <span class="text-xs font-bold truncate">${prov.nombre}</span>
                <span class="text-[10px] opacity-70">${prov.categoria || 'Sin rubro'}</span>
            `;
            btn.onclick = () => selectRecProvider(prov.id, prov.nombre, btn);
            container.appendChild(btn);
        });

    } catch (error) {
        console.error('[RECEPCION] Error al cargar proveedores:', error);
    }
};

const selectRecProvider = async (providerId, providerName, btnElement) => {
    resetReceptionUI();
    recActiveProviderId = providerId;
    
    document.getElementById('recActiveProviderName').innerText = providerName;

    // Highlight selected
    const container = document.getElementById('recProviderTabs');
    container.querySelectorAll('button').forEach(b => {
        b.classList.remove('bg-blue-600/20', 'border-blue-500/30', 'text-blue-400');
        b.classList.add('bg-slate-900', 'border-slate-800', 'text-slate-400');
    });
    if (btnElement) {
        btnElement.classList.remove('bg-slate-900', 'border-slate-800', 'text-slate-400');
        btnElement.classList.add('bg-blue-600/20', 'border-blue-500/30', 'text-blue-400');
    }

    await fetchActiveOrders(providerId);
};

const fetchActiveOrders = async (providerId) => {
    try {
        const selectContainer = document.getElementById('recOrderSelectorContainer');
        const selectEl = document.getElementById('recOrderSelect');
        
        selectEl.innerHTML = '<option value="">Cargando...</option>';
        selectContainer.style.display = 'flex';

        const ts = new Date().getTime();
        const res = await fetch(`${API_BASE}/api/recepcion/pedidos/${providerId}?_t=${ts}`);
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        const orders = result.data || [];
        
        if (orders.length === 0) {
            selectEl.innerHTML = '<option value="">No hay pedidos en tránsito</option>';
            return;
        }

        selectEl.innerHTML = '<option value="">Seleccione un pedido...</option>';
        orders.forEach(order => {
            const dateStr = new Date(order.fecha_emision).toLocaleDateString('es-AR');
            const opt = document.createElement('option');
            opt.value = order.id;
            opt.textContent = `Emisión: ${dateStr} - ${order.estado}`;
            selectEl.appendChild(opt);
        });

    } catch (error) {
        console.error('[RECEPCION] Error al obtener pedidos:', error);
        alert('Error al cargar los pedidos del proveedor.');
    }
};

window.loadReceptionOrder = async (pedidoId) => {
    if (!pedidoId) {
        recActiveOrderId = null;
        document.getElementById('recEmptyState').style.display = 'flex';
        document.getElementById('recItemsTable').style.display = 'none';
        document.getElementById('recBottomBar').style.display = 'none';
        return;
    }
    
    recActiveOrderId = pedidoId;
    document.getElementById('recEmptyState').style.display = 'none';
    
    try {
        const ts = new Date().getTime();
        const res = await fetch(`${API_BASE}/api/recepcion/pedido/${pedidoId}/items?_t=${ts}`);
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        recActiveOrderItems = result.data || [];
        renderRecItems();
        
    } catch (error) {
        console.error('[RECEPCION] Error al cargar ítems del pedido:', error);
        alert('Error al cargar el detalle del pedido.');
    }
};

const renderRecItems = () => {
    const tbody = document.getElementById('recItemsBody');
    tbody.innerHTML = '';
    
    if (recActiveOrderItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">No hay ítems en este pedido.</td></tr>';
        document.getElementById('recBottomBar').style.display = 'none';
        return;
    }

    document.getElementById('recItemsTable').style.display = 'table';
    document.getElementById('recBottomBar').style.display = 'flex';

    recActiveOrderItems.forEach(item => {
        const pedida = Number(item.cantidad);
        const previa = Number(item.cantidad_previa_recibida || 0);
        const aRecibirSugerido = Math.max(pedida - previa, 0);

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/50 transition-colors";
        
        let statusBadge = '';
        if (previa > 0 && previa < pedida) {
            statusBadge = '<span class="ml-2 text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">PARCIAL</span>';
        } else if (previa >= pedida && pedida > 0) {
            statusBadge = '<span class="ml-2 text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">COMPLETO</span>';
        }

        const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);

        tr.innerHTML = `
            <td class="p-3 font-mono text-slate-400">${item.producto_codigo}</td>
            <td class="p-3 font-medium text-slate-300">${item.producto_descripcion} ${statusBadge}</td>
            <td class="p-3 text-center text-slate-400 text-xs uppercase tracking-wider">${item.unidad_ref || '-'}</td>
            <td class="p-3 text-center text-slate-400 font-mono text-xs">${item.factor_conversion > 1 ? `x${item.factor_conversion} KG` : '1.00'}</td>
            <td class="p-3 text-center text-emerald-400 font-mono text-xs">${formatMoney(item.valor_unitario_ref || 0)}</td>
            <td class="p-3 text-center text-slate-300">${pedida}</td>
            <td class="p-3 text-center text-emerald-400 font-mono">${previa}</td>
            <td class="p-3 text-center">
                <input type="number" step="0.01" min="0" value="${aRecibirSugerido}" data-item-id="${item.id}" data-esperado="${pedida}"
                    class="rec-qty-input w-24 bg-slate-950 border border-slate-700 text-white text-center rounded px-2 py-1 outline-none focus:border-blue-500">
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.submitReception = async () => {
    if (!recActiveOrderId) return;
    
    const remito = document.getElementById('recRemitoInput').value.trim();
    const notas = document.getElementById('recNotasInput').value.trim();
    
    const inputs = document.querySelectorAll('.rec-qty-input');
    const items_recibidos = [];
    
    let hasValue = false;
    inputs.forEach(inp => {
        const val = Number(inp.value);
        if (val > 0) hasValue = true;
        
        items_recibidos.push({
            pedido_item_id: inp.getAttribute('data-item-id'),
            cantidad_esperada: Number(inp.getAttribute('data-esperado')),
            cantidad_recibida: val
        });
    });
    
    if (!hasValue) {
        alert("Debes indicar al menos una cantidad recibida mayor a cero.");
        return;
    }
    
    const btn = document.getElementById('btnSubmitReception');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Registrando...';
    lucide.createIcons();

    try {
        const payload = {
            pedido_id: recActiveOrderId,
            numero_remito: remito,
            notas: notas,
            items_recibidos: items_recibidos
        };

        const res = await fetch(`${API_BASE}/api/recepcion/registrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        // Success
        await Swal.fire({
            title: 'Recepción Registrada',
            text: `El evento ha sido guardado exitosamente. Estado actual: ${result.estado_final}`,
            icon: 'success',
            background: '#0f172a',
            color: '#fff',
            confirmButtonColor: '#2563eb'
        });
        
        // Clean form inputs
        document.getElementById('recRemitoInput').value = '';
        document.getElementById('recNotasInput').value = '';

        // Reload the provider's active orders so the dropdown reflects the new reality
        const currentProvSelect = document.getElementById('recProviderSelect');
        if (currentProvSelect && currentProvSelect.value) {
            window.loadReceptionProvider(currentProvSelect.value);
        }
        
        if (result.estado_final === 'Recepción Completa') {
            // Clear the items view, as it's no longer 'Active'
            document.getElementById('recItemsTable').style.display = 'none';
            document.getElementById('recBottomBar').style.display = 'none';
            
            const emptyState = document.getElementById('recEmptyState');
            emptyState.style.display = 'flex';
            emptyState.innerHTML = `
                <i data-lucide="check-circle-2" class="w-12 h-12 mb-4 opacity-50 text-emerald-500"></i>
                <p class="text-sm font-bold tracking-widest uppercase text-emerald-400">Pedido Completado</p>
                <p class="text-[10px] text-slate-500 mt-2">La logística de esta orden ha finalizado.</p>
            `;
            if (window.lucide) window.lucide.createIcons();
            recActiveOrderId = null;
        } else {
            // Reload order detail (now it's Parcial) to allow further inputs
            window.loadReceptionOrder(recActiveOrderId);
        }

        // Si la vista principal de Pedidos Activos está abierta de fondo, actualizarla
        if (typeof window.loadActiveOrders === 'function') {
            window.loadActiveOrders();
        }
        
    } catch (error) {
        console.error('[RECEPCION] Error al registrar:', error);
        alert(`Error al registrar la recepción: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Confirmar Ingreso';
        if(window.lucide) window.lucide.createIcons();
    }
};

// Listen for lucide redraws when modal opens
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === "class" && !mutation.target.classList.contains('hidden')) {
            if(window.lucide) lucide.createIcons();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('receptionModal');
    if (modal) observer.observe(modal, { attributes: true });
});
