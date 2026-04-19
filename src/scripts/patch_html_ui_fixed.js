const fs = require('fs');

let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const newUI = `                    <!-- Target Context -->
                    <div class="flex items-center gap-2 pl-2">
                        <select id="fmtBulkTargetCol" onchange="window.onBulkTargetChange()" class="bg-slate-800 border fill-current border-slate-600 text-fuchsia-400 font-bold text-xs rounded-lg px-3 py-2.5 outline-none cursor-pointer hover:border-fuchsia-500 transition-colors uppercase tracking-widest appearance-none">
                            <option value="rubro">🎯 Rubro</option>
                            <option value="unidad">🎯 Unidad</option>
                        </select>
                        <div class="w-px h-6 bg-slate-700 mx-1"></div>
                    </div>
                    
                    <!-- Values -->
                    <div class="flex items-center gap-3">
                        <select id="fmtBulkRubroSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 appearance-none cursor-pointer group-[.is-unidad]:hidden block">
                            <option value="">Cargando Rubros...</option>
                        </select>
                        <select id="fmtBulkUnidadSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 appearance-none cursor-pointer group-[.is-unidad]:block hidden">
                            <option value="">Cargando Unidades...</option>
                        </select>
                    </div>
                    
                    <div class="pl-2">
                        <button onclick="window.executeDynamicBulkUpdate()" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-purple-900/40 flex items-center gap-2">
                            <i data-lucide="zap" class="w-4 h-4"></i> Aplicar
                        </button>
                    </div>`;

const lines = html.split(/\r?\n/);

// Remove the old UI lines (1004 to 1015, which is index 1003 through 1014)
lines.splice(1003, 12, newUI);

html = lines.join('\n');

html = html.replace('id="fmtBulkActionBar" class="fixed', 'id="fmtBulkActionBar" class="group fixed');

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('UI injected perfectly.');
