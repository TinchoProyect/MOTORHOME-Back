const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const sIdx = code.indexOf('        let allSanitizedData = [];');
const eIdx = code.indexOf('        let simOptions =');

if (sIdx !== -1 && eIdx !== -1) {
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

            let localColumnMap = (typeof columnMapping !== 'undefined') ? columnMapping : {};
            let localVirtualCols = window.virtualColumns || [];
            let localPipelines = window.draftPipelines || {};
            let localComputedCols = window.computedColumns || []; // Support Phantom Columns globally if Active
            
            // Si la hoja tiene su propia configuración (Mapeada), la usamos
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
                const localDictTermId = localColumnMap[vColId];
                if (!localDictTermId || localDictTermId === 'Ignorar Columna') return;
                
                let resolutiveTermId = localDictTermId;
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
                                console.error("Error Sandbox Math:", e);
                            }
                            return resultDisplay;
                        }
                    });
                });
            }

            // FASE 2: Ejecutar Sandbox por cada fila
            let sanitizedData = rawSlice.filter((row, localIndex) => {
                const absoluteRow = startIndex + localIndex;
                if (absoluteRow > endIndex) return false;
                return localVirtualCols.some(v => row[v.dataIdx] !== undefined && row[v.dataIdx] !== null && String(row[v.dataIdx]).trim() !== '');
            });

            // AST Global Filters Sandbox
            if (window.viewerETL && window.viewerETL.astNodeDefinitions) {
                 sanitizedData = window.viewerETL.executeGlobalFilters(sanitizedData, localVirtualCols, localPipelines);
            }

            const seenValues = new Set();

            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                row._unifiedOutput = {
                     _origin: sheetObj.name
                };
                
                // Pre-llenar rCtx para operandos
                let rCtx = {};
                localVirtualCols.forEach(vCol => {
                    const rules = localPipelines[vCol.id] ? localPipelines[vCol.id].rules : [];
                    const raw = String(row[vCol.dataIdx] || "");
                    const pR = window.viewerETL ? window.viewerETL.transformCell(raw, rules, row) : { clean: raw, display: raw, result: raw };
                    rCtx[vCol.id] = { clean: pR.clean, display: pR.display !== undefined ? pR.display : pR.result, raw: raw };
                });
                row._richContext = rCtx;
                
                // Externa duplicates filter
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
                
                // RESOLUCION LOCAL A MATRIZ GLOBAL (TermId based)
                let isEmptyRow = true;
                localConfig.forEach(cfg => {
                     let resVal = null;
                     if (cfg.isComputed) resVal = cfg.transform(null, row);
                     else resVal = cfg.transform(row[cfg.sourceIndex], row);
                     
                     if (resVal !== undefined && resVal !== null && String(resVal).trim() !== "") {
                         isEmptyRow = false;
                     }
                     row._unifiedOutput[cfg.termId] = resVal;
                });
                
                if (isEmptyRow) keepRow = false;

                return keepRow;
            });

            // FASE 3: Encausar los registros saneados a la tubería unificadora
            allSanitizedData = allSanitizedData.concat(sanitizedData);
        }

        // FASE 4: El HTML Grid Builder. 
        // Sobreescribimos el 'displayConfig' para proveer una API de solo lectura
        // basándonos en el Schema Master Union.
        displayConfig.length = 0;
        masterVirtualCols.forEach(mv => {
             displayConfig.push({
                  label: mv.label || masterColumnMap[mv.id] || "Columna",
                  isSupportCol: false, 
                  virtualColId: mv.originalId,
                  transform: (val, row) => {
                       // En este punto somos ciegos: Solo leemos de _unifiedOutput (The Resolved Cache)
                       const safeKey = String(masterColumnMap[mv.id]).toLowerCase().trim();
                       let out = row._unifiedOutput ? row._unifiedOutput[safeKey] : null;
                       return out !== undefined && out !== null ? out : "";
                  }
             });
        });

        // Configurar renderizador web
        let sanitizedData = allSanitizedData;
        window.currentDisplayConfig = displayConfig;
        
        `;

   const newFileContent = code.substring(0, sIdx) + newBlock + code.substring(eIdx);
   fs.writeFileSync('src/views/js/viewer_render.js', newFileContent);
   console.log("ETL Sandbox Rewritten successfully.");
} else {
   console.log("Error index:", sIdx, eIdx);
}
