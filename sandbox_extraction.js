
        // Las configuraciones son universales (se construyen una sola vez)

        const displayConfig = [];
        const sourceConfig = [];

        window.virtualColumns.forEach(vCol => {
            const vColId = vCol.id;
            const termId = columnMapping[vColId];
            if (!termId || termId === 'Ignorar Columna') return;
            const dataIdx = vCol.dataIdx;

            if (termId) {
                sourceConfig.push({ index: dataIdx });

                let termName = termId;
                const termObj = nomenclatureCache.find(t => t.id === termId);
                if (termObj) {
                    termName = termObj.termino;
                } else if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    const masterObj = window.masterDictionary.find(m => m.id === termId);
                    if (masterObj) {
                        termName = masterObj.nombre_campo;
                    }
                }

                // [NUEVO MODELO STRICT VINCULATION V8]
                // El usuario ha determinado que "Mapeada en Primera Instancia" (Nomenclature) NO ES SUFICIENTE.
                // Para que una columna NO SEA "Basura Visual" en el Simulador, DEBE tener un vínculo de sangre explícito
                // en el motor ETL a un Campo Maestro del Diccionario Global (Vinculada).
                let isSupportCol = true; // Por defecto es de apoyo
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        isSupportCol = false; // Es una maestra vinculada oficial
                    }
                }

                // [V4/V5] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT
                const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];

                // Check for Structure Modifying Rules (Split) - Toma prioridad
                const splitRule = rulesStack.find(r => !r.disabled && (r.type === 'split' || r.type === 'regex_split'));

                if (splitRule) {
                    // --- SPLIT LOGIC ---
                    if (splitRule.type === 'split') {
                        splitRule.fields.forEach((fieldId, subIdx) => {
                            let fieldName = fieldId;
                            const fieldObj = nomenclatureCache.find(t => t.id === fieldId);
                            if (fieldObj) {
                                fieldName = fieldObj.termino;
                            } else if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                                const mObj = window.masterDictionary.find(m => m.id === fieldId);
                                if (mObj) fieldName = mObj.nombre_campo;
                            }
                            displayConfig.push({
                                label: fieldName,
                                isVirtual: true,
                                isSupportCol: false, // Split targets son siempre resultado principal
                                sourceIndex: dataIdx, // For reading raw value
                                transform: (val, rowContext) => {
                                    if (val === null || val === undefined || val === '') return '';
                                    const parts = String(val).split(splitRule.delimiter);
                                    return parts[subIdx] ? parts[subIdx].trim() : '';
                                },
                                hasSwitch: false, // Managed via Gear
                                switchColIdx: vColId,
                                virtualColId: vColId
                            });
                        });
                    } else if (splitRule.type === 'regex_split') {
                        const targets = [];
                        if (splitRule.fields) splitRule.fields.forEach(fid => {
                            let fName = "Campo Dinámico";
                            const t = nomenclatureCache.find(x => x.id === fid);
                            if (t) {
                                fName = t.termino;
                            } else if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                                const mT = window.masterDictionary.find(m => m.id === fid);
                                if (mT) fName = mT.nombre_campo;
                            }
                            targets.push(fName);
                        });
                        let patternStr = splitRule.pattern.replace(/\\\\/g, '\\');
                        if (patternStr.startsWith('/')) patternStr = patternStr.slice(1);
                        if (patternStr.endsWith('/')) patternStr = patternStr.slice(0, -1);
                        const regex = new RegExp(patternStr, 'i');

                        targets.forEach((label, subIdx) => {
                            displayConfig.push({
                                label: label,
                                isVirtual: true,
                                isSupportCol: false, // Split dinamico siempre visible
                                sourceIndex: dataIdx, // Read from raw data
                                transform: (val, rowContext) => {
                                    const stringVal = (val !== null && val !== undefined) ? String(val) : "";
                                    const match = stringVal.trim().match(regex);
                                    if (match) {
                                        const pPres = match[0].trim();
                                        const pDesc = String(val).replace(match[0], "").trim();
                                        return subIdx === 0 ? pDesc : pPres;
                                    }
                                    return subIdx === 0 ? val : "";
                                },
                                hasSwitch: false,
                                switchColIdx: vColId,
                                virtualColId: vColId
                            });
                        });
                    }
                } else {
                    // --- PIPELINE TRANSFORM (Chain) ---
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        isSupportCol: isSupportCol, // Flag Maestro V8
                        sourceIndex: dataIdx,
                        transform: (val, rowContext) => {
                            if (!window.viewerETL) return val;
                            const res = window.viewerETL.transformCell(String(val || ""), rulesStack, rowContext);
                            return res.resultDisplay || res.result || res.display;
                        },
                        hasSwitch: false, // Legacy switch hidden, relying on Gear
                        switchColIdx: vColId,
                        virtualColId: vColId // Important for Gear ID
                    });
                }
            }
        });

        // --- F. COMPUTED COLUMNS LOGIC ---
        if (window.computedColumns && Array.isArray(window.computedColumns)) {
            window.computedColumns.forEach(calcConfig => {
                displayConfig.push({
                    label: calcConfig.masterField?.nombre_campo || 'Calculada',
                    isVirtual: true,
                    isComputed: true, // Custom flag
                    isSupportCol: false, // Las calculadas son siempre maestras
                    virtualColId: calcConfig.id,
                    sourceIndex: -1, // No lee del slice crudo
                    transform: (val, row) => {
                        let resultDisplay = "";
                        try {
                            if (calcConfig.operands && calcConfig.operands.length >= 1) {
                                // [NEW] Lazy load para Simulador si la columna operando no fue mapeada oficialmente
                                let rCtx = row._richContext || {};
                                if (window.viewerETL) {
                                    calcConfig.operands.forEach(opColId => {
                                        if (!opColId) return;
                                        if (rCtx[opColId] === undefined) {
                                            if (window.VigiaLogger) window.VigiaLogger.log("SIMULATOR", `Inyectando Lazy Context para Preview: ${opColId}`);
                                            const pipe = window.draftPipelines && window.draftPipelines[opColId] ? window.draftPipelines[opColId].rules : [];
                                            const vColOp = window.virtualColumns.find(v => v.id === opColId);
                                            if (vColOp && vColOp.dataIdx !== undefined) {
                                                const raw = String(row[vColOp.dataIdx] || "");
                                                const { clean, display, result } = window.viewerETL.transformCell(raw, pipe || [], row);
                                                rCtx[opColId] = { clean, display: display !== undefined ? display : result, raw: raw };
                                            } else {
                                                rCtx[opColId] = { clean: "", display: "", raw: "" };
                                            }
                                        }
                                    });
                                    row._richContext = rCtx;
                                }

                                // Obtener los datos previamente transformados por sus columnas base de row._richContext
                                const cA = calcConfig.operands[0] ? rCtx[calcConfig.operands[0]] : null;
                                const cB = calcConfig.operands[1] ? rCtx[calcConfig.operands[1]] : null;
                                const allOps = calcConfig.operands.map(opIdx => rCtx[opIdx]);
                                
                                // Permite calcular si al menos cA existe (necesario para CLONE)
                                if (cA) {
                                    // Utilizar la función unificada de matemáticas / clonación
                                    const res = evaluateComputedColumnMath(calcConfig, cA, cB, window.draftPipelines, null, allOps);
                                    resultDisplay = res.resultDisplay;
                                }
                            }
                        } catch (e) {
                            console.error("Error Simulator Math:", e);
                        }
                        return resultDisplay;
                    },
                    hasSwitch: false,
                    switchColIdx: calcConfig.id
                });
            });
        }

        // --- G. UNIFIED VISUAL ORDERING ---
        // V6 UX: The simulator now properly renders columns in the exact global dragged layout
        if (window.LayoutManager && window.LayoutManager.state.order && window.LayoutManager.state.order.length > 0) {
            displayConfig.sort((a, b) => {
                let idxA = window.LayoutManager.state.order.indexOf(a.virtualColId);
                let idxB = window.LayoutManager.state.order.indexOf(b.virtualColId);
                if (idxA === -1) idxA = 9999;
                if (idxB === -1) idxB = 9999;
                return idxA - idxB;
            });
        }

        if (displayConfig.length === 0) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Primero debes mapear al menos una columna.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            else alert("Primero debes mapear al menos una columna.");
            return;
        }

        const startIndex = window.currentOffset ? window.currentOffset.row : 0;
        