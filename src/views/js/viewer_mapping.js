/**
 * VIEWER MAPPING - Nomenclature & Processing Rules
 * Extracted from viewer_engine.js
 * [UPDATED]: Global Scope Support via Checkbox
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

// [MODIFIED] Now supports isGlobal flag
async function addNomenclatureTerm(term, desc = "", isGlobal = false) {
    try {
        const providerId = window.globalContext ? window.globalContext.providerId : null;
        // The service needs to handle the payload structure manually here or updated in service
        // We'll do a direct fetch here to ensure custom payload support
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        const response = await fetch(`${backendUrl}/api/files/dictionary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                termino: term,
                descripcion: desc,
                providerId: providerId,
                isGlobal: isGlobal
            })
        });

        const result = await response.json();
        if (result.error) throw new Error(result.error);

        await loadNomenclature();
        return true;
    } catch (e) {
        console.error("Error adding term:", e);
        return false;
    }
}

// [MODIFIED] Now supports isGlobal flag
async function updateNomenclatureTerm(id, newTerm, newDesc, newRules, isGlobal) {
    try {
        const updatePayload = {
            id: id,
            termino: newTerm,
            currentProviderId: window.globalContext.providerId
        };
        if (newDesc !== undefined) updatePayload.descripcion_uso = newDesc;
        if (newRules !== undefined) updatePayload.reglas_procesamiento = newRules;
        if (isGlobal !== undefined) updatePayload.isGlobal = isGlobal;

        // --- 🕵️‍♂️ VIGÍA DEPURADOR: INICIO ---
        console.group("🕵️‍♂️ DEBUG: Transacción de Actualización");
        console.log("📤 [Cliente] Payload Enviado:", updatePayload);
        // ----------------------------------

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        const response = await fetch(`${backendUrl}/api/files/dictionary/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });
        const result = await response.json();

        // --- 🕵️‍♂️ VIGÍA DEPURADOR: RESPUESTA ---
        console.log("📥 [Servidor] Respuesta Cruda:", result);
        console.log("🧐 [Análisis] ¿Qué hay en result.data?:", result.data);
        console.log("📊 [Tipo] ¿result.data es Array?:", Array.isArray(result.data));
        if (Array.isArray(result.data) && result.data.length > 0) {
            console.log("👉 Primer elemento del array:", result.data[0]);
            console.log("🔑 ¿Tiene propiedad proveedor_id?:", result.data[0].hasOwnProperty('proveedor_id'));
        } else {
            console.log("⚠️ result.data no es un array o está vacío.");
        }
        console.groupEnd();
        // -------------------------------------

        if (!response.ok || !result.success) throw new Error(result.error || "Error desconocido");

        const idx = nomenclatureCache.findIndex(t => t.id === id);
        if (idx !== -1) {
            const oldName = nomenclatureCache[idx].termino;

            // Update Local Cache
            nomenclatureCache[idx].termino = newTerm;
            if (newDesc !== undefined) nomenclatureCache[idx].descripcion_uso = newDesc;
            if (newRules !== undefined) nomenclatureCache[idx].reglas_procesamiento = newRules;

            // INTENTO DE ACTUALIZACIÓN DE SCOPE (Aquí es donde sospechamos el fallo)
            if (result.data) {
                // Si el servidor devuelve array, tomamos el primero, si no, el objeto directo.
                // El depurador nos dirá cuál de las dos líneas siguientes es la necesaria.
                const dataObj = Array.isArray(result.data) ? result.data[0] : result.data;

                if (dataObj && dataObj.proveedor_id !== undefined) {
                    console.log(`✅ [Cache Update] Actualizando proveedor_id local de ${nomenclatureCache[idx].proveedor_id} a ${dataObj.proveedor_id}`);
                    nomenclatureCache[idx].proveedor_id = dataObj.proveedor_id;
                } else {
                    console.warn("⚠️ [Cache Warning] No se encontró proveedor_id en la respuesta para actualizar el cache.");
                }
            }

            // Update Mappings in UI
            Object.keys(columnMapping).forEach(vColId => {
                if (columnMapping[vColId] === oldName || columnMapping[vColId] === newTerm) {
                    columnMapping[vColId] = newTerm;
                    const updatedRule = nomenclatureCache[idx].reglas_procesamiento;
                    if (updatedRule) {
                        processingRules[vColId] = Array.isArray(updatedRule)
                            ? updatedRule
                            : [updatedRule];
                    } else {
                        delete processingRules[vColId];
                    }
                }
            });
        }
        return true;
    } catch (e) {
        console.error("Error updating:", e);
        // Si tienes SweetAlert cargado, úsalo, si no, alert normal
        if (typeof Swal !== 'undefined') Swal.fire("Error", e.message, "error");
        else alert("Error: " + e.message);
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
            Object.keys(columnMapping).forEach(vColId => {
                const termName = columnMapping[vColId];
                const term = nomenclatureCache.find(t => t.termino === termName);
                if (term && term.reglas_procesamiento) {
                    processingRules[vColId] = Array.isArray(term.reglas_procesamiento)
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

// [MODIFIED] Replaced inline create with Modal
function openColumnMenu_v2(vColId, buttonElement) {
    const existing = document.getElementById('colMenuDropdown');
    if (existing) {
        existing.remove();
        if (existing.dataset.vColId === String(vColId)) return;
    }

    const menu = document.createElement('div');
    menu.id = 'colMenuDropdown';
    menu.dataset.vColId = vColId;
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

    // [MODIFIED] Use ViewerUI v4 (Glassmorphism)
    createBtn.onclick = () => {
        menu.remove();
        if (window.ViewerUI && window.ViewerUI.renderCreateTermModal) {
            window.ViewerUI.renderCreateTermModal("", (newTermName) => {
                if (newTermName) {
                    // Success Callback from UI
                    // 1. Invalidate old rules if any
                    if (processingRules[vColId]) {
                        delete processingRules[vColId];
                    }
                    // 2. Map Column
                    columnMapping[vColId] = newTermName.toUpperCase();
                    // 3. Refresh & Save
                    renderVirtualTable(currentSheetData);
                    saveSheetState(currentSheetName);
                    renderSheetTabs();
                    // 4. Update Cache (Silent Reload)
                    loadNomenclature();
                }
            });
        } else {
            alert("Error: ViewerUI no disponible. Recarga la página.");
        }
    };
    scrollArea.appendChild(createBtn);

    nomenclatureCache.forEach(term => {
        const item = document.createElement('div');
        item.className = 'flex items-center border-l-2 border-transparent hover:bg-slate-800 transition-colors group relative cursor-pointer p-2';

        const content = document.createElement('div');
        content.className = 'flex-grow px-2 flex flex-col';
        // Add Globe Icon if Global
        const globalIcon = !term.proveedor_id ? '<i data-lucide="globe" class="w-3 h-3 inline text-slate-500 mr-1" title="Global"></i>' : '';

        content.innerHTML = `<span class="text-[11px] font-mono text-slate-300 font-bold flex items-center">${globalIcon}${term.termino}</span>
                             <span class="text-[9px] text-slate-500 truncate">${term.descripcion_uso || ''}</span>`;

        if (columnMapping[vColId] === term.termino) {
            item.classList.add('bg-blue-900/10', 'border-blue-500');
            content.querySelector('span').classList.add('text-blue-400');
        }

        content.onclick = () => {
            // [NEW] Strict 1-to-1 mapping validation
            let isAlreadyMapped = false;
            
            if (window.columnMapping) {
                for (const [id, assignedTerm] of Object.entries(window.columnMapping)) {
                    if (id !== vColId && assignedTerm === term.termino) {
                        isAlreadyMapped = true;
                        break;
                    }
                }
            }

            if (isAlreadyMapped) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Mapeo Duplicado Detectado',
                        text: `El campo orgánico "${term.termino}" ya se encuentra asignado a otra columna. Desvincúlalo primero antes de asignarlo aquí.`,
                        icon: 'warning',
                        background: '#0f172a',
                        color: '#f8fafc'
                    });
                } else {
                    alert(`El campo "${term.termino}" ya está asignado. Desvincúlalo primero.`);
                }
                menu.remove();
                return;
            }

            columnMapping[vColId] = term.termino;
            if (term.reglas_procesamiento) {
                processingRules[vColId] = Array.isArray(term.reglas_procesamiento)
                    ? term.reglas_procesamiento
                    : [term.reglas_procesamiento];
            } else {
                if (processingRules[vColId]) delete processingRules[vColId];
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
            // Call Modal Edit instead of inline
            menu.remove();
            openEditTermModal(term, vColId);
        };

        item.appendChild(content);
        item.appendChild(editBtn);
        scrollArea.appendChild(item);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'w-full px-4 py-3 text-left border-t border-red-900/50 text-[10px] text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2';
    deleteBtn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i> Eliminar Mapeo';
    deleteBtn.onclick = () => {
        // [V5.14 UX] Complete deletion logic
        const isClone = vColId.includes('_clone_');

        if (window.columnMapping) delete window.columnMapping[vColId];
        if (window.processingRules) delete window.processingRules[vColId];
        if (window.draftPipelines) delete window.draftPipelines[vColId];

        if (isClone && window.virtualColumns) {
            const idx = window.virtualColumns.findIndex(v => v.id === vColId);
            if (idx !== -1) window.virtualColumns.splice(idx, 1);
        }

        renderVirtualTable(currentSheetData);
        saveSheetState(currentSheetName);
        renderSheetTabs();
        menu.remove();

        // Silent save to backend to persist deletion
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }
    };
    menu.appendChild(deleteBtn);

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

// [MODIFIED] New Modal for Editing with Scope Control
// BYPASS: Redirects to ViewerUI.renderCreateTermModal (Edit Mode)
async function openEditTermModal(term, vColId) {
    if (window.ViewerUI && window.ViewerUI.renderCreateTermModal) {
        // [ADAPTER] Map Cache Object to UI Object
        // User confirmed: 'descripcion_uso' is the active field. 'Descripcion' is obsolete.
        const uiPayload = {
            id: term.id,
            term: term.termino,
            description: term.descripcion_uso || '',
            proveedor_id: term.proveedor_id
        };

        // Pass the full term object to trigger Edit Mode in ViewerUI
        window.ViewerUI.renderCreateTermModal(uiPayload, (result) => {
            // Result can be:
            // - null: Deleted or Cancelled
            // - string: Updated Name
            if (result === null) {
                // Term was deleted. Remove from cache locally.
                const idx = nomenclatureCache.findIndex(t => t.id === term.id);
                if (idx !== -1) nomenclatureCache.splice(idx, 1);

                // Clear mapping if it was this term
                if (columnMapping[vColId] === term.termino) {
                    columnMapping[vColId] = 'Ignorar Columna'; // Or empty
                    renderVirtualTable(currentSheetData);
                }
            } else {
                // Term Updated. Refresh Cache
                loadNomenclature().then(() => {
                    // Update mapping if name changed
                    if (columnMapping[vColId] !== result) {
                        columnMapping[vColId] = result;
                        renderVirtualTable(currentSheetData);
                    }
                });
            }
        });
    } else {
        alert("Error: ViewerUI no disponible.");
    }
}

// Legacy renderEditMode kept for internal specific UI calls if any, 
// but main flow now uses openEditTermModal. 
// Can be removed if confirmed no other usage.
function renderEditMode(container, term) {
    // Kept empty or redirect to modal to avoid code rot, 
    // but for safety in this "surgical" paste, I'll comment it out 
    // or just log warning.
    console.warn("Legacy renderEditMode called. Redirecting to Modal...");
    openEditTermModal(term, 0);
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

        for (const [vColId, rulesStack] of activeRules) {
            const vCol = window.virtualColumns.find(v => v.id === vColId);
            if (!vCol) continue;
            const dataIdx = vCol.dataIdx;
            const colIdx = dataIdx; // fallback to modify row
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

function toggleProcessingRule(vColId) {
    if (processingRules[vColId]) {
        // En V3 (Pipeline), deshabilitamos todo el stack o la primera regla
        // Simplificación: Toggle disable en la primera regla
        const rules = Array.isArray(processingRules[vColId]) ? processingRules[vColId] : [processingRules[vColId]];
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

console.log("🗺️ [ViewerMapping] Herramientas de Mapeo Cargadas (Global Support).");