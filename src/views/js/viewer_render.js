/**
 * VIEWER RENDER - Virtual Scroller & Visual Engine
 * Extracted from viewer_engine_rescatado.js
 */

function renderVirtualTable(originalData) {
    // 🔥 MODO MUERTITO: Tabla principal estática (RAW)
    const data = originalData;

    // 🔥 STATE EXPOSURE FOR SATELLITE MODULES (v2.5)
    window.viewerState = { mapping: columnMapping, data: currentSheetData };

    const container = document.getElementById('excelContainer');

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
    table.className = 'w-full border-collapse text-[11px] font-mono absolute top-0 left-0';
    table.style.tableLayout = 'fixed';
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

    for (let j = 0; j < maxCols; j++) {
        let originalVal = headerRow[j] || (j === 0 ? '#' : `Col ${j + 1}`);
        let mappedType = columnMapping[j];

        // Legacy toggle removed from main view

        let thContent = originalVal;
        let thClass = "bg-slate-800 text-blue-400 font-bold uppercase border border-slate-700 p-2 sticky top-0 z-20 text-left overflow-hidden text-ellipsis whitespace-nowrap";

        // Global check: mappingMode comes from viewer_mapping.js
        if (window.mappingMode || typeof mappingMode !== 'undefined' && mappingMode) {
            const isMapped = !!mappedType;
            const btnClass = isMapped ? 'bg-blue-600/10 border-blue-500/50 text-blue-300' : 'bg-slate-800/50 text-slate-500 hover:text-blue-400';
            thClass = "bg-slate-950 p-1 sticky top-0 z-20";
            thContent = `<div class="flex items-center gap-1 h-full">
                <button onclick="openColumnMenu_v2(${j}, this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                    <span class="truncate font-bold text-[10px] uppercase">${mappedType || originalVal}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                </button>
            </div>`;
        } else {
            if (mappedType && mappedType !== 'Ignorar Columna') {
                thContent = `<span class="text-emerald-400">${mappedType}</span> <span class="text-slate-600 text-[9px] ml-1">(${originalVal})</span>`;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType === 'Ignorar Columna') {
                thClass += " opacity-40 grayscale decoration-line-through";
            }

            // [FIX] Add Visual Feedback for Offset Mode on Headers
            if (offsetSelectionMode) {
                thClass += " cursor-crosshair hover:bg-amber-500/30 border-amber-500/50";
                // Add Anchor style if this is the selected offset
                if (currentOffset && currentOffset.row === 0 && currentOffset.col === j) {
                    thClass += " border-2 border-amber-500 bg-amber-900/40 text-amber-400";
                }
            }
        }

        // [FIX] Allow clicking header to set offset (Row 0)
        // Only if NOT in mapping mode (because mapping mode uses buttons inside th)
        const isHeaderMapping = (window.mappingMode || typeof mappingMode !== 'undefined' && mappingMode);
        const clickAttr = (!isHeaderMapping && window.offsetSelectionMode) ? `onclick="handleOffsetClick(0, ${j})"` : '';

        // ETL Preview Injection - Elevate Active Column
        if (activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === j) {
            thClass = thClass.replace(/z-20/g, ''); // Remove sticky conflict
            thClass += " relative z-[60] bg-slate-800 shadow-[0_-5px_15px_rgba(59,130,246,0.3)] border-x border-blue-500/50";
        }

        headerHtml += `<th class="${thClass}" style="height: ${HEADER_HEIGHT}px" ${clickAttr}>${thContent}</th>`;
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
            rowsHtml += `<tr style="height: ${ROW_HEIGHT}px;" class="hover:bg-slate-800/50">`;
            for (let j = 0; j < maxCols; j++) {
                let cellVal = row[j] !== undefined ? row[j] : '';
                let cellClass = 'border border-slate-800 p-2 whitespace-nowrap text-slate-400 overflow-hidden text-ellipsis transition-colors duration-150';

                const minRow = window.currentOffset ? window.currentOffset.row : 0;
                const minCol = window.currentOffset ? window.currentOffset.col : 0;
                const isIgnored = (i < minRow) || (j < minCol);
                const isAnchor = (i === minRow && j === minCol);

                if (isIgnored) cellClass += " opacity-25 grayscale bg-slate-950/50";
                if (!window.offsetSelectionMode && isIgnored) cellClass += " pointer-events-none select-none";
                if (isAnchor) cellClass += " border-2 border-amber-500 font-bold bg-amber-900/20 text-amber-500";
                if (window.offsetSelectionMode) cellClass += " cursor-crosshair hover:bg-amber-500/30";

                // ETL Preview Injection
                if (activeEtlState && activeEtlState.isOpen && activeEtlState.colIndex === j) {
                    if (i === startDataIndex) console.log(`[ETL RENDER] Pintando celda en fila ${i} para la columna activa ${j}`);

                    cellClass += " relative z-[60] bg-slate-800 shadow-[0_0_15px_rgba(59,130,246,0.3)] border-x border-blue-500/50";

                    if (activeEtlState.pipeline && activeEtlState.pipeline.length > 0 && window.viewerETL) {
                        const rawVal = String(cellVal);
                        const { result, rejected } = window.viewerETL.transformCell(rawVal, activeEtlState.pipeline);

                        if (rejected) {
                            cellClass += " opacity-30 grayscale bg-red-500/10";
                            cellVal = `
                                <div class="flex items-center gap-2 line-through text-red-400">
                                    <span class="truncate" title="${rawVal}">${rawVal}</span>
                                    <i data-lucide="ban" class="w-4 h-4 flex-shrink-0"></i>
                                </div>
                            `;
                        } else if (result !== rawVal) {
                            cellVal = `
                                <div class="flex flex-col gap-1 py-1">
                                    <span class="text-[10px] text-slate-500 line-through truncate" title="${rawVal}">${rawVal}</span>
                                    <div class="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50">
                                        <i data-lucide="arrow-down-right" class="w-3 h-3 flex-shrink-0"></i>
                                        <span class="truncate text-xs" title="${result}">${result || '<vacío>'}</span>
                                    </div>
                                </div>
                            `;
                        }
                    }
                }

                rowsHtml += `<td onclick="handleOffsetClick(${i}, ${j})" class="${cellClass}">${cellVal}</td>`;
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

        Object.keys(columnMapping).forEach(key => {
            const colIdx = parseInt(key);
            const termId = columnMapping[key];

            if (termId && termId !== 'Ignorar Columna') {
                sourceConfig.push({ index: colIdx });

                const termObj = nomenclatureCache.find(t => t.id === termId);
                const termName = termObj ? termObj.termino : termId;

                // [V3] PIPELINE HANDLING
                const rawRule = processingRules[colIdx];
                // Ensure Array
                const rulesStack = rawRule ? (Array.isArray(rawRule) ? rawRule : [rawRule]) : [];

                // Check for Structure Modifying Rules (Split) - Toma prioridad
                const splitRule = rulesStack.find(r => !r.disabled && (r.type === 'split' || r.type === 'regex_split'));

                if (splitRule) {
                    // --- SPLIT LOGIC ---
                    if (splitRule.type === 'split') {
                        splitRule.fields.forEach((fieldId, subIdx) => {
                            const fieldObj = nomenclatureCache.find(t => t.id === fieldId);
                            const fieldName = fieldObj ? fieldObj.termino : fieldId;
                            displayConfig.push({
                                label: fieldName,
                                isVirtual: true,
                                sourceIndex: colIdx,
                                transform: (val) => {
                                    if (!val) return '';
                                    const parts = String(val).split(splitRule.delimiter);
                                    return parts[subIdx] ? parts[subIdx].trim() : '';
                                },
                                hasSwitch: false, // Managed via Gear
                                switchColIdx: colIdx
                            });
                        });
                    } else if (splitRule.type === 'regex_split') {
                        const targets = [];
                        if (splitRule.fields) splitRule.fields.forEach(fid => {
                            const t = nomenclatureCache.find(x => x.id === fid);
                            targets.push(t ? t.termino : "Campo Dinámico");
                        });
                        let patternStr = splitRule.pattern.replace(/\\\\/g, '\\');
                        if (patternStr.startsWith('/')) patternStr = patternStr.slice(1);
                        if (patternStr.endsWith('/')) patternStr = patternStr.slice(0, -1);
                        const regex = new RegExp(patternStr, 'i');

                        targets.forEach((label, subIdx) => {
                            displayConfig.push({
                                label: label,
                                isVirtual: true,
                                sourceIndex: colIdx,
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
                                switchColIdx: colIdx
                            });
                        });
                    }
                } else {
                    // --- PIPELINE TRANSFORM (Chain) ---
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => {
                            let currentVal = val;
                            // 🔥 Apply all active rules in order
                            for (const rule of rulesStack) {
                                if (rule.disabled) continue;
                                const strVal = String(currentVal || "").trim();

                                if (rule.type === 'sanitize_numbers') {
                                    currentVal = strVal.replace(/[^0-9]/g, '');
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
                        switchColIdx: colIdx,
                        sourceIndex: colIdx // Important for Gear ID
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

            Object.keys(columnMapping).forEach(key => {
                const colIdx = parseInt(key);
                const rawRule = processingRules[colIdx];
                const rulesStack = rawRule ? (Array.isArray(rawRule) ? rawRule : [rawRule]) : [];

                // 1. First, apply "Transformation" rules to get the REAL value in memory
                let cellValue = row[colIdx];

                for (const rule of rulesStack) {
                    if (rule.disabled) continue;
                    const strVal = String(cellValue || "").trim();

                    // Apply Transforms
                    if (rule.type === 'sanitize_numbers') {
                        cellValue = strVal.replace(/[^0-9]/g, '');
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
                        if (shouldReplace) cellValue = fallback;
                        else if (strVal.includes('.')) cellValue = strVal.replace(/\./g, ',');
                    }
                }

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

        // [New] Gear Icon for Pipeline Manager
        if (cfg.sourceIndex >= 0) {
            actions += `
                <button onclick="window.ViewerUI.openRulesManager(${cfg.sourceIndex}, this)" class="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800" title="Gestionar Reglas">
                    <i data-lucide="settings-2" class="w-3 h-3"></i>
                </button>
            `;
        }

        let thContent = `
            <div class="flex items-center justify-between gap-2">
                <div class="font-bold truncate">${cfg.label}</div>
                <div class="flex items-center shrink-0">
                    ${actions}
                </div>
            </div>
        `;

        let thClass = "p-2 border border-slate-700 text-left align-middle ";
        thClass += cfg.isVirtual ? "bg-emerald-900/10 text-emerald-300 border-emerald-500/20" : "bg-blue-900/20 text-blue-300";
        html += `<th class="${thClass}">${thContent}</th>`;
    });
    html += "</tr></thead><tbody>";

    data.forEach((row) => {
        html += "<tr class='hover:bg-slate-800/50 border-b border-slate-800'>";
        currentDisplayConfig.forEach(cfg => {
            const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
            const finalVal = cfg.transform(rawVal, row);
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${finalVal}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody></table>";
    scrollArea.innerHTML = html;
}

window.renderSimulationTable = renderSimulationTable;

// [VIGÍA DE CONTROL]
console.log("🎨 [ViewerRender] Motor Gráfico Iniciado.");