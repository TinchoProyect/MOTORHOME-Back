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

    // 2. Visual Layer update (Only targeting rendered ghost rows, max ~50)
    const rows = tableContainer.querySelectorAll('tbody tr');

    rows.forEach(row => {
        const cell = row.children[colIndex];
        if (!cell) return;

        // Force visual elevation over z-40 backdrop
        cell.classList.add('relative', 'z-[60]', 'bg-slate-800', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');

        // Restore original HTML if returning to empty pipeline
        if (!cell.dataset.originalRawHtml) {
            cell.dataset.originalRawHtml = cell.innerHTML;
            cell.dataset.originalRawText = cell.innerText;
        }

        const rawVal = cell.dataset.originalRawText;

        // If pipeline is empty, revert
        if (!pipeline || pipeline.length === 0) {
            cell.innerHTML = cell.dataset.originalRawHtml;
            row.classList.remove('opacity-30', 'grayscale', 'bg-red-500/10');
            return;
        }

        const { result, rejected } = transformCell(rawVal, pipeline);

        // Visual "Before -> After" render
        if (rejected) {
            // Fila Fantasma (Ghost Row)
            row.classList.add('opacity-30', 'grayscale', 'bg-red-500/10');
            cell.innerHTML = `
                <div class="flex items-center gap-2 line-through text-red-400">
                    <span class="truncate" title="${rawVal}">${rawVal}</span>
                    <i data-lucide="ban" class="w-4 h-4 flex-shrink-0"></i>
                </div>
            `;
        } else {
            row.classList.remove('opacity-30', 'grayscale', 'bg-red-500/10');

            if (result !== rawVal) {
                // Modificado: Audit Visual (Non-Destructive)
                cell.innerHTML = `
                    <div class="flex flex-col gap-1 py-1">
                        <span class="text-[10px] text-slate-500 line-through truncate" title="${rawVal}">${rawVal}</span>
                        <div class="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50">
                            <i data-lucide="arrow-down-right" class="w-3 h-3 flex-shrink-0"></i>
                            <span class="truncate text-xs" title="${result}">${result || '<vacío>'}</span>
                        </div>
                    </div>
                `;
            } else {
                // Intacto
                cell.innerHTML = cell.dataset.originalRawHtml;
            }
        }
    });

    // Elevate Header to prevent it getting buried under the backdrop
    const th = tableContainer.querySelector(`thead tr th:nth-child(${colIndex + 1})`);
    if (th) {
        th.classList.remove('z-20'); // Remove default sticky index if conflicting
        th.classList.add('relative', 'z-[60]', 'bg-slate-800', 'shadow-[0_-5px_15px_rgba(59,130,246,0.3)]', 'border-x', 'border-blue-500/50');
    }

    if (window.lucide) window.lucide.createIcons();
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
