// inventory_ui.js
// Interfaz para la gestión y visibilidad del inventario consolidado

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

window.openInventory = async function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in slide-in-from-bottom-4 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-start mb-6 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h3 class="text-xl font-bold text-emerald-400 tracking-tight flex items-center gap-2">
                        <i data-lucide="package-search" class="w-6 h-6"></i> Control de Inventario
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">Stock Físico Consolidado (Single Source of Truth)</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.loadInventory()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2 shadow-md">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar Stock
                    </button>
                </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 w-full bg-slate-900/80 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col shadow-2xl relative" id="inventoryContainer">
                <div class="flex items-center justify-center h-full text-emerald-400/50">
                    <i data-lucide="loader-2" class="w-8 h-8 animate-spin mr-3"></i> Calculando métricas volumétricas...
                </div>
            </div>
            
            <!-- Bottom StatusBar -->
            <div class="pt-4 flex justify-between items-center shrink-0 border-t border-slate-800 mt-2">
                <span class="text-[10px] text-slate-500 font-mono" id="invCountStatus">Inicializando módulo...</span>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    await window.loadInventory();
};

window.loadInventory = async function() {
    const statusLabel = document.getElementById('invCountStatus');
    if (statusLabel) statusLabel.innerText = "Consultando Vistas de Consolidación (SQL)...";

    // Pre-carga del Maestro para cruzamiento si no existe
    if (!window._rawLamdaData) {
        try {
            const urlOp = `${API_BASE}/api/master-table/operativa`;
            const opJson = await fetch(urlOp).then(r => r.json());
            window._rawLamdaData = opJson.data;
        } catch(e) {
            console.warn("Vigia: Master Catalog no disponible para cruzamiento de inventario.");
        }
    }

    try {
        const ts = new Date().getTime();
        const res = await fetch(`${API_BASE}/api/inventory/stock?_t=${ts}`);
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);
        
        window.inventoryCache = result.data || [];
        renderInventoryTable(window.inventoryCache);
        
    } catch(e) {
        console.error("[INVENTORY] Error al cargar:", e);
        if (statusLabel) statusLabel.innerText = "Fallo General de Sincronización.";
        
        document.getElementById('inventoryContainer').innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-red-500">
                <i data-lucide="server-crash" class="w-12 h-12 mb-3 opacity-80"></i>
                <p class="font-bold tracking-widest uppercase text-sm">El motor de inventario no responde</p>
                <p class="text-xs text-red-400/70 mt-1">${e.message}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
};

function renderInventoryTable(data) {
    const container = document.getElementById('inventoryContainer');
    const statusLabel = document.getElementById('invCountStatus');
    
    if(!container) return;

    if (statusLabel) statusLabel.innerText = `Catálogo Activo: ${data.length} SKUs con stock físico.`;

    if (data.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-500">
                <i data-lucide="boxes" class="w-16 h-16 mb-4 opacity-30"></i>
                <p class="text-sm font-bold tracking-widest uppercase text-slate-400">Inventario Vacío</p>
                <p class="text-[10px] text-slate-600 mt-2">No existen recepciones físicas asentadas en la base de datos.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let html = `
        <div class="overflow-x-auto w-full custom-scrollbar flex-1 relative h-full">
            <table class="w-full text-left border-collapse whitespace-nowrap">
                <thead class="bg-slate-950/80 sticky top-0 z-10 shadow-md backdrop-blur-sm">
                    <tr>
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">SKU</th>
                        <th class="w-full p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción Maestra</th>
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-center">T. Volumétrico</th>
                        <th class="p-4 text-[10px] font-black text-emerald-400 uppercase tracking-widest border-b border-emerald-900/50 text-right bg-emerald-900/10 border-l border-emerald-900/30">Stock Disponible</th>
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Último Ingreso</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/50">
    `;

    data.forEach(item => {
        const sku = item.sku || 'S/N';
        let desc = item.descripcion || 'Sin descripción';
        const stockFisico = Number(item.stock_fisico);
        
        let fechaIngreso = '--';
        if (item.ultimo_ingreso) {
            const d = new Date(item.ultimo_ingreso);
            fechaIngreso = d.toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});
        }

        // Cruzamiento Forense con el Catálogo para Volumetría y Unidad Real
        let bulto = 1; let valor = 1; let abrevUnit = 'U';
        if (window._rawLamdaData) {
            const masterItem = window._rawLamdaData.find(r => {
                const p = r.datos_maestros || {};
                return (p.codigo === sku || p.sku === sku || r.codigo === sku || r.sku === sku);
            });
            
            if (masterItem) {
                const mp = masterItem.datos_maestros || {};
                const parseVol = (v) => { if(!v) return null; const n = parseFloat(String(v).replace(',', '.').trim()); return isNaN(n)? null : n; };
                bulto = parseVol(mp.cant_bult) || parseVol(masterItem.cant_bult) || 1;
                valor = parseVol(mp.cant_valor) || parseVol(masterItem.cant_valor) || 1;
                
                // Unidad base
                let rawUnit = (mp.unidad_compra || masterItem.unidad_compra || 'U').trim().toUpperCase();
                if (rawUnit.includes('KILO') || rawUnit === 'KILOGRAMO' || rawUnit === 'K' || rawUnit === 'KG') abrevUnit = 'Kg';
                else if (rawUnit.includes('GRAMO') || rawUnit === 'GR' || rawUnit === 'G') abrevUnit = 'g';
                else if (rawUnit.includes('LITRO') || rawUnit === 'LT' || rawUnit === 'L') abrevUnit = 'L';
                else if (rawUnit.includes('UNID')) abrevUnit = 'U';
            }
        }
        
        const volumenTotal = stockFisico * bulto * valor;

        // Estilos Dinámicos
        let rowClass = 'hover:bg-slate-800/40 transition-colors group';
        let stockColor = 'text-emerald-400';
        let stockBg = 'bg-emerald-900/10 border-emerald-900/30';
        
        if (stockFisico <= 0) {
            stockColor = 'text-red-500';
            stockBg = 'bg-red-900/10 border-red-900/30';
            rowClass += ' opacity-60 grayscale';
        }

        html += `
            <tr class="${rowClass}">
                <td class="p-4 text-xs font-black text-slate-400 font-mono">#${sku}</td>
                <td class="p-4 text-sm font-bold text-slate-200 truncate max-w-md" title="${desc}">${desc}</td>
                <td class="p-4 text-xs font-mono text-slate-500 text-center border-l border-slate-800/30 opacity-80 group-hover:opacity-100 transition-opacity">
                    ${bulto.toLocaleString('es-AR')} x ${valor.toLocaleString('es-AR')}
                    <span class="text-[9px] uppercase tracking-widest text-blue-400 ml-1 bg-blue-900/20 px-1 rounded">${volumenTotal.toLocaleString('es-AR', {maximumFractionDigits: 2})} ${abrevUnit}</span>
                </td>
                <td class="p-4 text-right ${stockBg} border-l shadow-inner relative">
                    <span class="text-lg font-black ${stockColor} font-mono tracking-tighter">${stockFisico.toLocaleString('es-AR')}</span>
                </td>
                <td class="p-4 text-[10px] font-mono text-slate-500 text-right opacity-70">
                    ${fechaIngreso}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}
