const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// I will locate the start of "if (validSheets.length > 1) {"
// and the end "sheetsToProcess = res.value;"

const startIdx = code.indexOf('if (validSheets.length > 1) {');
const endMarker = 'sheetsToProcess = res.value;';
const endIdx = code.indexOf(endMarker, startIdx) + endMarker.length;

if (startIdx !== -1 && endIdx !== -1) {
    const originalBlock = code.substring(startIdx, endIdx);
    
    const repStr = `if (validSheets.length > 1) {
                const sheetsHtml = validSheets.map((s, idx) => \`
                    <div draggable="true" data-idx="\${idx}" data-name="\${s.name}" class="draggable-sheet flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-move">
                        <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-600 shrink-0"></i>
                        <input type="checkbox" id="chk_sim_sheet_\${idx}" value="\${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" \${s.name === currentSheetName ? 'checked' : ''}>
                        
                        <div class="flex-1 text-left cursor-text" onclick="document.getElementById('chk_sim_sheet_\${idx}').click()">
                            <div class="text-white text-sm font-bold flex items-center gap-2">
                                <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> \${s.name}
                            </div>
                            <div class="text-xs text-slate-500 font-mono mt-0.5">Filas: \${s.data.length}</div>
                        </div>

                        <!-- Cacique Selector -->
                        <label title="Establecer como Maestra de Diseño (Cacique)" class="flex items-center gap-2 px-3 py-1.5 bg-amber-900/10 border border-amber-500/20 hover:border-amber-500/50 rounded-lg cursor-pointer transition-colors shrink-0">
                            <input type="radio" name="cacique_sheet" value="\${idx}" \${s.name === currentSheetName ? 'checked' : ''} class="w-3.5 h-3.5 text-amber-500 bg-slate-800 border-slate-600 focus:ring-amber-500">
                            <i data-lucide="star" class="w-4 h-4 text-amber-500"></i> Cacique
                        </label>
                    </div>
                \`).join('');

                const res = await Swal.fire({
                    width: '600px',
                    title: 'Alcance de la Transformación',
                    html: \`
                        <p class="text-slate-400 text-sm mb-4">Selecciona, ordena y define la Hoja Maestra (Cacique). El Cacique dictará la estructura visual del Visor Unificado.</p>
                        <div id="sortable-sheets-list" class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-left text-base">
                            \${sheetsHtml}
                        </div>
                    \`,
                    icon: 'info',
                    background: '#0f172a', color: '#f8fafc',
                    showCancelButton: true,
                    confirmButtonText: 'Generar Simulación Mixta',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#3b82f6',
                    cancelButtonColor: '#334155',
                    didOpen: () => { 
                        if (window.lucide) window.lucide.createIcons(); 
                        const list = document.getElementById('sortable-sheets-list');
                        let draggedItem = null;
                        
                        list.querySelectorAll('.draggable-sheet').forEach(item => {
                            item.addEventListener('dragstart', function(e) {
                                draggedItem = item;
                                setTimeout(() => item.classList.add('opacity-50', 'bg-slate-800'), 0);
                            });
                            item.addEventListener('dragend', function() {
                                setTimeout(() => {
                                    if(draggedItem) draggedItem.classList.remove('opacity-50', 'bg-slate-800');
                                    draggedItem = null;
                                }, 0);
                            });
                            item.addEventListener('dragover', function(e) {
                                e.preventDefault();
                                const afterElement = [...list.querySelectorAll('.draggable-sheet:not(.opacity-50)')].reduce((closest, child) => {
                                    const box = child.getBoundingClientRect();
                                    const offset = e.clientY - box.top - box.height / 2;
                                    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
                                    return closest;
                                }, { offset: Number.NEGATIVE_INFINITY }).element;
                                
                                if (afterElement == null) {
                                    list.appendChild(draggedItem);
                                } else {
                                    list.insertBefore(draggedItem, afterElement);
                                }
                            });
                        });
                    },
                    preConfirm: () => {
                        const list = document.getElementById('sortable-sheets-list');
                        const selected = [];
                        let caciqueNode = document.querySelector('input[name="cacique_sheet"]:checked');
                        let caciqueIdx = caciqueNode ? caciqueNode.value : null;

                        list.querySelectorAll('.draggable-sheet').forEach(node => {
                            const idx = node.getAttribute('data-idx');
                            const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                            if (chk && chk.checked) {
                                const s = validSheets[parseInt(idx)];
                                if (idx === caciqueIdx) {
                                    selected.unshift(s);
                                } else {
                                    selected.push(s);
                                }
                            }
                        });

                        if (selected.length === 0) {
                            Swal.showValidationMessage('⚠️ Tolera al menos una solapa para simular.');
                            return false;
                        }
                        return selected;
                    }
                });

                if (!res.isConfirmed) return;
                sheetsToProcess = res.value;`;

    code = code.substring(0, startIdx) + repStr + code.substring(endIdx);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log("Successfully replaced modal via substring manipulation");
} else {
    console.log("Failed to locate start/end index");
}
