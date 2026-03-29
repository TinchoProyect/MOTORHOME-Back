/**
 * VIEWER RENDER - Virtual Scroller & Visual Engine
 * Extracted from viewer_engine_rescatado.js
 */

function renderVirtualTable(originalData) {
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
    // [V5.19 FIX] Ensure external scripts access the purely cleaned array, overriding any previous injection.
    if (typeof currentSheetData !== 'undefined') currentSheetData = data;

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
    }

    const ROW_HEIGHT = 35;
    const HEADER_HEIGHT = 40;
    const totalRows = data.length;
    const totalHeight = (totalRows * ROW_HEIGHT) + HEADER_HEIGHT;

    container.innerHTML = '';
    const scrollerContent = document.createElement('div');
    scrollerContent.style.height = `${totalHeight}px`;
    scrollerContent.style.position = 'relative';
    container.appendChild(scrollerContent);

    const table = document.createElement('table');
    table.className = 'border-collapse text-[11px] font-mono absolute top-0 left-0';
    table.style.tableLayout = 'fixed';
    table.style.width = '0px'; // Crucial para que el contenido no impida achicar la columna
    scrollerContent.appendChild(table);

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
        let j = vCol.id;
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
                <button onclick="openColumnMenu_v2('${j}', this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                    <span class="truncate font-bold text-[10px] uppercase">${displayName}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                </button>
            </div>`;
        } else {
            if (window.draftPipelines && window.draftPipelines[j]) {
                const pipe = window.draftPipelines[j];
                const pipeName = getHumanName(pipe.masterField ? (pipe.masterField.nombre_campo || pipe.masterField.id) : mappedType);
                thContent = `
                    <div class="flex items-center gap-2 text-emerald-300 cursor-pointer hover:bg-emerald-900/30 px-1 py-0.5 rounded transition-colors" onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '${j}', '${originalVal}')">
                        <i data-lucide="link-2" class="w-3 h-3"></i>
                        <span class="truncate" title="${pipeName}">${pipeName}</span>
                        <div class="bg-emerald-800 text-emerald-200 text-[9px] px-1.5 rounded-full ml-auto">${pipe.rules ? pipe.rules.length : 0}r</div>
                    </div>
                `;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType && mappedType !== 'Ignorar Columna') {
                const mapName = getHumanName(mappedType);
                thContent = `<span class="text-emerald-400" title="ID: ${mappedType}">${mapName}</span> <span class="text-slate-600 text-[9px] ml-1">(${originalVal})</span>`;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType === 'Ignorar Columna') {
                thClass += " opacity-40 grayscale decoration-line-through";
            }

            // [FIX] Add Visual Feedback for Offset Mode on Headers
            if (offsetSelectionMode) {
                thClass += " cursor-crosshair hover:bg-amber-500/30 border-amber-500/50";
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
        headerHtml += `<th id="th-${j}" class="${thClass}" style="height: ${HEADER_HEIGHT}px; width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;" ${clickAttr} data-col-id="${j}">${thContent}${resizerHtml}</th>`;
    });

    // [V5.6] Fase 2 - Encabezados Computed en Virtual Scroller
    if (Array.isArray(window.computedColumns) && window.computedColumns.length > 0) {
        window.computedColumns.forEach((comp, idx) => {
            const thClass = "bg-fuchsia-900/20 border-b-2 border-fuchsia-500/50 text-fuchsia-300 font-bold uppercase border border-fuchsia-900/50 p-2 sticky top-0 z-20";
            const thContent = `
                <div class="flex items-center justify-between gap-1">
                    <div class="flex items-center gap-1 overflow-hidden" title="${comp.masterField?.nombre_campo || 'Calculada'}">
                        <i data-lucide="calculator" class="w-3 h-3 text-fuchsia-400 flex-shrink-0"></i>
                        <span class="truncate text-[10px]">${comp.masterField?.nombre_campo || 'Calculada'}</span>
                    </div>
                    <button onclick="window.ViewerUI.deleteComputedColumn('${idx}')" class="text-fuchsia-500 hover:text-red-400 p-0.5 ml-1 shrink-0 rounded hover:bg-red-500/10 transition-colors" title="Eliminar Cálculo">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                </div>
            `;
            const colWidth = 150;
            headerHtml += `<th class="${thClass}" style="height: ${HEADER_HEIGHT}px; width: ${colWidth}px; min-width: ${colWidth}px; max-width: ${colWidth}px;">${thContent}</th>`;
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
        const offsetY = startIndex * ROW_HEIGHT;
        table.style.transform = `translateY(${offsetY}px)`;

        let rowsHtml = '';
        let startDataIndex = Math.max(1, startIndex);
        if (startDataIndex === 0) startDataIndex = 1;

        let activeEtlState = null;
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
            activeEtlState = window.viewerRuleWorkshop.getActiveState();
        }

        for (let i = startDataIndex; i < endIndex; i++) {
            const row = data[i] || [];

            // --- INJECTION: LIVE SEARCH FILTER FOR CUSTOM RULES ---
            let rowStyle = `height: ${ROW_HEIGHT}px;`;
            let rowClass = "hover:bg-slate-800/50";

            if (window.activeCustomSearch && window.activeCustomSearch.text && window.activeCustomSearch.colIndex !== null) {
                const searchTarget = String(row[window.activeCustomSearch.colIndex] || '').toLowerCase();
                const searchQuery = window.activeCustomSearch.text.toLowerCase();
                if (!searchTarget.includes(searchQuery)) {
                    // Hide rows that don't match the live search
                    rowStyle += " display: none;";
                }
            }

            rowsHtml += `<tr style="${rowStyle}" class="${rowClass}">`;

            for (const vCol of window.virtualColumns) {
                let j = vCol.id;
                let dataIdx = vCol.dataIdx;
                let cellVal = row[dataIdx] !== undefined ? row[dataIdx] : '';

                const colWidth = window.currentColWidths && window.currentColWidths[j] ? window.currentColWidths[j] : 150;
                let cellClass = 'border border-slate-800 p-2 whitespace-nowrap text-slate-400 overflow-hidden text-ellipsis transition-colors duration-150';

                const minRow = window.currentOffset ? window.currentOffset.row : 0;
                const minCol = window.currentOffset ? window.currentOffset.col : 0;
                const isIgnored = (i < minRow) || (dataIdx < minCol);
                const isAnchor = (i === minRow && dataIdx === minCol);

                if (isIgnored) cellClass += " opacity-25 grayscale bg-slate-950/50";
                if (!window.offsetSelectionMode && isIgnored) cellClass += " pointer-events-none select-none";
                if (isAnchor) cellClass += " border-2 border-amber-500 font-bold bg-amber-900/20 text-amber-500";
                if (window.offsetSelectionMode) cellClass += " cursor-crosshair hover:bg-amber-500/30";

                // ETL Preview Injection & Global Audit Mode
                const isWorkshopOpen = activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === j;
                const savedPipeline = window.draftPipelines && window.draftPipelines[j] ? window.draftPipelines[j].rules : null;
                const isGlobalAuditOn = window.isGlobalPreviewEnabled && savedPipeline && savedPipeline.length > 0;

                let onCtx = "";

                if (isWorkshopOpen || isGlobalAuditOn) {
                    const safeRawVal = String(cellVal)
                        .replace(/\\/g, "\\\\")
                        .replace(/'/g, "\\'")
                        .replace(/"/g, "&quot;")
                        .replace(/\n/g, "\\n")
                        .replace(/\r/g, "\\r");
                    onCtx = ` oncontextmenu="window.ViewerUI.showOriginalValue(event, '${safeRawVal}', '${j}')"`;

                    if (isWorkshopOpen) {
                        cellClass += " relative z-[60] bg-slate-800 shadow-[0_0_15px_rgba(59,130,246,0.3)] border-x border-blue-500/50 cursor-context-menu";
                    } else {
                        // Estilo sutil para auditoría global
                        cellClass += " relative bg-emerald-950/20 border-x border-emerald-500/20 cursor-context-menu";
                    }

                    const activePipeline = isWorkshopOpen ? activeEtlState.pipeline : savedPipeline;

                    if (activePipeline && activePipeline.length > 0 && window.viewerETL) {
                        const rawVal = String(cellVal);
                        const { result, rejected } = window.viewerETL.transformCell(rawVal, activePipeline);

                        if (rawVal === "" && (window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1')) {
                            console.log(`[VIGIA AUDITOR RENDER] Celda Evaluada | rawVal: '${rawVal}' -> result: '${result}' | rejected: ${rejected} | Pipeline Length: ${activePipeline.length}`);
                        }

                        if (rejected) {
                            cellClass += " opacity-30 grayscale bg-red-500/10 text-red-400/50";
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
                    let rCtx = row._richContext || {};

                    // On-the-fly calculation si no existe context (Performance Lazy Load)
                    if (!row._richContext && window.viewerETL) {
                        rCtx = {};
                        if (calcConfig.operands && calcConfig.operands.length === 2) {
                            calcConfig.operands.forEach(opColId => {
                                const pipe = window.draftPipelines && window.draftPipelines[opColId] ? window.draftPipelines[opColId].rules : [];
                                const vColOp = window.virtualColumns.find(v => v.id === opColId);
                                if (vColOp && vColOp.dataIdx !== undefined) {
                                    const raw = String(row[vColOp.dataIdx] || "");
                                    const { clean } = window.viewerETL.transformCell(raw, pipe || []);
                                    rCtx[opColId] = { clean };
                                }
                            });
                        }
                    }

                    let resultDisplay = "";
                    let mathResult = 0;
                    let cellClass = 'border-r border-b border-fuchsia-900/30 p-2 whitespace-nowrap text-fuchsia-200 overflow-hidden text-ellipsis bg-fuchsia-950/20';

                    try {
                        if (calcConfig.operands && calcConfig.operands.length === 2) {
                            const opA = rCtx[calcConfig.operands[0]];
                            const opB = rCtx[calcConfig.operands[1]];

                            if (opA && opB && opA.clean !== null && opB.clean !== null && opA.clean !== undefined) {
                                let mathA = parseFloat(String(opA.clean).replace(',', '.'));
                                let mathB = parseFloat(String(opB.clean).replace(',', '.'));

                                if (isNaN(mathA)) mathA = 0;
                                if (isNaN(mathB)) mathB = 0;

                                if (calcConfig.macro === "PRICE_MINUS_DISCOUNT_PERCENT") {
                                    // Math.abs ensures we don't accidentally subtract a negative (which adds)
                                    const discountPercent = Math.abs(mathB);
                                    if (discountPercent === 0) {
                                        mathResult = mathA;
                                    } else {
                                        // Auto-detect if it's already a decimal (e.g., 0.10 for 10%) or whole number (10 for 10%)
                                        const actualPercentMultiplier = (discountPercent > 0 && discountPercent < 1)
                                            ? discountPercent
                                            : (discountPercent / 100);
                                        mathResult = mathA * (1 - actualPercentMultiplier);
                                    }
                                } else if (calcConfig.macro === "MULTIPLY") {
                                    mathResult = mathA * mathB;
                                } else if (calcConfig.macro === "SUBTRACT") {
                                    mathResult = mathA - mathB;
                                }
                                resultDisplay = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mathResult);
                            } else {
                                resultDisplay = "<span class='text-slate-600 italic text-[10px]'>N/A</span>";
                            }
                        }
                    } catch (e) {
                        console.error("Error evaluando Computed Column V5", e);
                    }

                    rowsHtml += `<td class="${cellClass}">${resultDisplay}</td>`;
                });
            }

            rowsHtml += '</tr>';
        }
        tbody.innerHTML = rowsHtml;
        if (window.lucide) window.lucide.createIcons();
    };

    container.onscroll = () => requestAnimationFrame(updateVisibleRows);
    updateVisibleRows();
}

function generatePreview() {
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

        const startRow = currentOffset ? currentOffset.row : 0;
        const rawSlice = currentSheetData.slice(startRow);

        const displayConfig = [];
        const sourceConfig = [];

        Object.keys(columnMapping).forEach(vColId => {
            const termId = columnMapping[vColId];
            const vCol = window.virtualColumns.find(v => v.id === vColId);
            if (!vCol) return;
            const dataIdx = vCol.dataIdx;

            if (termId && termId !== 'Ignorar Columna') {
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

                // [V3] PIPELINE HANDLING
                const rawRule = processingRules[vColId];
                // Ensure Array
                const rulesStack = rawRule ? (Array.isArray(rawRule) ? rawRule : [rawRule]) : [];

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
                                sourceIndex: dataIdx, // For reading raw value
                                transform: (val) => {
                                    if (!val) return '';
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
                                sourceIndex: dataIdx, // Read from raw data
                                transform: (val) => {
                                    const match = String(val || "").trim().match(regex);
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
                        sourceIndex: dataIdx,
                        transform: (val) => {
                            let currentVal = val;
                            // 🔥 Apply all active rules in order
                            for (const rule of rulesStack) {
                                if (rule.disabled) continue;
                                const strVal = String(currentVal || "").trim();

                                if (rule.type === 'sanitize_numbers') {
                                    currentVal = strVal.replace(/[^0-9]/g, '');
                                }
                                else if (rule.type === 'SANITIZER_NUMERIC_PIPE' || rule.tipo_regex === 'SANITIZER_NUMERIC_PIPE') {
                                    if (/[^0-9|/]/.test(strVal)) {
                                        currentVal = "";
                                    }
                                }
                                else if (rule.type === 'sanitize') {
                                    const fallback = rule.config?.replace_with || "0,00";
                                    let shouldReplace = false;
                                    if (!strVal || strVal === "undefined" || strVal === "null") shouldReplace = true;
                                    if (!shouldReplace && rule.config?.match_regex) {
                                        try {
                                            let p = rule.config.match_regex.replace(/\\\\/g, '\\');
                                            if (p.startsWith('/')) p = p.slice(1, -1);
                                            if (new RegExp(p, 'i').test(strVal)) shouldReplace = true;
                                        } catch (e) { }
                                    }
                                    if (shouldReplace) currentVal = fallback;
                                    else if (strVal.includes('.')) currentVal = strVal.replace(/\./g, ',');
                                }
                                else if (rule.type === 'format_number') {
                                    let num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
                                    if (!isNaN(num)) {
                                        currentVal = new Intl.NumberFormat('es-AR', {
                                            minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true
                                        }).format(num);
                                    }
                                }
                            }
                            return currentVal;
                        },
                        hasSwitch: false, // Legacy switch hidden, relying on Gear
                        switchColIdx: vColId,
                        sourceIndex: dataIdx,
                        virtualColId: vColId // Important for Gear ID
                    });
                }
            }
        });

        // --- F. COMPUTED COLUMNS LOGIC ---
        if (window.computedColumns && window.computedColumns.length > 0) {
            window.computedColumns.forEach(comp => {
                displayConfig.push({
                    label: comp.name,
                    isVirtual: true,
                    transform: (val, row) => {
                        try {
                            const parseVal = (v) => {
                                if (!v) return 0;
                                let s = String(v).trim().replace(/[^0-9,.-]/g, '');
                                if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
                                else if (s.includes(',')) s = s.replace(',', '.');
                                return parseFloat(s) || 0;
                            };
                            const valA = parseVal(row[comp.sourceA]);
                            const valB = parseVal(row[comp.sourceB]);
                            const result = valA * (1 - valB);
                            return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(result);
                        } catch (e) { return "ERR"; }
                    },
                    hasSwitch: false,
                    switchColIdx: -1
                });
            });
        }

        if (displayConfig.length === 0) {
            alert("Primero debes mapear al menos una columna.");
            return;
        }

        let sanitizedData = rawSlice.filter(row => {
            return sourceConfig.some(cfg => {
                const val = row[cfg.index];
                return val !== undefined && val !== null && String(val).trim() !== '';
            });
        });

        // 🔥 FILTER PIPELINE (CORRECTED: Apply transforms BEFORE filter)
        const seenValues = new Set();

        sanitizedData = sanitizedData.filter(row => {
            let keepRow = true;

            Object.keys(columnMapping).forEach(vColId => {
                const vCol = window.virtualColumns.find(v => v.id === vColId);
                if (!vCol) return;
                const dataIdx = vCol.dataIdx;

                const rawRule = processingRules[vColId];
                const rulesStack = rawRule ? (Array.isArray(rawRule) ? rawRule : [rawRule]) : [];

                let cellValue = row[dataIdx];
                let cleanValue = null; // V5 Math trap

                for (const rule of rulesStack) {
                    if (rule.disabled) continue;
                    const strVal = String(cellValue || "").trim();

                    // Apply Transforms
                    if (rule.type === 'sanitize_numbers') {
                        cellValue = strVal.replace(/[^0-9]/g, '');
                    }
                    else if (rule.type === 'SANITIZER_NUMERIC_PIPE' || rule.tipo_regex === 'SANITIZER_NUMERIC_PIPE') {
                        if (/[^0-9|/]/.test(strVal)) {
                            cellValue = "";
                        }
                    }
                    else if (rule.type === 'sanitize') {
                        const fallback = rule.config?.replace_with || ""; // Empty string for filter check
                        let shouldReplace = false;
                        if (!strVal || strVal === "undefined" || strVal === "null") shouldReplace = true;
                        if (!shouldReplace && rule.config?.match_regex) {
                            try {
                                let p = rule.config.match_regex.replace(/\\\\/g, '\\');
                                if (p.startsWith('/')) p = p.slice(1, -1);
                                if (new RegExp(p, 'i').test(strVal)) shouldReplace = true;
                            } catch (e) { }
                        }
                        if (shouldReplace) {
                            cellValue = fallback;
                        } else if (strVal.includes('.')) {
                            cellValue = strVal.replace(/\./g, ',');
                        }
                    }
                    else if (rule.type === 'FORMAT_DECIMAL_DISCOUNT' || rule.tipo_regex === 'FORMAT_DECIMAL_DISCOUNT') {
                        if (!strVal || strVal === "") {
                            cellValue = "0,00";
                            cleanValue = 0.0;
                        } else {
                            const normalized = strVal.replace(/,/g, '.');
                            cleanValue = parseFloat(normalized);
                            if (isNaN(cleanValue)) cleanValue = 0.0;
                            cellValue = strVal.replace(/\./g, ',');
                        }
                    }
                    else if (rule.type === 'FORMAT_PRICE_AR' || rule.tipo_regex === 'FORMAT_PRICE_AR') {
                        if (strVal && strVal !== "") {
                            let cleanStr = strVal.replace(/[^\d.,-]/g, '');
                            if (cleanStr !== "") {
                                const lastDot = cleanStr.lastIndexOf('.');
                                const lastComma = cleanStr.lastIndexOf(',');
                                let floatVal = 0;

                                if (lastDot === -1 && lastComma === -1) {
                                    floatVal = parseFloat(cleanStr);
                                } else if (lastDot > lastComma) {
                                    const withoutThousandSeps = cleanStr.replace(/,/g, '');
                                    floatVal = parseFloat(withoutThousandSeps);
                                } else {
                                    const withoutThousandSeps = cleanStr.replace(/\./g, '');
                                    const standardStr = withoutThousandSeps.replace(',', '.');
                                    floatVal = parseFloat(standardStr);
                                }

                                if (!isNaN(floatVal)) {
                                    cleanValue = floatVal;
                                    cellValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(floatVal);
                                } else {
                                    cellValue = "";
                                    cleanValue = null;
                                }
                            }
                        }
                    }
                } // End of rule loop

                // Default fallback parser if cleanValue wasn't explicitly trapped by a rule
                if (cleanValue === null && cellValue !== "") {
                    const parsed = parseFloat(String(cellValue).replace(/,/g, '.'));
                    if (!isNaN(parsed)) cleanValue = parsed;
                }

                // Save Rich Object output into row context for Phase 2
                if (!row._richContext) row._richContext = {};
                row._richContext[vColId] = { clean: cleanValue, display: cellValue };

                // 2. Now, check "Filter" rules against the TRANSFORMED value
                for (const rule of rulesStack) {
                    if (!keepRow) break;
                    if (rule.disabled) continue;

                    const strVal = String(cellValue || "").trim(); // Use transformed value

                    if (rule.type === 'row_filter' || rule.type === 'filter') {
                        if (rule.config?.exclude_empty && strVal === "") {
                            keepRow = false;
                        }
                        if (keepRow && rule.config?.exclude_regex) {
                            try {
                                let p = rule.config.exclude_regex.replace(/\\\\/g, '\\');
                                if (p.startsWith('/')) p = p.slice(1, -1);
                                if (new RegExp(p, 'i').test(strVal)) keepRow = false;
                            } catch (e) { }
                        }
                    }
                }
            });
            return keepRow;
        });

        currentSimData = sanitizedData;
        currentDisplayConfig = displayConfig;

        const container = document.getElementById('simulationTableContainer');
        if (!container) return;

        let optionsHtml = '<option value="ALL">Todos los Campos</option>';
        displayConfig.forEach((cfg, idx) => {
            optionsHtml += `<option value="${idx}">${cfg.label}</option>`;
        });

        const toolbar = `
            <div class="flex items-center gap-3 mb-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
                <div class="relative flex-grow">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"></i>
                    <input type="text" id="simSearchInput" placeholder="Filtrar datos..." oninput="filterSimulationData()" 
                        class="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
                </div>
                <select id="simSearchField" onchange="filterSimulationData()" class="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 max-w-[150px]">
                    ${optionsHtml}
                </select>
                
                <button onclick="saveSimulationConfig()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2">
                    <i data-lucide="save" class="w-3 h-3"></i> Guardar
                </button>

                <div class="text-[10px] text-slate-500 font-mono px-2 border-l border-slate-700">
                    <span id="simFilteredCount">${sanitizedData.length}</span> / ${sanitizedData.length}
                </div>
            </div>
            <div id="simTableScrollArea" class="overflow-auto max-h-[60vh]">
            </div>
        `;

        container.innerHTML = toolbar;
        renderSimulationTable(sanitizedData);

        document.getElementById('simulationModal').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons({ root: container });

        document.getElementById('simMeta').innerHTML = `
            <span class="text-slate-400">Total Filas Útiles:</span> <span class="text-white font-bold">${sanitizedData.length}</span> 
            <span class="text-slate-600 mx-2">|</span> 
            <span class="text-slate-400">Columnas:</span> <span class="text-white font-bold">${displayConfig.length}</span>
        `;

    } catch (error) {
        console.error("Critical Preview Error:", error);
        alert("Error en Previsualizador: " + error.message);
    }
}

function filterSimulationData() {
    const rawQuery = document.getElementById('simSearchInput').value.toLowerCase().trim();
    const fieldIdx = document.getElementById('simSearchField').value;
    const countEl = document.getElementById('simFilteredCount');

    if (!rawQuery) {
        renderSimulationTable(currentSimData);
        if (countEl) countEl.innerText = currentSimData.length;
        return;
    }

    const terms = rawQuery.split(/\s+/).filter(t => t.length > 0);

    const filtered = currentSimData.filter(row => {
        return terms.every(term => {
            if (fieldIdx === "ALL") {
                return currentDisplayConfig.some(cfg => {
                    const val = cfg.transform(row[cfg.sourceIndex], row);
                    return String(val).toLowerCase().includes(term);
                });
            } else {
                const cfg = currentDisplayConfig[parseInt(fieldIdx)];
                if (!cfg) return false;
                const val = cfg.transform(row[cfg.sourceIndex], row);
                return String(val).toLowerCase().includes(term);
            }
        });
    });

    renderSimulationTable(filtered);
    if (countEl) countEl.innerText = filtered.length;
}

function renderSimulationTable(data) {
    const scrollArea = document.getElementById('simTableScrollArea');
    if (!scrollArea) return;

    let html = "<table class='min-w-full text-xs text-slate-300 font-mono'><thead><tr class='bg-slate-950 sticky top-0'>";

    currentDisplayConfig.forEach(cfg => {
        let content = `<span>${cfg.label}</span>`;
        let actions = '';
        let rulesBadgesHtml = '';

        // [New] Gear Icon & Pipeline Quick Toggles
        if (cfg.virtualColId) {
            actions += `
                <button onclick="window.ViewerUI.openRulesManager('${cfg.virtualColId}', this)" class="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800" title="Gestionar Reglas">
                    <i data-lucide="settings-2" class="w-3 h-3"></i>
                </button>
            `;
            
            // Generate Interactive Badges for Applied Rules
            if (window.processingRules && window.processingRules[cfg.virtualColId]) {
                let rulesStack = window.processingRules[cfg.virtualColId];
                if (!Array.isArray(rulesStack)) rulesStack = [rulesStack];
                
                rulesStack.forEach((r, idx) => {
                    const isOff = r.disabled;
                    const badgeColor = isOff 
                        ? 'bg-slate-800 text-slate-500 border-slate-700 line-through grayscale opacity-50' 
                        : 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30 font-bold';
                    const iconType = isOff ? 'zap-off' : 'zap';
                    
                    const displayType = (r.type === 'split' || r.type === 'regex_split') ? 'Split' : (r.type || 'Regla');
                    
                    rulesBadgesHtml += `
                        <button onclick="window.ViewerUI.toggleRuleInSimulation('${cfg.virtualColId}', ${idx})" 
                                class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border ${badgeColor} hover:brightness-125 hover:-translate-y-px transition-all text-left max-w-[120px] shadow-sm shadow-black/20"
                                title="${isOff ? 'Regla Inactiva (clic para Encender)' : 'Regla Activa (clic para Apagar)'}">
                            <i data-lucide="${iconType}" class="w-2.5 h-2.5 shrink-0"></i>
                            <span class="truncate">${displayType}</span>
                        </button>
                    `;
                });
            }
        }

        let thContent = `
            <div class="flex flex-col gap-1.5 min-h-[40px]">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-bold truncate" title="${cfg.label}">${cfg.label}</div>
                    <div class="flex items-center shrink-0">
                        ${actions}
                    </div>
                </div>
                ${rulesBadgesHtml ? `<div class="flex flex-wrap gap-1 mt-1 border-t border-slate-800 pt-1.5">${rulesBadgesHtml}</div>` : ''}
            </div>
        `;

        let thClass = "p-2 border border-slate-700 text-left align-top ";
        thClass += cfg.isVirtual ? "bg-emerald-900/10 text-emerald-300 border-emerald-500/20" : "bg-blue-900/20 text-blue-300";
        html += `<th class="${thClass}">${thContent}</th>`;
    });

    // Fase 2 - Headers (Computed Columns)
    if (Array.isArray(window.computedColumns)) {
        window.computedColumns.forEach((calcConfig, index) => {
            let thContent = `
                <div class="flex items-center justify-between gap-2 text-fuchsia-300">
                    <i data-lucide="calculator" class="w-3 h-3"></i>
                    <div class="font-bold truncate" title="${calcConfig.masterField.nombre_campo}">${calcConfig.masterField.nombre_campo}</div>
                    <div class="flex items-center shrink-0">
                        <button onclick="window.ViewerUI.deleteComputedColumn('${index}')" class="text-fuchsia-400 hover:text-red-400 p-1" title="Eliminar Cálculo">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
            `;
            html += `<th class="p-2 border border-fuchsia-900/50 bg-fuchsia-900/20 align-middle">${thContent}</th>`;
        });
    }

    html += "</tr></thead><tbody>";

    data.forEach((row) => {
        html += "<tr class='hover:bg-slate-800/50 border-b border-slate-800'>";

        // Fase 1 - Render
        currentDisplayConfig.forEach(cfg => {
            const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
            const finalVal = cfg.transform(rawVal, row);
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${finalVal}</td>`;
        });

        // Fase 2 - Cálculo al vuelo de celdas Computed
        if (Array.isArray(window.computedColumns) && window.computedColumns.length > 0) {
            window.computedColumns.forEach(calcConfig => {
                const rCtx = row._richContext || {};

                let resultDisplay = "";

                try {
                    // Solo podemos operar si tenemos ambos operandos
                    if (calcConfig.operands && calcConfig.operands.length === 2) {
                        const opA = rCtx[calcConfig.operands[0]];
                        const opB = rCtx[calcConfig.operands[1]];

                        // Validar que existen en la fila, y que tienen valores limpios matemáticos
                        if (opA && opB && opA.clean !== null && opB.clean !== null) {
                            let mathResult = 0;
                            // Ejecutar Macro Matemática (Ej. Precio Final = Precio * (1 - Descuento/100))
                            if (calcConfig.macro === "PRICE_MINUS_DISCOUNT_PERCENT") {
                                mathResult = opA.clean * (1 - (opB.clean / 100));
                            } else if (calcConfig.macro === "MULTIPLY") {
                                mathResult = opA.clean * opB.clean;
                            } else if (calcConfig.macro === "SUBTRACT") {
                                mathResult = opA.clean - opB.clean;
                            }

                            // Formatear el resultado usando el estándar local
                            resultDisplay = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mathResult);
                        } else {
                            resultDisplay = "<span class='text-slate-600 italic'>Err: N/A</span>";
                        }
                    }
                } catch (e) {
                    console.error("Error evaluando Fase 2", e);
                }

                html += `<td class="p-2 border-r border-fuchsia-900/30 text-fuchsia-100 whitespace-nowrap bg-fuchsia-950/20">${resultDisplay}</td>`;
            });
        }

        html += "</tr>";
    });
    html += "</tbody></table>";
    scrollArea.innerHTML = html;
}

window.renderSimulationTable = renderSimulationTable;

// --- DYNAMIC SIMULATION TOGGLES ---
window.ViewerUI = window.ViewerUI || {};
window.ViewerUI.toggleRuleInSimulation = function(vColId, ruleIndex) {
    if (!window.processingRules || !window.processingRules[vColId]) return;
    let rules = window.processingRules[vColId];
    if (!Array.isArray(rules)) rules = [rules];
    if (rules[ruleIndex]) {
        // Toggle the explicit disabled flag
        rules[ruleIndex].disabled = !rules[ruleIndex].disabled;
        window.processingRules[vColId] = rules;
        
        // Retrigger the simulation modal processing directly
        if (typeof window.generatePreview === 'function') {
            window.generatePreview();
        }
        
        // Sync the workshop left panel UI implicitly if it's currently showing that column
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {
            window.viewerRuleWorkshop.syncVisuals();
        }
    }
};

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

    // Force full table re-render to propagate width to all body cells
    if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
        window.renderVirtualTable(window.currentSheetData);
    }

    // Silent auto-save to backend
    if (typeof window.saveSimulationConfig === 'function') {
        window.saveSimulationConfig(null, true);
    }
}

// [VIGÍA DE CONTROL]
console.log("🎨 [ViewerRender] Motor Gráfico Iniciado (Con Drag & Drop Resizing v1.0).");