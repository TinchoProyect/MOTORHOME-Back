// inventory_ui.js
// Interfaz para la gestión y visibilidad del inventario consolidado

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

window.currentInventoryTab = window.currentInventoryTab || 'MAIN';

window.setInventoryTab = function(tabId) {
    window.currentInventoryTab = tabId;
    if (window.inventoryCache) {
        renderInventoryTable(window.inventoryCache);
    }
    updateInventoryTabsUI();
};

window.toggleInventoryGroup = function(groupId, headerElement) {
    const isCollapsed = headerElement.getAttribute('data-collapsed') === 'true';
    headerElement.setAttribute('data-collapsed', !isCollapsed);
    
    // Toggle chevron icon rotation
    const icon = headerElement.querySelector('i[data-lucide="chevron-down"]');
    if (icon) {
        if (!isCollapsed) {
            icon.classList.add('-rotate-90');
        } else {
            icon.classList.remove('-rotate-90');
        }
    }

    // Toggle children rows visibility
    const rows = document.querySelectorAll(`tr[data-parent-group="${groupId}"]`);
    rows.forEach(row => {
        if (!isCollapsed) {
            row.classList.add('hidden');
            const childGroupId = row.getAttribute('data-group-id');
            if (childGroupId) {
                const childRows = document.querySelectorAll(`tr[data-parent-group="${childGroupId}"]`);
                childRows.forEach(cr => cr.classList.add('hidden'));
                row.setAttribute('data-collapsed', 'true');
                const childIcon = row.querySelector('i[data-lucide="chevron-down"]');
                if(childIcon) childIcon.classList.add('-rotate-90');
            }
        } else {
            row.classList.remove('hidden');
            const childGroupId = row.getAttribute('data-group-id');
            if (childGroupId) {
                row.setAttribute('data-collapsed', 'true');
                const childIcon = row.querySelector('i[data-lucide="chevron-down"]');
                if(childIcon) childIcon.classList.add('-rotate-90');
            }
        }
    });
};

function updateInventoryTabsUI() {
    const btnMain = document.getElementById('tabMain');
    const btnDev = document.getElementById('tabDev');
    if(btnMain && btnDev) {
        if(window.currentInventoryTab === 'MAIN') {
            btnMain.className = 'px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-widest text-[10px] font-bold transition-colors shadow-sm';
            btnDev.className = 'px-4 py-2 bg-transparent text-slate-500 hover:text-slate-300 rounded uppercase tracking-widest text-[10px] font-bold transition-colors';
        } else {
            btnDev.className = 'px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded uppercase tracking-widest text-[10px] font-bold transition-colors shadow-sm';
            btnMain.className = 'px-4 py-2 bg-transparent text-slate-500 hover:text-slate-300 rounded uppercase tracking-widest text-[10px] font-bold transition-colors';
        }
    }
}

window.openInventory = async function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in slide-in-from-bottom-4 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-end mb-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h3 class="text-xl font-bold text-emerald-400 tracking-tight flex items-center gap-2">
                        <i data-lucide="package-search" class="w-6 h-6"></i> Control de Inventario
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">Stock Físico Consolidado (Single Source of Truth)</p>
                </div>
                <div class="flex items-center gap-4">
                    <div class="flex bg-slate-900/50 rounded p-1 border border-slate-800/80">
                        <button id="tabMain" onclick="window.setInventoryTab('MAIN')" class="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-widest text-[10px] font-bold transition-colors shadow-sm">Stock Físico Real</button>
                        <button id="tabDev" onclick="window.setInventoryTab('DEV')" class="px-4 py-2 bg-transparent text-slate-500 hover:text-slate-300 rounded uppercase tracking-widest text-[10px] font-bold transition-colors">Faltantes de Recepción</button>
                    </div>
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
    updateInventoryTabsUI();
    await window.loadInventory();
};

window.loadInventory = async function() {
    const statusLabel = document.getElementById('invCountStatus');
    if (statusLabel) statusLabel.innerText = "Consultando Vistas de Consolidación (SQL)...";

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

    // Helper de Formateo Estricto Localizado (AR) - Evita fallas del navegador
    const formatMoneyAR = (num) => {
        if (isNaN(num) || num === null) return '0,00';
        const parts = Number(num).toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return parts.join(',');
    };

    const formatQtyAR = (num, maxFrac = 0) => {
        if (isNaN(num) || num === null) return '0';
        // Formatea con decimales dinámicos pero maximos
        let strNum = maxFrac > 0 ? Number(num).toLocaleString('en-US', {maximumFractionDigits: maxFrac, useGrouping: false}) : Number(num).toString();
        const parts = strNum.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return parts.join(',');
    };

    // Enriquecimiento y Parseo
    const enrichedData = data.map(item => {
        let proveedor = 'Proveedor Desconocido';
        let bulto = 1; let valor = 1; let abrevUnit = 'U';
        let precioUnitario = 0;
        let ivaPorcentaje = 21;
        
        if (window._rawLamdaData) {
            const masterItem = window._rawLamdaData.find(r => {
                const p = r.datos_maestros || {};
                return (p.codigo === item.sku || p.sku === item.sku || r.codigo === item.sku || r.sku === item.sku);
            });
            
            if (masterItem) {
                proveedor = masterItem.nombre_proveedor || 'Proveedor Desconocido';
                const mp = masterItem.datos_maestros || {};
                
                // Helper para parsear de forma segura precios con punto de mil y coma decimal (Ej: "7.402,00" o "7402.00")
                const parseSafeNumber = (val) => {
                    if (!val && val !== 0) return null;
                    if (typeof val === 'number') return val;
                    let s = String(val).trim();
                    if (s.includes('.') && s.includes(',')) {
                        if (s.indexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
                        else s = s.replace(/,/g, '');
                    } else if (s.includes(',')) {
                        s = s.replace(/\./g, '').replace(',', '.'); // Por si acaso tiene múltiples comas como mil
                    }
                    const n = parseFloat(s);
                    return isNaN(n) ? null : n;
                };

                const parseVol = (v) => parseSafeNumber(v);
                bulto = parseVol(mp.cant_bult) || parseVol(masterItem.cant_bult) || 1;
                valor = parseVol(mp.cant_valor) || parseVol(masterItem.cant_valor) || 1;
                
                precioUnitario = parseSafeNumber(mp.precio) ?? parseSafeNumber(masterItem.precio) ?? 0;
                let rawIva = item.iva_aplicado ?? mp.iva ?? masterItem.iva ?? '21';
                ivaPorcentaje = parseFloat(String(rawIva).replace('%', '').replace(',', '.')) || 0;

                let rawUnit = (mp.unidad_compra || masterItem.unidad_compra || 'U').trim().toUpperCase();
                if (rawUnit.includes('KILO') || rawUnit === 'KILOGRAMO' || rawUnit === 'K' || rawUnit === 'KG') abrevUnit = 'Kg';
                else if (rawUnit.includes('GRAMO') || rawUnit === 'GR' || rawUnit === 'G') abrevUnit = 'g';
                else if (rawUnit.includes('LITRO') || rawUnit === 'LT' || rawUnit === 'L') abrevUnit = 'L';
                else if (rawUnit.includes('UNID')) abrevUnit = 'U';
            }
        }
        
        let d = item.ultimo_ingreso ? new Date(item.ultimo_ingreso) : new Date(0);
        
        return {
            ...item,
            proveedor,
            bulto, valor, abrevUnit,
            precioUnitario,
            precioBulto: precioUnitario * valor,
            ivaPorcentaje,
            dateObj: d,
            stockFisico: Number(item.stock_fisico),
            volumenTotal: Number(item.stock_fisico) * bulto * valor,
            valuacionLote: Number(item.stock_fisico) * (precioUnitario * valor)
        };
    });

    const isMain = window.currentInventoryTab === 'MAIN';
    let filteredData = isMain 
        ? enrichedData.filter(i => i.stockFisico > 0)
        : enrichedData.filter(i => i.stockFisico <= 0);

    filteredData.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    if (statusLabel) statusLabel.innerText = `Catálogo ${isMain ? 'Principal' : 'de Desvíos'}: ${filteredData.length} SKUs listados.`;

    if (filteredData.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-500">
                <i data-lucide="${isMain ? 'boxes' : 'check-circle-2'}" class="w-16 h-16 mb-4 opacity-30 ${!isMain ? 'text-emerald-500' : ''}"></i>
                <p class="text-sm font-bold tracking-widest uppercase text-slate-400">${isMain ? 'Inventario Vacío' : 'Sin Desvíos Físicos'}</p>
                <p class="text-[10px] text-slate-600 mt-2">${isMain ? 'No existen recepciones físicas consolidadas.' : 'Todas las recepciones arribaron sin faltantes.'}</p>
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
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 w-24">Código</th>
                        <th class="w-full p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Descripción Maestra</th>
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-center">T. Volumétrico</th>
                        <th class="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right w-40">Costos (Un. / Bult.)</th>
                        <th class="p-4 text-[10px] font-black ${isMain ? 'text-emerald-400 bg-emerald-900/10 border-emerald-900/50' : 'text-amber-400 bg-amber-900/10 border-amber-900/50'} uppercase tracking-widest border-b text-right border-l shadow-inner w-48">${isMain ? 'Total Físico (Lote)' : 'Faltante Registrado'}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/50">
    `;

    let currentYearMonth = '';
    let currentDisplayDate = '';
    let currentProvider = '';

    filteredData.forEach(item => {
        const sku = item.sku || 'S/N';
        let desc = item.descripcion || 'Sin descripción';
        const stockFisico = item.stockFisico;
        const bulto = item.bulto;
        const valor = item.valor;
        const abrevUnit = item.abrevUnit;
        const volumenTotal = item.volumenTotal;
        const precioUnitario = item.precioUnitario;
        const precioBulto = item.precioBulto;
        const ivaP = item.ivaPorcentaje || 0;
        const ivaDisplay = ivaP === 0 ? '0%' : (ivaP === 10.5 ? '10,5%' : `${ivaP}%`);
        const ivaColor = ivaP === 0 ? 'text-slate-500 bg-slate-800/50' : (ivaP === 10.5 ? 'text-blue-400 bg-blue-900/20' : 'text-amber-400 bg-amber-900/20');
        const valuacionLote = item.valuacionLote;
        const d = item.dateObj;

        let yearMonth = '--';
        let displayDate = '--';
        let provider = item.proveedor;
        
        if (d.getTime() > 0) {
            const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
            
            const yyyy = d.getFullYear();
            const mm = d.getMonth();
            const dd = String(d.getDate()).padStart(2, '0');
            const dayName = days[d.getDay()];

            yearMonth = `${yyyy} - ${months[mm]}`;
            displayDate = `${dayName}, ${dd} de ${months[mm]} de ${yyyy}`;
        }

        const groupIdMonth = `g-month-${yearMonth.replace(/\s/g, '')}`;
        const groupIdDay = `g-day-${displayDate.replace(/\s/g, '')}`;
        const groupIdProvider = `g-prov-${provider.replace(/\s/g, '')}`;

        // 1. Cabecera Nivel 1: MES (Plegada por Defecto)
        if (yearMonth !== currentYearMonth && yearMonth !== '--') {
            html += `
                <tr class="bg-slate-950 hover:bg-slate-900 cursor-pointer transition-colors group" onclick="window.toggleInventoryGroup('${groupIdMonth}', this)" data-collapsed="true">
                    <td colspan="5" class="p-3 text-xs font-black text-slate-400 uppercase tracking-widest border-y border-slate-800/80 shadow-sm">
                        <i data-lucide="chevron-down" class="w-4 h-4 inline mr-1 text-slate-600 transition-transform duration-200 -rotate-90"></i>
                        <i data-lucide="calendar" class="w-3 h-3 inline mr-2 mb-0.5 text-slate-500"></i> ${yearMonth}
                    </td>
                </tr>
            `;
            currentYearMonth = yearMonth;
            currentDisplayDate = '';
            currentProvider = '';
        }

        // 2. Cabecera Nivel 2: DIA (Oculta por Defecto)
        if (displayDate !== currentDisplayDate && displayDate !== '--') {
            html += `
                <tr class="bg-slate-900/60 hover:bg-slate-800/80 cursor-pointer transition-colors hidden" onclick="window.toggleInventoryGroup('${groupIdDay}', this)" data-collapsed="true" data-parent-group="${groupIdMonth}" data-group-id="${groupIdDay}">
                    <td colspan="5" class="px-4 py-2 pl-8 text-[11px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800/50">
                        <i data-lucide="chevron-down" class="w-3 h-3 inline mr-1 text-slate-500 transition-transform duration-200 -rotate-90"></i>
                        <i data-lucide="clock" class="w-3 h-3 inline mr-1 mb-0.5 text-slate-600"></i> ${displayDate}
                    </td>
                </tr>
            `;
            currentDisplayDate = displayDate;
            currentProvider = '';
        }

        // 3. Cabecera Nivel 3: PROVEEDOR (Oculta por Defecto)
        if (provider !== currentProvider) {
            html += `
                <tr class="bg-slate-900/30 hidden" data-parent-group="${groupIdDay}">
                    <td colspan="5" class="px-4 py-1.5 pl-12 text-[10px] font-bold text-blue-400/80 uppercase tracking-widest border-b border-slate-800/30">
                        <i data-lucide="truck" class="w-3 h-3 inline mr-1 text-blue-500/50"></i> ${provider}
                    </td>
                </tr>
            `;
            currentProvider = provider;
        }

        let rowClass = 'hover:bg-slate-800/40 transition-colors group hidden';
        let stockColor = isMain ? 'text-emerald-400' : 'text-amber-500';
        let stockBg = isMain ? 'bg-emerald-900/10 border-emerald-900/30' : 'bg-amber-900/10 border-amber-900/30';
        
        if (!isMain) {
            rowClass += ' opacity-80';
        }

        html += `
            <tr class="${rowClass}" data-parent-group="${groupIdDay}">
                <td class="p-4 text-xs font-black text-slate-400 font-mono pl-14 border-l-2 border-transparent group-hover:border-blue-500/50">#${sku}</td>
                <td class="p-4">
                    <div class="text-sm font-bold text-slate-200 truncate max-w-sm" title="${desc}">${desc}</div>
                </td>
                <td class="p-4 text-xs font-mono text-slate-500 text-center border-l border-slate-800/30 opacity-80 group-hover:opacity-100 transition-opacity">
                    ${formatQtyAR(bulto)} x ${formatQtyAR(valor)} ${abrevUnit}
                </td>
                <td class="p-4 text-right border-l border-slate-800/30 font-mono text-slate-400 text-xs relative group/price z-10 hover:z-50">
                    <div class="flex flex-col items-end justify-center transform origin-right transition-all duration-300 group-hover/price:scale-[1.8] group-hover/price:-translate-x-4 group-hover/price:bg-slate-800 group-hover/price:p-3 group-hover/price:rounded-lg group-hover/price:shadow-2xl group-hover/price:border group-hover/price:border-slate-600 cursor-pointer">
                        <span class="text-[10px] text-slate-500 mb-0.5 flex items-center justify-end gap-1">$${formatMoneyAR(precioUnitario)} / ${abrevUnit} <span class="text-[8px] font-bold px-1 rounded uppercase tracking-wider ${ivaColor}">IVA ${ivaDisplay}</span></span>
                        <span class="text-xs font-bold text-slate-300">$${formatMoneyAR(precioBulto)} <span class="text-[9px] text-slate-500 font-sans ml-1">Caja/Bol</span></span>
                    </div>
                </td>
                <td class="p-4 text-right ${stockBg} border-l shadow-inner relative group/stock">
                    <div class="flex flex-col items-end justify-center">
                        <span class="text-lg font-black ${stockColor} font-mono tracking-tighter leading-none mb-1">${formatQtyAR(stockFisico)} <span class="text-[10px] font-sans font-bold opacity-60">BULTOS</span></span>
                        <span class="text-xs text-blue-400 uppercase tracking-widest font-bold">${formatQtyAR(volumenTotal, 2)} ${abrevUnit} Netos</span>
                        <span class="text-[9px] text-slate-500 opacity-0 group-hover/stock:opacity-100 transition-opacity absolute bottom-1 right-4">Valuación: $${formatMoneyAR(valuacionLote)}</span>
                    </div>
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
