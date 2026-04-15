const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Rename Bloques Semánticos Detonados
content = content.replace('Bloques Semánticos Detonados', 'Sugerencias de Clasificación');

// 2. Add Swal before processChunk in _buildUniqueSet
const swalLoader = `            // Inyectar GUI Loader Inmediato Bloqueante
            if (window.Swal) {
                Swal.fire({
                    title: 'Despertando Chofer IA...',
                    html: 'Preparando entorno inteligente para ' + targetColName + '.<br>Calculando diccionario de valores únicos...',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    didOpen: () => { Swal.showLoading(); },
                    background: '#0f172a', color: '#f8fafc'
                });
            }

            const incrementalCheckbox = document.getElementById('vaiIncrementalMode');`;
content = content.replace("const incrementalCheckbox = document.getElementById('vaiIncrementalMode');", swalLoader);

// 3. Add Update Swal after processChunk
const swalUpdate = `            if (uniqueDictionary.length === 0) {
                 if (window.Swal) Swal.close();
                 throw new Error("La columna carece de datos parseables.");
            }
            
            // Update Overlay
            if (window.Swal && Swal.isVisible()) {
                Swal.update({
                    title: 'Inspeccionando Matriz...',
                    html: 'Mapeo completado: <b>' + uniqueDictionary.length + '</b> valores únicos detectados.<br>Solicitando filtrado semántico y categorización profunda al Motor IA...'
                });
            }`;
            
const searchUniqueDrop = `if (uniqueDictionary.length === 0) throw new Error("La columna carece de datos parseables.");`;
content = content.replace(searchUniqueDrop, swalUpdate);

// Remove the old Overlays
content = content.replace(/\/\/ Overlays Cinematogr[\s\S]*?background.*?\};\n            \}/g, '');

// 4. Overwrite cards layout
const newCardBody = `
                <!-- CARD HEADER (Editable) -->
                <div class="bg-gradient-to-r from-slate-950/80 to-slate-900 p-6 border-b border-slate-800 flex flex-col gap-4">
                    <div class="flex justify-between items-start gap-6">
                        <div class="flex-1 flex flex-col gap-4">
                            <div class="space-y-1 relative">
                                <label class="text-[9px] font-black uppercase text-orange-500 tracking-widest pl-1 absolute -top-2 left-3 bg-slate-950 px-1 border border-orange-500/20 rounded z-10">Rubro Maestro (Destino)</label>
                                <input type="text" class="card-rubro-name w-full bg-slate-950 border border-slate-700/80 text-orange-400 text-sm font-black uppercase rounded-lg px-4 py-3.5 focus:border-orange-500 focus:bg-slate-900 shadow-inner outline-none transition-all" value="\${groupName}">
                                <i data-lucide="edit-3" class="w-4 h-4 absolute right-4 top-4 text-slate-600 pointer-events-none"></i>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black uppercase text-slate-500 tracking-widest pl-1">Directiva de Clasificación / Narrativa (Opcional)</label>
                                <input type="text" class="card-rubro-desc w-full bg-slate-900/60 border border-slate-700/50 text-slate-300 text-xs rounded-lg px-4 py-2.5 focus:border-blue-500 outline-none transition-colors" placeholder="Ej: Agrupa todos los elementos derivados del plástico exceptuando PET..." value="\${narrativa.replace(/"/g, '&quot;')}">
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-3 shrink-0 pt-2">
                            <span class="bg-slate-950 text-slate-400 border border-slate-700 px-4 py-1.5 rounded-lg text-xs font-mono shadow-inner"><span class="card-count font-bold text-orange-400">\${items.length}</span> SKUs Inyectados</span>
                            <!-- ACTIONS CONTAINER -->
                            <div class="flex flex-col gap-2 w-full mt-2">
                                <button type="button" class="btn-approve-card px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-[0_4px_15px_rgba(234,88,12,0.3)] border border-orange-400/20 flex items-center justify-center gap-2">
                                    <i data-lucide="check-circle" class="w-4 h-4"></i> Ingestar
                                </button>
                                <button type="button" class="btn-discard-group px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 font-bold rounded-xl text-[9px] uppercase tracking-widest transition-colors border border-red-500/20 flex items-center justify-center gap-2" title="Descartar este bloque por completo">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Descartar
                                </button>
                            </div>
                        </div>
                    </div>
                    <!-- BULK ACTION BAR -->
                    <div class="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50 relative z-20">
                          <label class="flex items-center gap-2 cursor-pointer group px-2">
                               <input type="checkbox" class="select-all-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                               <span class="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-300">Seleccionar Todo</span>
                          </label>
                          <div class="flex items-center gap-2">
                               <button type="button" class="btn-bulk-move px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>📦 Mover Selección</button>
                               <button type="button" class="btn-bulk-trash px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>🗑️ Eliminar</button>
                          </div>
                    </div>
                </div>
`;

const oldCardHeaderPattern = /<!-- CARD HEADER \(Editable\) -->[\s\S]*?<\/div>[\s]*<\/div>[\s]*<\/div>[\s]*<!-- CARD BODY \(Entities\) -->/;
content = content.replace(oldCardHeaderPattern, newCardBody + '\n                <!-- CARD BODY (Entities) -->');


const newRows = `
                    <div id="\${skuId}" class="flex items-center justify-between p-3 border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors grouper-row group" data-raw="\${String(sku).replace(/"/g, '&quot;')}">
                        <div class="flex items-center gap-3 flex-1 min-w-0 pr-4">
                             <input type="checkbox" class="bulk-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                             <span class="text-[13px] text-slate-300 font-mono truncate group-hover:text-amber-200 transition-colors" title="\${String(sku).replace(/"/g, '&quot;')}">\${String(sku).replace(/</g, "&lt;")}</span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="text-slate-500 hover:text-blue-400 p-1.5 transition-colors move-sku-btn rounded hover:bg-slate-800" title="Transferir Artículo a Otro Lote"><i data-lucide="arrow-right-left" class="w-4 h-4"></i></button>
                            <button type="button" class="text-slate-500 hover:text-red-400 p-1.5 transition-colors remove-sku-btn rounded hover:bg-slate-800" title="Descartar Ítem del Mapeo"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
                    
const oldRowsPattern = /<div id="\$\{skuId\}"[\s\S]*?<\/div>\s*<\/div>\s*`;/;
content = content.replace(oldRowsPattern, newRows + '`;');


fs.writeFileSync(file, content, 'utf8');
console.log('Script ran successfully!');
