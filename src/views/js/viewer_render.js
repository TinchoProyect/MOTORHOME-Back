/**
 * VIEWER RENDER - Virtual Scroller & Visual Engine
 * Extracted from viewer_engine_rescatado.js
 */

function evaluateComputedColumnMath(calcConfig, opA, opB, draftPipelinesVar, activeEtlStateVar, allOps = null, contextRow = null) {
    let resultDisplay = "";
    let rejected = false;
    let mathResult = 0;
    
    // [NUEVO CASO CLON] Manejo puramente de String, no matemático
    // Aceptamos CLONE_SEMANTIC para que el Módulo Caza-rubros (Chofer IA) no termine fundiéndose en 0,00 al parsear texto
    if (calcConfig.macro === "CLONE" || calcConfig.macro === "CLONE_SEMANTIC") {
        let rawStringA = "";
        
        if (allOps && Array.isArray(allOps) && allOps.length > 0) {
            // Lógica de Fallback (COALESCE): Tomar la primera columna origen que posea un valor válido.
            // Opcional: Si el usuario deseaba concatenar, se puede hacer join(" "). Para Fallback estricto usamos filter + shift:
            const valids = allOps.map(op => {
                const txt = op?.raw !== undefined ? op.raw : (op?.display !== undefined ? op.display : (op?.clean !== undefined && op?.clean !== null ? op.clean : ""));
                return String(txt).trim();
            }).filter(v => v !== "");
            
            rawStringA = valids.length > 0 ? valids.join(" ") : ""; // join(" ") cumple ambos propósitos: Si solo hay uno, es él mismo. Si hay dos, es string1 + string2.
        } else {
            // [HOTFIX V5.22] Extraer dato crudo (raw) para CLONE
            const txtA = opA?.raw !== undefined ? opA.raw : (opA?.display !== undefined ? opA.display : (opA?.clean !== undefined && opA?.clean !== null ? opA.clean : ""));
            rawStringA = String(txtA).trim();
        }
        
        const savedPipeline = draftPipelinesVar && draftPipelinesVar[calcConfig.id] ? draftPipelinesVar[calcConfig.id].rules : null;
        const activePipeline = (activeEtlStateVar && activeEtlStateVar.isOpen && activeEtlStateVar.colIndex === calcConfig.id) 
                                ? activeEtlStateVar.pipeline : savedPipeline;

        if (window.VigiaLogger) window.VigiaLogger.log("CLONE_OP", `Evaluando Clone: input='${rawStringA}', pipeline=${activePipeline?activePipeline.length:0}`, { opA, calcConfigId: calcConfig.id, opA_ID: calcConfig.operands?.[0] });

        if (activePipeline && activePipeline.length > 0 && window.viewerETL) {
            const { result, rejected: wasRejected } = window.viewerETL.transformCell(rawStringA, activePipeline, contextRow);
            if (wasRejected) rejected = true;
            resultDisplay = result;
            if (result === "" && rawStringA !== "" && !window._vigiaTripleGate2) {
                window._vigiaTripleGate2 = true;
                console.warn(`VIGÍA CRÍTICO GATE 2: transformCell ANIQUILÓ la cadena "${rawStringA}". Retornó VACÍO. Regla Culpable:`, JSON.parse(JSON.stringify(activePipeline)));
            }
        } else {
            resultDisplay = rawStringA;
        }
        
        if (window.VigiaLogger) window.VigiaLogger.log("CLONE_RES", `Resultado Clone: '${resultDisplay}'`);
        
        return { resultDisplay, mathResult: rawStringA, rejected };
    }

    // [FIX V8.10 - DETERMINISTIC NUMERIC SANITIZER]
    // Extractor robusto con fallback en cascada: clean -> raw -> display
    // Nunca permite que una columna numérica llegue al motor como string vacío
    const extractNumericSource = (op) => {
        if (!op) return '';
        // Cascada de candidatos: clean (valor post-ETL sin formato), raw (crudo original), display
        const candidates = [
            op.clean,
            op.raw,
            op.display,
        ];
        for (const c of candidates) {
            if (c !== undefined && c !== null && String(c).trim() !== '') {
                const s = String(c).trim();
                // Rechazar valores que son puramente HTML (resultado de transformación visual)
                if (s.startsWith('<')) continue;
                return s;
            }
        }
        return '';
    };

    // Sanitizador numérico modularizado (maneja locale AR: 20.618,30 -> 20618.30)
    const safeParseFn = (strVal) => {
        if (!strVal || strVal === '') return 0;
        // Strip currency symbols and whitespace
        let s = strVal.replace(/[$\s\u00A0\u202F]/g, '').trim();
        if (s === '' || s === '-') return 0;
        // Locale AR: punto de miles, coma decimal (20.618,30)
        if (s.includes(',') && s.includes('.')) {
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');
            if (lastComma > lastDot) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
            else return parseFloat(s.replace(/,/g, ''));
        } else if (s.includes(',')) {
            // Solo coma: puede ser decimal AR (0,1 -> 0.1)
            return parseFloat(s.replace(',', '.'));
        }
        return parseFloat(s);
    };

    let rawA = extractNumericSource(opA);
    let isOpBEmpty = (opB?.clean === null || opB?.clean === undefined || String(opB.clean).trim() === '') &&
                     (opB?.raw === null || opB?.raw === undefined || String(opB.raw).trim() === '');
    let rawB = '0';

    let shouldTolerateEmpty = calcConfig.tolerateEmpty !== false;
    if (!isOpBEmpty) {
        rawB = extractNumericSource(opB);
    } else if (!shouldTolerateEmpty) {
        return { resultDisplay: "<span class='text-slate-600 italic text-[10px]'>N/A</span>", rejected: true };
    }

    let mathA = safeParseFn(rawA);
    let mathB = safeParseFn(rawB);

    if (isNaN(mathA)) mathA = 0;
    if (isNaN(mathB)) mathB = 0;

    if (calcConfig.macro === "PRICE_MINUS_DISCOUNT_PERCENT") {
        const discountPercent = Math.abs(mathB);
        if (discountPercent === 0) mathResult = mathA;
        else {
            const actualPercentMultiplier = (discountPercent > 0 && discountPercent < 1) ? discountPercent : (discountPercent / 100);
            mathResult = mathA * (1 - actualPercentMultiplier);
        }
    } else if (calcConfig.macro === "MULTIPLY") {
        mathResult = mathA * mathB;
    } else if (calcConfig.macro === "SUBTRACT") {
        mathResult = mathA - mathB;
    }

    let rawFormatted = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mathResult);
    
    const savedPipeline = draftPipelinesVar && draftPipelinesVar[calcConfig.id] ? draftPipelinesVar[calcConfig.id].rules : null;
    const activePipeline = (activeEtlStateVar && activeEtlStateVar.isOpen && activeEtlStateVar.colIndex === calcConfig.id) 
                            ? activeEtlStateVar.pipeline : savedPipeline;

    if (activePipeline && activePipeline.length > 0 && window.viewerETL) {
        const { result, rejected: wasRejected } = window.viewerETL.transformCell(String(mathResult).replace('.', ','), activePipeline, contextRow);
        if (wasRejected) rejected = true;
        resultDisplay = result;
    } else {
        resultDisplay = rawFormatted;
    }
    
    return { resultDisplay, mathResult, rejected };
}

function renderVirtualTable(originalData) {
    // [REQ QA] Resolución anticipada de la columna 'código' para el anclaje SKU de reemplazos manuales
    // [REQ QA] Resolución anticipada de la columna 'código' para el anclaje SKU de reemplazos manuales
    let codeDataIdx = -1;
    
    const isMasterIdentifier = (masterId, masterName) => {
        if (!window.masterDictionary) return false;
        const mObj = window.masterDictionary.find(m => String(m.id) === String(masterId));
        if (mObj && mObj.es_identificador === true) return true;
        if (mObj && mObj.nombre_campo) masterName = mObj.nombre_campo;
        if (!masterName) return false;
        const lowerName = masterName.toLowerCase().trim();
        return lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku';
    };

    if (window.draftPipelines) {
        for (let cId in window.draftPipelines) {
            const pipe = window.draftPipelines[cId];
            if (pipe && pipe.masterField && isMasterIdentifier(pipe.masterField.id, pipe.masterField.nombre_campo)) {
                if (window.virtualColumns && typeof cId === 'string') {
                    const vCol = window.virtualColumns.find(c => String(c.id) === String(cId));
                    if (vCol && vCol.dataIdx !== undefined) codeDataIdx = vCol.dataIdx;
                }
                if (codeDataIdx === -1 && typeof cId === 'string' && cId.startsWith('col_')) {
                    codeDataIdx = parseInt(cId.replace('col_', ''), 10);
                }
                break;
            }
        }
    }
    
    if (codeDataIdx === -1 && window.columnMapping) {
        for (let cId in window.columnMapping) {
            const mappedVal = window.columnMapping[cId];
            let isId = false;
            if (isMasterIdentifier(mappedVal, mappedVal)) {
                isId = true;
            } else if (window.nomenclatureCache) {
                const term = window.nomenclatureCache.find(t => String(t.termino).toLowerCase().trim() === String(mappedVal).toLowerCase().trim());
                if (term && (term.termino.toLowerCase().trim() === 'código' || term.termino.toLowerCase().trim() === 'codigo' || term.termino.toLowerCase().trim() === 'sku')) {
                    isId = true;
                }
            }
            if (!isId) {
                const lowerName = String(mappedVal).toLowerCase().trim();
                if (lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku') {
                    isId = true;
                }
            }
            if (isId) {
                if (window.virtualColumns && typeof cId === 'string') {
                    const vCol = window.virtualColumns.find(c => String(c.id) === String(cId));
                    if (vCol && vCol.dataIdx !== undefined) codeDataIdx = vCol.dataIdx;
                }
                if (codeDataIdx === -1 && typeof cId === 'string' && cId.startsWith('col_')) {
                    codeDataIdx = parseInt(cId.replace('col_', ''), 10);
                }
                break;
            }
        }
    }

    // [V5.19 UX] Global Trim for Phantom Rows (bottom-up filtering)
    let cleanedData = [...(originalData || [])];
    let lastRealRowIndex = cleanedData.length - 1;
    while (lastRealRowIndex >= 0) {
        const row = cleanedData[lastRealRowIndex];
        const isEmptyRow = !row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === "");
        if (!isEmptyRow) break;
        lastRealRowIndex--;
    }
    const data = cleanedData.slice(0, lastRealRowIndex + 1);

    // 🔥 STATE EXPOSURE FOR SATELLITE MODULES (v2.5)
    window.viewerState = { mapping: columnMapping, data: data };
    // [V5.19 FIX REVERTED] Ya no sobreescribimos currentSheetData aquí, 
    // porque si 'data' es un subconjunto filtrado por el buscador, 
    // destruiríamos el dataset global maestro irreversíblemente.

    const container = document.getElementById('excelContainer');
    if (container) {
        container.style.overflowY = 'auto';
        container.style.overflowX = 'auto';

        // Estilizar scrollbar nativa generada dinámicamente
        if (!document.getElementById('virtual-scrollbar-style')) {
            const style = document.createElement('style');
            style.id = 'virtual-scrollbar-style';
            style.textContent = `
                #excelContainer::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                #excelContainer::-webkit-scrollbar-track {
                    background: #0f172a; /* bg-slate-900 */
                    border-left: 1px solid #1e293b;
                }
                #excelContainer::-webkit-scrollbar-thumb {
                    background: #334155; /* bg-slate-700 */
                    border-radius: 6px;
                    border: 3px solid #0f172a;
                }
                #excelContainer::-webkit-scrollbar-thumb:hover {
                    background: #10b981; /* bg-emerald-500 */
                }
            `;
            document.head.appendChild(style);
        }
    }

    if (!data || data.length === 0) {
        if (container) container.innerHTML = '<div class="text-slate-500 p-4">Hoja vacía o todos los datos fueron filtrados.</div>';
        return;
    }

    let maxCols = 0;
    const scanLimit = Math.min(data.length, 50);
    for (let i = 0; i < scanLimit; i++) {
        if (data[i] && data[i].length > maxCols) maxCols = data[i].length;
    }
    if (maxCols === 0) maxCols = 1;

    // --- VIRTUAL COLUMNS V4 PROXY ---
    if (!window.virtualColumns || window.virtualColumns.length === 0) {
        window.virtualColumns = [];
        for (let idx = 0; idx < maxCols; idx++) {
            window.virtualColumns.push({ id: `col_${idx}`, dataIdx: idx });
        }
    } else {
        // [QA BUGFIX: PRE-CLEANUP DE HUÉRFANOS]
        // Purgamos variables fantasma que no fueron mapeadas para que no contaminen la renderización ni maxCols
        window.virtualColumns = window.virtualColumns.filter(vc => {
            if (vc.isGhostPlaceholder) {
                // Tolerar ghosts recién creados (_isNewTemp) hasta que sean mapeados.
                // El flag NO se consume aquí porque el injector dispara múltiples renders
                // durante la fase de creación, antes de que el usuario pueda mapear.
                if (vc._isNewTemp) return true;
                
                const isMapped = window.draftPipelines && window.draftPipelines[vc.id];
                if (!isMapped) {
                    console.log(`🧹 [RenderEngine] Purgando Placeholder Huérfano: ${vc.id}`);
                    return false;
                }
            }
            return true;
        });

        // [V5.5 - MERGE DE ESQUEMAS] Resuelve "Schema Blindness" cruzando memoria con Raw Data
        // Aseguramos que si el archivo nuevo trajo más columnas de las que el flujo recordaba, estas se inyecten.
        // [QA BUGFIX] Guardia defensiva: no re-inyectar dataIdx que fueron consumidos por computedColumns
        const consumedDataIdxSet = new Set();
        if (window.computedColumns) {
            window.computedColumns.forEach(cc => {
                // Las computed columns que nacieron de ghosts almacenan el dataIdx consumido
                if (cc._consumedDataIdx !== undefined) {
                    consumedDataIdxSet.add(cc._consumedDataIdx);
                }
            });
        }

        for (let idx = 0; idx < maxCols; idx++) {
            if (consumedDataIdxSet.has(idx)) continue; // Ya fue absorbido por una computed column
            const exists = window.virtualColumns.some(vc => vc.dataIdx === idx);
            if (!exists) {
                window.virtualColumns.push({ id: `col_${idx}`, dataIdx: idx });
            }
        }
    }
    
    // [V5 UX] Auto-Restore UI Order Preference via Layout Manager
    if (window.virtualColumns && window.LayoutManager) {
        window.virtualColumns = window.LayoutManager.applyOrder(window.virtualColumns);
    }

    const ROW_HEIGHT = 35;
    const HEADER_HEIGHT = 40;
    const totalRows = data.length;
    const totalHeight = (totalRows * ROW_HEIGHT) + HEADER_HEIGHT;

    // [V6] Gestor de Visibilidad (Renderizado de Píldoras Externo)
    if (window.ViewerVisibilityManager && typeof window.ViewerVisibilityManager.renderHiddenPills === 'function') {
        window.ViewerVisibilityManager.renderHiddenPills();
    }

    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'border-collapse text-[11px] font-mono w-full';
    table.style.tableLayout = 'fixed';
    table.style.width = '0px'; // Crucial para que el contenido no impida achicar la columna
    table.style.marginBottom = '20px'; // [QA-3] Ajustar padding inferior para evitar ocultamiento de la última fila
    container.appendChild(table);

    const thead = document.createElement('thead');
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // Header
    const headerRow = data[0] || [];
    let headerHtml = `<tr style="height: ${HEADER_HEIGHT}px">`;

    let activeEtlState = null;
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
        activeEtlState = window.viewerRuleWorkshop.getActiveState();
    }

    window.virtualColumns.forEach((vCol) => {
        if (vCol.isCalculated) return; // Bug Fix N°5: Ignorar la columna fantasma en el DOM de pre-render físico
        let j = vCol.id;
        
        // [V6] Control de Visibilidad
        if (window.ViewerVisibilityManager && window.ViewerVisibilityManager.isHidden(j)) return;
        
        let dataIdx = vCol.dataIdx;
        let originalVal = headerRow[dataIdx] || (dataIdx === 0 ? '#' : `Col ${dataIdx + 1}`);
        let mappedType = columnMapping[j];

        // --- NAME RESOLUTION HELPER ---
        const getHumanName = (idOrName) => {
            if (!idOrName || idOrName === 'Ignorar Columna') return idOrName;
            if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                const match = window.masterDictionary.find(m => String(m.id) === String(idOrName) || String(m.nombre_campo) === String(idOrName));
                if (match) return match.nombre_campo;
            }
            return idOrName;
        };

        // Legacy toggle removed from main view

        let thContent = originalVal;
        let thClass = "bg-slate-800 text-blue-400 font-bold uppercase border border-slate-700 p-2 sticky top-0 z-20 text-left overflow-hidden text-ellipsis whitespace-nowrap";

        // Global check: mappingMode comes from viewer_mapping.js
        if (window.mappingMode || typeof mappingMode !== 'undefined' && mappingMode) {
            const isMapped = !!mappedType;
            const btnClass = isMapped ? 'bg-blue-600/10 border-blue-500/50 text-blue-300' : 'bg-slate-800/50 text-slate-500 hover:text-blue-400';
            thClass = "bg-slate-950 p-1 sticky top-0 z-20";
            const displayName = isMapped ? getHumanName(mappedType) : originalVal;
            thContent = `<div class="flex items-center gap-1 h-full">
                <button onclick="if(window.isRemappingFlow) return; openColumnMenu_v2('${j}', this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                    <span class="truncate font-bold text-[10px] uppercase">${displayName}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                </button>
            </div>`;
        } else if (window.isViewerReadOnly) {
            // [QA-4] MODO LECTURA ESTRICTA (Pendientes)
            // [Ticket #010] Inyectar selector de omisión para columnas basura (PDF/Excel crudo)
            const isOmitted = window.pdfOmittedColumns && window.pdfOmittedColumns.includes(dataIdx);
            const chkId = `chk_omit_${dataIdx}`;
            
            thContent = `
                <div class="flex items-center justify-between w-full h-full group">
                    <span class="truncate ${isOmitted ? 'opacity-30 grayscale decoration-line-through text-slate-500' : 'text-slate-300'}" title="${originalVal}">${originalVal}</span>
                    <input type="checkbox" id="${chkId}" ${!isOmitted ? 'checked' : ''} onchange="window.toggleColumnOmission(${dataIdx})" class="w-3.5 h-3.5 cursor-pointer rounded bg-slate-800 border-slate-600 text-emerald-500" title="Desmarcar para omitir columna de la Ingesta">
                </div>
            `;
            
            if (isOmitted) thClass += " bg-slate-900/50 opacity-50";
        } else {
            if (window.draftPipelines && window.draftPipelines[j]) {
                const pipe = window.draftPipelines[j];
                const pipeName = getHumanName(pipe.masterField ? (pipe.masterField.nombre_campo || pipe.masterField.id) : mappedType);
                const safeOriginVal = originalVal ? originalVal.replace(/'/g, "\\'") : '';
                const safePipeName = pipeName ? pipeName.replace(/'/g, "\\'") : '';
                thContent = `
                    <div class="flex items-center justify-between w-full gap-1 group relative">
                        <div class="flex items-center gap-1.5 flex-1 cursor-pointer text-emerald-300 hover:bg-emerald-900/30 px-1 py-0.5 rounded transition-colors truncate" onclick="if(window.isRemappingFlow) return; if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '${j}', '${safePipeName}')">
                            <i data-lucide="link-2" class="w-3 h-3 shrink-0"></i>
                            <span class="truncate font-bold text-[10px] uppercase" title="${pipeName}">${pipeName}</span>
                            <div class="bg-emerald-800 text-emerald-200 text-[8px] font-bold px-1.5 rounded-full shrink-0">${pipe.rules ? pipe.rules.length : 0}R</div>
                        </div>
                        
                        <button onclick="if(window.startColumnRemap) window.startColumnRemap('${j}', '${safeOriginVal}'); event.stopPropagation();" class="shrink-0 p-1 opacity-0 group-hover:opacity-100 bg-indigo-900/50 hover:bg-indigo-600 hover:text-white text-indigo-300 rounded transition-all z-10 pointer-events-auto absolute right-0 shadow" title="Mudar este flujo ETL a otra columna (Reasignar Origen)">
                            <i data-lucide="arrow-left-right" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                `;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-1.5 sticky top-0 z-20";
            } else if (mappedType && mappedType !== 'Ignorar Columna') {
                const mapName = getHumanName(mappedType);
                thContent = `<span class="text-emerald-400" title="ID: ${mappedType}">${mapName}</span> <span class="text-slate-600 text-[9px] ml-1">(${originalVal})</span>`;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType === 'Ignorar Columna') {
                thClass += " opacity-40 grayscale decoration-line-through";
            } else {
                // [V6] Unmapped column gets the hide button
                thContent = `
                    <div class="flex items-center justify-between group h-full">
                        <span class="truncate pr-2">${originalVal}</span>
                        <button onclick="event.stopPropagation(); window.ViewerVisibilityManager.hideColumn('${j}')" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-0.5 transition-all w-5 h-5 flex items-center justify-center shrink-0 bg-slate-900/80 rounded" title="Ocultar Variable">
                             <i data-lucide="eye-off" class="w-3 h-3"></i>
                        </button>
                    </div>
                `;
            }

            // [FIX] Add Visual Feedback for Offset Mode on Headers
            if (offsetSelectionMode) {
                thClass += " cursor-crosshair hover:bg-amber-500/30";
                // Add Anchor style if this is the selected offset (uses dataIdx)
                if (currentOffset && currentOffset.row === 0 && currentOffset.col === dataIdx) {
                    thClass += " border-2 border-amber-500 bg-amber-900/40 text-amber-400";
                }
            }
        }

        // [FIX] Allow clicking header to set offset (Row 0)
        // Only if NOT in mapping mode (because mapping mode uses buttons inside th)
        const isHeaderMapping = (window.mappingMode || typeof mappingMode !== 'undefined' && mappingMode);
        const clickAttr = (!isHeaderMapping && window.offsetSelectionMode) ? `onclick="handleOffsetClick(0, ${dataIdx})"` : '';

        // Globals for resize parsing
        const colWidth = window.currentColWidths && window.currentColWidths[j] ? window.currentColWidths[j] : 150;
        const resizerHtml = `<div class="resizer-handle" onmousedown="window.initColResize(event, '${j}', this.parentElement)" style="position:absolute; right:0; top:0; bottom:0; width:6px; cursor:col-resize; z-index:70; user-select:none; background:transparent; transition:background 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.3)'" onmouseout="this.style.background='transparent'"></div>`;

        // ETL Preview Injection - Elevate Active Column
        if (activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === j) {
            thClass = thClass.replace(/z-20/g, ''); // Remove sticky conflict
            thClass += " relative z-[60] bg-slate-800 shadow-[0_-5px_15px_rgba(59,130,246,0.3)] border-x border-blue-500/50";
        }

        thClass += " relative"; // Add relative so the absolute resizer handles position correctly
        const headerNameEscaped = String((typeof getHumanName === 'function' ? getHumanName(mappedType) : '') || originalVal).replace(/'/g, "\\'");
        headerHtml += `<th id="th-${j}" class="${thClass}" style="height: ${HEADER_HEIGHT}px; width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;" ${clickAttr} data-col-id="${j}" oncontextmenu="window.handleColumnContextMenu(event, '${j}', '${headerNameEscaped}')">${thContent}${resizerHtml}</th>`;
    });

    // [V5.6] Fase 2 - Encabezados Computed en Virtual Scroller
    if (Array.isArray(window.computedColumns) && window.computedColumns.length > 0) {
        window.computedColumns.forEach((comp, idx) => {
            // [V6] Control de Visibilidad para Columnas Calculadas
            if (window.ViewerVisibilityManager && window.ViewerVisibilityManager.isHidden(comp.id)) return;

            let thClass = "relative bg-fuchsia-900/20 border-b-2 border-fuchsia-500/50 text-fuchsia-300 font-bold uppercase border border-fuchsia-900/50 p-2 sticky top-0 z-20 transition-colors";
            let thContent = "";
            let mappedName = comp.masterField?.nombre_campo || 'Calculada';

            // [V7] Visibilidad del selector de Mapeo en Computed Columns (Columna Añadida/Clon)
            if (window.mappingMode || typeof mappingMode !== 'undefined' && mappingMode) {
                const isMapped = !!comp.masterField;
                const btnClass = isMapped ? 'bg-fuchsia-600/20 border-fuchsia-500/50 text-fuchsia-300' : 'bg-slate-800/50 text-slate-500 hover:text-fuchsia-400';
                thClass = "bg-slate-950 p-1 sticky top-0 z-20";
                
                // --- NAME RESOLUTION HELPER COPIA EN LÍNEA ---
                let displayName = mappedName;
                if (!comp.masterField || comp.masterField.nombre_campo === 'Ignorar Columna') {
                    displayName = 'Calculada';
                } else if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    const match = window.masterDictionary.find(m => String(m.id) === String(mappedName) || String(m.nombre_campo) === String(mappedName));
                    if (match) displayName = match.nombre_campo;
                }
                
                thContent = `
                <div class="flex items-center gap-1 h-full relative">
                    <button onclick="if(typeof openColumnMenu_v2 === 'function') openColumnMenu_v2('${comp.id}', this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                        <span class="truncate font-bold text-[10px] uppercase">${displayName} (Calculada)</span>
                        <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                    </button>
                    <button onclick="window.ViewerUI.deleteComputedColumn('${idx}')" class="text-fuchsia-500 hover:text-red-400 p-1 shrink-0 rounded transition-colors" title="Eliminar Columna Calculada">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                </div>`;
            } else {
                thContent = `
                    <div class="flex items-center justify-between gap-1 h-full relative">
                        <div class="flex items-center gap-1 overflow-hidden cursor-pointer hover:bg-fuchsia-500/20 px-1 py-0.5 rounded transition-colors w-full h-full" title="Editar ${mappedName}" onclick="if(window.editComputedColumn) window.editComputedColumn('${comp.id}')">
                            <i data-lucide="calculator" class="w-3 h-3 text-fuchsia-400 flex-shrink-0"></i>
                            <span class="truncate text-[10px]">${mappedName}</span>
                        </div>
                        <div class="flex" style="flex-shrink: 0">
                            <button onclick="window.ViewerUI.deleteComputedColumn('${idx}')" class="text-fuchsia-500 hover:text-red-400 p-0.5 ml-1 shrink-0 rounded hover:bg-red-500/10 transition-colors" title="Eliminar Cálculo">
                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                            </button>
                        </div>
                    </div>
                `;
            }
            
            const colWidth = window.currentColWidths && window.currentColWidths[comp.id] ? window.currentColWidths[comp.id] : 150;
            const resizerHtml = `<div class="resizer-handle" onmousedown="window.initColResize(event, '${comp.id}', this.parentElement)" style="position:absolute; right:0; top:0; bottom:0; width:6px; cursor:col-resize; z-index:70; user-select:none; background:transparent; transition:background 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.3)'" onmouseout="this.style.background='transparent'"></div>`;
            const compNameEscaped = String(comp.nombre || '').replace(/'/g, "\\'");
            headerHtml += `<th id="th-${comp.id}" class="${thClass}" style="height: ${HEADER_HEIGHT}px; width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;" data-col-id="${comp.id}" oncontextmenu="window.handleColumnContextMenu(event, '${comp.id}', '${compNameEscaped}')">${thContent}${resizerHtml}</th>`;
        });
    }

    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;

    // Body
    const updateVisibleRows = () => {
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;
        const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
        const endIndex = Math.min(startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + 5, totalRows);

        let rowsHtml = '';
        let startDataIndex = Math.max(1, startIndex);
        if (startDataIndex === 0) startDataIndex = 1;

        // Generar dummy row superior para desplazar el scroll (Virtual Scrolling nativo con position: sticky en thead)
        const topPadding = (startDataIndex - 1) * ROW_HEIGHT;
        if (topPadding > 0) {
            rowsHtml += `<tr style="height: ${topPadding}px; border: none; pointer-events: none;"><td colspan="100%" style="border: none; padding: 0;"></td></tr>`;
        }

        let activeEtlState = null;
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
            activeEtlState = window.viewerRuleWorkshop.getActiveState();
        }

        for (let i = startDataIndex; i < endIndex; i++) {
            const row = data[i] || [];

            // [V8.15 UX FIX] Visually disappear manually resolved or pipeline-discarded rows from Universal Viewer
            if (row._rejectedSim || row._rejectedByCode) continue;

            let rowStyle = `height: ${ROW_HEIGHT}px;`;
            let rowClass = "hover:bg-slate-800/50";

            rowsHtml += `<tr style="${rowStyle}" class="${rowClass}">`;

            for (const vCol of window.virtualColumns) {
                if (vCol.isCalculated) continue; // Bug Fix N°5: Ignorar la celda física fantasma
                let j = vCol.id;
                
                // [V6] Salto Lógico Celda - Visibilidad
                if (window.ViewerVisibilityManager && window.ViewerVisibilityManager.isHidden(j)) continue;
                
                let dataIdx = vCol.dataIdx;
                let cellVal = row[dataIdx] !== undefined ? row[dataIdx] : '';

                // [SchemaSanitizer] Cast Fuerte heredado del ColMapping
                if (window.columnMapping && window.columnMapping[j] && window.masterDictionary && window.SchemaSanitizer) {
                    const mappedType = window.columnMapping[j];
                    const mObj = window.masterDictionary.find(m => String(m.id) === String(mappedType));
                    if (mObj) {
                        cellVal = window.SchemaSanitizer.cast(cellVal, mObj);
                    }
                }

                const colWidth = window.currentColWidths && window.currentColWidths[j] ? window.currentColWidths[j] : 150;
                let cellClass = 'border border-slate-800 p-2 whitespace-nowrap text-slate-400 overflow-hidden text-ellipsis transition-colors duration-150';

                // [Ticket #010] Ignorar visualmente si la columna está omitida en PDF
                const isOmitted = window.isViewerReadOnly && window.pdfOmittedColumns && window.pdfOmittedColumns.includes(dataIdx);
                if (isOmitted) cellClass += " opacity-30 grayscale bg-slate-900/50 decoration-line-through text-slate-600 pointer-events-none";

                const minRow = window.currentOffset ? window.currentOffset.row : 0;
                const minCol = window.currentOffset ? window.currentOffset.col : 0;
                const maxRow = window.currentEndOffset ? window.currentEndOffset.row : Infinity;
                
                // Evitar bloqueo (isIgnored) en filas filtradas dinámicamente si el buscador está activo
                const searchState = window.GlobalSearchFilter ? window.GlobalSearchFilter.getState('visor') : null;
                const isSearchActive = searchState && searchState.query && searchState.query.trim().length > 0;
                
                const isIgnored = (!isSearchActive) && ((i < minRow) || (dataIdx < minCol) || (i > maxRow));
                const isAnchorStart = (!isSearchActive) && (i === minRow && dataIdx === minCol);
                const isAnchorEnd = (!isSearchActive) && window.currentEndOffset && (i === window.currentEndOffset.row && dataIdx === window.currentEndOffset.col);

                if (isIgnored) cellClass += " opacity-25 grayscale bg-slate-950/50";
                if (!window.offsetSelectionMode && !window.endOffsetSelectionMode && isIgnored) cellClass += " pointer-events-none select-none";
                if (isAnchorStart) cellClass += " border-2 border-amber-500 font-bold bg-amber-900/20 text-amber-500";
                if (isAnchorEnd) cellClass += " border-2 border-red-500 font-bold bg-red-900/20 text-red-500";
                if (window.offsetSelectionMode || window.endOffsetSelectionMode) cellClass += " cursor-crosshair hover:bg-slate-700/50";

                // ETL Preview Injection & Global Audit Mode
                const isWorkshopOpen = activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === j;
                const savedPipeline = window.draftPipelines && window.draftPipelines[j] ? window.draftPipelines[j].rules : null;
                const isGlobalAuditOn = window.isGlobalPreviewEnabled && savedPipeline && savedPipeline.length > 0;

                const safeRawVal = String(cellVal)
                    .replace(/\\/g, "\\\\")
                    .replace(/'/g, "\\'")
                    .replace(/"/g, "&quot;")
                    .replace(/\n/g, "\\n")
                    .replace(/\r/g, "\\r");

                // EXCEPCIONES: Bindear click derecho para TODAS las columnas renderizadas, sin importar si el ETL o Taller están en foco (Solo si no es Modo Lectura/Pendientes)
                let onCtx = "";
                if (!window.isViewerReadOnly) {
                    // [REQ QA] Pasar contexto SKU al Modal
                    let rawSkuValue = "";
                    if (codeDataIdx >= 0 && row && row[codeDataIdx] !== undefined) {
                        rawSkuValue = String(row[codeDataIdx]).trim();
                    }
                    const safeSkuContext = rawSkuValue
                        .replace(/\\/g, "\\\\").replace(/'/g, "\\'")
                        .replace(/"/g, "&quot;").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

                    onCtx = ` oncontextmenu="window.ViewerUI.showOriginalValue(event, '${safeRawVal}', '${j}', ${row && row._rowUid !== undefined ? row._rowUid : -1}, '${safeSkuContext}')"`;
                    cellClass += " cursor-context-menu";
                }

                if (isWorkshopOpen || isGlobalAuditOn) {
                    if (isWorkshopOpen) {
                        cellClass += " relative z-[60] bg-slate-800 shadow-[0_0_15px_rgba(59,130,246,0.3)] border-x border-blue-500/50";
                    } else {
                        // Estilo sutil para auditoría global
                        cellClass += " relative bg-emerald-950/20 border-x border-emerald-500/20";
                    }

                    const activePipeline = isWorkshopOpen ? activeEtlState.pipeline : savedPipeline;

                    if (activePipeline && activePipeline.length > 0 && window.viewerETL) {
                        const rawVal = String(cellVal);
                        const { result, rejected } = window.viewerETL.transformCell(rawVal, activePipeline, row);

                        if (rawVal === "" && (window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1')) {
                            console.log(`[VIGIA AUDITOR RENDER] Celda Evaluada | rawVal: '${rawVal}' -> result: '${result}' | rejected: ${rejected} | Pipeline Length: ${activePipeline.length}`);
                        }

                        // [Fase 5.1] Detectar Cache Misses (Naranja)
                        let isCacheMiss = false;
                        let libretaDict = null;
                        activePipeline.forEach(r => {
                             let isDictRule = false;
                             let dictObj = null;
                             if (r.tipo === 'ast_conditional' && r.logica && r.logica[0]) {
                                 const cond = r.logica[0].condicion;
                                 const act = r.logica[0].accion;
                                 if (cond && cond.operador === 'IN_DICT_KEYS' && typeof cond.valor === 'object' && cond.valor !== null) {
                                     isDictRule = true;
                                     dictObj = cond.valor;
                                 } else if (act && act.tipo_accion === 'DICTIONARY_REPLACE' && typeof act.valor === 'object' && act.valor !== null) {
                                     isDictRule = true;
                                     dictObj = act.valor;
                                 }
                             }
                             if (isDictRule) libretaDict = dictObj;
                        });
                        
                        if (libretaDict && rawVal.trim() !== "" && !Object.prototype.hasOwnProperty.call(libretaDict, rawVal.trim())) {
                            if (rejected || result.trim() === "" || result === rawVal) {
                                isCacheMiss = true;
                            }
                        }

                        if (isCacheMiss) {
                            cellClass += " bg-amber-500/15 border border-amber-500/40 text-amber-300 relative font-bold shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]";
                            cellVal = `
                                <div class="flex items-center gap-2">
                                    <span class="truncate" title="${rawVal}">${rawVal}</span>
                                    <div class="relative flex items-center justify-center">
                                        <div class="absolute w-2 h-2 bg-amber-500 rounded-full animate-ping opacity-75"></div>
                                        <i data-lucide="database-zap" class="w-3 h-3 flex-shrink-0 text-amber-400 relative z-10"></i>
                                    </div>
                                </div>
                            `;
                        } else if (rejected) {
                            cellClass += " opacity-30 grayscale bg-red-500/10 text-red-400/50 border-x border-red-500/20";
                            cellVal = `
                                <div class="flex items-center gap-2 line-through text-red-500/60">
                                    <span class="truncate" title="${rawVal}">${rawVal}</span>
                                    <i data-lucide="ban" class="w-3 h-3 flex-shrink-0"></i>
                                </div>
                            `;
                        } else if (result !== rawVal || (result === "" && rawVal === "")) {
                            // [V5.19 UX] Explicitly show when a rule CLEARS a cell to differentiate from a natural missing value
                            const displayResult = result === "" ? '<span class="italic opacity-50 text-[10px]">[Vaciada]</span>' : result;

                            cellVal = `
                                <div class="flex flex-col gap-1 py-1">
                                    <span class="text-[10px] text-slate-500 line-through truncate">${rawVal === "" ? '[Vacía]' : rawVal}</span>
                                    <div class="flex items-center gap-2 text-emerald-400 font-bold ${isWorkshopOpen ? 'bg-emerald-950/30' : 'bg-emerald-950/10'} px-2 py-0.5 rounded border ${isWorkshopOpen ? 'border-emerald-900/50' : 'border-emerald-900/20'}">
                                        <i data-lucide="arrow-down-right" class="w-3 h-3 flex-shrink-0"></i>
                                        <span class="truncate text-xs leading-none">${displayResult}</span>
                                    </div>
                                </div>
                            `;
                        }
                    }
                }

                rowsHtml += `<td onclick="handleOffsetClick(${i}, ${dataIdx})" class="${cellClass}" style="width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;"${onCtx}>${cellVal}</td>`;
            }

            // [V5.6] Fase 2 - Cálculo al vuelo en Virtual Scroller (Columnas Calculadas)
            if (Array.isArray(window.computedColumns) && window.computedColumns.length > 0) {
                window.computedColumns.forEach(calcConfig => {
                    // [V6] Control de Visibilidad en Celdas Calculadas
                    if (window.ViewerVisibilityManager && window.ViewerVisibilityManager.isHidden(calcConfig.id)) return;
                    
                    let rCtx = row._richContext || {};

                    // On-the-fly calculation: Si falta ALGÚN operando en el contexto rápido, lo cargamos (Lazy Load)
                    if (window.viewerETL) {
                        let rCtx = row._richContext || {};
                        if (calcConfig.operands && calcConfig.operands.length >= 1) {
                            calcConfig.operands.forEach(opColId => {
                                if (!opColId) return; // Ignore empty operand B in CLONE mode
                                // Lazy Evaluate solo si no existe
                                if (rCtx[opColId] === undefined) {
                                    if (window.VigiaLogger) window.VigiaLogger.log("ENGINE", `Tratando de inyectar Lazy Context para celda no-mapeada: ${opColId}`);
                                    const pipe = window.draftPipelines && window.draftPipelines[opColId] ? window.draftPipelines[opColId].rules : [];
                                    const vColOp = window.virtualColumns.find(v => v.id === opColId);
                                    if (vColOp && vColOp.dataIdx !== undefined) {
                                        const raw = String(row[vColOp.dataIdx] || "");
                                        const { clean, display, result } = window.viewerETL.transformCell(raw, pipe || [], row);
                                        rCtx[opColId] = { clean, display: display !== undefined ? display : result, raw: raw };
                                    } else {
                                        // Prevents undefined crash
                                        rCtx[opColId] = { clean: "", display: "", raw: "" };
                                    }
                                }
                            });
                        }
                        // Mutate strict back to avoid repeating lazy loads per row if shared
                        row._richContext = rCtx;
                    }
                    
                    let rCtxFinal = row._richContext || {};
                    let resultDisplay = "";
                    let mathResult = 0;
                    let cellClass = 'border-r border-b border-fuchsia-900/30 p-2 whitespace-nowrap text-fuchsia-200 overflow-hidden text-ellipsis bg-fuchsia-950/20';

                    try {
                        if (calcConfig.operands && calcConfig.operands.length >= 1) {
                            const opA = rCtxFinal[calcConfig.operands[0]];
                            const opB = calcConfig.operands[1] ? rCtxFinal[calcConfig.operands[1]] : null;
                            const allOps = calcConfig.operands.map(opIdx => rCtxFinal[opIdx]);

                            // Allow processing if at least opA exists
                            if (opA) {
                                // Bug Fix N°2 & QA FIX: Check strict conditionals depending on Macro Type.
                                const isCloneOp = (calcConfig.macro === "CLONE" || calcConfig.macro === "CLONE_SEMANTIC");
                                const isOpAEmpty = isCloneOp 
                                      ? (opA.raw === null || opA.raw === undefined || String(opA.raw).trim() === "")
                                      : (opA.clean === null || opA.clean === undefined || String(opA.clean).trim() === "");
                                
                                if (isOpAEmpty && !isCloneOp) {
                                    resultDisplay = "<span class='text-fuchsia-500/50 italic text-[10px]'>Sin Base A</span>";
                                    cellClass += ' text-center';
                                } else {
                                    let evalres = { resultDisplay: "", mathResult: 0, rejected: false };
                                    
                                    // [Ticket #018] QA Fix: Out-Of-Bounds Guard para Columnas Procesadas.
                                    // Si la ingesta descartó la base A, el motor matemático ya no tiene datos para calcular.
                                    if (opA && typeof opA === 'object' && ('raw' in opA || 'clean' in opA)) {
                                        try {
                                            evalres = evaluateComputedColumnMath(calcConfig, opA, opB, window.draftPipelines, activeEtlState, allOps, row);
                                        } catch(e) {
                                            console.warn("Fallo evaluando Math (Out-of-Bounds guard intercept):", e);
                                        }
                                    } else if (!window.isRawViewerMode) {
                                        // En modo Procesados, si no podemos calcular, intentamos recuperar el valor pre-calculado del dataset original si es posible
                                        const fallbackCol = window.virtualColumns.find(v => v.id === calcConfig.id);
                                        if (fallbackCol && fallbackCol.dataIdx !== undefined && fallbackCol.dataIdx !== null) {
                                            evalres.resultDisplay = row[fallbackCol.dataIdx] || "";
                                            evalres.mathResult = evalres.resultDisplay;
                                        } else {
                                            evalres.resultDisplay = "<span class='text-fuchsia-500/50 italic text-[10px]'>Sin Origen (ETL Omitido)</span>";
                                        }
                                    }

                                    resultDisplay = evalres.resultDisplay;
                                    mathResult = evalres.mathResult;
                                    
                                    // [Fase 5.2] Detectar Cache Misses en Ghost Columns (Naranja)
                                    let isGhostCacheMiss = false;
                                    const savedPipe = window.draftPipelines && window.draftPipelines[calcConfig.id] ? window.draftPipelines[calcConfig.id].rules : null;
                                    const cPipe = (activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === calcConfig.id) ? activeEtlState.pipeline : savedPipe;
                                    const isGlobalAuditOnGhost = window.isGlobalPreviewEnabled && savedPipe && savedPipe.length > 0;
                                    const isWorkshopOpenGhost = activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === calcConfig.id;

                                    if ((isGlobalAuditOnGhost || isWorkshopOpenGhost) && cPipe && cPipe.length > 0) {
                                        let libretaDict = null;
                                        cPipe.forEach(r => {
                                             let isDictRule = false;
                                             let dictObj = null;
                                             if (r.tipo === 'ast_conditional' && r.logica && r.logica[0]) {
                                                 const cond = r.logica[0].condicion;
                                                 const act = r.logica[0].accion;
                                                 if (cond && cond.operador === 'IN_DICT_KEYS' && typeof cond.valor === 'object' && cond.valor !== null) {
                                                     isDictRule = true; dictObj = cond.valor;
                                                 } else if (act && act.tipo_accion === 'DICTIONARY_REPLACE' && typeof act.valor === 'object' && act.valor !== null) {
                                                     isDictRule = true; dictObj = act.valor;
                                                 }
                                             }
                                             if (isDictRule) libretaDict = dictObj;
                                        });

                                        const crudoGhost = String(mathResult || "").trim();
                                        if (libretaDict && crudoGhost !== "" && libretaDict[crudoGhost] === undefined) {
                                            if (evalres.rejected || String(resultDisplay).trim() === "" || resultDisplay == crudoGhost) {
                                                isGhostCacheMiss = true;
                                            }
                                        }
                                    }

                                    if (isGhostCacheMiss) {
                                        cellClass = cellClass.replace('bg-fuchsia-950/20', '');
                                        cellClass += " bg-amber-500/15 border border-amber-500/40 text-amber-300 relative font-bold shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]";
                                        resultDisplay = `
                                            <div class="flex items-center gap-2">
                                                <span class="truncate" title="${String(resultDisplay).replace(/"/g, '&quot;')}">${resultDisplay}</span>
                                                <div class="relative flex items-center justify-center">
                                                    <div class="absolute w-2 h-2 bg-amber-500 rounded-full animate-ping opacity-75"></div>
                                                    <i data-lucide="database-zap" class="w-3 h-3 flex-shrink-0 text-amber-400 relative z-10"></i>
                                                </div>
                                            </div>
                                        `;
                                    } else if(evalres.rejected) {
                                         cellClass += ' bg-red-900/30 text-red-400 border border-red-500/50';
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error evaluando Computed Column V5", e);
                    }

                    // EXCEPCIONES: Binding click derecho también para columnas generadas matemáticamente en el vuelo
                    let safeResultDisplay = String(resultDisplay).replace(/<[^>]*>?/gm, ''); // Quitar etiquetas html de advertencia si las hay
                    safeResultDisplay = safeResultDisplay
                        .replace(/\\/g, "\\\\")
                        .replace(/'/g, "\\'")
                        .replace(/"/g, "&quot;")
                        .replace(/\n/g, "\\n")
                        .replace(/\r/g, "\\r");
                    
                    // [REQ QA] Pasar contexto SKU al Modal (Computed Columns)
                    let rawSkuValueComp = "";
                    if (codeDataIdx >= 0 && row && row[codeDataIdx] !== undefined) {
                        rawSkuValueComp = String(row[codeDataIdx]).trim();
                    }
                    const safeSkuContextComp = rawSkuValueComp
                        .replace(/\\/g, "\\\\").replace(/'/g, "\\'")
                        .replace(/"/g, "&quot;").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

                    let onCtxComputed = ` oncontextmenu="window.ViewerUI.showOriginalValue(event, '${safeResultDisplay}', '${calcConfig.id}', ${row && row._rowUid !== undefined ? row._rowUid : -1}, '${safeSkuContextComp}')"`;
                    
                    cellClass += " cursor-context-menu";

                    const colWidth = window.currentColWidths && window.currentColWidths[calcConfig.id] ? window.currentColWidths[calcConfig.id] : 150;
                    rowsHtml += `<td class="${cellClass}"${onCtxComputed} style="width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;">${resultDisplay}</td>`;
                });
            }

            rowsHtml += '</tr>';
        }

        // Generar dummy row inferior para mantener al contenedor con el totalHeight simulado
        const bottomPadding = Math.max(0, totalRows - endIndex) * ROW_HEIGHT;
        if (bottomPadding > 0) {
            rowsHtml += `<tr style="height: ${bottomPadding}px; border: none; pointer-events: none;"><td colspan="100%" style="border: none; padding: 0;"></td></tr>`;
        }

        tbody.innerHTML = rowsHtml;
        if (window.lucide) window.lucide.createIcons();
    };

    container.onscroll = () => requestAnimationFrame(updateVisibleRows);
    updateVisibleRows();
}

async function generatePreview(skipModal = false) {
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
        let caciqueName = null;

        if (skipModal && window._simValidSheetsForPreview && window._simValidSheetsForPreview.length > 0) {
            sheetsToProcess = window._simValidSheetsForPreview;
            if (window._simCaciqueSheetName) caciqueName = window._simCaciqueSheetName;
        } else {
            if (window.currentSheetList && window.currentSheetList.length > 1) {
                if (skipModal) {
                    const allSheets = window.exportAllSheets ? await window.exportAllSheets() : [];
                    const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
                    sheetsToProcess = validSheets;
                    caciqueName = window._simCaciqueSheetName || (validSheets.length > 0 ? validSheets[0].name : null);
                    window._simValidSheetsForPreview = validSheets;
                    window._rawValidSheetsCache = validSheets;
                } else {
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
                const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
                
                // [FIX V8.8] PERSISTENCIA DURA (LOCALSTORAGE)
                const pN = (typeof window.globalContext !== 'undefined' && window.globalContext.providerName) ? window.globalContext.providerName : 'NATIVE';
                const lsKey = 'LAMDA_SHEET_ORDER_' + pN.replace(/\s+/g, '_');
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
                
                // [FIX V8.5] RESTAURAR ORDEN Y ESTADOS PREVIOS (Persistencia de Sesión)
                if (window._rawValidSheetsCache && window._rawValidSheetsCache.length > 0) {
                     let merged = [];
                     window._rawValidSheetsCache.forEach(cachedSheet => {
                         let fresh = validSheets.find(s => s.name === cachedSheet.name);
                         if (fresh) {
                             if (cachedSheet.hasOwnProperty('_cachedCheck')) fresh._cachedCheck = cachedSheet._cachedCheck;
                             merged.push(fresh);
                         }
                     });
                     validSheets.forEach(fresh => {
                         if (!merged.find(m => m.name === fresh.name)) merged.push(fresh);
                     });
                     window._rawValidSheetsCache = merged;
                } else {
                     window._rawValidSheetsCache = validSheets;
                }
                
                Swal.hideLoading();
                Swal.close();

                if (window._rawValidSheetsCache.length > 1) {
                    
                    // Scope functions for Drag and Drop
                    window._simSwapSheets = function(dragIdx, dropIdx) {
                        // SYNC CURRENT DOM STATES BEFORE REWRITING
                        window._rawValidSheetsCache.forEach((s, i) => {
                            const cbox = document.getElementById('chk_sim_sheet_' + i);
                            if (cbox) s._cachedCheck = cbox.checked;
                            const rad = document.querySelector('input[name="sim_cacique"]:checked');
                            if (rad && rad.value === s.name) window._simCaciqueSheetName = s.name;
                        });

                        const arr = window._rawValidSheetsCache;
                        const item = arr.splice(dragIdx, 1)[0];
                        arr.splice(dropIdx, 0, item);
                        const c = document.getElementById('sheets_dnd_container');
                        if (c) c.innerHTML = window._simRenderSheetsHtml();
                        if (window.lucide) window.lucide.createIcons();
                    };

                    window._simRenderSheetsHtml = function() {
                        return window._rawValidSheetsCache.map((s, idx) => {
                            let isChecked = s.hasOwnProperty('_cachedCheck') ? s._cachedCheck : (s.name === currentSheetName);
                            let isCacique = window._simCaciqueSheetName === s.name;
                            if (idx === 0 && !window._simCaciqueSheetName) isCacique = true; // Fallback
                            
                            return `
                            <div draggable="true" ondragstart="event.dataTransfer.setData('text/plain', ${idx}); event.currentTarget.classList.add('opacity-50');" ondragend="event.currentTarget.classList.remove('opacity-50');" ondragover="event.preventDefault();" ondrop="event.preventDefault(); window._simSwapSheets(parseInt(event.dataTransfer.getData('text/plain')), ${idx});" class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-grab active:cursor-grabbing mb-2">
                                <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-600"></i>
                                <input type="checkbox" id="chk_sim_sheet_${idx}" value="${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" ${isChecked ? 'checked' : ''}>
                                <div class="flex-1 text-left flex flex-col justify-center">
                                    <div class="text-white text-sm font-bold flex items-center gap-2">
                                        <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> ${s.name}
                                    </div>
                                    <div class="text-[10px] text-slate-500 font-mono mt-0.5">Filas: ${s.data.length}</div>
                                </div>
                                <div class="flex items-center gap-2 border-l border-slate-800 pl-3">
                                    <label class="flex items-center gap-1.5 cursor-pointer text-[10px] text-amber-400 font-bold uppercase" title="Define la estructura base y el esquema de columnas">
                                        <input type="radio" name="sim_cacique" value="${s.name}" class="w-3 h-3 text-amber-500 bg-slate-900 border-slate-700" ${isCacique ? 'checked' : ''}>
                                        <i data-lucide="crown" class="w-3 h-3"></i> Cacique
                                    </label>
                                </div>
                            </div>
                        `}).join('');
                    };

                    const res = await Swal.fire({
                        title: 'Alcance de la Transformación',
                        html: `
                            <p class="text-slate-400 text-sm mb-4">Selecciona el orden de ingesta y marca cuál será la hoja "Cacique" (la que rige el mapeo final maestro de todas):</p>
                            <div id="sheets_dnd_container" class="flex flex-col text-left text-base max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                ${window._simRenderSheetsHtml()}
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
                            const sheetNames = [];
                            const checks = {};
                            window._rawValidSheetsCache.forEach((s, idx) => {
                                sheetNames.push(s.name);
                                const chk = document.getElementById(`chk_sim_sheet_${idx}`);
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
                                const lsKey = 'LAMDA_SHEET_ORDER_' + pN.replace(/\s+/g, '_');
                                localStorage.setItem(lsKey, JSON.stringify({
                                     sheetNames: sheetNames,
                                     checks: checks,
                                     cacique: window._simCaciqueSheetName
                                }));
                            } catch(e) { console.error("Error saving hard persistence", e); }

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
                } // Close the 'else' block from 'if (skipModal)'!
            } else {
                sheetsToProcess = [{ name: currentSheetName || 'Principal', data: currentSheetData }];
                window._simValidSheetsForPreview = sheetsToProcess;
            }
        }

        window._isMixedSimulation = sheetsToProcess && sheetsToProcess.length > 1;

        const startRow = currentOffset ? currentOffset.row : 0;
        
        // Las configuraciones son universales (se construyen una sola vez)

        const displayConfig = [];
        const sourceConfig = [];

        // ---------------- SCHEMA UNION (Unión de Esquemas Inclusiva) ----------------
        // [FIX V8.11] Funcionalidad Resolutiva Cruzada (Nomenclatura -> Master Dictionary)
        const resolveToMasterId = (termId) => {
             const safeT = String(termId).toLowerCase().trim();
             let resName = safeT;
             if (typeof nomenclatureCache !== 'undefined' && Array.isArray(nomenclatureCache)) {
                 const nCache = nomenclatureCache.find(n => String(n.id).toLowerCase().trim() === safeT);
                 if (nCache && nCache.termino) resName = String(nCache.termino).toLowerCase().trim();
             }
             if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                 const m = window.masterDictionary.find(d => 
                     d.id === termId || 
                     String(d.id).toLowerCase().trim() === safeT || 
                     String(d.nombre_campo).toLowerCase().trim() === safeT || 
                     String(d.nombre_campo).toLowerCase().trim() === resName
                 );
                 if (m) return m.id;
             }
             return termId;
        };

        let masterVirtualCols = [];
        let masterColumnMap = {};
        let masterPipelines = {};
        let seenUnionTermIds = new Set();
        let syntheticColIdCounter = 1;

        // Armamos un arreglo con TODAS las hojas a escanear (Prioridad de Orden: Cacique Primero)
        let sheetsToScan = [];
        const isMultiSheetSession = (sheetsToProcess && sheetsToProcess.length > 0);
        
        if (isMultiSheetSession) {
            if (typeof caciqueName !== 'undefined' && caciqueName) {
                const caciqueObj = sheetsToProcess.find(s => s.name === caciqueName);
                if (caciqueObj) sheetsToScan.push(caciqueObj);
            }
            sheetsToProcess.forEach(s => {
                if (s.name !== caciqueName) sheetsToScan.push(s);
            });
        } else {
            sheetsToScan.push({ name: window.currentSheetName || 'ActiveSheet' });
        }

        sheetsToScan.forEach(sheetObj => {
             const sName = sheetObj.name;
             let sVirtualCols = window.virtualColumns || [];
             let sColumnMap = (typeof columnMapping !== 'undefined') ? columnMapping : {};
             let sPipelines = window.draftPipelines || {};
             let sComputedCols = window.computedColumns || []; // Fantasmas!
             
             // Prioridad 1: Configuración en Caché Fuerte (sheetConfigStore)
             if (window.sheetConfigStore && window.sheetConfigStore[sName]) {
                 if (window.sheetConfigStore[sName].virtualCols && window.sheetConfigStore[sName].virtualCols.length > 0) {
                     sVirtualCols = window.sheetConfigStore[sName].virtualCols;
                     sColumnMap = window.sheetConfigStore[sName].columnMapping || {};
                     sPipelines = window.sheetConfigStore[sName].pipelines || {};
                     sComputedCols = window.sheetConfigStore[sName].computedCols || window.sheetConfigStore[sName].computedColumns || [];
                 }
             }

             // Ayudante Unificador para ingresar Keys Válidas
             const registerToUnion = (dictId, rawColObj) => {
                 const masterId = resolveToMasterId(dictId);
                 const idSafeKey = String(masterId).toLowerCase().trim();
                 
                 // [NUEVO] PURGA SANITARIA DETERMINISTA: Ya protegida por resolveToMasterId
                 const validDictEntry = window.masterDictionary ? window.masterDictionary.find(d => d.id === masterId || String(d.id).toLowerCase().trim() === idSafeKey) : null;
                 if (!validDictEntry) return;

                 if (!seenUnionTermIds.has(idSafeKey)) {
                      seenUnionTermIds.add(idSafeKey);
                      
                      const syntheticVColId = 'unionVCol_' + syntheticColIdCounter++;
                      masterVirtualCols.push({ id: syntheticVColId, dataIdx: rawColObj.dataIdx, originalId: rawColObj.id, sourceSheet: sName, label: validDictEntry.nombre_campo });
                      masterColumnMap[syntheticVColId] = validDictEntry.id;
                      if (sPipelines && sPipelines[rawColObj.id]) {
                          masterPipelines[syntheticVColId] = JSON.parse(JSON.stringify(sPipelines[rawColObj.id]));
                      }
                 }
             };

             // Escaneo de Columnas Únicas
             sVirtualCols.forEach(vCol => {
                 let localDictTermId = sColumnMap[vCol.id];
                 if (!localDictTermId || localDictTermId === 'Ignorar Columna') return;
                 
                 let resolutiveTermId = localDictTermId;
                 if (sPipelines && sPipelines[vCol.id] && sPipelines[vCol.id].masterField && sPipelines[vCol.id].masterField.id) {
                      resolutiveTermId = sPipelines[vCol.id].masterField.id;
                 }
                 
                 // [BUGFIX: RECONOCIMIENTO DE SPLITS (CAJITAS HIJAS)]
                 const rStack = sPipelines && sPipelines[vCol.id] ? sPipelines[vCol.id].rules : null;
                 const rulesStack = rStack ? (Array.isArray(rStack) ? rStack : [rStack]) : [];
                 const activeSplit = rulesStack.find(r => !r.disabled && (r.type === 'split' || r.type === 'regex_split'));
                 
                 if (activeSplit) {
                      let tIds = [];
                      if (activeSplit.fields && Array.isArray(activeSplit.fields)) {
                          tIds = activeSplit.fields;
                      } else if (activeSplit.partIdentifiers && Array.isArray(activeSplit.partIdentifiers)) {
                          tIds = activeSplit.partIdentifiers.map(p => typeof p === 'object' ? p.id : p);
                      }
                      
                      if (tIds.length > 0) {
                          tIds.forEach(tId => registerToUnion(tId, vCol));
                      } else {
                          // Si no hay targets definidos, intentar fallback al resolutivo
                          registerToUnion(resolutiveTermId, vCol);
                      }
                 } else {
                      registerToUnion(resolutiveTermId, vCol);
                 }
             });
             
             // Escaneo de Columnas Fantasmas (Cálculos Post-Mapeo)
             if (sComputedCols && Array.isArray(sComputedCols)) {
                 sComputedCols.forEach(cCol => {
                      let calcId = cCol.masterField?.id || cCol.id;
                      registerToUnion(calcId, cCol);
                 });
             }
        });
        // ---------------- FIN SCHEMA UNION ----------------

        masterVirtualCols.forEach(vCol => {
            const vColId = vCol.id;
            const termId = masterColumnMap[vColId];
            if (!termId || termId === 'Ignorar Columna') return;
            const dataIdx = vCol.dataIdx;

            if (termId) {
                sourceConfig.push({ index: dataIdx });

                let termName = termId;
                
                // [FIX V8.3] SIEMPRE USAR NOMBRE DEL DICCIONARIO MAESTRO SI EXISTE
                if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    const masterObj = window.masterDictionary.find(m => String(m.id).toLowerCase() === String(termId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(termId).toLowerCase());
                    if (masterObj) {
                        termName = masterObj.nombre_campo;
                    } else {
                        // Fallback a terminology solo si no es maestra nativa
                        const termObj = nomenclatureCache.find(t => t.id === termId);
                        if (termObj) {
                            termName = termObj.termino;
                        }
                    }
                }
                
                // [FIX V8.3] SOBREESCRITURA DINAMICA SI EL PIPELINE DEFINE OTRA MAESTRA
                if (masterPipelines && masterPipelines[vColId]) {
                    const pipe = masterPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            const masterHit = window.masterDictionary.find(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase());
                            if (masterHit) {
                                termName = masterHit.nombre_campo;
                            }
                        }
                    }
                }

                // [NUEVO MODELO STRICT VINCULATION V8.2]
                let isSupportCol = true; 
                
                // 1. Verificación Nativa (Mapeo Directo sin Pipeline)
                if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(termId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(termId).toLowerCase())) {
                        isSupportCol = false;
                    }
                }

                // 2. Verificación Dinámica (Pipeline)
                if (masterPipelines && masterPipelines[vColId]) {
                    const pipe = masterPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        isSupportCol = true; // Reset strict
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase())) {
                                isSupportCol = false;
                            }
                        }
                    }
                }
                
                // 3. Blacklist Explícito por Corrupción Histórica DB
                if (String(termId).toLowerCase() === 'especificación' || String(termName).toLowerCase().includes('especificaci')) {
                    isSupportCol = true;
                }

                // [V4/V5] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT
                const savedPipeline = masterPipelines && masterPipelines[vColId] ? masterPipelines[vColId].rules : null;
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
                            // [BUG-FIX: Null/Empty Persistence] Si el pipeline se ejecutó (wasTransformed),
                            // respetamos el resultado aunque sea "". Solo hacemos fallback si no hubo pipeline.
                            if (res.wasTransformed) return res.display !== undefined ? res.display : res.result;
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
                                            const pipe = masterPipelines && masterPipelines[opColId] ? masterPipelines[opColId].rules : [];
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
                                    const res = evaluateComputedColumnMath(calcConfig, cA, cB, masterPipelines, null, allOps, row);
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
        window._purgedByCodeCount = 0; // Reset purge tracking

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
                    localComputedCols = window.sheetConfigStore[sheetObj.name].computedCols || window.sheetConfigStore[sheetObj.name].computedColumns || [];
                }
            }
            
            // FASE 1: Construir Sandbox ETL Local para esta hoja
            let localConfig = [];
            
            localVirtualCols.forEach(vCol => {
                const vColId = vCol.id;
                const localDictTermId = localColumnMap[vColId];
                
                // [VIGÍA RENDER MAPEOS ACTIVOS] Inyectado para auditar la columna
                if (String(localDictTermId).toLowerCase().includes('rubro')) {
                    console.log(`[VIGÍA RENDER MAPEOS] Detectado intento de renderizar columna 'rubro'. (vColId: ${vColId})`);
                }

                if (!localDictTermId || localDictTermId === 'Ignorar Columna') {
                    if (String(vColId).startsWith('col_ph_')) {
                         console.warn(`[VIGÍA RENDER MAPEOS] Columna Fantasma ${vColId} ignorada (no tiene mapping asignado en localColumnMap)`);
                    }
                    return;
                }
                
                let resolutiveTermId = localDictTermId;
                if (localPipelines[vColId] && localPipelines[vColId].masterField && localPipelines[vColId].masterField.id) {
                     resolutiveTermId = localPipelines[vColId].masterField.id;
                }
                 
                const rStack = localPipelines[vColId] ? localPipelines[vColId].rules : null;
                const rulesStack = rStack ? (Array.isArray(rStack) ? rStack : [rStack]) : [];
                
                const splitRule = rulesStack.find(r => !r.disabled && (r.type === 'split' || r.type === 'regex_split'));
                if (splitRule) {
                     const sep = splitRule.type === 'regex_split' ? new RegExp(splitRule.separator, 'g') : splitRule.separator || ' ';
                     
                     let tIds = [];
                     if (splitRule.fields && Array.isArray(splitRule.fields)) {
                         tIds = splitRule.fields;
                     } else if (splitRule.partIdentifiers && Array.isArray(splitRule.partIdentifiers)) {
                         tIds = splitRule.partIdentifiers.map(p => typeof p === 'object' ? p.id : p);
                     }
                     
                     const trg = splitRule.targetCount ? parseInt(splitRule.targetCount) : (tIds.length > 0 ? tIds.length : 2);
                     for (let i = 0; i < trg; i++) {
                         let clonedTrId = resolutiveTermId;
                         if (tIds[i]) {
                             clonedTrId = tIds[i];
                         }
                         localConfig.push({
                             termId: String(resolveToMasterId(clonedTrId)).toLowerCase().trim(),
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
                         termId: String(resolveToMasterId(resolutiveTermId)).toLowerCase().trim(),
                         transform: (val, rowContext) => {
                             if (!window.viewerETL) return val;
                             const res = window.viewerETL.transformCell(String(val||""), rulesStack, rowContext);
                             
                             if (!window._vigiaGridRender && resolutiveTermId.toLowerCase().includes("rubro")) {
                                 window._vigiaGridRender = true;
                                 console.warn("VIGÍA ESTADO FÍSICO (RUBRO)", {
                                     uuid: resolveToMasterId(resolutiveTermId),
                                     recibido: val,
                                     rulesStackLength: rulesStack.length,
                                     reglas: JSON.parse(JSON.stringify(rulesStack))
                                 });
                             }

                             // [BUG-FIX: Null/Empty Persistence] Si el pipeline se ejecutó (wasTransformed),
                             // respetamos el resultado aunque sea "". Solo hacemos fallback si no hubo pipeline.
                             if (res.wasTransformed) return res.display !== undefined ? res.display : res.result;
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
                        termId: String(resolveToMasterId(calcId)).toLowerCase().trim(),
                        isComputed: true,
                        transform: (val, row) => {
                            let resultDisplay = "";
                            try {
                                if (calcConfig.operands && calcConfig.operands.length >= 1) {
                                    let rCtx = row._richContext || {};
                                    // [FIX V8.10] Resolver operandos con lookups robustos
                                    calcConfig.operands.forEach(opColId => {
                                        if (!opColId) return;
                                        // Si ya fue resuelto con un valor no-vacío, no reescribir
                                        if (rCtx[opColId] !== undefined && String(rCtx[opColId].raw || '').trim() !== '') return;
                                        
                                        const pipe = localPipelines && localPipelines[opColId] ? localPipelines[opColId].rules : [];
                                        
                                        // Lookup 1: Por ID exacto de virtual col
                                        let vColOp = localVirtualCols.find(v => v.id === opColId);
                                        
                                        // Lookup 2: Por mapeo invertido (el operando puede ser el termId que apunta a la columna maestra)
                                        if (!vColOp) {
                                            vColOp = localVirtualCols.find(v => {
                                                const mappedTerm = localColumnMap[v.id];
                                                return mappedTerm && (String(mappedTerm) === String(opColId) || String(mappedTerm).toLowerCase() === String(opColId).toLowerCase());
                                            });
                                        }
                                        
                                        // Lookup 3: Buscar en _unifiedOutput por si ya fue resuelto por otra cfg
                                        if (!vColOp && row._unifiedOutput && row._unifiedOutput[String(opColId).toLowerCase().trim()] !== undefined) {
                                            const cached = String(row._unifiedOutput[String(opColId).toLowerCase().trim()] || '').trim();
                                            rCtx[opColId] = { clean: cached, display: cached, raw: cached };
                                            return;
                                        }
                                        
                                        if (vColOp && vColOp.dataIdx !== undefined) {
                                            const raw = String(row[vColOp.dataIdx] || '');
                                            const etlResult = window.viewerETL
                                                ? window.viewerETL.transformCell(raw, pipe || [], row)
                                                : { clean: raw, display: raw, result: raw };
                                            rCtx[opColId] = { clean: etlResult.clean, display: etlResult.display !== undefined ? etlResult.display : etlResult.result, raw };
                                        } else {
                                            rCtx[opColId] = { clean: '', display: '', raw: '' };
                                        }
                                    });
                                    row._richContext = rCtx;

                                    const cA = calcConfig.operands[0] ? rCtx[calcConfig.operands[0]] : null;
                                    const cB = calcConfig.operands[1] ? rCtx[calcConfig.operands[1]] : null;
                                    const allOps = calcConfig.operands.map(opIdx => rCtx[opIdx]);
                                    
                                    if (cA) {
                                        const res = evaluateComputedColumnMath(calcConfig, cA, cB, localPipelines, null, allOps, row);
                                        resultDisplay = res.resultDisplay;
                                        if (resultDisplay === "" && calcConfig.macro === "CLONE_SEMANTIC" && !window._vigiaTripleGate3) {
                                            window._vigiaTripleGate3 = true;
                                            console.warn("VIGÍA CRÍTICO GATE 3: El Math resolvió VACÍO a pesar de tener cA.", { res, rawStringA: res.mathResult });
                                        }
                                    } else {
                                        if (!window._vigiaTripleGate1 && calcConfig.macro === "CLONE_SEMANTIC") {
                                            window._vigiaTripleGate1 = true;
                                            console.warn("VIGÍA CRÍTICO GATE 1: cA es NULL. Operandos inyectados en la columna calculada están rotos.", JSON.stringify(calcConfig.operands), "Keys en rCtx:", Object.keys(rCtx));
                                        }
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
                row._sourceSheet = sheetObj.name;
                
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
                        // [UX FIX] Read the ETL Transformed value (richContext) to evaluate duplicates on processed data, not raw initial data
                        const cellVal = rCtx && rCtx[v.id] ? String(rCtx[v.id].display).trim() : String(row[v.dataIdx] || "").trim();
                        if (cellVal) {
                            if (seenValues.has(cellVal)) {
                                row._rejectedSim = true;
                                row._rejectedByDuplicate = true;
                            }
                            else seenValues.add(cellVal);
                        }
                    }
                });
                
                // RESOLUCION LOCAL A MATRIZ GLOBAL (TermId based)
                let isEmptyRow = true;
                let hasCodeCol = false;
                let codeValueStr = "";
                const logGrid = window._vigiaETLLogged && window._vigiaETLLogged <= 20;

                localConfig.forEach(cfg => {
                     let resVal = null;
                     if (cfg.isComputed) resVal = cfg.transform(null, row);
                     else resVal = cfg.transform(row[cfg.sourceIndex], row);
                     
                     let semanticName = String(cfg.termId).toLowerCase().trim();
                     if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                          const mMatch = window.masterDictionary.find(d => String(d.id) === String(cfg.termId) || String(d.nombre_campo).toLowerCase().trim() === semanticName);
                          if (mMatch) semanticName = String(mMatch.nombre_campo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                     }

                     if (resVal !== undefined && resVal !== null && String(resVal).trim() !== "") {
                         isEmptyRow = false;
                     }
                     row._unifiedOutput[cfg.termId] = resVal;

                     if (semanticName === 'codigo' || semanticName === 'art_codigo' || semanticName === 'ean' || semanticName === 'codigo de articulo') {
                          hasCodeCol = true;
                          codeValueStr = String(resVal || "").trim();
                     }
                });
                
                // Filtro de Exclusión Absoluta (Data Cleansing Nivel Físico) - Ahora Conservativo en DOM
                if (hasCodeCol && codeValueStr === "") {
                     window._purgedByCodeCount = (window._purgedByCodeCount || 0) + 1;
                     row._rejectedSim = true;
                     row._rejectedByCode = true;
                } else if (isEmptyRow) {
                     row._rejectedSim = true;
                     row._emptySilently = true;
                } else if (row._rejectedByCode) {
                     // Catch-all para rejections inyectados manualmente desde la UI (ej. unifyDuplicates)
                     row._rejectedSim = true;
                }

                // SIEMPRE retornar true para preservar el objeto y permitir la visibilidad on/off
                return true;
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
                  id: mv.originalId, // Alias for LayoutManager
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
        window.currentSimData = sanitizedData;
        window.currentDisplayConfig = displayConfig;
        
        // [FIX V8.9] APLICAR ORDEN DE LAYOUT MANAGER SOBRE CONFIGURACIÓN UNIVERSAL VIRTUAL!
        if (window.LayoutManager) {
             window.currentDisplayConfig = window.LayoutManager.applyOrder(window.currentDisplayConfig);
        }
        
                
        const container = document.getElementById('simulationTableContainer');
        if (!container) {
            console.error("No se encontró contenedor visual para simulación");
            return;
        }
        
        let simOptions = [];
        displayConfig.forEach((cfg, idx) => {
            simOptions.push({ label: cfg.label, value: idx });
        });

        const filterHTML = window.GlobalSearchFilter ? window.GlobalSearchFilter.render('sim', 'filterSimulationData') : '<span class="text-slate-500">Search Loader Failed</span>';
        
        // [V8 UI] Toggle de Visibilidad de Rechazos
        window.ViewerUI._showRejectedRowsInSim = window.ViewerUI._showRejectedRowsInSim || false;
        window.ViewerUI._groupRejectedRowsInSim = window.ViewerUI._groupRejectedRowsInSim || false;
        
        const toggleHtml = `
            <div class="flex items-center gap-1">
                <button id="btnToggleRejectedSimulator" onclick="window.ViewerUI.toggleRejectedRows()" class="ml-2 px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase ${window.ViewerUI._showRejectedRowsInSim ? 'bg-red-900/40 text-red-300 border border-red-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'}" title="Alterna la visibilidad de registros descartados o completamente vacíos">
                    <i id="iconToggleRejectedSimulator" data-lucide="${window.ViewerUI._showRejectedRowsInSim ? 'eye' : 'eye-off'}" class="w-3 h-3"></i> 
                    Mostrar Descartadas
                </button>
                <button id="btnToggleGroupRejectedSimulator" onclick="window.ViewerUI.toggleGroupRejected()" class="px-3 py-1 items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase ${window.ViewerUI._showRejectedRowsInSim ? 'flex' : 'hidden'} ${window.ViewerUI._groupRejectedRowsInSim ? 'bg-orange-900/40 text-orange-300 border border-orange-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'}" title="Agrupar descartes en la parte superior">
                    <i id="iconToggleGroupRejectedSimulator" data-lucide="${window.ViewerUI._groupRejectedRowsInSim ? 'arrow-up-to-line' : 'list-ordered'}" class="w-3 h-3"></i>
                    Agrupar
                </button>
            </div>
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

        // Pre-compute Valid Row count directly to establish psychological UI confirmation 
        let currentValidRowsCount = sanitizedData ? sanitizedData.filter(r => !r._rejectedSim).length : 0;
        let totalRawRowsCount = sanitizedData ? sanitizedData.length : 0;

        const toolbar = `
            <div class="flex items-center gap-3 mb-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10 w-full">
                ${filterHTML}
                ${toggleHtml}
                ${supportToggleHtml}
                
                <div class="text-[10px] text-slate-500 font-mono px-2 border-l border-slate-700 ml-auto flex items-center">
                    <span id="simFilteredCount" class="text-emerald-400 font-bold">${currentValidRowsCount}</span> 
                    <span class="mx-1">/</span> 
                    ${currentValidRowsCount} 
                    <span class="text-slate-600 italic ml-2">(${totalRawRowsCount} En Matriz)</span>
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
            
            if (!skipModal) {
                if (state.query && state.query !== "") {
                    filterSimulationData();
                } else {
                    renderSimulationTable(sanitizedData);
                }
            }
        } else {
            if (!skipModal) renderSimulationTable(sanitizedData);
        }

        // [UX FIX] Si es una invocación silenciosa (ej. Chofer IA sync), mantener en background
        if (!skipModal) {
             document.getElementById('simulationModal').classList.remove('hidden');
             if (window.lucide) window.lucide.createIcons({ root: container });
        }

        let validRowsCount = sanitizedData ? sanitizedData.filter(r => !r._rejectedSim).length : 0;
        let totalRowsCount = sanitizedData ? sanitizedData.length : 0;

        const simMetaEl = document.getElementById('simMeta');
        if (simMetaEl) {
            simMetaEl.innerHTML = `
                <span class="text-slate-400">Filas Válidas:</span> <span class="text-emerald-400 font-bold">${validRowsCount}</span> 
                <span class="text-red-400 font-bold ml-2">(Filas Descartadas: ${(totalRowsCount - validRowsCount)})</span>  
                <span class="text-slate-600 mx-2">|</span> 
                <span class="text-slate-400">Columnas Master:</span> <span class="text-white font-bold">${displayConfig.length}</span>
            `;
        }

    } catch (error) {
        console.error("Critical Preview Error:", error);
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error en Previsualización', text: error.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Error en Previsualizador: " + error.message);
        
        const simMetaEl = document.getElementById('simMeta');
        if (simMetaEl) simMetaEl.innerHTML = `<span class="text-red-400">Error durante la carga: ${error.message}</span>`;
    }
}

function filterSimulationData() {
    if (!window.GlobalSearchFilter) return;
    window.GlobalSearchFilter.saveState('sim');
    const state = window.GlobalSearchFilter.getState('sim');
    
    const countEl = document.getElementById('simFilteredCount');
    
    if (!state.query) {
        renderSimulationTable(window.currentSimData);
        if (countEl) countEl.innerText = window.currentSimData.length;
        return;
    }

    const normString = (s) => s != null ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const terms = normString(state.query).split(/\s+/).filter(t => t.length > 0);

    const filtered = window.currentSimData.filter(row => {
        return terms.every(term => {
            if (state.field === "ALL") {
                return window.currentDisplayConfig.some(cfg => {
                    const val = cfg.transform(row[cfg.sourceIndex], row);
                    return normString(val).includes(term);
                });
            } else {
                const cfg = window.currentDisplayConfig[parseInt(state.field)];
                if (!cfg) return false;
                const val = cfg.transform(row[cfg.sourceIndex], row);
                return normString(val).includes(term);
            }
        });
    });

    renderSimulationTable(filtered);
    if (countEl) countEl.innerText = filtered.length;
}

function renderSimulationTable(data) {
    const scrollArea = document.getElementById('simTableScrollArea');
    if (!scrollArea) return;

    let html = "<table class='table-fixed text-xs text-slate-300 font-mono' style='width: max-content;'><thead><tr class='bg-slate-950 sticky top-0 z-[100] border-b border-slate-700'>";

    html += "<th class='p-0 text-center font-bold border-r border-slate-700 bg-slate-900 sticky top-0 left-0 z-[110]' style='width: 30px; min-width: 30px; max-width: 30px;' title='Hoja de Origen'><div class='flex items-center justify-center w-full h-full text-blue-300 opacity-60'><i data-lucide='layers' class='w-3 h-3'></i></div></th>";

    const getRuleName = (type) => {
        switch(type) {
            case 'split': case 'regex_split': return 'Dividir Texto';
            case 'sanitize_numbers': return 'Extraer Numéricos';
            case 'VALIDATE_NUMERIC_STRICT': return 'Validador Numérico Estricto';
            case 'remove_zeros': return 'Quitar Ceros Iniciales';
            case 'uppercase': return 'Mayúsculas';
            case 'lowercase': return 'Minúsculas';
            case 'replace': return 'Reemplazo Textual';
            case 'format_number': return 'Formato ARS Simple';
            case 'SANITIZE_NUMERIC_PIPE': return 'Extractor Numérico Agresivo';
            case 'FORMAT_DECIMAL_DISCOUNT': return 'Parser Decimal / Descuento';
            case 'FORMAT_PRICE_AR': return 'Conversión Monetaria ARS';
            case 'SANITIZE_DECIMAL_FILL': return 'Normalización Decimal y Relleno';
            case 'sanitize': return 'Saneamiento / Regex';
            case 'row_filter': case 'filter': return 'Filtro Condicional';
            default: return type || 'Regla de Transformación';
        }
    };

    currentDisplayConfig.forEach((cfg, fieldIdx) => {
        const isSupport = cfg.isSupportCol;
        const hideClass = (isSupport && !window.ViewerUI._showSupportColsInSim) ? "hidden" : "";

        let content = `<span>${cfg.label}</span>`;
        let actions = '';
        let rulesDropdownHtml = '';
        
        // Hoist safeLabel to avoid TDZ (Temporal Dead Zone) ReferenceError
        const safeLabel = cfg.label ? cfg.label.replace(/'/g, "\\'") : '';

        // [New] Pipeline Quick Toggles
        if (cfg.virtualColId && !window._isMixedSimulation) {
            // Generate Interactive Dropdown for Applied Rules and Remapping
            if (window.draftPipelines && window.draftPipelines[cfg.virtualColId]) {
                let rulesStack = window.draftPipelines[cfg.virtualColId].rules || [];
                if (!Array.isArray(rulesStack)) rulesStack = [rulesStack];
                
                let dropdownItems = '';
                let activeCount = 0;

                if (rulesStack.length > 0) {
                    rulesStack.forEach((r, idx) => {
                        const isOff = r.disabled;
                        if (!isOff) activeCount++;
                        const badgeColor = isOff 
                            ? 'text-slate-500 line-through grayscale opacity-50' 
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                        const hoverEffect = isOff ? 'hover:text-slate-300' : 'hover:brightness-110';
                        
                        dropdownItems += `
                            <div onclick="window.ViewerUI.toggleRuleInSimulation('${cfg.virtualColId}', ${idx}); event.stopPropagation();" class="flex items-center justify-between text-[10px] px-2 py-1.5 border-b border-slate-800/50 cursor-pointer pointer-events-auto ${hoverEffect}">
                                <div class="truncate max-w-[140px] ${badgeColor} font-bold rounded px-1">${r.nombre_regla || getRuleName(r.type || r.tipo_regex)}</div>
                                <div class="w-2 h-2 rounded-full ${isOff ? 'bg-slate-600' : 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]'}"></div>
                            </div>
                        `;
                    });
                } else {
                    dropdownItems = `<div class="px-2 py-3 text-center text-[9px] text-slate-500 italic">Columna Maestra enlazada directo (sin reglas).</div>`;
                }

                // Logic to force the dropdown open if it was the last toggled
                const isForcedOpen = (window.ViewerUI && window.ViewerUI._keepDropdownOpen === cfg.virtualColId);
                const dropdownClasses = isForcedOpen 
                    ? 'opacity-100 visible pointer-events-auto scale-100'
                    : 'opacity-0 invisible pointer-events-none scale-95';

                rulesDropdownHtml = `
                    <div class="relative group pb-1">
                        <button onclick="window.ViewerUI.toggleRulesMenu(event, '${cfg.virtualColId}')" class="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-1 bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 rounded shadow-sm hover:brightness-125 transition-all w-full justify-between focus:outline-none focus:ring-1 focus:ring-emerald-500">
                            <span><i data-lucide="${rulesStack.length > 0 ? 'filter' : 'link'}" class="w-3 h-3 inline mr-1"></i> ${rulesStack.length > 0 ? activeCount + ' / ' + rulesStack.length : 'Opciones'}</span> <i data-lucide="${isForcedOpen ? 'chevron-up' : 'chevron-down'}" class="w-3 h-3"></i>
                        </button>
                        <div class="absolute left-0 top-full pt-1 w-52 z-[300] transition-all duration-200 transform origin-top ${dropdownClasses}" onmousedown="event.stopPropagation()" draggable="false">
                            <div class="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1">
                                <div class="px-2 pb-1 border-b border-slate-800 flex flex-col gap-1 mb-1">
                                    <button onclick="if(window.startColumnRemap) window.startColumnRemap('${cfg.virtualColId}', '${safeLabel}'); window.ViewerUI.toggleRulesMenu(event, '${cfg.virtualColId}'); event.stopPropagation();" class="w-full text-[9px] font-bold text-center bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/30 rounded py-1.5 transition-colors pointer-events-auto shadow-sm flex items-center justify-center gap-1.5" title="Reasignar el origen de datos a otra columna"><i data-lucide="arrow-left-right" class="w-3 h-3"></i> Mudar Origen</button>
                                    ${rulesStack.length > 0 ? `
                                    <div class="flex gap-1 mt-1">
                                        <button onclick="window.ViewerUI.toggleAllRulesInSimulation('${cfg.virtualColId}', true); event.stopPropagation();" class="flex-1 text-[8px] font-bold text-center bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 rounded py-1 transition-colors pointer-events-auto" title="Prender Todo">ON</button>
                                        <button onclick="window.ViewerUI.toggleAllRulesInSimulation('${cfg.virtualColId}', false); event.stopPropagation();" class="flex-1 text-[8px] font-bold text-center bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded py-1 transition-colors pointer-events-auto" title="Apagar Todo">OFF</button>
                                    </div>
                                    ` : ''}
                                </div>
                                <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                                    ${dropdownItems}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        const isComputedConfig = cfg.isComputed || false;
        
        // Define click handler for the label area (Bug Fix N°2)
        const clickHandler = (window._isMixedSimulation) ? "" : (isComputedConfig 
            ? `onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.editComputedColumn) window.editComputedColumn('${cfg.virtualColId}')"` 
            : `onclick="event.stopPropagation(); if(window.isRemappingFlow) return; if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '${cfg.virtualColId}', '${safeLabel}')"`);

        let thContent = `
            <div class="flex flex-col gap-1 min-h-[40px] relative w-full h-full justify-center">
                <div class="flex items-center justify-between gap-2 pr-2 cursor-pointer hover:bg-white/5 rounded px-1 -ml-1 transition-colors" ${clickHandler} title="Haz clic para editar cabecera/reglas">
                    <div class="font-bold truncate">${cfg.label}</div>
                    <div class="flex items-center shrink-0">
                        ${actions}
                    </div>
                </div>
                ${rulesDropdownHtml ? `<div>${rulesDropdownHtml}</div>` : ''}
            </div>
        `;

        let thClass = `p-2 border border-slate-700 text-left align-top relative group ${hideClass} sticky top-0 z-[100] `;
        thClass += cfg.isVirtual ? "bg-[rgb(8,17,26)] text-emerald-300 border-emerald-500/20" : "bg-[rgb(8,17,26)] text-blue-300";
        if (isSupport) thClass += " opacity-60"; // Visual clue that it's support when shown
        
        let resizeHandle = `<div onmousedown="window.initSimColResize(event, this.parentElement, ${fieldIdx}, '${cfg.virtualColId}')" class="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/50 z-20 transition-colors"></div>`;
        
        // Recover persisted width via Manager
        let restoredWidth = window.LayoutManager ? window.LayoutManager.getWidthCSS(cfg.virtualColId, '150px') : "150px";
        
        let draggableConfig = `draggable="true" ondragstart="window.ViewerUI.handleDragStart(event, ${fieldIdx})" ondragover="window.ViewerUI.handleDragOver(event)" ondragenter="window.ViewerUI.handleDragEnter(event)" ondragleave="window.ViewerUI.handleDragLeave(event)" ondrop="window.ViewerUI.handleDrop(event, ${fieldIdx})" ondragend="window.ViewerUI.handleDragEnd(event)"`;

        html += `<th ${draggableConfig} class="cursor-grab active:cursor-grabbing ${thClass}" style="width: ${restoredWidth}; min-width: ${restoredWidth}; max-width: ${restoredWidth};">${thContent}${resizeHandle}</th>`;
    });

    // Fase 2 - Headers (Computed Columns) PURGADO - Solo V5 pipeline oficial.

    html += "</tr></thead><tbody>";

    let rowsToRender = data;
    if (window.ViewerUI._showRejectedRowsInSim && window.ViewerUI._groupRejectedRowsInSim) {
        // Copia y Ordena: primero los descartados, luego el resto
        // Javascript default .sort is stable, so original layout index inside groups is preserved
        rowsToRender = [...data].sort((a, b) => {
            const aRej = a._rejectedSim ? 1 : 0;
            const bRej = b._rejectedSim ? 1 : 0;
            return bRej - aRej;
        });
    }

    rowsToRender.forEach((row) => {
        const isRejected = row._rejectedSim;
        if (isRejected && !window.ViewerUI._showRejectedRowsInSim) return;

        let rowTitle = row._emptySilently ? "Fila 100% vacía tras extracción" : "Fila descartada matemáticamente";
        if (row._rejectedByCode) rowTitle = "Fila descartada: Carencia de Identidad (Código Vacío)";
        
        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simValidSheetsForPreview) {
             const names = window._simValidSheetsForPreview.map(s => s.name);
             tblSheetIdx = names.indexOf(rowSheetName);
        }
        if (tblSheetIdx === -1) tblSheetIdx = 0;
        
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';
        
        const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : `${tonalBgClass} hover:bg-slate-800/50`;
        
        html += `<tr class='transition-colors border-b border-slate-800 ${rowClass}' ${isRejected ? `title="${rowTitle}"` : ''}>`;

        // Solid vertical block for Hoja Origen instead of transparent background
        let borderColorClass = (tblSheetIdx % 2 !== 0) ? 'border-l-[12px] border-l-fuchsia-600 text-fuchsia-400 bg-[rgb(8,17,26)]' : 'border-l-[12px] border-l-blue-600 text-blue-400 bg-[#0f172a]';
        
        const sheetBadge = `
            <div class="h-full w-full ${borderColorClass} flex items-center justify-center relative group cursor-help transition-all">
                <i data-lucide="layers" class="w-3 h-3 opacity-60"></i>
            </div>
        `;
        html += `<td class="p-0 border-r border-slate-800 ${tonalBgClass} sticky left-0 z-[105] w-[30px] max-w-[30px] overflow-hidden" title="${row._sourceSheet || 'Principal'}">${sheetBadge}</td>`;

        // Fase 1 - Render V5
        currentDisplayConfig.forEach(cfg => {
            const isSupport = cfg.isSupportCol;
            const hideClass = (isSupport && !window.ViewerUI._showSupportColsInSim) ? "hidden" : "";

            const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
            let finalVal = row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null;
            if(finalVal === null || finalVal === undefined) finalVal = cfg.transform(rawVal, row);
            
            // Limit text properly so resizing behaves like excel truncating long strings
            // We use max-w-0 on td with table-fixed to force truncation instead of expanding grid
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-0 ${isRejected ? 'text-red-400' : ''} ${hideClass} ${isSupport ? 'bg-slate-900/50 text-slate-500' : ''}" title="${String(finalVal).replace(/"/g, '&quot;')}">${finalVal}</td>`;
        });

        html += "</tr>";
    });
    html += "</tbody></table>";
    scrollArea.innerHTML = html;
}

window.renderSimulationTable = renderSimulationTable;

// --- DYNAMIC SIMULATION TOGGLES ---
window.ViewerUI = window.ViewerUI || {};
window.ViewerUI.toggleRuleInSimulation = function(vColId, ruleIndex) {
    if (!window.draftPipelines || !window.draftPipelines[vColId] || !window.draftPipelines[vColId].rules) return;
    let rules = window.draftPipelines[vColId].rules;
    if (!Array.isArray(rules)) rules = [rules];
    if (rules[ruleIndex]) {
        // Toggle the explicit disabled flag
        rules[ruleIndex].disabled = !rules[ruleIndex].disabled;
        window.draftPipelines[vColId].rules = rules;
        
        // PRESERVE DROPDOWN OPEN STATE
        window.ViewerUI._keepDropdownOpen = vColId;
        
        // Retrigger the simulation modal processing directly
        if (typeof window.generatePreview === 'function') {
            window.generatePreview(true); // skipModal
        }
        
        // Sync the workshop left panel UI implicitly if it's currently showing that column
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {
            window.viewerRuleWorkshop.syncVisuals();
        }
    }
};

window.ViewerUI.toggleAllRulesInSimulation = function(vColId, forceEnable) {
    if (!window.draftPipelines || !window.draftPipelines[vColId] || !window.draftPipelines[vColId].rules) return;
    let rules = window.draftPipelines[vColId].rules;
    if (!Array.isArray(rules)) rules = [rules];
    
    rules.forEach(r => {
        r.disabled = !forceEnable;
    });
    window.draftPipelines[vColId].rules = rules;
    
    window.ViewerUI._keepDropdownOpen = vColId;
    
    if (typeof window.generatePreview === 'function') {
        window.generatePreview(true); // skipModal
    }
};

window.ViewerUI.toggleRulesMenu = function(e, vColId) {
    e.stopPropagation();
    const dropdown = e.currentTarget.nextElementSibling;
    const isCurrentlyForced = window.ViewerUI._keepDropdownOpen === vColId;
    
    if (isCurrentlyForced) {
        window.ViewerUI._keepDropdownOpen = null;
    } else {
        window.ViewerUI._keepDropdownOpen = vColId;
    }
    
    if (typeof window.generatePreview === 'function') {
        window.generatePreview(true); // skipModal
    }
};

window.ViewerUI.toggleRejectedRows = function() {
    window.ViewerUI._showRejectedRowsInSim = !window.ViewerUI._showRejectedRowsInSim;
    
    const btn = document.getElementById('btnToggleRejectedSimulator');
    if (btn) {
        if (window.ViewerUI._showRejectedRowsInSim) {
             btn.className = "ml-2 px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase bg-red-900/40 text-red-300 border border-red-500/50";
        } else {
             btn.className = "ml-2 px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700";
        }
    }
    const iconEl = document.getElementById('iconToggleRejectedSimulator');
    if (iconEl) iconEl.setAttribute('data-lucide', window.ViewerUI._showRejectedRowsInSim ? 'eye' : 'eye-off');
    
    const groupBtn = document.getElementById('btnToggleGroupRejectedSimulator');
    if (groupBtn) {
        if (window.ViewerUI._showRejectedRowsInSim) {
             groupBtn.classList.remove('hidden');
             groupBtn.classList.add('flex');
        } else {
             groupBtn.classList.remove('flex');
             groupBtn.classList.add('hidden');
        }
    }
    
    if (window.lucide) window.lucide.createIcons();

    if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
        window.renderSimulationTable(window.currentSimData);
    }
};

window.ViewerUI.toggleGroupRejected = function() {
    window.ViewerUI._groupRejectedRowsInSim = !window.ViewerUI._groupRejectedRowsInSim;
    
    const btn = document.getElementById('btnToggleGroupRejectedSimulator');
    if (btn) {
        if (window.ViewerUI._groupRejectedRowsInSim) {
            btn.className = "px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase bg-orange-900/40 text-orange-300 border border-orange-500/50";
        } else {
            btn.className = "px-3 py-1 flex items-center gap-2 rounded transition-colors text-[10px] font-bold uppercase bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700";
        }
    }
    const iconEl = document.getElementById('iconToggleGroupRejectedSimulator');
    if (iconEl) iconEl.setAttribute('data-lucide', window.ViewerUI._groupRejectedRowsInSim ? 'arrow-up-to-line' : 'list-ordered');
    
    if (window.lucide) window.lucide.createIcons();

    if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
        window.renderSimulationTable(window.currentSimData);
    }
};

window.ViewerUI.toggleSupportCols = function() {
    window.ViewerUI._showSupportColsInSim = !window.ViewerUI._showSupportColsInSim;
    if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
        window.renderSimulationTable(window.currentSimData);
    }
};

// --- DRAG AND DROP COLUMNS ---
window.ViewerUI.draggedSimColIndex = null;

window.ViewerUI.handleDragStart = function(e, index) {
    const th = e.target.closest('th');
    if (!th) return;
    window.ViewerUI.draggedSimColIndex = index;
    
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', index.toString()); } catch(ex){} 
    
    setTimeout(() => {
        // [FIX V8.9] Aislar elemento arrastrado del motor de eventos del puntero
        th.classList.add('opacity-40', 'pointer-events-none', 'z-50');
    }, 10);
};

window.ViewerUI.handleDragOver = function(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    return false;
};

window.ViewerUI.handleDragEnter = function(e) {
    e.preventDefault();
    let th = e.target.closest('th');
    if (!th) return;
    
    // [FIX V8.9] Filtro de Bubbling
    th._dragCounter = (th._dragCounter || 0) + 1;
    if (th._dragCounter === 1) {
         th.classList.add('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};

window.ViewerUI.handleDragLeave = function(e) {
    let th = e.target.closest('th');
    if (!th) return;
    
    th._dragCounter = (th._dragCounter || 0) - 1;
    if (th._dragCounter <= 0) {
        th._dragCounter = 0;
        th.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};

window.ViewerUI.handleDrop = function(e, dropColIndex) {
    e.stopPropagation();
    let th = e.target.closest('th');
    if (th) th.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    
    let dragColIndex = window.ViewerUI.draggedSimColIndex;
    if (dragColIndex === null || dragColIndex === dropColIndex) return false;
    
    // Obtenemos las configuraciones de columnas en la matriz virtual
    let draggedConfig = window.currentDisplayConfig[dragColIndex];
    let droppedConfig = window.currentDisplayConfig[dropColIndex];
    
    if (!draggedConfig || !droppedConfig) return false;
    
    // V6 Fix: Las columnas calculadas no existen en vColArray, sino en computedColumns.
    // El orden global se unifica operando sobre el 'currentDisplayConfig'
    if (window.LayoutManager) {
        // Inicializar track list desde el currentDisplayConfig visual original
        let unifiedOrderList = window.currentDisplayConfig.map(cfg => cfg.virtualColId);
        
        // Efectuar Desplazamiento Transaccional in-place
        const elementId = unifiedOrderList.splice(dragColIndex, 1)[0];
        unifiedOrderList.splice(dropColIndex, 0, elementId);
        
        // Guardar el estado unificado maestramente en LayoutManager (array de id dict)
        window.LayoutManager.recordOrder(unifiedOrderList.map(id => ({ id })));
        
        // Guardar estado master hacia el servidor si es posible
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }
        
        // Efectuar Desplazamiento Transaccional Físico en Memoria UI
        if (window.currentDisplayConfig) {
             const elementObj = window.currentDisplayConfig.splice(dragColIndex, 1)[0];
             window.currentDisplayConfig.splice(dropColIndex, 0, elementObj);
        }
        
        // Reconstruir interfaz completa reflejando nueva posición (Actualización Optimista Dinámica)
        if (typeof window.renderSimulationTable === 'function' && window.currentSimData) {
            window.renderSimulationTable(window.currentSimData);
            if (window.lucide) window.lucide.createIcons({ root: document.getElementById('simulationTableContainer') });
        } else if (typeof generatePreview === 'function') {
            generatePreview(true); // Fallback
        }
        
        // Disparar redibujado táctico del layout de Workshop (Opcional si conviven)
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {
            setTimeout(() => window.viewerRuleWorkshop.syncVisuals(), 100);
        }
    } else {
        console.error("Layout Manager not loaded, skipping universal Drag&Drop reorder.");
    }
    return false;
};

window.ViewerUI.handleDragEnd = function(e) {
    const th = e.target.closest('th');
    if (th) {
        th.classList.remove('opacity-40', 'pointer-events-none', 'z-50');
    }
    window.ViewerUI.draggedSimColIndex = null;
    
    // Purga general
    document.querySelectorAll('th').forEach(t => {
         t._dragCounter = 0;
         t.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    });
    
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {
        window.viewerRuleWorkshop.syncVisuals();
    }
};

window.ViewerUI.toggleFullscreenSimulation = function(btn) {
    const modalWrapper = document.getElementById('simulationModal');
    const modal = document.querySelector('#simulationModal .glass-panel');
    if (!modalWrapper || !modal) return;
    
    // El panel inicia con 'w-full max-w-4xl', por ende usar w-full como flag de fullscreen es erróneo.
    const isFullscreen = modal.classList.contains('max-w-none') || modal.classList.contains('w-screen');
    
    if (isFullscreen) {
        modalWrapper.classList.remove('p-0');
        modalWrapper.classList.add('p-4');
        modal.classList.remove('w-screen', 'h-screen', 'w-full', 'h-full', 'max-w-none', 'max-h-none', 'max-h-screen', 'rounded-none', 'border-0');
        modal.classList.add('max-w-4xl', 'max-h-[90vh]', 'rounded-2xl', 'border', 'border-emerald-500/30');
        
        const icon = btn.querySelector('i');
        if(icon) {
            icon.setAttribute('data-lucide', 'maximize');
            if (window.lucide) window.lucide.createIcons({ root: btn });
        }
    } else {
        modalWrapper.classList.remove('p-4');
        modalWrapper.classList.add('p-0');
        modal.classList.remove('max-w-4xl', 'max-h-[90vh]', 'rounded-2xl', 'border', 'border-emerald-500/30');
        modal.classList.add('w-full', 'h-full', 'max-w-none', 'max-h-none', 'rounded-none', 'border-0');
        
        const icon = btn.querySelector('i');
        if(icon) {
            icon.setAttribute('data-lucide', 'minimize');
            if (window.lucide) window.lucide.createIcons({ root: btn });
        }
    }
    
    // Force redraw icons of full document just in case
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 10);
};

// --- SIMULATION COL RESIZE LOGIC ---
let isSimResizing = false;
let simResizeStartX = 0;
let simResizeStartWidth = 0;
let simResizeTargetTh = null;
let simResizeRAF = null;
let simResizeColIndex = -1;
let simResizeColVirtualId = null;

// window.simColWidthPersist was deleted

window.initSimColResize = function(e, thEl, colIdx, virtualColId) {
    e.preventDefault();
    e.stopPropagation();
    isSimResizing = true;
    simResizeStartX = e.pageX;
    simResizeStartWidth = thEl.offsetWidth;
    simResizeTargetTh = thEl;
    simResizeColIndex = colIdx;
    simResizeColVirtualId = virtualColId;

    // Fix absolute CSS widths to prevent auto flex-resizing from table siblings
    if (!thEl.style.width) thEl.style.width = thEl.offsetWidth + 'px';

    document.body.classList.add('select-none');
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onSimColMouseMove);
    document.addEventListener('mouseup', onSimColMouseUp);
};

function onSimColMouseMove(e) {
    if (!isSimResizing || !simResizeTargetTh) return;
    if (simResizeRAF) cancelAnimationFrame(simResizeRAF);
    simResizeRAF = requestAnimationFrame(() => {
        const diff = e.pageX - simResizeStartX;
        const newWidth = Math.max(50, simResizeStartWidth + diff); // At least 50px wide
        simResizeTargetTh.style.width = newWidth + 'px';
        simResizeTargetTh.style.minWidth = newWidth + 'px';
        simResizeTargetTh.style.maxWidth = newWidth + 'px';
    });
}

function onSimColMouseUp(e) {
    if (!isSimResizing) return;
    
    // Save strictly to robust LayoutManager Memory
    if (simResizeTargetTh && simResizeColVirtualId) {
        const pixelVal = parseInt(simResizeTargetTh.style.width, 10);
        if (window.LayoutManager) {
            window.LayoutManager.recordWidth(simResizeColVirtualId, pixelVal);
        }
        
        // Guardar estado master hacia el servidor si es posible
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }
    }
    
    isSimResizing = false;
    if (simResizeRAF) cancelAnimationFrame(simResizeRAF);
    document.body.classList.remove('select-none');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onSimColMouseMove);
    document.removeEventListener('mouseup', onSimColMouseUp);
}

// --- COL RESIZE LOGIC (Virtual Scroller D&D) ---
let isResizing = false;
let resizeColIndex = -1;
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizeTargetTh = null;
let resizeRAF = null;

window.initColResize = function (e, colIndex, thEl) {
    e.preventDefault();
    e.stopPropagation(); // Avoid conflicts with other click handlers

    isResizing = true;
    resizeColIndex = colIndex;
    resizeStartX = e.pageX;
    resizeStartWidth = thEl.offsetWidth;
    resizeTargetTh = thEl;

    // Add visual feedback to the body (prevent selection across UI)
    document.body.classList.add('select-none');
    document.body.style.cursor = 'col-resize';

    document.addEventListener('mousemove', onColMouseMove);
    document.addEventListener('mouseup', onColMouseUp);
};

function onColMouseMove(e) {
    if (!isResizing || !resizeTargetTh) return;

    // Throttling with requestAnimationFrame for 60FPS DOM updates
    if (resizeRAF) cancelAnimationFrame(resizeRAF);

    resizeRAF = requestAnimationFrame(() => {
        const diff = e.pageX - resizeStartX;
        const newWidth = Math.max(30, resizeStartWidth + diff); // Minimum 30px

        // Surgical Update on Header
        resizeTargetTh.style.width = newWidth + 'px';
        resizeTargetTh.style.minWidth = newWidth + 'px';
        resizeTargetTh.style.maxWidth = newWidth + 'px';
    });
}

function onColMouseUp(e) {
    if (!isResizing) return;
    isResizing = false;

    if (resizeRAF) cancelAnimationFrame(resizeRAF);

    document.body.classList.remove('select-none');
    document.body.style.cursor = '';

    document.removeEventListener('mousemove', onColMouseMove);
    document.removeEventListener('mouseup', onColMouseUp);

    // Save strictly to memory
    if (!window.currentColWidths) window.currentColWidths = {};
    window.currentColWidths[resizeColIndex] = parseInt(resizeTargetTh.style.width, 10);

    // Persist to multi-sheet store safely
    if (window.currentSheetName && window.saveSheetState) {
        window.saveSheetState(window.currentSheetName);
    }

    // Capture visual context to prevent scroll jumping
    const container = document.getElementById('excelContainer');
    const scrollPos = container ? container.scrollTop : 0;
    const scrollLeft = container ? container.scrollLeft : 0;

    // Force full table re-render to propagate width to all body cells, preserving state
    if (typeof window.triggerSafeRender === 'function') {
        window.triggerSafeRender();
    } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
        window.renderVirtualTable(window.currentSheetData);
    }

    // Restore visual context
    if (container) {
        container.scrollTop = scrollPos;
        container.scrollLeft = scrollLeft;
        container.dispatchEvent(new Event('scroll')); // Resync Virtual Scroller
        
        requestAnimationFrame(() => {
            container.scrollTop = scrollPos;
            container.scrollLeft = scrollLeft;
            container.dispatchEvent(new Event('scroll'));
        });
    }

    // Silent auto-save to backend
    if (typeof window.saveSimulationConfig === 'function') {
        window.saveSimulationConfig(null, true);
    }
}

// [VIGÍA DE CONTROL]
console.log("🎨 [ViewerRender] Motor Gráfico Iniciado (Con Drag & Drop Resizing v1.0).");

// --- AUDITORÍA CLIENT-SIDE DE UNICIDAD (NUEVA FUNCIONALIDAD) --- //

window.handleColumnContextMenu = function(e, colId, colName) {
    if (window.isRemappingFlow || window.isViewerReadOnly) return; // Omitir si es un modo restringido, a menos que el usuario lo requiera en ReadOnly.
    
    e.preventDefault();
    
    // Remover menu viejo si hay
    const oldMenu = document.getElementById('viewerCtxMenu');
    if (oldMenu) oldMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'viewerCtxMenu';
    menu.className = "absolute z-[9999] bg-slate-900 border border-slate-700 shadow-2xl rounded-lg overflow-hidden py-1 min-w-[220px]";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    
    menu.innerHTML = `
        <div class="px-3 py-2 text-xs font-bold text-slate-400 border-b border-slate-800 uppercase tracking-wider bg-slate-950">
            Opciones p/ Columna
        </div>
        <button onclick="window.runUniqueValueAudit('${colId}', '${colName}'); document.getElementById('viewerCtxMenu').remove();" class="w-full text-left px-4 py-2.5 text-sm text-blue-400 hover:bg-slate-800 transition-colors flex items-center gap-2">
            <i data-lucide="search" class="w-4 h-4"></i>
            Control de Valor Único
        </button>
    `;
    
    document.body.appendChild(menu);
    if(window.lucide) window.lucide.createIcons();
    
    // Autodestrucción al click fuera o Escape
    const killMenu = (evt) => {
        if (!menu.contains(evt.target)) {
            menu.remove();
            document.removeEventListener('mousedown', killMenu);
        }
    };
    // Delay binding
    setTimeout(() => document.addEventListener('mousedown', killMenu), 10);
};

window.runUniqueValueAudit = function(colId, colName, viewMode = 'raw') {
    // 1. Snapshot validación
    if (!window.viewerState || !window.viewerState.data || window.viewerState.data.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ title: 'Auditoría Abortada', text: 'No hay datos en memoria para auditar.', icon: 'error', background: '#0f172a', color: '#f8fafc' });
        }
        return;
    }
    
    const data = window.viewerState.data;
    const valueMap = {}; // hashmap para agrupar rows
    
    // 2. Extraemos el 'dataIdx' si existe en virtual columns, sino asumimos ID de computed object
    let lookupKey = null;
    if (window.virtualColumns) {
        const vCol = window.virtualColumns.find(c => String(c.id) === String(colId));
        if (vCol) lookupKey = vCol.dataIdx;
    }
    
    const isComputed = lookupKey === null; // si lookupKey es nulo, significa que debe estar como llave cruda
    
    // Obtener Pipeline Activo para esta columna en caso de modo procesado
    const pipeObj = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === colId) 
        ? window.activeEtlState.pipeline 
        : (window.draftPipelines && window.draftPipelines[colId] ? window.draftPipelines[colId].rules : []);

    let scannedCount = 0;

    data.forEach((row, rowIdx) => {
        // Obviamos filas desechadas o vacías virtualmente
        if (row._rejectedSim || row._emptySilently || row._rejectedByCode) return;
        
        let cellVal = null;
        if (isComputed) {
            cellVal = row[colId]; 
        } else {
            cellVal = row[lookupKey];
        }
        
        let strVal = '';
        if (viewMode === 'processed' && pipeObj && pipeObj.length > 0 && window.viewerETL) {
            const tr = window.viewerETL.transformCell(cellVal, pipeObj, row);
            strVal = String(tr.display || tr.result || "").trim();
        } else {
            strVal = cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : '';
        }
        
        // 3. Omitir nulos o vacíos ("Manejo de Celdas Vacías")
        if (strVal === '') return; 
        
        scannedCount++;
        
        if (!valueMap[strVal]) valueMap[strVal] = [];
        valueMap[strVal].push({ index: rowIdx, rawData: row });
    });
    
    // 4. Analizar Conflicto (Valores duplicados)
    const duplicates = Object.entries(valueMap).filter(([val, occurrences]) => occurrences.length > 1);
    
    const toggleHtml = `
        <div class="flex items-center justify-between bg-slate-900 border border-slate-700/50 p-2 rounded-lg mb-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 focus:outline-none">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i> Auditando origen:
            </div>
            <div class="w-72 bg-slate-950 p-1 rounded-md flex relative shadow-inner">
                <div class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-blue-600/30 border border-blue-500/50 rounded transition-all duration-300" style="left: ${viewMode === 'raw' ? '4px' : 'calc(50% + 4px)'};"></div>
                <button onclick="window.runUniqueValueAudit('${colId}', '${colName}', 'raw')" class="flex-1 py-1.5 text-xs font-bold z-10 transition-colors ${viewMode === 'raw' ? 'text-blue-200' : 'text-slate-500 hover:text-slate-300'}">Crudo (Inicial)</button>
                <button onclick="window.runUniqueValueAudit('${colId}', '${colName}', 'processed')" class="flex-1 py-1.5 text-xs font-bold z-10 transition-colors ${viewMode === 'processed' ? 'text-blue-200' : 'text-slate-500 hover:text-slate-300'}">Procesado (ETL)</button>
            </div>
        </div>
        ${viewMode === 'processed' && (!pipeObj || pipeObj.length === 0) ? '<div class="text-xs text-amber-400 bg-amber-900/20 py-2 px-3 rounded text-center mb-4 border border-amber-500/30"><i data-lucide="alert-triangle" class="inline w-3 h-3 mr-1 align-middle"></i>Mostrando estado inicial: Aún no hay reglas activas para alterar el flujo.</div>' : ''}
    `;

    // 5. UX Escenarios
    if (duplicates.length === 0) {
        // ÉXITO
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Auditoría Exitosa',
                html: toggleHtml + `<div class="mt-4"><i data-lucide="check-circle" class="w-16 h-16 text-emerald-500 mx-auto mb-4"></i><br>Se escanearon <b>${scannedCount}</b> registros.<br>Todos los valores en <b>'${colName}'</b> son rigurosamente únicos.</div>`,
                background: '#0f172a',
                color: '#10b981',
                confirmButtonText: 'Genial',
                confirmButtonColor: '#3b82f6',
                didOpen: () => { if(window.lucide) window.lucide.createIcons(); }
            });
        } else {
            alert(`Auditoría exitosa! Se escanearon ${scannedCount} registros. Todos los valores son únicos.`);
        }
    } else {
        // CONFLICTO
        console.warn("[Auditoria] Duplicados detectados: ", duplicates);
        
        // 5.1 Math Analítico de Frecuencias
        let f2 = 0, f3 = 0, f4 = 0, fM = 0;
        duplicates.forEach(([_, occ]) => {
            const l = occ.length;
            if (l === 2) f2++;
            else if (l === 3) f3++;
            else if (l === 4) f4++;
            else if (l > 4) fM++;
        });

        const phrases = [];
        if (f2 > 0) phrases.push(`${f2} caso${f2===1?'':'s'} de códigos duplicados`);
        if (f3 > 0) phrases.push(`${f3} caso${f3===1?'':'s'} de código triplicado`);
        if (f4 > 0) phrases.push(`${f4} caso${f4===1?'':'s'} de código cuadruplicado`);
        if (fM > 0) phrases.push(`${fM} caso${fM===1?'':'s'} de repeticiones masivas (>4)`);
        
        let freqSentence = "";
        if (phrases.length > 1) {
            const lastPhrase = phrases.pop();
            freqSentence = phrases.join(', ') + ' y ' + lastPhrase;
        } else {
            freqSentence = phrases[0] || 'casos repetidos';
        }

        const totalAffected = duplicates.reduce((sum, [_, arr]) => sum + arr.length, 0);

        // Build conflict UI HTML
        let conflictHtml = toggleHtml + `
            <div class="mb-5 bg-amber-900/40 border border-amber-500/40 shadow-lg shadow-amber-900/20 rounded-lg p-4 text-left relative">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                        <i data-lucide="bar-chart-2" class="w-4 h-4"></i> Resumen Analítico
                    </div>
                    <button onclick="window.unifyDuplicates('${colId}', '${viewMode}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs shadow-lg shadow-rose-900/50 transition-transform active:scale-95 flex items-center gap-2">
                        <i data-lucide="scissors" class="w-3.5 h-3.5"></i> Purificar Duplicados (Conservar Únicos)
                    </button>
                </div>
                <div class="text-amber-200/90 text-[13px] leading-relaxed">
                    Se encontraron ${freqSentence}. Total de filas afectadas: <b class="text-amber-400 text-sm bg-amber-500/10 px-1 rounded">${totalAffected}</b>.
                </div>
            </div>
            <div class="flex flex-col gap-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2 pb-4">
        `;
        
        duplicates.forEach(([val, reqs]) => {
            conflictHtml += `
            <div class="bg-slate-900 border-l-4 border-l-rose-500 border border-slate-700/50 rounded p-3">
                <div class="font-bold text-rose-400 font-mono text-sm mb-2 break-all flex items-center justify-between">
                    <span>📌 Valor: <span class="bg-slate-950 px-2 py-0.5 rounded ml-1 text-rose-300 select-all">${val}</span></span>
                    <span class="text-xs bg-rose-500/10 text-rose-500 px-2 rounded-full py-0.5 border border-rose-500/20">${reqs.length} repeticiones</span>
                </div>
                <div class="flex flex-col gap-1.5 mt-2">
            `;
            
            // Limit shown occurrences inside modal to prevent freezing if there are thousands.
            const shows = reqs.slice(0, 50);
            shows.forEach(occ => {
                // Serializar la fila para verla completita, filtrando llaves internas que empiezan con _ (underscore)
                const displayRow = Object.keys(occ.rawData)
                     .filter(k => !k.startsWith('_')) 
                     .map(k => {
                         const rawVal = occ.rawData[k] !== undefined && occ.rawData[k] !== null ? occ.rawData[k] : '';
                         return `<span class="opacity-50">[${k}]:</span> <span class="text-slate-200">${rawVal}</span>`;
                     })
                     .join(' <span class="text-slate-700 mx-1">•</span> ');
                     
                conflictHtml += `<div class="bg-slate-950 px-2 py-1.5 text-[11px] font-mono rounded overflow-hidden text-ellipsis whitespace-nowrap hover:whitespace-normal transition-all border border-slate-800 shadow-inner" style="word-break: break-all;">
                    <span class="text-slate-500 mr-2 font-bold bg-slate-900 px-1 rounded">#${occ.index}</span> ${displayRow || 'Fila Vacia'}
                </div>`;
            });
            
            if (reqs.length > 50) {
               conflictHtml += `<div class="text-xs text-slate-500 text-center italic mt-1">+ ${reqs.length - 50} filas adicionales omitidas de la visualización...</div>`;
            }
            
            conflictHtml += `</div></div>`;
        });
        
        conflictHtml += `</div></div>`;
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: '⚠️ Alerta de Duplicidad',
                html: conflictHtml,
                width: '850px',
                background: '#0f172a',
                color: '#f8fafc',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#3b82f6',
                didOpen: () => { if(window.lucide) window.lucide.createIcons(); }
            });
        }
    }
};

window.unifyDuplicates = function(colId, viewMode) {
    if (!window.viewerState || !window.viewerState.data) return;
    
    Swal.fire({
        title: '¿Confirmar Purificación Estricta?',
        html: '<div class="text-[13px] text-slate-300">Se conservará secuencialmente el <b>primer registro</b> de cada bloque de duplicados por esta columna, filtrando y descartando el resto permanentemente de la vista activa.</div>',
        icon: 'warning',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#334155',
        confirmButtonText: '<i data-lucide="scissors" class="inline w-4 h-4 mr-1 mt-[-2px]"></i> Sí, Purificar Matriz',
        cancelButtonText: 'Cancelar',
        didOpen: () => { if(window.lucide) window.lucide.createIcons(); }
    }).then((result) => {
        if (result.isConfirmed) {
            
            if (!window.draftPipelines) window.draftPipelines = {};
            if (!window.draftPipelines[colId]) {
                 // Prevent crashing if no pipeline is attached to the column yet 
                 window.draftPipelines[colId] = { rules: [] };
            }
            
            const existingDupl = window.draftPipelines[colId].rules.find(r => r.type === 'remove_duplicates');
            if (existingDupl) {
                Swal.fire({ title: 'Atención', text: 'La regla de purificación única ya se encuentra activa en esta columna.', icon: 'info', background: '#0f172a', color: '#f8fafc' });
                return;
            }
            
            window.draftPipelines[colId].rules.push({
                type: 'remove_duplicates',
                nombre_regla: 'Eliminar Duplicados',
                descripcion: 'Elimina las filas que repitan exactamente el mismo valor de identidad en esta columna.',
                disabled: false
            });
            
            Swal.fire({
                title: 'Regla Inyectada',
                text: 'Se inyectó la regla de Depuración Unificada en la memoria de esta columna.',
                icon: 'success',
                background: '#0f172a', color: '#10b981',
                confirmButtonColor: '#3b82f6',
                timer: 3000
            });
            
            if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncToGlobalState === 'function') {
                window.viewerRuleWorkshop.syncToGlobalState();
            } else if (typeof window.triggerSafeRender === 'function') {
                window.triggerSafeRender();
            } else if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
                window.renderVirtualTable(window.currentSheetData);
            }
        }
    });
};