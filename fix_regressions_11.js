const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const preConfirmTarget = `preConfirm: () => {
                            const selected = [];
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                                if (chk) {
                                    s._cachedCheck = chk.checked;
                                    if (chk.checked) selected.push(s);
                                }
                            });
                            if (selected.length === 0) {
                                Swal.showValidationMessage('⚠️ Selecciona al menos una solapa.');
                                return false;
                            }
                            const caciqueRadio = document.querySelector('input[name="sim_cacique"]:checked');
                            if (caciqueRadio) window._simCaciqueSheetName = caciqueRadio.value;
                            else window._simCaciqueSheetName = selected[0] ? selected[0].name : null;
                            
                            return selected;
                        }`;

const preConfirmRepl = `preConfirm: () => {
                            const selected = [];
                            const sheetNames = [];
                            const checks = {};
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                sheetNames.push(s.name);
                                const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                                if (chk) {
                                    s._cachedCheck = chk.checked;
                                    checks[s.name] = chk.checked;
                                    if (chk.checked) selected.push(s);
                                }
                            });
                            if (selected.length === 0) {
                                Swal.showValidationMessage('⚠️ Selecciona al menos una solapa.');
                                return false;
                            }
                            const caciqueRadio = document.querySelector('input[name="sim_cacique"]:checked');
                            if (caciqueRadio) window._simCaciqueSheetName = caciqueRadio.value;
                            else window._simCaciqueSheetName = selected[0] ? selected[0].name : null;

                            try {
                                const pN = (typeof window.globalContext !== 'undefined' && window.globalContext.providerName) ? window.globalContext.providerName : 'NATIVE';
                                const lsKey = 'LAMDA_SHEET_ORDER_' + pN.replace(/\\s+/g, '_');
                                localStorage.setItem(lsKey, JSON.stringify({
                                     sheetNames: sheetNames,
                                     checks: checks,
                                     cacique: window._simCaciqueSheetName
                                }));
                            } catch(e) { console.error("Error saving hard persistence", e); }

                            return selected;
                        }`;

if (code.includes(preConfirmTarget)) {
   code = code.replace(preConfirmTarget, preConfirmRepl);
   fs.writeFileSync('src/views/js/viewer_render.js', code);
   console.log("PreConfirm Hard Persistence patched.");
} else {
   console.log("Target not found!");
}
