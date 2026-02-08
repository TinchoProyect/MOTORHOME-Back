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
            Object.keys(columnMapping).forEach(colIdx => {
                if (columnMapping[colIdx] === oldName || columnMapping[colIdx] === newTerm) {
                    columnMapping[colIdx] = newTerm;
                    const updatedRule = nomenclatureCache[idx].reglas_procesamiento;
                    if (updatedRule) {
                        processingRules[colIdx] = Array.isArray(updatedRule)
                            ? updatedRule
                            : [updatedRule];
                    } else {
                        delete processingRules[colIdx];
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
            Object.keys(columnMapping).forEach(colIdx => {
                const termName = columnMapping[colIdx];
                const term = nomenclatureCache.find(t => t.termino === termName);
                if (term && term.reglas_procesamiento) {
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

// [MODIFIED] Replaced inline create with Modal
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

    // [MODIFIED] Use SweetAlert for Creation
    createBtn.onclick = async () => {
        menu.remove();
        if (typeof Swal === 'undefined') return alert("SweetAlert not loaded");

        const { value: formValues } = await Swal.fire({
            title: 'Nuevo Encabezado',
            html: `
                <div class="flex flex-col gap-3 text-left">
                    <label class="text-xs font-bold text-slate-400 uppercase">Nombre del Término</label>
                    <input id="swal-input-term" class="swal2-input m-0 w-full" placeholder="Ej: PRECIO_LISTA">
                    
                    <label class="text-xs font-bold text-slate-400 uppercase mt-2">Descripción (Opcional)</label>
                    <input id="swal-input-desc" class="swal2-input m-0 w-full" placeholder="Para qué se usa...">
                    
                    <div class="flex items-center gap-2 mt-4 p-3 bg-blue-900/20 rounded border border-blue-500/30">
                        <input type="checkbox" id="swal-input-global" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <div class="flex flex-col">
                            <label for="swal-input-global" class="text-sm font-medium text-slate-200 cursor-pointer">Hacer Global</label>
                            <span class="text-[10px] text-slate-400">Disponible para todos los proveedores.</span>
                        </div>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Crear',
            confirmButtonColor: '#3b82f6',
            background: '#1e293b',
            color: '#fff',
            preConfirm: () => {
                return {
                    termino: document.getElementById('swal-input-term').value,
                    descripcion: document.getElementById('swal-input-desc').value,
                    isGlobal: document.getElementById('swal-input-global').checked
                }
            }
        });

        if (formValues && formValues.termino) {
            const success = await addNomenclatureTerm(formValues.termino, formValues.descripcion, formValues.isGlobal);
            if (success) {
                // Bug fix: Clean old rules
                if (processingRules[colIndex]) {
                    delete processingRules[colIndex];
                }
                columnMapping[colIndex] = formValues.termino.toUpperCase();
                renderVirtualTable(currentSheetData);
                saveSheetState(currentSheetName);
                renderSheetTabs();
                Swal.fire({
                    icon: 'success',
                    title: 'Creado',
                    text: `Término "${formValues.termino.toUpperCase()}" creado correctamente.`,
                    timer: 1500,
                    showConfirmButton: false,
                    background: '#1e293b',
                    color: '#fff'
                });
            }
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

        if (columnMapping[colIndex] === term.termino) {
            item.classList.add('bg-blue-900/10', 'border-blue-500');
            content.querySelector('span').classList.add('text-blue-400');
        }

        content.onclick = () => {
            columnMapping[colIndex] = term.termino;
            if (term.reglas_procesamiento) {
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
            // Call Modal Edit instead of inline
            menu.remove();
            openEditTermModal(term, colIndex);
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

// [MODIFIED] New Modal for Editing with Scope Control
async function openEditTermModal(term, colIndex) {
    if (typeof Swal === 'undefined') return alert("SweetAlert not loaded");

    const isCurrentlyGlobal = (term.proveedor_id === null);

    const { value: formValues } = await Swal.fire({
        title: 'Editar Encabezado',
        html: `
            <div class="flex flex-col gap-3 text-left">
                <input type="hidden" id="swal-edit-id" value="${term.id}">
                
                <label class="text-xs font-bold text-slate-400 uppercase">Nombre</label>
                <input id="swal-edit-term" class="swal2-input m-0 w-full" value="${term.termino}">
                
                <label class="text-xs font-bold text-slate-400 uppercase mt-2">Descripción</label>
                <input id="swal-edit-desc" class="swal2-input m-0 w-full" value="${term.descripcion_uso || ''}">
                
                <div class="flex items-center gap-2 mt-4 p-3 bg-slate-700/50 rounded border border-slate-600">
                    <input type="checkbox" id="swal-edit-global" class="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500" 
                        ${isCurrentlyGlobal ? 'checked' : ''}>
                    <div class="flex flex-col">
                        <label for="swal-edit-global" class="text-sm font-medium text-slate-200 cursor-pointer">Es Global</label>
                        <span class="text-[10px] text-slate-400">Si marcas esto, estará disponible para TODOS los proveedores.</span>
                    </div>
                </div>

                <div class="mt-2 pt-2 border-t border-slate-700">
                    <span class="text-[9px] text-slate-500 uppercase">Configuración de Reglas (Solo lectura en modal rápido)</span>
                    <div class="text-[10px] text-slate-400 font-mono truncate">${JSON.stringify(term.reglas_procesamiento || {})}</div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        showDenyButton: true,
        denyButtonText: 'Eliminar Término',
        denyButtonColor: '#ef4444',
        background: '#1e293b',
        color: '#fff',
        preConfirm: () => {
            return {
                id: document.getElementById('swal-edit-id').value,
                termino: document.getElementById('swal-edit-term').value,
                descripcion: document.getElementById('swal-edit-desc').value,
                isGlobal: document.getElementById('swal-edit-global').checked
            }
        }
    });

    if (formValues) {
        await updateNomenclatureTerm(
            formValues.id,
            formValues.termino,
            formValues.descripcion,
            undefined, // No rules update from simple modal
            formValues.isGlobal
        );
        Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: 'Término modificado correctamente.',
            timer: 1000,
            showConfirmButton: false,
            background: '#1e293b',
            color: '#fff'
        });
        // Re-open menu to show changes? Or just let user click again.
    } else if (Swal.getDenyButton().getAttribute('data-swal-deny-clicked') === 'true') {
        // Handle Delete
        if (confirm("¿Seguro que deseas eliminar este término permanentemente?")) {
            try {
                const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                await fetch(`${backendUrl}/api/files/dictionary/delete?id=${term.id}`, { method: 'DELETE' });
                const idx = nomenclatureCache.findIndex(t => t.id === term.id);
                if (idx !== -1) nomenclatureCache.splice(idx, 1);
                Swal.fire('Eliminado', '', 'success');
            } catch (e) {
                Swal.fire('Error', 'No se pudo eliminar', 'error');
            }
        }
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

console.log("🗺️ [ViewerMapping] Herramientas de Mapeo Cargadas (Global Support).");