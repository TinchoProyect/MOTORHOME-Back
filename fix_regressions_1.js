const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').replace(/\r\n/g, '\n');

// ==== 1. FIX SKIP MODAL ARGUMENT & CACHING ====
const targetGenerateFn = `async function generatePreview() {`;
const replGenerateFn = `async function generatePreview(skipModal = false) {`;
code = code.replace(targetGenerateFn, replGenerateFn);

const targetModalBlock = `
        let sheetsToProcess = [];
        if (window.currentSheetList && window.currentSheetList.length > 1) {
            Swal.fire({
                title: 'Recolectando Estructura...',
                html: '<span class="text-slate-400">Analizando el alcance del documento multi-hoja.</span>',
                allowOutsideClick: false,
                background: '#0f172a',
                color: '#f8fafc'
            });
            Swal.showLoading(); // Invocación síncrona para evitar leak al siguiente modal

            // Recuperar todas las hojas
            const allSheets = window.exportAllSheets ? await window.exportAllSheets() : [];
            const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
            
            Swal.hideLoading(); // Purga forzada del estado interno de loading antes del close
            Swal.close();

            if (validSheets.length > 1) {
                const sheetsHtml = validSheets.map((s, idx) => \`
                    <div class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors">
                        <input type="checkbox" id="chk_sim_sheet_\${idx}" value="\${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" \${s.name === currentSheetName ? 'checked' : ''}>
                        <div class="flex-1 text-left cursor-pointer" onclick="document.getElementById('chk_sim_sheet_\${idx}').click()">
                            <div class="text-white text-sm font-bold flex items-center gap-2">
                                <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> \${s.name}
                            </div>
                            <div class="text-xs text-slate-500 font-mono mt-0.5">Filas crudas: \${s.data.length}</div>
                        </div>
                    </div>
                \`).join('');

                const res = await Swal.fire({
                    title: 'Alcance de la Transformación',
                    html: \`
                        <p class="text-slate-400 text-sm mb-4">El archivo base posee múltiples pestañas. Selecciona cuáles deseas procesar simultáneamente empleando esta misma configuración del motor ETL:</p>
                        <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-left text-base">
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
                    didOpen: () => { if (window.lucide) window.lucide.createIcons(); },
                    preConfirm: () => {
                        const selected = [];
                        validSheets.forEach((s, idx) => {
                            const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                            if (chk && chk.checked) selected.push(s);
                        });
                        if (selected.length === 0) {
                            Swal.showValidationMessage('⚠️ Tolera al menos una solapa para simular.');
                            return false;
                        }
                        return selected;
                    }
                });

                if (!res.isConfirmed) return;
                sheetsToProcess = res.value;
            } else {
                sheetsToProcess = validSheets.length === 1 ? validSheets : [{ name: currentSheetName || 'Principal', data: currentSheetData }];
            }
        } else {
            sheetsToProcess = [{ name: currentSheetName || 'Principal', data: currentSheetData }];
        }
`;

const replModalBlock = `
        let sheetsToProcess = [];
        let caciqueName = null;

        if (skipModal && window._simValidSheetsForPreview && window._simValidSheetsForPreview.length > 0) {
            sheetsToProcess = window._simValidSheetsForPreview;
            if (window._simCaciqueSheetName) caciqueName = window._simCaciqueSheetName;
        } else {
            if (window.currentSheetList && window.currentSheetList.length > 1) {
                Swal.fire({
                    title: 'Recolectando Estructura...',
                    html: '<span class="text-slate-400">Analizando el alcance del documento multi-hoja.</span>',
                    allowOutsideClick: false,
                    background: '#0f172a',
                    color: '#f8fafc'
                });
                Swal.showLoading();

                // Recuperar todas las hojas
                const allSheets = window.exportAllSheets ? await window.exportAllSheets() : [];
                window._rawValidSheetsCache = allSheets.filter(s => s.data && s.data.length > 0);
                
                Swal.hideLoading();
                Swal.close();

                if (window._rawValidSheetsCache.length > 1) {
                    
                    // Scope functions for Drag and Drop
                    window._simSwapSheets = function(dragIdx, dropIdx) {
                        const arr = window._rawValidSheetsCache;
                        const item = arr.splice(dragIdx, 1)[0];
                        arr.splice(dropIdx, 0, item);
                        const c = document.getElementById('sheets_dnd_container');
                        if (c) c.innerHTML = window._simRenderSheetsHtml();
                        if (window.lucide) window.lucide.createIcons();
                    };

                    window._simRenderSheetsHtml = function() {
                        return window._rawValidSheetsCache.map((s, idx) => \`
                            <div draggable="true" ondragstart="event.dataTransfer.setData('text/plain', \${idx}); event.currentTarget.classList.add('opacity-50');" ondragend="event.currentTarget.classList.remove('opacity-50');" ondragover="event.preventDefault();" ondrop="event.preventDefault(); window._simSwapSheets(parseInt(event.dataTransfer.getData('text/plain')), \${idx});" class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-grab active:cursor-grabbing mb-2">
                                <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-600"></i>
                                <input type="checkbox" id="chk_sim_sheet_\${idx}" value="\${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" \${s.name === currentSheetName ? 'checked' : ''}>
                                <div class="flex-1 text-left flex flex-col justify-center">
                                    <div class="text-white text-sm font-bold flex items-center gap-2">
                                        <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> \${s.name}
                                    </div>
                                    <div class="text-[10px] text-slate-500 font-mono mt-0.5">Filas: \${s.data.length}</div>
                                </div>
                                <div class="flex items-center gap-2 border-l border-slate-800 pl-3">
                                    <label class="flex items-center gap-1.5 cursor-pointer text-[10px] text-amber-400 font-bold uppercase" title="Define la estructura base y el esquema de columnas">
                                        <input type="radio" name="sim_cacique" value="\${s.name}" class="w-3 h-3 text-amber-500 bg-slate-900 border-slate-700" \${s.name === currentSheetName ? 'checked' : ''}>
                                        <i data-lucide="crown" class="w-3 h-3"></i> Cacique
                                    </label>
                                </div>
                            </div>
                        \`).join('');
                    };

                    const res = await Swal.fire({
                        title: 'Alcance de la Transformación',
                        html: \`
                            <p class="text-slate-400 text-sm mb-4">Selecciona el orden de ingesta y marca cuál será la hoja "Cacique" (la que rige el mapeo final maestro de todas):</p>
                            <div id="sheets_dnd_container" class="flex flex-col text-left text-base max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                \${window._simRenderSheetsHtml()}
                            </div>
                        \`,
                        icon: 'info',
                        background: '#0f172a', color: '#f8fafc',
                        showCancelButton: true,
                        confirmButtonText: 'Generar Simulación Mixta',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#3b82f6',
                        cancelButtonColor: '#334155',
                        didOpen: () => { if (window.lucide) window.lucide.createIcons(); },
                        preConfirm: () => {
                            const selected = [];
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                                if (chk && chk.checked) selected.push(s);
                            });
                            if (selected.length === 0) {
                                Swal.showValidationMessage('⚠️ Selecciona al menos una solapa.');
                                return false;
                            }
                            const caciqueRadio = document.querySelector('input[name="sim_cacique"]:checked');
                            if (caciqueRadio) window._simCaciqueSheetName = caciqueRadio.value;
                            else window._simCaciqueSheetName = selected[0] ? selected[0].name : null;
                            
                            return selected;
                        }
                    });

                    if (!res.isConfirmed) return;
                    sheetsToProcess = res.value;
                    caciqueName = window._simCaciqueSheetName;
                    
                    // SAVE CACHE FOR SKIP MODAL
                    window._simValidSheetsForPreview = sheetsToProcess;

                } else {
                    sheetsToProcess = window._rawValidSheetsCache.length === 1 ? window._rawValidSheetsCache : [{ name: currentSheetName || 'Principal', data: currentSheetData }];
                    window._simValidSheetsForPreview = sheetsToProcess;
                }
            } else {
                sheetsToProcess = [{ name: currentSheetName || 'Principal', data: currentSheetData }];
                window._simValidSheetsForPreview = sheetsToProcess;
            }
        }
`;

if (code.includes(targetModalBlock.trim())) {
    code = code.replace(targetModalBlock.trim(), replModalBlock.trim());
    console.log("Modal Cacique Block Fixed");
} else {
    // try exact regex
    const r1 = /let sheetsToProcess = \[\];[\s\S]*?sheetsToProcess = \[\{ name: currentSheetName \|\| 'Principal', data: currentSheetData \}\];\s*\}/;
    if (r1.test(code)) {
        code = code.replace(r1, replModalBlock.trim());
        console.log("Modal Cacique Block Fixed VR");
    } else {
        console.log("Could not find Modal block");
    }
}

// ==== 2. FIX SKIPMODAL ROUTING IN TOGGLES ====
code = code.replaceAll(`if (typeof window.generatePreview === 'function') {
            window.generatePreview();
        }`, `if (typeof window.generatePreview === 'function') {
            window.generatePreview(true); // skipModal
        }`);

code = code.replaceAll(`if (typeof window.generatePreview === 'function') {
        window.generatePreview();
    }`, `if (typeof window.generatePreview === 'function') {
        window.generatePreview(true); // skipModal
    }`);

// Also fix row visibilty toggles missing skipModal
const tr1 = `window.ViewerUI.toggleRejectedRows = function() {
    window.ViewerUI._showRejectedRowsInSim = !window.ViewerUI._showRejectedRowsInSim;
    if (typeof window.generatePreview === 'function') {
        window.generatePreview(true); // skipModal
    }
};`;

const rTr1 = `window.ViewerUI.toggleRejectedRows = function() {
    window.ViewerUI._showRejectedRowsInSim = !window.ViewerUI._showRejectedRowsInSim;
    if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
        window.renderSimulationTable(window.currentSimData);
    }
};`;
if(code.includes(tr1)) {
    code = code.replace(tr1, rTr1);
    console.log("Fixed Reject Toggle routing");
}

const tr2 = `window.ViewerUI.toggleSupportCols = function() {
    window.ViewerUI._showSupportColsInSim = !window.ViewerUI._showSupportColsInSim;
    if (typeof window.generatePreview === 'function') {
        window.generatePreview(true); // skipModal
    }
};`;
const rTr2 = `window.ViewerUI.toggleSupportCols = function() {
    window.ViewerUI._showSupportColsInSim = !window.ViewerUI._showSupportColsInSim;
    if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
        window.renderSimulationTable(window.currentSimData);
    }
};`;
if(code.includes(tr2)) {
    code = code.replace(tr2, rTr2);
    console.log("Fixed Support Toggle routing");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
