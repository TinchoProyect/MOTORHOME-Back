const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// 1. FIX REFERENCE ERROR FOR 'container'
const missingContainerPayload = `        
        const container = document.getElementById('simulationTableContainer');
        if (!container) {
            console.error("No se encontró contenedor visual para simulación");
            return;
        }
        
        let simOptions = `;

if (code.includes('        let simOptions = ')) {
    code = code.replace('        let simOptions = ', missingContainerPayload);
    console.log("Inyectado container is not defined fix");
}

// 2. HARD PERSISTENCE IN MODAL (localStorage)
const extractPointTarget = `                const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
                
                // [FIX V8.5] RESTAURAR ORDEN Y ESTADOS PREVIOS (Persistencia de Sesión)`;

const extractPointRepl = `                const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
                
                // [FIX V8.8] PERSISTENCIA DURA (LOCALSTORAGE)
                const pN = (typeof window.globalContext !== 'undefined' && window.globalContext.providerName) ? window.globalContext.providerName : 'NATIVE';
                const lsKey = 'LAMDA_SHEET_ORDER_' + pN.replace(/\\s+/g, '_');
                try {
                     const hardDataStr = localStorage.getItem(lsKey);
                     if (hardDataStr) {
                          const hardData = JSON.parse(hardDataStr);
                          if (hardData && hardData.sheetNames && Array.isArray(hardData.sheetNames)) {
                               validSheets.sort((a,b) => {
                                    let ia = hardData.sheetNames.indexOf(a.name);
                                    let ib = hardData.sheetNames.indexOf(b.name);
                                    if(ia === -1) ia = 999;
                                    if(ib === -1) ib = 999;
                                    return ia - ib;
                               });
                               if (hardData.checks) {
                                    validSheets.forEach(s => {
                                         if (hardData.checks[s.name] !== undefined) s._cachedCheck = hardData.checks[s.name];
                                    });
                               }
                               if (hardData.cacique && !window._simCaciqueSheetName) {
                                    window._simCaciqueSheetName = hardData.cacique;
                               }
                          }
                     }
                } catch(e) { console.error("Error loading hard persistence", e); }
                
                // [FIX V8.5] RESTAURAR ORDEN Y ESTADOS PREVIOS (Persistencia de Sesión)`;

if (code.includes(extractPointTarget)) {
    code = code.replace(extractPointTarget, extractPointRepl);
    console.log("Injected Hard Persistence extraction logic.");
}

const preConfirmTarget = `                        preConfirm: () => {
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

const preConfirmRepl = `                        preConfirm: () => {
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
   console.log("Injected Hard Persistence saving logic.");
} else {
   console.log("Failed to find preConfirm target.");
}


fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log("Finished executing fix_regressions_10.");
