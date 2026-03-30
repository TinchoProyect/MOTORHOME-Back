/**
 * VIEWER ETL PREVIEW (V4)
 * Phase 4: Client-Side Transformation Simulator
 */

// CORE ALGORITHM: Apply pipeline sequentially
export function transformCell(rawValue, pipeline) {
    if (rawValue === undefined || rawValue === null) rawValue = "";
    let currentValue = String(rawValue).trim();
    let isRejected = false;

    // [V5] Rich Object Support
    let cleanValue = null; // Stores pure mathematical float if evaluated

    // [V5.20 FIX] Absolute Overrides: Evaluate CUSTOM_REPLACE local rules FIRST against RAW value.
    const customRules = pipeline.filter(r => r.tipo_regex && r.tipo_regex.startsWith('CUSTOM_REPLACE:'));
    const genericRules = pipeline.filter(r => !(r.tipo_regex && r.tipo_regex.startsWith('CUSTOM_REPLACE:')));

    let hasAbsoluteOverride = false;

    for (const rule of customRules) {
        if (rule.disabled) continue;
        if (isRejected) break;
        try {
            const payload = rule.tipo_regex.replace('CUSTOM_REPLACE:', '');
            const parts = payload.split('|||');
            const searchStr = parts[0] || '';
            let replaceStr = parts[1] || '';
            let matched = false;

            if (searchStr.startsWith('/') && searchStr.lastIndexOf('/') > 0) {
                const flags = searchStr.slice(searchStr.lastIndexOf('/') + 1);
                const pattern = searchStr.slice(1, searchStr.lastIndexOf('/'));
                const regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
                if (regex.test(currentValue)) {
                    matched = true;
                    currentValue = currentValue.replace(regex, replaceStr);
                }
            } else {
                const cv = String(currentValue).trim();
                const sv = String(searchStr).trim();

                if (sv === "" && cv === "") {
                    matched = true;
                    currentValue = replaceStr === '|||SPLIT|||' ? '' : replaceStr;
                }
                else if (sv !== "" && cv === sv) {
                    matched = true;
                    currentValue = replaceStr === '|||SPLIT|||' ? '' : replaceStr;
                }
                else if (sv !== "" && cv.includes(sv)) {
                    matched = true;
                    if (replaceStr === '|||SPLIT|||') {
                        currentValue = cv.split(sv).join('');
                    } else {
                        currentValue = cv.split(sv).join(replaceStr);
                    }
                }
            }

            if (matched) {
                if (window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1') {
                    console.log(`[VIGIA AUDITOR ETL] MATCH REGLA LOCAL PRE-PIPELINE | Buscar: '${searchStr}', Reemplazar: '${replaceStr}' | Celda Resultante: '${currentValue}'`);
                }
                hasAbsoluteOverride = true;
                break;
            }
        } catch (e) {
            console.warn(`[ETL] Error procesando regla custom preliminar ${rule.nombre_regla}:`, e);
        }
        currentValue = currentValue.trim();
    }

    if (!hasAbsoluteOverride) {
        for (const rule of genericRules) {
            if (rule.disabled) continue;
            if (isRejected) break; // Si ya fue filtrada, saltar resto

            // Reglas Nativas
            if (rule.tipo_regex === 'SANITIZER_NUMERIC') {
                currentValue = currentValue.replace(/[^0-9.,-]/g, '');
            }
            else if (rule.tipo_regex === 'SANITIZER_NUMERIC_PIPE') {
                if (/[^0-9|/]/.test(currentValue)) {
                    currentValue = "";
                    isRejected = true;
                }
            }
            else if (rule.tipo_regex === 'FILTER_EMPTY') {
                if (currentValue.trim() === "") isRejected = true;
            }
            else if (rule.tipo_regex === 'CLEAR_ZERO_VALUES') {
                const tv = currentValue.trim();
                if (tv === '0' || tv === '0,00' || tv === '0.00' || tv === '$0,00' || tv === '$ 0,00' || tv === '0,0') {
                    currentValue = "";
                }
            }
            else if (rule.tipo_regex === 'TRANSFORM_UPPERCASE') {
                currentValue = currentValue.toUpperCase();
            }
            else if (rule.tipo_regex === 'VALIDATE_NUMERIC') {
                // Rechaza completamente si hay caracteres no numéricos
                if (!/^\d+$/.test(currentValue)) {
                    currentValue = "";
                    isRejected = true;
                }
            }
            else if (rule.tipo_regex === 'EXTRACT_DESCRIPTION_PACKAGE') {
                const packageRegex = /\s+(\d+\s*x\s*\d+|x\s*\d+|por\s+\d+).*$/i;
                currentValue = currentValue.replace(packageRegex, '');
            }
            else if (rule.tipo_regex === 'EXTRACT_PACKAGE_UNITS') {
                const explicitMatch = currentValue.match(/(\d+)\s*[xX]\s*\d+/);
                if (explicitMatch) {
                    currentValue = explicitMatch[1];
                } else {
                    const implicitMatch = currentValue.match(/(?:\s|^)(?:[xX]|por)\s*\d+/i);
                    if (implicitMatch) {
                        currentValue = "1";
                    } else {
                        currentValue = "1";
                    }
                }
            }
            else if (rule.tipo_regex === 'EXTRACT_UNIT_SIZE') {
                const unitMatch = currentValue.match(/(?:x|X|por)\s*(\d+(?:[.,]\d+)?)/i);
                if (unitMatch) {
                    currentValue = unitMatch[1];
                } else {
                    currentValue = "";
                }
            }
            else if (rule.tipo_regex === 'FORMAT_DECIMAL_DISCOUNT') {
                if (!currentValue || currentValue === "") {
                    currentValue = "0,00";
                    cleanValue = 0.0;
                } else {
                    // Ensure float parsing before converting back to comma string
                    const normalized = currentValue.replace(/,/g, '.');
                    cleanValue = parseFloat(normalized);
                    if (isNaN(cleanValue)) cleanValue = 0.0;

                    currentValue = currentValue.replace(/\./g, ',');
                }
            }
            else if (rule.tipo_regex === 'FORMAT_PRICE_AR') {
                if (currentValue && currentValue !== "") {
                    // Remove everything except digits, dots, and commas
                    let cleanStr = currentValue.replace(/[^\d.,-]/g, '');

                    if (cleanStr !== "") {
                        // Find the last dot or comma
                        const lastDot = cleanStr.lastIndexOf('.');
                        const lastComma = cleanStr.lastIndexOf(',');
                        let floatVal = 0;

                        if (lastDot === -1 && lastComma === -1) {
                            floatVal = parseFloat(cleanStr);
                        } else if (lastDot > lastComma) {
                            // Dot is the decimal separator. Remove all commas.
                            const withoutThousandSeps = cleanStr.replace(/,/g, '');
                            floatVal = parseFloat(withoutThousandSeps);
                        } else {
                            // Comma is the decimal separator. Remove all dots, replace last comma with dot.
                            const withoutThousandSeps = cleanStr.replace(/\./g, '');
                            const standardStr = withoutThousandSeps.replace(',', '.');
                            floatVal = parseFloat(standardStr);
                        }

                        if (!isNaN(floatVal)) {
                            cleanValue = floatVal; // [V5] Trap the actual math value
                            currentValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(floatVal);
                        } else {
                            currentValue = "";
                            cleanValue = null;
                        }
                    }
                }
            }
            else {
                // Regla Regex Dinámica
                try {
                    let patternStr = rule.tipo_regex;
                    let isGlobal = true;
                    if (patternStr.startsWith('/')) {
                        const lastSlash = patternStr.lastIndexOf('/');
                        const flags = patternStr.slice(lastSlash + 1);
                        patternStr = patternStr.slice(1, lastSlash);
                        isGlobal = flags.includes('g');
                    }

                    const regex = new RegExp(patternStr, isGlobal ? 'g' : '');
                    // Por defecto removemos las coincidencias (limpieza)
                    currentValue = currentValue.replace(regex, '');
                } catch (e) {
                    console.warn(`[ETL] Regex Invalido en regla ${rule.nombre_regla}:`, e);
                }
            }
            currentValue = currentValue.trim();
        }
    } // Cierra if (!hasAbsoluteOverride)

    // Default cleanValue fallback: Try parse if not explicitly set by rules
    if (cleanValue === null && currentValue !== "" && !isNaN(currentValue.replace(/,/g, '.'))) {
        cleanValue = parseFloat(currentValue.replace(/,/g, '.'));
    }

    return {
        result: currentValue, // [Legacy compatibility] Target string representation
        display: currentValue, // [V5] explicit display 
        clean: cleanValue,     // [V5] Mathematical reality 
        rejected: isRejected
    };
}

// SIMULATE CHANGES IN DOM
export function previewColumn(colIndex, pipeline, skipMath = false) {
    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    if (!skipMath) {
        // 1. Math Calculation on the REAL DATA (Ignoring virtual DOM limits)
        let countTotal = 0;
        let countRejected = 0;

        // Attempt to read from global Viewer State
        const realData = (window.viewerState && window.viewerState.data) ? window.viewerState.data : null;
        if (realData && realData.length > 1) { // >1 to have rows beyond header
            countTotal = realData.length - 1; // exclude header
            for (let i = 1; i < realData.length; i++) {
                const rawVal = (realData[i][colIndex] !== undefined && realData[i][colIndex] !== null) ? String(realData[i][colIndex]) : "";
                const { rejected } = transformCell(rawVal, pipeline);
                if (rejected) countRejected++;
            }
        } else {
            // Fallback for some reason, though should never hit in active table
            console.warn("[ETL PREVIEW] Warning: window.viewerState.data is missing, stats might be inaccurate.");
        }

        const countBadge = document.getElementById('vrwRuleCount');
        if (countBadge) {
            countBadge.textContent = `${pipeline.length} reglas`;
        }

        const infoPanel = document.getElementById('vrwCurrentMappingInfo');
        if (infoPanel) {
            let statsContainer = document.getElementById('vrwStatsContainer');
            const statsHtml = `
                <div id="vrwStatsContainer" class="mt-2 text-[10px] bg-slate-950 p-2 rounded border border-slate-800 flex justify-between text-slate-400 font-mono">
                    <span>Totales: <strong class="text-white">${countTotal}</strong></span>
                    <span>Válidas: <strong class="text-emerald-400">${countTotal - countRejected}</strong></span>
                    <span>Descartadas: <strong class="text-red-400">${countRejected}</strong></span>
                </div>
            `;

            if (statsContainer) {
                statsContainer.outerHTML = statsHtml;
            } else {
                infoPanel.insertAdjacentHTML('beforeend', statsHtml);
            }
        }
    }

    // 2. Trigger Native Repaint (Header + Body + Z-[60])
    if (window.renderVirtualTable && window.viewerState && window.viewerState.data) {
        window.renderVirtualTable(window.viewerState.data);
    } else {
        tableContainer.dispatchEvent(new Event('scroll'));
    }
}

// COMMIT VISUALS TO HEADER
export function commitColumnMapping(vColId, masterField, pipeline) {
    const th = document.getElementById(`th-${vColId}`);
    if (th) {
        th.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-300 cursor-pointer hover:bg-emerald-900/30 px-1 py-0.5 rounded transition-colors" onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '${vColId}', '${masterField.nombre_campo}')">
                <i data-lucide="link-2" class="w-3 h-3"></i>
                <span class="truncate" title="${masterField.nombre_campo}">${masterField.nombre_campo}</span>
                <div class="bg-emerald-800 text-emerald-200 text-[9px] px-1.5 rounded-full ml-auto">${pipeline.length}r</div>
            </div>
            ${th.querySelector('.resizer-handle') ? th.querySelector('.resizer-handle').outerHTML : ''}
        `;
        // [V4] Set correct classes
        th.className = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20 relative";
        if (window.lucide) window.lucide.createIcons();
    }
}

window.viewerETL = {
    transformCell,
    previewColumn,
    commitColumnMapping
};
