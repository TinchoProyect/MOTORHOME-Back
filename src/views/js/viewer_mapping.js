/**
 * VIEWER MAPPING - Nomenclature & Processing Rules
 * Extracted from viewer_engine.js
 */

// --- MAPPING & NOMENCLATURE TOOLS ---

async function loadNomenclature() {
    try {
        const providerId = window.globalContext ? window.globalContext.providerId : null;
        const data = await window.NomenclatureService.getAll(providerId);
        nomenclatureCache = data;
        return data;
    } catch (e) {
        console.error("Error loading nomenclature:", e);
        if (nomenclatureCache.length === 0) {
            nomenclatureCache = [];
        }
        return nomenclatureCache;
    }
}

async function addNomenclatureTerm(term, desc = "") {
    try {
        const providerId = window.globalContext ? window.globalContext.providerId : null;
        await window.NomenclatureService.create(term, desc, providerId);
        await loadNomenclature();
        return true;
    } catch (e) {
        console.error("Error adding term:", e);
        return false;
    }
}

async function updateNomenclatureTerm(id, newTerm, newDesc, newRules) {
    try {
        const updatePayload = { id: id, termino: newTerm };
        if (newDesc !== undefined) updatePayload.descripcion_uso = newDesc;
        if (newRules !== undefined) updatePayload.reglas_procesamiento = newRules;

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        const response = await fetch(`${backendUrl}/api/files/dictionary/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error);

        const idx = nomenclatureCache.findIndex(t => t.id === id);
        if (idx !== -1) {
            const oldName = nomenclatureCache[idx].termino;
            nomenclatureCache[idx].termino = newTerm;
            if (newDesc !== undefined) nomenclatureCache[idx].descripcion_uso = newDesc;
            if (newRules !== undefined) nomenclatureCache[idx].reglas_procesamiento = newRules;

            Object.keys(columnMapping).forEach(colIdx => {
                if (columnMapping[colIdx] === oldName || columnMapping[colIdx] === newTerm) {
                    columnMapping[colIdx] = newTerm;
                    const updatedRule = nomenclatureCache[idx].reglas_procesamiento;
                    if (updatedRule) {
                        // [V3] NORMALIZACIÓN A PIPELINE (ARRAY)
                        processingRules[colIdx] = Array.isArray(updatedRule)
                            ? updatedRule
                            : [updatedRule];
                    } else {
                        delete processingRules[colIdx];
                    }
                    console.log(`[Hot Reload] Regla actualizada en memoria para Col ${colIdx}`);
                }
            });
        }
        return true;
    } catch (e) {
        console.error("Error updating:", e);
        alert("Error: " + e.message);
        return false;
    }
}

async function toggleMappingMode() {
    mappingMode = !mappingMode;
    const btn = document.getElementById('btnMappingMode');
    if (!btn) return;

    if (mappingMode) {
        if (nomenclatureCache.length === 0) {
            btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>';
            await loadNomenclature();
            btn.innerHTML = '<i data-lucide="layers" class="w-3 h-3"></i> Mapear Columnas';
            if (window.lucide) window.lucide.createIcons();
        }
        if (columnMapping && Object.keys(columnMapping).length > 0) {
            Object.keys(columnMapping).forEach(colIdx => {
                const termName = columnMapping[colIdx];
                const term = nomenclatureCache.find(t => t.termino === termName);
                if (term && term.reglas_procesamiento) {
                    // [V3] NORMALIZACIÓN A PIPELINE (ARRAY)
                    processingRules[colIdx] = Array.isArray(term.reglas_procesamiento)
                        ? term.reglas_procesamiento
                        : [term.reglas_procesamiento];
                }
            });
        }
        btn.classList.remove('bg-slate-800', 'border-slate-700');
        btn.classList.add('bg-blue-600', 'border-blue-500', 'shadow-[0_0_15px_rgba(37,99,235,0.3)]');
    } else {
        btn.classList.remove('bg-blue-600', 'border-blue-500', 'shadow-[0_0_15px_rgba(37,99,235,0.3)]');
        btn.classList.add('bg-slate-800', 'border-slate-700');
    }
    if (currentSheetData) renderVirtualTable(currentSheetData);
}

function openColumnMenu_v2(colIndex, buttonElement) {
    const existing = document.getElementById('colMenuDropdown');
    if (existing) {
        existing.remove();
        if (existing.dataset.colIndex === String(colIndex)) return;
    }

    const menu = document.createElement('div');
    menu.id = 'colMenuDropdown';
    menu.dataset.colIndex = colIndex;
    menu.className = 'fixed z-[150] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col min-w-[280px] max-h-[400px] overflow-hidden animate-in slide-in-from-top-2 duration-200';

    const rect = buttonElement.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = rect.left + 'px';

    const header = document.createElement('div');
    header.className = "px-4 py-2 bg-slate-950/50 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800";
    header.textContent = "Asignar Tipo de Dato";
    menu.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.className = "overflow-y-auto custom-scrollbar flex-1";
    menu.appendChild(scrollArea);

    const createBtn = document.createElement('button');
    createBtn.className = 'w-full px-4 py-2 text-left bg-blue-600/10 hover:bg-blue-600/20 border-b border-blue-500/20 text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2';
    createBtn.innerHTML = '<i data-lucide="plus-circle" class="w-3 h-3"></i> Crear Nuevo Encabezado';
    createBtn.onclick = () => {
        menu.remove();

        window.ViewerUI.renderCreateTermModal("", async (newTermName) => {
            await loadNomenclature();

            // 🔥 BUG FIX: Limpiar reglas remanentes al asignar un término nuevo
            if (processingRules[colIndex]) {
                delete processingRules[colIndex];
                console.log(`[Mapping] Regla eliminada para Col ${colIndex} (Nuevo Término)`);
            }

            columnMapping[colIndex] = newTermName;
            renderVirtualTable(currentSheetData);
            saveSheetState(currentSheetName);
            renderSheetTabs();
        });
    };
    scrollArea.appendChild(createBtn);

    nomenclatureCache.forEach(term => {
        const item = document.createElement('div');
        item.className = 'flex items-center border-l-2 border-transparent hover:bg-slate-800 transition-colors group relative cursor-pointer p-2';

        const content = document.createElement('div');
        content.className = 'flex-grow px-2 flex flex-col';
        content.innerHTML = `<span class="text-[11px] font-mono text-slate-300 font-bold">${term.termino}</span>
                             <span class="text-[9px] text-slate-500 truncate">${term.descripcion_uso || ''}</span>`;

        if (columnMapping[colIndex] === term.termino) {
            item.classList.add('bg-blue-900/10', 'border-blue-500');
            content.querySelector('span').classList.add('text-blue-400');
        }

        content.onclick = () => {
            columnMapping[colIndex] = term.termino;
            if (term.reglas_procesamiento) {
                // [V3] NORMALIZACIÓN A PIPELINE
                processingRules[colIndex] = Array.isArray(term.reglas_procesamiento)
                    ? term.reglas_procesamiento
                    : [term.reglas_procesamiento];
            } else {
                if (processingRules[colIndex]) delete processingRules[colIndex];
            }
            renderVirtualTable(currentSheetData);
            saveSheetState(currentSheetName);
            renderSheetTabs();
            menu.remove();
        };

        const editBtn = document.createElement('button');
        editBtn.className = 'p-1.5 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all bg-slate-900/80 rounded z-10';
        editBtn.innerHTML = '<i data-lucide="pencil" class="w-3 h-3"></i>';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            renderEditMode(item, term);
        };

        item.appendChild(content);
        item.appendChild(editBtn);
        scrollArea.appendChild(item);
    });

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'w-full px-4 py-3 text-left border-t border-slate-800 text-[10px] text-slate-500 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2';
    ignoreBtn.innerHTML = '<i data-lucide="eye-off" class="w-3 h-3"></i> Ignorar esta columna';
    ignoreBtn.onclick = () => {
        columnMapping[colIndex] = 'Ignorar Columna';
        renderVirtualTable(currentSheetData);
        saveSheetState(currentSheetName);
        renderSheetTabs();
        menu.remove();
    };
    menu.appendChild(ignoreBtn);

    const closeHandler = (e) => {
        if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 50);
    document.body.appendChild(menu);
    if (window.lucide) window.lucide.createIcons();
}

function createTermSelect(currentId, placeholder, currentTermId) {
    const select = document.createElement('select');
    select.className = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-blue-500 outline-none w-full appearance-none';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.text = `- ${placeholder} -`;
    defaultOpt.disabled = true;
    if (!currentId) defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    let foundCurrent = false;
    nomenclatureCache.forEach(t => {
        if (t.id === currentTermId) return;
        if (t.reglas_procesamiento && Object.keys(t.reglas_procesamiento).length > 0) return;
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.text = t.termino;
        if (t.id === currentId) {
            opt.selected = true;
            foundCurrent = true;
        }
        select.appendChild(opt);
    });

    if (currentId && !foundCurrent) {
        const legacyOpt = document.createElement('option');
        legacyOpt.value = currentId;
        legacyOpt.text = `ID Desconocido`;
        legacyOpt.selected = true;
        select.appendChild(legacyOpt);
    }
    return select;
}

function renderEditMode(container, term) {
    container.className = 'p-3 bg-slate-900 border-l-2 border-blue-500 flex flex-col gap-3 transition-all rounded-r-lg shadow-inner';
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = "flex justify-between items-center mb-1";
    header.innerHTML = '<span class="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Edición Rápida</span>';
    container.appendChild(header);

    const group1 = document.createElement('div');
    group1.className = "space-y-1";
    group1.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold">Término</label>';
    const inputTerm = document.createElement('input');
    inputTerm.value = term.termino;
    inputTerm.className = 'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] text-white focus:border-blue-500 outline-none placeholder:text-slate-600 font-mono';
    group1.appendChild(inputTerm);
    container.appendChild(group1);

    const group2 = document.createElement('div');
    group2.className = "space-y-1";
    group2.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold">Descripción</label>';
    const inputDesc = document.createElement('input');
    inputDesc.value = term.descripcion_uso || '';
    inputDesc.placeholder = 'Contexto de uso...';
    inputDesc.className = 'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-400 focus:border-blue-500 outline-none placeholder:text-slate-600';
    group2.appendChild(inputDesc);
    container.appendChild(group2);

    // 🔥 SELECTOR DE REGLAS
    const group3 = document.createElement('div');
    group3.className = "space-y-1.5 pt-2 border-t border-slate-800";
    group3.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-between"><span>Reglas de Procesamiento</span> <i data-lucide="split" class="w-3 h-3"></i></label>';

    const ruleContainer = document.createElement('div');
    ruleContainer.className = "grid grid-cols-2 gap-2";

    // Extracción segura de regla (si es array toma la primera, si es objeto lo toma directo)
    let rawRule = term.reglas_procesamiento;
    if (Array.isArray(rawRule)) rawRule = rawRule[0];
    const existingRule = (rawRule && typeof rawRule === 'object') ? rawRule : { delimiter: " + ", fields: [] };

    const inputDelim = document.createElement('input');
    inputDelim.type = 'hidden';
    inputDelim.value = existingRule.delimiter || " + ";

    const val1 = (existingRule.fields && existingRule.fields[0]) ? existingRule.fields[0] : "";
    const field1 = createTermSelect(val1, "Campo 1", term.id);
    const val2 = (existingRule.fields && existingRule.fields[1]) ? existingRule.fields[1] : "";
    const field2 = createTermSelect(val2, "Campo 2", term.id);

    ruleContainer.appendChild(inputDelim);
    ruleContainer.appendChild(field1);
    ruleContainer.appendChild(field2);
    group3.appendChild(ruleContainer);
    container.appendChild(group3);

    const btnRow = document.createElement('div');
    btnRow.className = 'flex justify-between items-end gap-2 mt-3 pt-2 border-t border-slate-800';

    const btnDelete = document.createElement('button');
    btnDelete.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3 text-red-500"></i>';
    btnDelete.className = 'p-1.5 rounded hover:bg-red-900/30 transition-colors border border-transparent hover:border-red-900/50';
    btnDelete.onclick = async (e) => {
        e.stopPropagation();
        if (confirm("¿Eliminar término?")) {
            try {
                const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                await fetch(`${backendUrl}/api/files/dictionary/delete?id=${term.id}`, { method: 'DELETE' });
                const idx = nomenclatureCache.findIndex(t => t.id === term.id);
                if (idx !== -1) nomenclatureCache.splice(idx, 1);
                const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
                const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
                if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
            } catch (error) { alert("Error eliminando."); }
        }
    };

    const rightActions = document.createElement('div');
    rightActions.className = "flex gap-2";

    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'Cancelar';
    btnCancel.className = 'text-[10px] text-slate-500 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 uppercase font-bold';
    btnCancel.onclick = (e) => {
        e.stopPropagation();
        const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
        const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
        if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
    };

    const btnSave = document.createElement('button');
    btnSave.innerHTML = '<i data-lucide="save" class="w-3 h-3 inline mr-1"></i> Guardar';
    btnSave.className = 'bg-blue-600 text-white px-4 py-1.5 rounded text-[10px] hover:bg-blue-500 uppercase font-bold';
    btnSave.onclick = async (e) => {
        e.stopPropagation();
        btnSave.innerText = '...';

        let parsedRules = undefined;
        // Solo guardamos regla si es Split y tiene campos definidos (compatibilidad legacy)
        if (field1.value || field2.value) {
            parsedRules = {
                type: 'split',
                delimiter: inputDelim.value,
                fields: [field1.value, field2.value]
            };
        }

        await updateNomenclatureTerm(term.id, inputTerm.value, inputDesc.value, parsedRules);
        const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
        const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
        if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
    };

    btnRow.appendChild(btnDelete);
    rightActions.appendChild(btnCancel);
    rightActions.appendChild(btnSave);
    btnRow.appendChild(rightActions);

    container.appendChild(group1);
    container.appendChild(group2);
    container.appendChild(group3);
    container.appendChild(btnRow);

    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ root: container }); inputTerm.focus(); }, 50);
}

function applyProcessingRules(originalData) {
    if (!originalData || originalData.length === 0) return [];

    const activeRules = Object.entries(processingRules).filter(([colIdx, rule]) => {
        return rule && !rule.disabled;
    });

    if (activeRules.length === 0) return originalData;

    const processedData = [];
    const seenValues = new Set();

    for (let i = 0; i < originalData.length; i++) {
        let row = [...originalData[i]];
        let keepRow = true;

        for (const [colIdxStr, rulesStack] of activeRules) {
            const colIdx = parseInt(colIdxStr);
            const pipeline = Array.isArray(rulesStack) ? rulesStack : [rulesStack];

            for (const rule of pipeline) {
                if (rule.disabled) continue;

                const cellVal = row[colIdx];
                const strVal = String(cellVal || "").trim();

                // --- LOGICA DE REGLAS ---
                if (rule.type === 'sanitize') {
                    const fallback = rule.config?.replace_with || "0,00";
                    let shouldReplace = false;
                    if (!strVal || strVal === "" || strVal.toLowerCase() === "undefined" || strVal.toLowerCase() === "null") {
                        shouldReplace = true;
                    }
                    if (!shouldReplace && rule.config?.match_regex) {
                        try {
                            let p = rule.config.match_regex;
                            if (p.startsWith('/')) p = p.slice(1);
                            if (p.endsWith('/')) p = p.slice(0, -1);
                            p = p.replace(/\\\\/g, '\\');
                            if (new RegExp(p, 'i').test(strVal)) shouldReplace = true;
                        } catch (e) { console.warn("Regex Error", e); }
                    }
                    if (shouldReplace) {
                        row[colIdx] = fallback;
                    } else {
                        if (strVal && strVal.includes('.')) row[colIdx] = strVal.replace(/\./g, ',');
                    }
                }

                if (rule.type === 'filter' || rule.type === 'row_filter') {
                    if (rule.config?.exclude_empty && strVal === "") {
                        keepRow = false; break;
                    }
                    if (rule.config?.exclude_regex) {
                        try {
                            let p = rule.config.exclude_regex;
                            if (p.startsWith('/')) p = p.slice(1);
                            if (p.endsWith('/')) p = p.slice(0, -1);
                            p = p.replace(/\\\\/g, '\\');
                            if (new RegExp(p, 'i').test(strVal)) {
                                keepRow = false; break;
                            }
                        } catch (e) { }
                    }
                    if (rule.config?.unique) {
                        const uniqueKey = strVal.toUpperCase();
                        if (seenValues.has(uniqueKey)) { keepRow = false; break; }
                        else { seenValues.add(uniqueKey); }
                    }
                }

                if (keepRow && (rule.type === 'split' || rule.type === 'regex_split')) {
                    // Logic for split... (simplificado para brevedad, se mantiene igual)
                    let pDesc = strVal;
                    let pPres = "";
                    if (rule.type === 'split' && rule.delimiter) {
                        const parts = strVal.split(rule.delimiter);
                        if (parts.length > 0) pDesc = parts[0].trim();
                        if (parts.length > 1) pPres = parts[1].trim();
                    }
                    if (pPres) row[colIdx] = `📦 ${pDesc}  |  🏷️ ${pPres}`;
                }

                if (keepRow && rule.type === 'format_number') {
                    let num = parseFloat(String(cellVal).replace(/[^0-9.-]/g, ''));
                    if (!isNaN(num)) {
                        row[colIdx] = new Intl.NumberFormat('es-AR', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true
                        }).format(num);
                    }
                }
            } // end pipeline loop
            if (!keepRow) break;
        } // end columns loop

        if (keepRow) {
            processedData.push(row);
        }
    }

    return processedData;
}

function toggleProcessingRule(colIndex) {
    if (processingRules[colIndex]) {
        // En V3 (Pipeline), deshabilitamos todo el stack o la primera regla
        // Simplificación: Toggle disable en la primera regla
        const rules = Array.isArray(processingRules[colIndex]) ? processingRules[colIndex] : [processingRules[colIndex]];
        if (rules.length > 0) {
            rules[0].disabled = !rules[0].disabled;
            renderVirtualTable(currentSheetData);
        }
    }
}

window.resetMappingCache = function () {
    console.log("🧹 [ViewerMapping] Limpiando caché de nomenclaturas...");
    nomenclatureCache = [];
};

console.log("🗺️ [ViewerMapping] Herramientas de Mapeo Cargadas.");