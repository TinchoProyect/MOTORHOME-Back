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

    for (let j = 0; j < maxCols; j++) {
        let originalVal = headerRow[j] || (j === 0 ? '#' : `Col ${j + 1}`);
        let mappedType = columnMapping[j];

        let toggleHtml = '';
        const hasRule = processingRules[j];
        if (mappingMode && hasRule) {
            const isOff = hasRule.disabled;
            toggleHtml = `
                 <button onclick="event.stopPropagation(); toggleProcessingRule(${j})" class="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${isOff ? 'bg-slate-700 text-slate-400' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'} hover:opacity-80 transition-all border border-transparent hover:border-white/20">
                    ${isOff ? 'OFF' : 'ON'}
                 </button>`;
        }

        let thContent = originalVal;
        let thClass = "bg-slate-800 text-blue-400 font-bold uppercase border border-slate-700 p-2 sticky top-0 z-20 text-left overflow-hidden text-ellipsis whitespace-nowrap";

        if (mappingMode) {
            const isMapped = !!mappedType;
            const btnClass = isMapped ? 'bg-blue-600/10 border-blue-500/50 text-blue-300' : 'bg-slate-800/50 text-slate-500 hover:text-blue-400';
            thClass = "bg-slate-950 p-1 sticky top-0 z-20";
            thContent = `<div class="flex items-center gap-1 h-full">
                <button onclick="openColumnMenu_v2(${j}, this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                    <span class="truncate font-bold text-[10px] uppercase">${mappedType || originalVal}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                </button>
                ${toggleHtml}
            </div>`;
        } else {
            if (mappedType && mappedType !== 'Ignorar Columna') {
                thContent = `<span class="text-emerald-400">${mappedType}</span> <span class="text-slate-600 text-[9px] ml-1">(${originalVal})</span>`;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType === 'Ignorar Columna') {
                thClass += " opacity-40 grayscale decoration-line-through";
            }
        }
        headerHtml += `<th class="${thClass}" style="height: ${HEADER_HEIGHT}px">${thContent}</th>`;
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

        for (let i = startDataIndex; i < endIndex; i++) {
            const row = data[i] || [];
            rowsHtml += `<tr style="height: ${ROW_HEIGHT}px;" class="hover:bg-slate-800/50">`;
            for (let j = 0; j < maxCols; j++) {
                const cellVal = row[j] !== undefined ? row[j] : '';
                let cellClass = 'border border-slate-800 p-2 whitespace-nowrap text-slate-400 overflow-hidden text-ellipsis transition-colors duration-150';

                const minRow = currentOffset ? currentOffset.row : 0;
                const minCol = currentOffset ? currentOffset.col : 0;
                const isIgnored = (i < minRow) || (j < minCol);
                const isAnchor = (i === minRow && j === minCol);

                if (isIgnored) cellClass += " opacity-25 grayscale bg-slate-950/50";
                if (!offsetSelectionMode && isIgnored) cellClass += " pointer-events-none select-none";
                if (isAnchor) cellClass += " border-2 border-amber-500 font-bold bg-amber-900/20 text-amber-500";
                if (offsetSelectionMode) cellClass += " cursor-crosshair hover:bg-amber-500/30";

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

                const rule = processingRules[colIdx];
                const isSimActive = rule ? (rule.isSimActive !== undefined ? rule.isSimActive : true) : false;

                // --- 1. RULE: SPLIT ---
                if (rule && isSimActive && rule.type === 'split') {
                    rule.fields.forEach((fieldId, subIdx) => {
                        const fieldObj = nomenclatureCache.find(t => t.id === fieldId);
                        const fieldName = fieldObj ? fieldObj.termino : fieldId;

                        displayConfig.push({
                            label: fieldName,
                            isVirtual: true,
                            sourceIndex: colIdx,
                            transform: (val) => {
                                if (!val) return '';
                                const valStr = String(val);
                                const parts = valStr.split(rule.delimiter);
                                return parts[subIdx] ? parts[subIdx].trim() : '';
                            },
                            hasSwitch: subIdx === 0,
                            switchState: true,
                            switchColIdx: colIdx
                        });
                    });
                }
                // --- 2. RULE: REGEX SPLIT ---
                else if (rule && isSimActive && rule.type === 'regex_split') {
                    const targets = [];
                    if (rule.fields && rule.fields.length > 0) {
                        rule.fields.forEach(fid => {
                            const t = nomenclatureCache.find(x => x.id === fid);
                            targets.push(t ? t.termino : "Campo Dinámico");
                        });
                    }
                    if (targets.length === 0 && rule.target_labels) {
                        targets.push(...rule.target_labels);
                    }

                    let patternStr = rule.pattern;
                    if (patternStr) {
                        patternStr = patternStr.replace(/\\\\/g, '\\');
                        if (patternStr.startsWith('/')) patternStr = patternStr.slice(1);
                        if (patternStr.endsWith('/i')) patternStr = patternStr.slice(0, -2);
                        else if (patternStr.endsWith('/')) patternStr = patternStr.slice(0, -1);

                        const regex = new RegExp(patternStr, 'i');

                        targets.forEach((label, subIdx) => {
                            displayConfig.push({
                                label: label,
                                isVirtual: true,
                                sourceIndex: colIdx,
                                transform: (val) => {
                                    if (!val) return '';
                                    const valStr = String(val).trim();
                                    const match = valStr.match(regex);
                                    if (match) {
                                        const fullMatch = match[0];
                                        const presentation = fullMatch.trim();
                                        const description = valStr.replace(fullMatch, "").trim();
                                        return subIdx === 0 ? description : presentation;
                                    } else {
                                        return subIdx === 0 ? valStr : "";
                                    }
                                },
                                hasSwitch: subIdx === 0,
                                switchState: true,
                                switchColIdx: colIdx
                            });
                        });
                    }
                }
                // --- 3. RULE: SANITIZE NUMBERS (SOLO NÚMEROS) ---
                else if (rule && isSimActive && rule.type === 'sanitize_numbers') {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => String(val || "").replace(/[^0-9]/g, ''),
                        hasSwitch: true, // ✅ TIENE SWITCH
                        switchState: true,
                        switchColIdx: colIdx
                    });
                }
                // --- 4. RULE: SANITIZE GENERIC ---
                else if (rule && isSimActive && rule.type === 'sanitize') {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => {
                            const strVal = String(val || "").trim();
                            const fallback = rule.config?.replace_with || "0,00";
                            if (strVal === "" || strVal.toLowerCase() === "undefined" || strVal.toLowerCase() === "null") return fallback;
                            if (rule.config?.match_regex) {
                                try {
                                    let p = rule.config.match_regex;
                                    if (p.startsWith('/')) p = p.slice(1);
                                    if (p.endsWith('/')) p = p.slice(0, -1);
                                    p = p.replace(/\\\\/g, '\\');
                                    if (new RegExp(p, 'i').test(strVal)) return fallback;
                                } catch (e) { }
                            }
                            return val && String(val).includes('.') ? String(val).replace(/\./g, ',') : val;
                        },
                        hasSwitch: true, // ✅ TIENE SWITCH
                        switchState: rule.isSimActive !== false,
                        switchColIdx: colIdx
                    });
                }
                // --- 5. RULE: FORMAT NUMBER ---
                else if (rule && isSimActive && rule.type === 'format_number') {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => {
                            const strVal = String(val);
                            let num = parseFloat(strVal);
                            if (isNaN(num)) {
                                num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
                            }
                            if (!isNaN(num)) {
                                return new Intl.NumberFormat('es-AR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true
                                }).format(num);
                            }
                            return val;
                        },
                        hasSwitch: true, // ✅ TIENE SWITCH
                        switchState: rule.isSimActive !== false,
                        switchColIdx: colIdx
                    });
                }
                // --- 6. DEFAULT (SIN REGLA) ---
                else {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => val,
                        hasSwitch: false, // 🚫 NO TIENE SWITCH (CORRECCIÓN)
                        switchState: false,
                        switchColIdx: colIdx
                    });
                }
            }
        });

        // --- F. COMPUTED COLUMNS LOGIC (v2.5) ---
        if (window.computedColumns && window.computedColumns.length > 0) {
            window.computedColumns.forEach(comp => {
                displayConfig.push({
                    label: comp.name,
                    isVirtual: true,
                    // Note: We use a wrapper to access the full ROW
                    transform: (val, row) => {
                        try {
                            const parseVal = (v) => {
                                if (!v) return 0;
                                let s = String(v).trim();
                                if (!isNaN(s)) return parseFloat(s);
                                // Limpieza agresiva de moneda
                                s = s.replace(/[^0-9,.-]/g, '');
                                if (s.includes(',') && s.includes('.')) {
                                    s = s.replace(/\./g, '').replace(',', '.');
                                } else if (s.includes(',')) {
                                    s = s.replace(',', '.');
                                }
                                return parseFloat(s) || 0;
                            };

                            const valA = parseVal(row[comp.sourceA]); // Precio
                            const valB = parseVal(row[comp.sourceB]); // Descuento

                            // Lógica: Precio * (1 - Descuento)
                            const result = valA * (1 - valB);

                            return new Intl.NumberFormat('es-AR', {
                                minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true
                            }).format(result);

                        } catch (e) { return "ERR"; }
                    },
                    hasSwitch: true,
                    switchState: true,
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

        // 🔥 FILTRADO REAL + ANTI-DUPLICADOS (REGEX FIX v2.6)
        const seenValues = new Set();

        sanitizedData = sanitizedData.filter(row => {
            let keepRow = true;
            Object.keys(columnMapping).forEach(key => {
                const colIdx = parseInt(key);
                const rule = processingRules[colIdx];

                if (rule && (rule.type === 'filter' || rule.type === 'row_filter') && rule.isSimActive !== false) {
                    const cellValue = row[colIdx];
                    if (rule.config?.exclude_empty) {
                        if (!cellValue || String(cellValue).trim() === '') keepRow = false;
                    }
                    if (keepRow && rule.config?.exclude_regex) {
                        try {
                            let p = rule.config.exclude_regex;
                            if (p.startsWith('/')) p = p.slice(1);
                            if (p.endsWith('/')) p = p.slice(0, -1);
                            p = p.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6
                            if (new RegExp(p, 'i').test(String(cellValue))) keepRow = false;
                        } catch (e) { console.error("Filter Regex Error", e); }
                    }
                    if (keepRow && rule.config?.unique) {
                        const uniqueKey = String(cellValue || "").toUpperCase().trim();
                        if (seenValues.has(uniqueKey)) {
                            keepRow = false;
                        } else {
                            seenValues.add(uniqueKey);
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
                    const val = cfg.transform(row[cfg.sourceIndex], row); // 🔥 PASS ROW (v2.5)
                    return String(val).toLowerCase().includes(term);
                });
            } else {
                const cfg = currentDisplayConfig[parseInt(fieldIdx)];
                if (!cfg) return false;
                const val = cfg.transform(row[cfg.sourceIndex], row); // 🔥 PASS ROW (v2.5)
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
        let content = cfg.label;
        if (cfg.hasSwitch) {
            const checked = cfg.switchState ? 'checked' : '';
            content = `
                <div class="flex items-center gap-2 justify-between">
                    <span>${cfg.label}</span>
                    <label class="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" onclick="toggleSimulationRule(${cfg.switchColIdx})" ${checked} class="sr-only peer">
                        <div class="w-7 h-3.5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-500 hover:bg-slate-600"></div>
                    </label>
                </div>
            `;
        }
        let thClass = "p-2 border border-slate-700 text-left align-middle ";
        thClass += cfg.isVirtual ? "bg-emerald-900/10 text-emerald-300 border-emerald-500/20" : "bg-blue-900/20 text-blue-300";
        html += `<th class="${thClass}">${content}</th>`;
    });
    html += "</tr></thead><tbody>";

    data.forEach((row) => {
        html += "<tr class='hover:bg-slate-800/50 border-b border-slate-800'>";
        currentDisplayConfig.forEach(cfg => {
            const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
            const finalVal = cfg.transform(rawVal, row); // 🔥 PASS ROW (v2.5)
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${finalVal}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody></table>";
    scrollArea.innerHTML = html;
}

// [VIGÍA DE CONTROL]
console.log("🎨 [ViewerRender] Motor Gráfico Iniciado.");
