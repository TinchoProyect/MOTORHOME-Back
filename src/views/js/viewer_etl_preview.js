/**
 * VIEWER ETL PREVIEW (V4)
 * Phase 4: Client-Side Transformation Simulator
 */

// CORE ALGORITHM: Apply pipeline sequentially
export function transformCell(rawValue, pipeline) {
    if (rawValue === undefined || rawValue === null) rawValue = "";
    let currentValue = String(rawValue).trim();
    let isRejected = false;

    for (const rule of pipeline) {
        if (isRejected) break; // Si ya fue filtrada, saltar resto

        // Reglas Nativas
        if (rule.tipo_regex === 'SANITIZER_NUMERIC') {
            currentValue = currentValue.replace(/[^0-9.,-]/g, '');
        }
        else if (rule.tipo_regex === 'FILTER_EMPTY') {
            if (currentValue === "") isRejected = true;
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

    return { result: currentValue, rejected: isRejected };
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
export function commitColumnMapping(colIndex, masterField, pipeline) {
    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    const th = tableContainer.querySelector(`thead tr th:nth-child(${colIndex + 1})`);
    if (th) {
        th.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-300">
                <i data-lucide="link-2" class="w-3 h-3"></i>
                <span class="truncate" title="${masterField.nombre_campo}">${masterField.nombre_campo}</span>
                <div class="bg-emerald-800 text-emerald-200 text-[9px] px-1.5 rounded-full ml-auto">${pipeline.length}r</div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

window.viewerETL = {
    transformCell,
    previewColumn,
    commitColumnMapping
};
