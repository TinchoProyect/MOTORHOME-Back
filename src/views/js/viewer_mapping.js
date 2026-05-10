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
    if (window.currentSheetData) window.renderVirtualTable(window.currentSheetData);
}

// [MODIFIED] Replaced inline create with Modal
async function openColumnMenu_v2(vColId, buttonElement) {
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
                    window.renderVirtualTable(window.currentSheetData);
                    window.saveSheetState(window.currentSheetName);
                    window.renderSheetTabs();
                    // 4. Update Cache
                    loadNomenclature().then(() => {
                        console.log(`🔗 [MAPPING] Mapeo Primario guardado en Cache local.`);
                    });
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

        content.onclick = async () => {
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
                    const result = await Swal.fire({
                        title: 'Mapeo Duplicado Detectado',
                        text: `El campo orgánico "${term.termino}" ya se encuentra asignado a otra columna oculta o existente.`,
                        icon: 'warning',
                        background: '#0f172a',
                        color: '#f8fafc',
                        showCancelButton: true,
                        confirmButtonText: 'Forzar reasignación aquí',
                        cancelButtonText: 'Mantener bloqueado',
                        confirmButtonColor: '#2563eb', // blue-600
                        cancelButtonColor: '#334155'  // slate-700
                    });

                    if (!result.isConfirmed) {
                        menu.remove();
                        return; // Usuario canceló
                    }

                    // Forzar reasignación: Limpiamos los mapeos viejos de este término
                    for (const k of Object.keys(window.columnMapping)) {
                        if (window.columnMapping[k] === term.termino) {
                            delete window.columnMapping[k];
                        }
                    }
                } else {
                    alert(`El campo "${term.termino}" ya está asignado. Desvincúlalo primero.`);
                    menu.remove();
                    return;
                }
            }

            // [QA FIX] Global Assignment and Native Implicit Persistence
            window.columnMapping[vColId] = term.termino;
            console.log(`🔗 [MAPPING CAPA 1] Mapeo Primario asignado a '${vColId}' (${term.termino}). Esperando vinculación a Capa 2.`);

            // [QA BUGFIX CRÍTICO V9]: Forzamos inyección en draftPipelines.
            // Si es columna fantasma previene desincronización DOM.
            // [HERD IMMUNITY QA] Inyecta las reglas históricas del Master Dictionary (AST Perpetual).
            if (!window.draftPipelines) window.draftPipelines = {};
            
            let targetRules = [];
            if (window.draftPipelines[vColId] && window.draftPipelines[vColId].rules && window.draftPipelines[vColId].rules.length > 0) {
                targetRules = window.draftPipelines[vColId].rules;
            } else if (term.reglas_procesamiento) {
                targetRules = Array.isArray(term.reglas_procesamiento) ? term.reglas_procesamiento : [term.reglas_procesamiento];
                console.log(`[HERD IMMUNITY] Auto-inyectando ${targetRules.length} reglas históricas AST para ${term.termino}`);
            } else {
                // [BUGFIX AMNESIA] Si el término maestro no tiene reglas globales todavía, y estamos re-seleccionando el término, 
                // asegurar de no planchar las reglas locales generadas por Chofer IA que podrían estar persistidas en draftPipelines.
                if (window.draftPipelines && window.draftPipelines[vColId] && window.draftPipelines[vColId].rules) {
                     targetRules = window.draftPipelines[vColId].rules;
                }
            }

            window.draftPipelines[vColId] = {
                colName: term.termino,
                masterField: { id: term.id, nombre_campo: term.termino },
                rules: targetRules
            };
            
            if (vColId.startsWith('col_ph_')) {
                console.log(`🛠️ [UX FIX] Ghost Column '${vColId}' anclado nativamente a draftPipelines para evitar purga del DOM y habilitar Taller.`);
            }

            // [V8] Consumir _isNewTemp ahora que la columna está mapeada — ya no necesita inmunidad
            if (window.virtualColumns) {
                const vc = window.virtualColumns.find(c => c.id === vColId);
                if (vc && vc._isNewTemp) {
                    delete vc._isNewTemp;
                    console.log(`🔄 [MAPPING V8] Flag _isNewTemp consumido para '${vColId}' (columna ahora mapeada)`);
                }
            }

            // [V7] Computed Column Mapping Sync
            if (window.computedColumns) {
                const compDef = window.computedColumns.find(c => c.id === vColId);
                if (compDef) {
                    compDef.masterField = { id: term.id, nombre_campo: term.termino };
                }
            }
            
            if (term.reglas_procesamiento) {
                window.processingRules[vColId] = Array.isArray(term.reglas_procesamiento)
                    ? term.reglas_procesamiento
                    : [term.reglas_procesamiento];
            } else {
                if (window.processingRules && window.processingRules[vColId]) delete window.processingRules[vColId];
            }
            window.renderVirtualTable(window.currentSheetData);
            window.saveSheetState(window.currentSheetName);
            window.renderSheetTabs();
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

    const searchGlobalBtn = document.createElement('button');
    searchGlobalBtn.className = 'w-full px-4 py-3 text-left border-t border-slate-700/50 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors flex items-center gap-2 font-bold tracking-wide';
    searchGlobalBtn.innerHTML = '<i data-lucide="search" class="w-3 h-3 text-indigo-400"></i> Buscar en otros proveedores...';
    searchGlobalBtn.onclick = () => {
        menu.remove();
        if (typeof window.openGlobalColumnSearchModal === 'function') {
            window.openGlobalColumnSearchModal(vColId);
        } else {
            alert("Función no implementada aún.");
        }
    };
    menu.appendChild(searchGlobalBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'w-full px-4 py-3 text-left border-t border-red-900/50 text-[10px] text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2';
    deleteBtn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i> Eliminar Mapeo';
    deleteBtn.onclick = () => {
        // [V5.14 UX] Complete deletion logic
        const isClone = vColId.includes('_clone_');

        if (window.columnMapping) delete window.columnMapping[vColId];
        if (window.processingRules) delete window.processingRules[vColId];
        if (window.draftPipelines) delete window.draftPipelines[vColId];
        
        // [V7] Computed Column Mapping Sync
        if (window.computedColumns) {
            const compDef = window.computedColumns.find(c => c.id === vColId);
            if (compDef) delete compDef.masterField;
        }

        if (isClone && window.virtualColumns) {
            const idx = window.virtualColumns.findIndex(v => v.id === vColId);
            if (idx !== -1) window.virtualColumns.splice(idx, 1);
        }

        window.renderVirtualTable(window.currentSheetData);
        window.saveSheetState(window.currentSheetName);
        window.renderSheetTabs();
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
                    window.renderVirtualTable(window.currentSheetData);
                }
            } else {
                // Term Updated. Refresh Cache
                loadNomenclature().then(() => {
                    // Update mapping if name changed
                    if (columnMapping[vColId] !== result) {
                        columnMapping[vColId] = result;
                        window.renderVirtualTable(window.currentSheetData);
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
            window.renderVirtualTable(window.currentSheetData);
        }
    }
}

window.resetMappingCache = function () {
    console.log("🧹 [ViewerMapping] Limpiando caché de nomenclaturas...");
    nomenclatureCache = [];
};

// ============================================================================
// [NEW V9] GLOBAL COLUMN PROMOTION (CROSS-PROVIDER SEARCH)
// ============================================================================
window.openGlobalColumnSearchModal = async function(vColId) {
    if (typeof Swal === 'undefined') return alert("SweetAlert2 no está disponible.");

    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    Swal.fire({
        title: 'Buscando Columnas Globales...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // Obtenemos ABSOLUTAMENTE TODAS las columnas (Cross-Provider)
        const response = await fetch(`${backendUrl}/api/files/dictionary?fetchAll=true`);
        if (!response.ok) throw new Error("Error al obtener catálogo global.");
        const allTerms = await response.json();

        // Filtramos las que ya tenemos en nuestro caché local
        const localIds = new Set(nomenclatureCache.map(t => t.id));
        const foreignTerms = allTerms.filter(t => !localIds.has(t.id));

        if (foreignTerms.length === 0) {
            return Swal.fire({
                icon: 'info', title: 'Sin Resultados',
                text: 'No hay columnas ocultas o ajenas disponibles para promover.',
                background: '#0f172a', color: '#f8fafc'
            });
        }

        // Construir HTML para el listado interactivo
        let htmlContent = `<div class="max-h-[300px] overflow-y-auto custom-scrollbar text-left mt-4 border border-slate-700 rounded bg-slate-900 p-2">`;
        foreignTerms.forEach(term => {
            const isGlobal = term.proveedor_id === null;
            const badge = isGlobal ? `<span class="bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-[8px] uppercase tracking-wider">Ya es Global</span>` : `<span class="bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded text-[8px] uppercase tracking-wider">Aislada (Privada)</span>`;
            
            htmlContent += `
                <div class="flex items-center justify-between p-2 hover:bg-slate-800 border-b border-slate-800 transition-colors rounded cursor-pointer group" onclick="window.promoteGlobalTerm('${term.id}', '${term.termino}', '${vColId}')">
                    <div class="flex flex-col">
                        <span class="text-[12px] font-bold text-slate-200 font-mono group-hover:text-blue-400 transition-colors">${term.termino}</span>
                        <span class="text-[9px] text-slate-500">${term.descripcion_uso || 'Sin descripción'}</span>
                    </div>
                    <div>${badge}</div>
                </div>
            `;
        });
        htmlContent += `</div>`;

        Swal.fire({
            title: 'Explorador Transversal',
            html: `<p class="text-sm text-slate-400">Selecciona una columna pre-existente en otro proveedor para promoverla y utilizarla en este flujo.</p>${htmlContent}`,
            showConfirmButton: false,
            showCloseButton: true,
            background: '#1e293b', color: '#f8fafc',
            width: '600px',
            customClass: { container: 'z-[9999]' }
        });

    } catch (error) {
        console.error("[ViewerMapping] Error global search:", error);
        Swal.fire('Error', error.message, 'error');
    }
};

window.promoteGlobalTerm = async function(termId, termName, vColId) {
    if (typeof Swal === 'undefined') return;

    const result = await Swal.fire({
        title: '¿Promover a Global?',
        html: `Al promover <b>${termName}</b>, esta columna estará disponible permanentemente para todos los proveedores de LAMDA.<br><br>¿Deseas promoverla y asignarla inmediatamente?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Promover y Asignar',
        cancelButtonText: 'Cancelar',
        background: '#1e293b', color: '#f8fafc',
        customClass: { container: 'z-[9999]' }
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'Promoviendo...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        customClass: { container: 'z-[9999]' }
    });

    try {
        if (!window.NomenclatureService || !window.NomenclatureService.update) {
            throw new Error("Servicio de Nomenclatura no disponible.");
        }

        // Llamamos a Update forzando isGlobal = true.
        // El término ya existe, solo le cambiamos el scope.
        await window.NomenclatureService.update(termId, { 
            termino: termName,
            isGlobal: true 
        });

        // Refrescar caché local
        await loadNomenclature();

        // Asignar al vColId activo
        window.columnMapping[vColId] = termName;

        // Inyectamos las reglas históricas si las hubiera
        const termObj = nomenclatureCache.find(t => t.id === termId);
        if (!window.draftPipelines) window.draftPipelines = {};
        
        let targetRules = [];
        if (termObj && termObj.reglas_procesamiento) {
            targetRules = Array.isArray(termObj.reglas_procesamiento) ? termObj.reglas_procesamiento : [termObj.reglas_procesamiento];
            window.processingRules[vColId] = targetRules;
        } else {
             if (window.processingRules && window.processingRules[vColId]) delete window.processingRules[vColId];
        }

        window.draftPipelines[vColId] = {
            colName: termName,
            masterField: { id: termId, nombre_campo: termName },
            rules: targetRules
        };

        // Renderizado final
        window.renderVirtualTable(window.currentSheetData);
        window.saveSheetState(window.currentSheetName);
        window.renderSheetTabs();

        Swal.fire({
            icon: 'success', title: 'Columna Promovida',
            text: `La columna ${termName} ahora es global y ha sido asignada con éxito.`,
            timer: 2500, showConfirmButton: false,
            background: '#1e293b', color: '#f8fafc',
            customClass: { container: 'z-[9999]' }
        });

    } catch (e) {
        console.error("Error al promover término:", e);
        Swal.fire('Error', 'No se pudo promover la columna: ' + e.message, 'error');
    }
};

console.log("🗺️ [ViewerMapping] Herramientas de Mapeo Cargadas (Global Support).");
