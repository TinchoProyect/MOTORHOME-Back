const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// 1. FIX PERSISTENCE IN MODAL PRECONFIRM
const targetPreConfirm = `                        preConfirm: () => {
                            const selected = [];
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                                if (chk && chk.checked) selected.push(s);
                            });`;

const replPreConfirm = `                        preConfirm: () => {
                            const selected = [];
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                const chk = document.getElementById(\`chk_sim_sheet_\${idx}\`);
                                if (chk) {
                                    s._cachedCheck = chk.checked;
                                    if (chk.checked) selected.push(s);
                                }
                            });`;

if (code.includes(targetPreConfirm)) {
    code = code.replace(targetPreConfirm, replPreConfirm);
    console.log("Modal preConfirm patched.");
} else {
    // Try relaxed
    if (code.includes('if (chk && chk.checked) selected.push(s);')) {
       code = code.replace('if (chk && chk.checked) selected.push(s);', 'if (chk) { s._cachedCheck = chk.checked; if (chk.checked) selected.push(s); }');
       console.log("Modal preConfirm patched (RELAXED).");
    } else {
       console.log("WARNING: Modal preConfirm missing.");
    }
}


// 2. ISOLATE RULE MANIPULATION IN HEADERS (Mixed View)
// We look for where renderSimulationTable builds the rulesDropdownHtml and buttons.
// We can just add a global boolean: const isMixedSimulation = sheetsToProcess.length > 1;
// But wait! renderSimulationTable doesn't have sheetsToProcess!
// We can define it at the top of generatePreview and save it to window.
const mixFlagTarget = `        caciqueName = window._simCaciqueSheetName;`;
const mixFlagRepl = `        caciqueName = window._simCaciqueSheetName;
        window._isMixedSimulation = sheetsToProcess && sheetsToProcess.length > 1;`;
if (code.includes(mixFlagTarget)) {
   code = code.replace(mixFlagTarget, mixFlagRepl);
}

const ruleBtnTarget = `        // [New] Pipeline Quick Toggles
        if (cfg.virtualColId) {
            // Generate Interactive Dropdown for Applied Rules and Remapping`;
const ruleBtnRepl = `        // [New] Pipeline Quick Toggles
        if (cfg.virtualColId && !window._isMixedSimulation) {
            // Generate Interactive Dropdown for Applied Rules and Remapping`;
if (code.includes(ruleBtnTarget)) {
   code = code.replace(ruleBtnTarget, ruleBtnRepl);
   console.log("Headers manipulation patched.");
}

const clickHandlerTarget = `        const clickHandler = isComputedConfig 
            ? \`onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.editComputedColumn) window.editComputedColumn('\${cfg.virtualColId}')"\` 
            : \`onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '\${cfg.virtualColId}', '\${safeLabel}')"\`;`;
const clickHandlerRepl = `        const clickHandler = (window._isMixedSimulation) ? "" : (isComputedConfig 
            ? \`onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.editComputedColumn) window.editComputedColumn('\${cfg.virtualColId}')"\` 
            : \`onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '\${cfg.virtualColId}', '\${safeLabel}')"\`);`;
if (code.includes(clickHandlerTarget)) {
   code = code.replace(clickHandlerTarget, clickHandlerRepl);
   console.log("Header Click Handler patched.");
} else {
   console.log("Could not find click handler");
}

// 3. ETL SANDBOX FOR MIXED SUMULATION
// I will rewrite the loop: `for (const sheetObj of sheetsToProcess) { ...`
// This loop needs to use localConfig, building the `normalizedRow`.

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const etlLoopStart = code.indexOf('        let allSanitizedData = [];');
const etlLoopEnd = code.indexOf('        // Guardar currentDisplayConfig al global para referenciar');

if (etlLoopStart !== -1 && etlLoopEnd !== -1) {
   const originalBlock = code.substring(etlLoopStart, etlLoopEnd);
   
   // Replace the original block with our new architecture block.
   const newBlock = `        let allSanitizedData = [];

        // ---------------- ETL SANDBOX ARCHITECTURE ----------------
        // [FIX V8.6] Aislamiento Absoluto: Cada hoja del lote ejecuta su ciclo vital completo 
        // de columnas base, splits y fantasmas EN PRIVADO, antes de la unificación.
        
        for (const sheetObj of sheetsToProcess) {
            const currentSheetIterationData = sheetObj.data;
            if (!currentSheetIterationData || currentSheetIterationData.length === 0) continue;

            const startIndex = window.currentOffset ? window.currentOffset.row : 0;
            const endIndex = window.currentEndOffset ? window.currentEndOffset.row : currentSheetIterationData.length;
            const rawSlice = currentSheetIterationData.slice(startIndex);

            // Contexto individual de hoja para evitar 'Pipeline Amnesia'
            let localColumnMap = columnMapping;
            let localVirtualCols = window.virtualColumns;
            let localPipelines = window.draftPipelines;
            let localComputedCols = window.computedColumns || [];
            
            if (window.sheetConfigStore && window.sheetConfigStore[sheetObj.name]) {
                if (window.sheetConfigStore[sheetObj.name].virtualCols && window.sheetConfigStore[sheetObj.name].virtualCols.length > 0) {
                    localVirtualCols = window.sheetConfigStore[sheetObj.name].virtualCols;
                    localColumnMap = window.sheetConfigStore[sheetObj.name].columnMapping || {};
                    localPipelines = window.sheetConfigStore[sheetObj.name].pipelines || {};
                    localComputedCols = window.sheetConfigStore[sheetObj.name].computedColumns || [];
                }
            }
            
            // FASE 1: Construir Sandbox ETL Local para esta hoja
            let localConfig = [];
            
            localVirtualCols.forEach(vCol => {
                const vColId = vCol.id;
                const termId = localColumnMap[vColId];
                if (!termId || termId === 'Ignorar Columna') return;
                
                let resolutiveTermId = termId;
                if (localPipelines[vColId] && localPipelines[vColId].masterField && localPipelines[vColId].masterField.id) {
                     resolutiveTermId = localPipelines[vColId].masterField.id;
                }
                 
                const rStack = localPipelines[vColId] ? localPipelines[vColId].rules : null;
                const rulesStack = rStack ? (Array.isArray(rStack) ? rStack : [rStack]) : [];
                
                const splitRule = rulesStack.find(r => !r.disabled && (r.type === 'split' || r.type === 'regex_split'));
                if (splitRule) {
                     const sep = splitRule.type === 'regex_split' ? new RegExp(splitRule.separator, 'g') : splitRule.separator || ' ';
                     const trg = splitRule.targetCount ? parseInt(splitRule.targetCount) : 2;
                     for (let i = 0; i < trg; i++) {
                         let clonedTrId = resolutiveTermId;
                         if (splitRule.partIdentifiers && splitRule.partIdentifiers[i] && splitRule.partIdentifiers[i].id) {
                             clonedTrId = splitRule.partIdentifiers[i].id;
                         }
                         localConfig.push({
                             termId: String(clonedTrId).toLowerCase().trim(),
                             transform: (val, rowContext) => {
                                 let text = String(val||"");
                                 const pRules = rulesStack.slice(0, rulesStack.indexOf(splitRule));
                                 if (window.viewerETL) text = window.viewerETL.transformCell(text, pRules, rowContext).clean;
                                 let parts = splitRule.type === 'regex_split' ? text.split(sep) : text.split(sep);
                                 let pT = parts[i] || "";
                                 const aRules = rulesStack.slice(rulesStack.indexOf(splitRule)+1);
                                 if (window.viewerETL) {
                                     const pR = window.viewerETL.transformCell(pT, aRules, rowContext);
                                     pT = pR.resultDisplay || pR.result || pR.display;
                                 }
                                 return pT;
                             },
                             sourceIndex: vCol.dataIdx,
                             originalColId: vColId
                         });
                     }
                } else {
                     localConfig.push({
                         termId: String(resolutiveTermId).toLowerCase().trim(),
                         transform: (val, rowContext) => {
                             if (!window.viewerETL) return val;
                             const res = window.viewerETL.transformCell(String(val||""), rulesStack, rowContext);
                             return res.resultDisplay || res.result || res.display;
                         },
                         sourceIndex: vCol.dataIdx,
                         originalColId: vColId
                     });
                }
            });
            
            // Computadas Locales
            if (localComputedCols && Array.isArray(localComputedCols)) {
                localComputedCols.forEach(calcConfig => {
                    let calcId = calcConfig.masterField?.id || calcConfig.id;
                    localConfig.push({
                        termId: String(calcId).toLowerCase().trim(),
                        isComputed: true,
                        transform: (val, row) => {
                            let resultDisplay = "";
                            try {
                                if (calcConfig.operands && calcConfig.operands.length >= 1) {
                                    let rCtx = row._richContext || {};
                                    // Garantizar evaluacion previa de operando en caso lazy
                                    calcConfig.operands.forEach(opColId => {
                                        if (!opColId || rCtx[opColId] !== undefined) return;
                                        const pipe = localPipelines && localPipelines[opColId] ? localPipelines[opColId].rules : [];
                                        const vColOp = localVirtualCols.find(v => v.id === opColId);
                                        if (vColOp && vColOp.dataIdx !== undefined) {
                                            const raw = String(row[vColOp.dataIdx] || "");
                                            const { clean, display, result } = window.viewerETL.transformCell(raw, pipe || [], row);
                                            rCtx[opColId] = { clean, display: display !== undefined ? display : result, raw };
                                        } else {
                                            rCtx[opColId] = { clean: "", display: "", raw: "" };
                                        }
                                    });
                                    row._richContext = rCtx;

                                    const cA = calcConfig.operands[0] ? rCtx[calcConfig.operands[0]] : null;
                                    const cB = calcConfig.operands[1] ? rCtx[calcConfig.operands[1]] : null;
                                    const allOps = calcConfig.operands.map(opIdx => rCtx[opIdx]);
                                    
                                    if (cA) {
                                        const res = evaluateComputedColumnMath(calcConfig, cA, cB, localPipelines, null, allOps);
                                        resultDisplay = res.resultDisplay;
                                    }
                                }
                            } catch (e) {
                                console.error("Error Simulator Math:", e);
                            }
                            return resultDisplay;
                        }
                    });
                });
            }

            // FASE 2: Ejecutar Sandbox por cada Fila de la Hoja Actual
            let sanitizedData = rawSlice.filter((row, localIndex) => {
                const absoluteRow = startIndex + localIndex;
                if (absoluteRow > endIndex) return false;
                // Filtramos chequeando si tiene datos validos en *alguna* columna que usemos (simulacion rapida)
                // Usaremos localVirtualCols
                return localVirtualCols.some(v => row[v.dataIdx] !== undefined && row[v.dataIdx] !== null && String(row[v.dataIdx]).trim() !== '');
            });

            sanitizedData = window.viewerETL && window.viewerETL.astNodeDefinitions ? window.viewerETL.executeGlobalFilters(sanitizedData, localVirtualCols, localPipelines) : sanitizedData;

            const seenValues = new Set();
            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                row._unifiedOutput = {
                     _origin: sheetObj.name
                };
                
                // Primero pre-llenar rCtx para operados (esto se requiere antes de computed)
                let rCtx = {};
                localVirtualCols.forEach(vCol => {
                    const rules = localPipelines[vCol.id] ? localPipelines[vCol.id].rules : [];
                    const raw = String(row[vCol.dataIdx] || "");
                    const pR = window.viewerETL ? window.viewerETL.transformCell(raw, rules, row) : { clean: raw, display: raw, result: raw };
                    rCtx[vCol.id] = { clean: pR.clean, display: pR.display !== undefined ? pR.display : pR.result, raw: raw };
                });
                row._richContext = rCtx;
                
                // Validadores de Duplicados en hoja
                localVirtualCols.forEach(v => {
                    const ruleStack = localPipelines[v.id] ? localPipelines[v.id].rules : null;
                    const rS = ruleStack ? (Array.isArray(ruleStack) ? ruleStack : [ruleStack]) : [];
                    const dRule = rS.find(r => r.type === 'remove_duplicates' && !r.disabled);
                    if (dRule) {
                        const cellVal = String(row[v.dataIdx] || "").trim();
                        if (cellVal) {
                            if (seenValues.has(cellVal)) keepRow = false;
                            else seenValues.add(cellVal);
                        }
                    }
                });
                
                // Ejecutivo ETL Final hacia Output Normalizado
                localConfig.forEach(cfg => {
                     let resVal = null;
                     if (cfg.isComputed) resVal = cfg.transform(null, row);
                     else resVal = cfg.transform(row[cfg.sourceIndex], row);
                     row._unifiedOutput[cfg.termId] = resVal;
                });

                return keepRow;
            });

            // FASE 3: Enviar el resultado Sandboxed a la Bolsa General
            allSanitizedData = allSanitizedData.concat(sanitizedData);
        }

        let displayConfigForUI = masterVirtualCols.map(mv => {
             return {
                  label: mv.label || masterColumnMap[mv.id] || "Columna",
                  isVirtual: false,
                  isSupportCol: false, // Puedes derivarlo si lo necesitas
                  virtualColId: mv.originalId,
                  transform: (val, row) => {
                       // En este punto, val es ignorado porque consumimos UNIFIED OUTPUT
                       const safeKey = String(masterColumnMap[mv.id]).toLowerCase().trim();
                       let out = row._unifiedOutput ? row._unifiedOutput[safeKey] : null;
                       return out !== undefined && out !== null ? out : "";
                  }
             };
        });
        
        // Sobre-escribir displayConfig con ForUI
        // Nota: displayConfigForUI ya contiene el termId original
        displayConfig.length = 0;
        displayConfig.push(...displayConfigForUI);

        let sanitizedData = allSanitizedData;
        window.currentDisplayConfig = displayConfig;
        
`

   code = code.substring(0, etlLoopStart) + newBlock + code.substring(etlLoopEnd);
   console.log("ETL Sandbox Architecture Patched.");
} else {
    console.log("Could not find ETL sandbox target.");
}


fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log("Done.");
