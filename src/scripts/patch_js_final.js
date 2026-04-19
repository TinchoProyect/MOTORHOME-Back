const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const s = html.indexOf('window.executeBulkRubroUpdate = async function');
const e = html.indexOf('// EXTRACCIÓN OPERATIVA');

if (s !== -1 && e !== -1) {
    const newLogic = `
        window.onBulkTargetChange = function() {
            const target = document.getElementById('fmtBulkTargetCol').value;
            if (target === 'unidad') {
                document.getElementById('fmtBulkRubroSelect').style.display = 'none';
                document.getElementById('fmtBulkUnidadSelect').style.display = 'block';
                window.populateUnidadDropdown();
            } else {
                document.getElementById('fmtBulkRubroSelect').style.display = 'block';
                document.getElementById('fmtBulkUnidadSelect').style.display = 'none';
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
        
        // VIGIA EXIGIDO POR QA
        setTimeout(() => {
            const logFn = window.originalConsoleLog || console.log;
            const targetColEl = document.getElementById("fmtBulkTargetCol");
            if (logFn) logFn("Auditoría de Inyección UI - Opciones disponibles en TargetCol:", targetColEl ? targetColEl.options.length : 'ELEMENTO NO ENCONTRADO');
        }, 1000);

        `;
    
    html = html.substring(0, s) + newLogic + html.substring(e);
    fs.writeFileSync('src/views/monitor_proveedores.html', html);
    console.log('JS fully repaired using absolute index substring');
} else {
    console.log('COULD NOT FIND START OR END');
}
