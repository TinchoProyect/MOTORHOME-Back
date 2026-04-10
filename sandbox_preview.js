async function generatePreview() {
    try {
        if (!currentSheetData || currentSheetData.length === 0) return;

        const pName = window.globalContext.providerName || "DESCONOCIDO";
        const fType = window.globalContext.fileType || "GENERAL";
        const modalTitle = document.getElementById('simModalTitle');

        if (modalTitle) {
            modalTitle.innerHTML = `
                <span class="text-slate-400 font-normal">Vista Previa de Extracción:</span> 
                <span class="text-white font-bold ml-2">${pName}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-blue-900 text-blue-300 border border-blue-800 uppercase tracking-wider">${fType}</span>
            `;
        }
        
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
                const sheetsHtml = validSheets.map((s, idx) => `
                    <div class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors">
                        <input type="checkbox" id="chk_sim_sheet_${idx}" value="${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" ${s.name === currentSheetName ? 'checked' : ''}>
                        <div class="flex-1 text-left cursor-pointer" onclick="document.getElementById('chk_sim_sheet_${idx}').click()">
                            <div class="text-white text-sm font-bold flex items-center gap-2">
                                <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> ${s.name}
                            </div>
                            <div class="text-xs text-slate-500 font-mono mt-0.5">Filas crudas: ${s.data.length}</div>
                        </div>
                    </div>
                `).join('');

                const res = await Swal.fire({
                    title: 'Alcance de la Transformación',
                    html: `
                        <p class="text-slate-400 text-sm mb-4">El archivo base posee múltiples pestañas. Selecciona cuáles deseas procesar simultáneamente empleando esta misma configuración del motor ETL:</p>
                        <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-left text-base">
                            ${sheetsHtml}
                        </div>
                    `,
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
                            const chk = document.getElementById(`chk_sim_sheet_${idx}`);
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

        const startRow = currentOffset ? currentOffset.row : 0;
        
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
        
        let allSanitizedData = [];

        for (const sheetObj of sheetsToProcess) {
            const currentSheetIterationData = sheetObj.data;
            if (!currentSheetIterationData || currentSheetIterationData.length === 0) continue;

            // En VIRTUAL_DB o sheets cargados, currentSheetIterationData tiene X rows
            const endIndex = window.currentEndOffset ? window.currentEndOffset.row : currentSheetIterationData.length;
            const rawSlice = currentSheetIterationData.slice(startIndex);

            let sanitizedData = rawSlice.filter((row, localIndex) => {
                const absoluteRow = startIndex + localIndex;
                if (absoluteRow > endIndex) return false;
                
                return sourceConfig.some(cfg => {
                    const val = row[cfg.index];
                    return val !== undefined && val !== null && String(val).trim() !== '';
                });
            });

            const seenValues = new Set();

            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                Object.keys(columnMapping).forEach(vColId => {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    if (!vCol) return;
                    const dataIdx = vCol.dataIdx;

                    const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                    const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                    const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];

                    let cellValue = row[dataIdx];
                    let display = (cellValue !== null && cellValue !== undefined) ? String(cellValue) : "";
                    let clean = null;
                    let rejected = false;

                    if (window.viewerETL && typeof window.viewerETL.transformCell === 'function') {
                        const result = window.viewerETL.transformCell(cellValue, rulesStack, row);
                        display = result.display;
                        clean = result.clean;
                        rejected = result.rejected;
                    } else {
                        console.warn("[Simulador] window.viewerETL no está listo. Ignorando transformaciones.");
                    }
                    
                    if (!row._richContext) row._richContext = {};
                    row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };

                    let localReject = rejected;
                    for (const rule of rulesStack) {
                        if (rule.disabled) continue;
                        if (rule.type === 'row_filter' || rule.type === 'filter') {
                            if (rule.config?.exclude_empty && String(display).trim() === "") localReject = true;
                            if (!localReject && rule.config?.exclude_regex) {
                                try {
                                    let p = rule.config.exclude_regex.replace(/\\/g, '\\');
                                    if (p.startsWith('/')) p = p.slice(1, -1);
                                    if (new RegExp(p, 'i').test(String(display))) localReject = true;
                                } catch (e) { }
                            }
                        }
                    }
                    
                    if (localReject) {
                        let isRequired = false;
                        const termId = columnMapping[vColId];
                        if (termId && termId !== 'Ignorar Columna' && window.masterDictionary) {
                            const mObj = window.masterDictionary.find(m => m.id === termId);
                            if (mObj && mObj.es_requerido) isRequired = true;
                        }

                        const isCellEmpty = (display === null || display === undefined || String(display).trim() === "");
                        if (isCellEmpty && !isRequired) {
                            // Perdonar
                        } else {
                            row._rejectedSim = true;
                        }
                    }

                    let dictTermId = columnMapping[vColId];
                    if (dictTermId && dictTermId !== 'Ignorar Columna') {
                        let colName = dictTermId;
                        if (window.masterDictionary) {
                            const mObj = window.masterDictionary.find(m => m.id === dictTermId || m.nombre_campo === dictTermId);
                            if (mObj && mObj.nombre_campo) colName = mObj.nombre_campo;
                        }
                        
                        const isCodeCol = !!String(colName).toUpperCase().trim().match(/^C[OÓ]DIGO/i);
                        const cleanDisplay = display ? String(display).trim() : "";
                        const hasAlphanumeric = /[a-zA-Z0-9]/.test(cleanDisplay);
                        
                        if (isCodeCol && !hasAlphanumeric) {
                            row._rejectedSim = true;
                            row._rejectedByCode = true;
                        }
                    }
                });
                return true;
            });

            sanitizedData.forEach((row, localIndex) => {
                if (row._rejectedSim) return;
                let isEmptyRow = true;
                displayConfig.forEach(cfg => {
                     let finalVal = null;
                     if (cfg.isComputed) {
                         finalVal = cfg.transform(null, row);
                     } else {
                         const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
                         finalVal = row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null;
                         if(finalVal === null || finalVal === undefined) finalVal = cfg.transform(rawVal, row);
                     }
                     if (finalVal !== null && finalVal !== undefined && String(finalVal).trim() !== "") {
                         isEmptyRow = false;
                     }
                });
                
                if (isEmptyRow) {
                     row._rejectedSim = true;
                     row._emptySilently = true;
                }
                
                // [NUEVO] Inyectar Identidad Multi-hoja para trazabilidad y concanetación sin ID collissions
                row._sourceSheet = sheetObj.name;
                row._originalIndex = startIndex + localIndex;
            });

            // Concatenar el lote completado a la colección unificada
            allSanitizedData = allSanitizedData.concat(sanitizedData);
        }
        
        // Reasignamos sanitizedData consolidado para compatibilidad con el resto de la UI
        let sanitizedData = allSanitizedData;

        const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;
        window.currentSimData = sanitizedData;
        window.currentDisplayConfig = displayConfig;

        const container = document.getElementById('simulationTableContainer');
        if (!container) return;

        // Reuse GlobalSearchFilter component
        let simOptions = [];
        displayConfig.forEach((cfg, idx) => {
            simOptions.push({ label: cfg.label, value: idx });
        });

        const filterHTML = window.GlobalSearchFilter ? window.GlobalSearchFilter.render('sim', 'filterSimulationData') : '<span class="text-slate-500">Search Loader Failed</span>';
        
        // [V8 UI] Toggle de Visibilidad de Rechazos
        window.ViewerUI._showRejectedRowsInSim = window.ViewerUI._showRejectedRowsInSim || false;
        const toggleHtml = `
            <button onclick="window.ViewerUI.toggleRejectedRows()" class="ml-2 px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase ${window.ViewerUI._showRejectedRowsInSim ? 'bg-red-900/40 text-red-300 border border-red-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'}" title="Alterna la visibilidad de registros descartados o completamente vacíos">
                <i data-lucide="${window.ViewerUI._showRejectedRowsInSim ? 'eye' : 'eye-off'}" class="w-3 h-3"></i> 
                Mostrar Descartadas
            </button>
        `;

        // [V8 UI] Toggle de Visibilidad de Columnas de Apoyo
        window.ViewerUI._showSupportColsInSim = window.ViewerUI._showSupportColsInSim || false;
        
        let hasSupportCols = displayConfig.some(c => c.isSupportCol);
        const supportToggleHtml = hasSupportCols ? `
            <button onclick="window.ViewerUI.toggleSupportCols()" class="ml-2 px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase ${window.ViewerUI._showSupportColsInSim ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'}" title="Las columnas de apoyo están mapeadas pero no tienen reglas que las vinculen a un campo maestro">
                <i data-lucide="${window.ViewerUI._showSupportColsInSim ? 'eye' : 'eye-off'}" class="w-3 h-3"></i> 
                Columnas de Apoyo
            </button>
        ` : '';

        const toolbar = `
            <div class="flex items-center gap-3 mb-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10 w-full">
                ${filterHTML}
                ${toggleHtml}
                ${supportToggleHtml}
                
                <div class="text-[10px] text-slate-500 font-mono px-2 border-l border-slate-700 ml-auto">
                    <span id="simFilteredCount">${sanitizedData.length}</span> / ${sanitizedData.length}
                </div>
            </div>
            <div id="simTableScrollArea" class="flex-1 w-full min-h-[300px] overflow-auto custom-scrollbar relative p-0 m-0 bg-slate-900">
            </div>
        `;

        container.innerHTML = toolbar;
        
        if (window.GlobalSearchFilter) {
            window.GlobalSearchFilter.updateOptions('sim', simOptions);
            const state = window.GlobalSearchFilter.getState('sim');
            
            const searchInp = document.getElementById('simSearchInput');
            if (searchInp && state.query) searchInp.value = state.query;
            
            if (state.query && state.query !== "") {
                filterSimulationData();
            } else {
                renderSimulationTable(sanitizedData);
            }
        } else {
            renderSimulationTable(sanitizedData);
        }

        document.getElementById('simulationModal').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons({ root: container });

        document.getElementById('simMeta').innerHTML = `
            <span class="text-slate-400">Filas Válidas:</span> <span class="text-emerald-400 font-bold">${validRowsCount}</span> 
            <span class="text-red-400 font-bold ml-2">(Filas Descartadas: ${sanitizedData.length - validRowsCount})</span>  
            <span class="text-slate-600 mx-2">|</span> 
            <span class="text-slate-400">Columnas Master:</span> <span class="text-white font-bold">${displayConfig.length}</span>
        `;

    } catch (error) {
        console.error("Critical Preview Error:", error);
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error en Previsualización', text: error.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Error en Previsualizador: " + error.message);
    }
}