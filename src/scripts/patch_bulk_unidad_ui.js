const fs = require('fs');

const path = 'src/views/monitor_proveedores.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Reemplazar UI del Modal
const oldUI = `                    <div class="flex items-center gap-3 pl-2">
                        <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Reasignar Semántica:</label>
                        <select id="fmtBulkRubroSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 appearance-none cursor-pointer">
                            <option value="">Cargando Rubros...</option>
                        </select>
                    </div>
                    
                    <div class="pl-2">
                        <button onclick="window.executeBulkRubroUpdate()" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-purple-900/40 flex items-center gap-2">
                            <i data-lucide="zap" class="w-4 h-4"></i> Aplicar
                        </button>
                    </div>`;

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

if(html.includes('id="fmtBulkRubroSelect"')) {
    html = html.replace(oldUI, newUI);
    // Add "group" class to action bar to allow Tailwind group state rendering
    html = html.replace('id="fmtBulkActionBar" class="fixed', 'id="fmtBulkActionBar" class="group fixed');
}

// 2. Logic Replacement
const scriptReplacement = `
        window.onBulkTargetChange = function() {
            const target = document.getElementById('fmtBulkTargetCol').value;
            const actionBar = document.getElementById('fmtBulkActionBar');
            if (target === 'unidad') {
                actionBar.classList.add('is-unidad');
                window.populateUnidadDropdown();
            } else {
                actionBar.classList.remove('is-unidad');
            }
        };

        window.populateUnidadDropdown = function() {
            if (!window.v4GridApi) return;
            const uniqueUnidades = new Set();
            window.v4GridApi.forEachNode(node => {
                if (node.data && node.data.datos_maestros) {
                    let dm = node.data.datos_maestros;
                    for (let key in dm) {
                        if (String(key).toLowerCase() === 'unidad' && dm[key]) {
                            uniqueUnidades.add(dm[key].trim());
                        }
                    }
                }
            });
            
            const select = document.getElementById('fmtBulkUnidadSelect');
            if (select) {
                select.innerHTML = '<option value="">-- Seleccionar Unidad --</option>';
                select.innerHTML += '<option value="UNASSIGN" class="text-rose-400 font-bold bg-rose-950/20">🧹 VACIAR CELDA</option>';
                
                const sorted = Array.from(uniqueUnidades).sort();
                sorted.forEach(u => {
                    select.innerHTML += \`<option value="\${u}">\${u}</option>\`;
                });
            }
        };

        window.executeDynamicBulkUpdate = async function() {
            if (!window.v4GridApi) return;
            const selectedRows = window.v4GridApi.getSelectedRows();
            const targetCol = document.getElementById('fmtBulkTargetCol').value;
            
            if (selectedRows.length === 0) {
                Swal.fire('Error', 'Debe seleccionar al menos un registro.', 'error');
                return;
            }

            const itemIds = selectedRows.map(r => r._system_id);
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

            if (targetCol === 'rubro') {
                const targetId = document.getElementById('fmtBulkRubroSelect').value;
                if (!targetId) return Swal.fire('Atención', 'Seleccione el Rubro destino.', 'warning');
                
                const result = await Swal.fire({
                    title: '¿Confirmar Reasignación de Rubro?',
                    html: \`Vas a reasignar <b>\${selectedRows.length}</b> productos al nuevo rubro.\`,
                    icon: 'warning', background: '#0f172a', color: '#f8fafc',
                    showCancelButton: true, confirmButtonText: 'Sí, Ejecutar', cancelButtonText: 'Cancelar'
                });
                
                if (result.isConfirmed) {
                    try {
                        Swal.fire({ title: 'Aplicando...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), background: '#0f172a' });
                        const res = await fetch(\`\${backendUrl}/api/master-table/operativa/bulk-rubro\`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ itemIds: itemIds, target_rubro_id: targetId })
                        });
                        const json = await res.json();
                        if (res.ok && json.success) {
                            Swal.fire({ title: '¡Sincronización Exitosa!', text: \`\${json.count} registros reasignados.\`, icon: 'success', background: '#0f172a', color: '#f8fafc', timer: 2500, showConfirmButton: false });
                            if (window.openFinalMasterTable) window.openFinalMasterTable();
                        } else throw new Error(json.error || 'Error');
                    } catch (e) { Swal.fire('Error de Red', e.message, 'error'); }
                }
            } else if (targetCol === 'unidad') {
                const targetValRaw = document.getElementById('fmtBulkUnidadSelect').value;
                if (!targetValRaw) return Swal.fire('Atención', 'Seleccione la Unidad destino.', 'warning');
                
                const targetVal = targetValRaw === 'UNASSIGN' ? "" : targetValRaw;

                const result = await Swal.fire({
                    title: '¿Confirmar Reasignación de Unidad?',
                    html: \`Vas a ajustar higiénicamente la Unidad de <b>\${selectedRows.length}</b> productos a: <strong class="text-fuchsia-400 px-2">\${targetValRaw === 'UNASSIGN' ? 'VACÍO' : targetVal}</strong>\`,
                    icon: 'warning', background: '#0f172a', color: '#f8fafc',
                    showCancelButton: true, confirmButtonText: 'Sí, Ejecutar', cancelButtonText: 'Cancelar'
                });
                
                if (result.isConfirmed) {
                    try {
                        Swal.fire({ title: 'Aplicando...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), background: '#0f172a' });
                        const res = await fetch(\`\${backendUrl}/api/master-table/operativa/bulk-unidad\`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ itemIds: itemIds, target_unidad: targetVal })
                        });
                        const json = await res.json();
                        if (res.ok && json.success) {
                            Swal.fire({ title: '¡Unidad Aterrizada!', text: \`\${json.count} registros reasignados.\`, icon: 'success', background: '#0f172a', color: '#f8fafc', timer: 2500, showConfirmButton: false });
                            if (window.openFinalMasterTable) window.openFinalMasterTable();
                        } else throw new Error(json.error || 'Error');
                    } catch (e) { Swal.fire('Error de Red', e.message, 'error'); }
                }
            }
        };
`;

// Inject right below original executeBulkRubroUpdate definition or replace it
const oldFuncRegex = /window\.executeBulkRubroUpdate\s*=\s*async\s*function\(\)\s*\{[\s\S]*?\/\/\s*={10,}\s*\n\s*\/\/\s*EXTRACCIÓN OPERATIVA/m;
const match = html.match(oldFuncRegex);
if (match) {
    // We drop old executeBulkRubroUpdate and place new Logic
    html = html.replace(match[0], scriptReplacement + '\n        // ==========================================\n        // EXTRACCIÓN OPERATIVA');
}

fs.writeFileSync(path, html);
console.log('UI Parcheada Exitosamente.');
