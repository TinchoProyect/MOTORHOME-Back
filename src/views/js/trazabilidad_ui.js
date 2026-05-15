// trazabilidad_ui.js
// Interfaz de consulta rápida vía escáner láser para trazabilidad de lotes

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

window.openTrazabilidad = function() {
    const reportDisplay = document.getElementById('reportDisplay');
    if(!reportDisplay) return;

    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 p-2">
            <!-- Header section -->
            <div class="flex justify-between items-start mb-4 pb-4 shrink-0 border-b border-slate-800">
                <div>
                    <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <i data-lucide="scan-barcode" class="w-6 h-6 text-indigo-400"></i> Consulta de Lote
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">Escaneo láser para trazabilidad física en depósito</p>
                </div>
            </div>

            <!-- Scanner Input -->
            <div class="w-full max-w-xl mx-auto mt-8 shrink-0 relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i data-lucide="barcode" class="w-6 h-6 text-slate-400"></i>
                </div>
                <input 
                    type="text" 
                    id="scannerInput" 
                    autocomplete="off"
                    class="w-full pl-12 pr-4 py-4 bg-slate-900 border-2 border-indigo-500/50 rounded-xl text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                    placeholder="Escanee el código de lote aquí..."
                    onkeydown="window.handleScanner(event)"
                >
                <div class="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span class="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-900/30 px-2 py-1 rounded">Listo</span>
                </div>
            </div>

            <p class="text-center text-[10px] text-slate-500 mt-3 font-mono">El campo recupera el foco automáticamente tras cada escaneo.</p>

            <!-- Content Area (Matrix) -->
            <div id="trazabilidadResult" class="flex-1 w-full max-w-3xl mx-auto mt-8 overflow-y-auto custom-scrollbar">
                <div class="flex flex-col items-center justify-center py-10 opacity-50">
                    <i data-lucide="box" class="w-16 h-16 text-slate-600 mb-4"></i>
                    <p class="text-sm font-bold uppercase tracking-widest text-slate-500">Esperando Lectura</p>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Autofocus
    setTimeout(() => {
        const input = document.getElementById('scannerInput');
        if (input) input.focus();
    }, 100);
};

window.handleScanner = async function(event) {
    if (event.keyCode === 13) {
        event.preventDefault();
        const input = event.target;
        const loteId = input.value.trim();
        
        input.value = ''; // Limpiar input para la próxima lectura
        input.blur();     // Desenfocar momentáneamente

        if (loteId.length < 5) {
            renderTrazabilidadError("Lectura Inválida o Incompleta.");
            setTimeout(() => input.focus(), 100);
            return;
        }

        renderTrazabilidadLoading();

        try {
            const ts = new Date().getTime();
            const res = await fetch(`${API_BASE}/api/recepcion/trazabilidad/${encodeURIComponent(loteId)}?_t=${ts}`);
            const result = await res.json();
            
            if (!result.success) throw new Error(result.error);
            
            renderTrazabilidadMatrix(result.data);
            
        } catch (e) {
            console.error("[TRAZABILIDAD] Error:", e);
            renderTrazabilidadError(e.message);
        } finally {
            // Recuperar foco al instante tras renderizar
            setTimeout(() => input.focus(), 100);
        }
    }
};

function renderTrazabilidadLoading() {
    const container = document.getElementById('trazabilidadResult');
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 text-blue-400">
            <i data-lucide="loader-2" class="w-10 h-10 animate-spin mb-4"></i>
            <p class="text-sm font-bold uppercase tracking-widest">Consultando Matriz...</p>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
}

function renderTrazabilidadError(msg) {
    const container = document.getElementById('trazabilidadResult');
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 bg-red-900/10 border border-red-500/20 rounded-xl">
            <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 mb-4 animate-pulse"></i>
            <p class="text-sm font-bold uppercase tracking-widest text-red-400">${msg}</p>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
}

function renderTrazabilidadMatrix(data) {
    const container = document.getElementById('trazabilidadResult');
    if (!container) return;
    
    const fecha = new Date(data.fecha_exacta);
    const fechaFormat = fecha.toLocaleDateString('es-AR') + ' ' + fecha.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});

    let permanenciaHtml = `<span class="text-2xl font-black text-emerald-400">${data.permanencia_dias} <span class="text-sm font-bold uppercase text-emerald-600/50 tracking-widest">Días</span></span>`;
    if (data.permanencia_dias > 30) {
         permanenciaHtml = `<span class="text-2xl font-black text-red-400">${data.permanencia_dias} <span class="text-sm font-bold uppercase text-red-600/50 tracking-widest">Días</span></span>`;
    } else if (data.permanencia_dias > 15) {
         permanenciaHtml = `<span class="text-2xl font-black text-amber-400">${data.permanencia_dias} <span class="text-sm font-bold uppercase text-amber-600/50 tracking-widest">Días</span></span>`;
    }

    container.innerHTML = `
        <div class="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <!-- Header -->
            <div class="bg-slate-900/80 p-5 border-b border-slate-700/50 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                        <i data-lucide="package-check" class="w-5 h-5 text-indigo-400"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-widest text-slate-300">Detalle de Bulto</h4>
                        <p class="text-[10px] font-mono text-slate-500 truncate max-w-xs">ID: ${data.id_lote}</p>
                    </div>
                </div>
                <div class="text-right">
                    ${permanenciaHtml}
                    <p class="text-[9px] uppercase tracking-widest text-slate-500">Antigüedad en Depósito</p>
                </div>
            </div>

            <!-- Body -->
            <div class="p-6 grid grid-cols-2 gap-6">
                <!-- Info Articulo -->
                <div class="col-span-2 md:col-span-1 space-y-4">
                    <div>
                        <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Mercadería (SKU: ${data.articulo_codigo})</p>
                        <p class="text-base font-bold text-white">${data.articulo_desc}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Proveedor Origen</p>
                        <p class="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <i data-lucide="truck" class="w-4 h-4 text-indigo-400"></i> ${data.proveedor}
                        </p>
                    </div>
                </div>

                <!-- Info Ingreso -->
                <div class="col-span-2 md:col-span-1 space-y-4 bg-slate-900/30 p-4 rounded-xl border border-slate-800/50">
                    <div>
                        <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Fecha y Hora de Recepción</p>
                        <p class="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <i data-lucide="calendar" class="w-4 h-4 text-emerald-400"></i> ${fechaFormat}
                        </p>
                    </div>
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Factura/Remito</p>
                            <span class="inline-block px-2 py-1 bg-blue-900/20 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold rounded">
                                ${data.remito}
                            </span>
                        </div>
                        <div class="flex-1">
                            <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Cant. Física</p>
                            <span class="inline-block px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs font-bold rounded">
                                ${data.cantidad_fisica} ${data.unidad}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
}
