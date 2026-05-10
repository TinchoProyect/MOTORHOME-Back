/**
 * VIEWER COMPUTED - Módulo Satélite de Cálculos
 * Se encarga de gestionar columnas calculadas (Precio - Descuento, etc.)
 */

console.log("%c 🧮 VIEWER COMPUTED: READY ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px;");

// Almacén global de columnas calculadas
window.computedColumns = [];

// --- ABRIR MODAL Y CARGAR OPCIONES ---
async function openCalculationModal(fromRuleWorkshop = false) {
    if (window.checkFlujoMutationGuard) {
        const isSafeToEdit = await window.checkFlujoMutationGuard();
        if (!isSafeToEdit) return; // User cancelled or aborted
    }

    const selectA = document.getElementById('calcFieldA');
    const selectB = document.getElementById('calcFieldB');
    const selectColName = document.getElementById('calcColName');

    // Limpiar opciones previas
    if (selectA) selectA.innerHTML = '';
    if (selectB) selectB.innerHTML = '';
    if (selectColName) selectColName.innerHTML = '';
    
    // Purga de multiclonados anteriores
    document.querySelectorAll('.calc-source-dyn').forEach((el, i) => { if(i>0) el.parentElement.remove(); });
    
    // V5: Obtener columnas procesadas visual y estructuralmente (Fase 1 completada)
    let hasOptions = false;

    let columnsToProcess = [];
    if (window.virtualColumns) {
        columnsToProcess = columnsToProcess.concat(window.virtualColumns);
    }
    if (window.computedColumns) {
        columnsToProcess = columnsToProcess.concat(window.computedColumns);
    }

    if (columnsToProcess.length > 0) {
        columnsToProcess.forEach((vCol) => {
            const vColId = vCol.id;
            let termName = null;

            // Para columnas calculadas (que ya fueron mapeadas/procesadas)
            if (vCol.masterField && vCol.masterField.nombre_campo) {
                termName = vCol.masterField.nombre_campo;
            }

            // 1. Obtener el Mapeo Primario como fuente principal prioritaria (Materia Prima)
            if (!termName) {
                termName = window.columnMapping ? window.columnMapping[vColId] : null;
            }
            
            // 2. Resguardo: Si la columna no está en columnMapping global, buscar el nombre mapeado nativo en el draft
            if (!termName && window.draftPipelines && window.draftPipelines[vColId]) {
                termName = window.draftPipelines[vColId].colName;
            }
            
            // 3. Resguardo V4 DB UUID: Si por arrastre legacy se guardó el ID maestro en lugar del nombre primario
            if (termName && termName.length === 36 && termName.includes('-') && window.masterDictionary) {
                const realField = window.masterDictionary.find(f => f.id === termName);
                if (realField) termName = realField.nombre_campo;
            }

                // --- Trazabilidad Triple ---
                let origenTexto = vColId;
                if (vColId.startsWith('ghost_')) {
                    origenTexto = "VARIANTE AÑADIDA";
                } else if (vColId.startsWith('calc_')) {
                    origenTexto = "VARIANTE CALCULADA";
                } else if (vColId.includes('__clone')) {
                    const baseIdStr = vColId.split('__')[0];
                    const baseName = window.rawHeaders && window.rawHeaders[baseIdStr] ? window.rawHeaders[baseIdStr] : baseIdStr;
                    origenTexto = baseName + " (Clonado)";
                } else if (vColId.startsWith('col_ph_')) {
                    origenTexto = "FANTASMA/CALCULADA";
                } else {
                    origenTexto = window.rawHeaders && window.rawHeaders[vColId] ? window.rawHeaders[vColId] : vColId;
                }

                let maestroTexto = "SIN MAESTRO";
                if (vCol.masterField && vCol.masterField.nombre_campo) {
                    maestroTexto = vCol.masterField.nombre_campo;
                } else if (window.draftPipelines && window.draftPipelines[vColId] && window.draftPipelines[vColId].masterField) {
                    maestroTexto = window.draftPipelines[vColId].masterField.nombre_campo || "SIN MAESTRO";
                }

                // Nombre efectivo de respaldo (cubre fantasmas vírgenes sin mapeo)
                const effectiveTermName = termName || (vColId.startsWith('col_ph_') ? vColId.replace('col_ph_', '') : (vColId.startsWith('ghost_') ? vColId.replace('ghost_', '') : vColId));
                const traceString = `[${origenTexto}] ➜ [${effectiveTermName}] ➜ [${maestroTexto}]`;

                // 1. SELECTOR DESTINO (Nombre de Columna): Siempre visible, incluye la columna activa y fantasmas absolutas
                if (selectColName) {
                    const optionName = document.createElement('option');
                    optionName.text = traceString;
                    optionName.className = "text-[10px] sm:text-[11px] font-mono leading-tight truncate";
                    optionName.value = maestroTexto !== "SIN MAESTRO" ? maestroTexto : effectiveTermName;
                    selectColName.appendChild(optionName);
                }

                // 2. SELECTORES DE OPERANDOS (A, B, Semántico): Omiten la columna actual y las ignoradas
                const isMathComputed = window._activeComputedContext && window._activeComputedContext.colIndex === vColId;
                if (termName && termName !== 'Ignorar Columna' && !isMathComputed) {
                    const optionA = document.createElement('option');
                    optionA.value = vColId; // ID virtual (operando técnico)
                    optionA.text = traceString;
                    optionA.className = "text-[10px] sm:text-[11px] font-mono leading-tight truncate";

                    const optionB = optionA.cloneNode(true);
                    const optionSemantic = optionA.cloneNode(true);

                    if (selectA) selectA.appendChild(optionA);
                    if (selectB) selectB.appendChild(optionB);
                    
                    const selectSemantic = document.getElementById('calcFieldSemanticKey');
                    if (selectSemantic) selectSemantic.appendChild(optionSemantic);
                    
                    hasOptions = true;
                }
            });
    }

    if (!hasOptions) {
        console.warn("⚠️ Primero debés mapear variables (ej: 'Precio Base' y 'Descuento') en el visor para usarlas como operandos.");
    }

    // [New] Dynamic UI For Operations
    const selOp = document.getElementById('calcOperation');
    if (selOp) {
        selOp.onchange = () => {
            const opValue = selOp.value;
            const labelA = document.getElementById('calcLabelA') || document.getElementById('calcFieldA').previousElementSibling;
            const containerB = document.getElementById('calcFieldB_container') || document.getElementById('calcFieldB').parentElement;
            const containerTol = document.getElementById('calcTolerateEmpty') ? document.getElementById('calcTolerateEmpty').parentElement : null;
            const cloneAddBtn = document.getElementById('cloneAddBtnContainer');
            
            if (opValue === 'CLONE' || opValue === 'CLONE_SEMANTIC') {
                if(labelA) labelA.innerText = opValue === 'CLONE_SEMANTIC' ? "Semántica Origen (Principal)" : "Columna Origen (Clonada)";
                if(containerB) containerB.style.display = 'none'; // Se devuelve el campo secundario a la normalidad
                document.getElementById('calcFieldA').style.display = 'block';
                
                const masterKeyContainer = document.getElementById('calcMasterKeyContainer');
                if (masterKeyContainer) {
                    if (opValue === 'CLONE_SEMANTIC') {
                        masterKeyContainer.style.display = 'block';
                    } else {
                        masterKeyContainer.style.display = 'none';
                    }
                }
                
                if(containerTol) containerTol.style.display = 'none';
                if(cloneAddBtn) cloneAddBtn.style.display = 'block';
                
                const formulaBtn = document.getElementById('btnOpenFormulaModal');
                if (formulaBtn) formulaBtn.style.display = 'none';
            } else if (opValue === 'CUSTOM_FORMULA') {
                if(labelA) labelA.innerText = "Fórmula Aritmética";
                document.getElementById('calcFieldA').style.display = 'none';
                if(containerB) containerB.style.display = 'none';
                
                let formulaBtn = document.getElementById('btnOpenFormulaModal');
                if (!formulaBtn) {
                    formulaBtn = document.createElement('button');
                    formulaBtn.id = 'btnOpenFormulaModal';
                    formulaBtn.type = 'button';
                    formulaBtn.className = "w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors mt-1 flex items-center justify-center gap-2";
                    formulaBtn.innerHTML = '<i data-lucide="function-square" class="w-4 h-4"></i> Construir Fórmula';
                    formulaBtn.onclick = () => window.openCustomFormulaModal && window.openCustomFormulaModal();
                    document.getElementById('calcFieldA').parentElement.appendChild(formulaBtn);
                    if (window.lucide) window.lucide.createIcons();
                }
                formulaBtn.style.display = 'flex';
                
                const masterKeyContainer = document.getElementById('calcMasterKeyContainer');
                if (masterKeyContainer) masterKeyContainer.style.display = 'none';
                if(containerTol) containerTol.style.display = 'none';
                if(cloneAddBtn) cloneAddBtn.style.display = 'none';
                document.querySelectorAll('.calc-source-dyn').forEach((el, i) => { if(i>0) el.parentElement.remove(); });
            } else {
                if(labelA) labelA.innerText = "Precio Base (A)";
                document.getElementById('calcFieldA').style.display = 'block';
                if(containerB) {
                    containerB.style.display = 'block';
                    const labelB = containerB.querySelector('label');
                    if(labelB) labelB.innerText = "Descuento (B)";
                }
                const masterKeyContainer = document.getElementById('calcMasterKeyContainer');
                if (masterKeyContainer) masterKeyContainer.style.display = 'none';
                
                if(containerTol) containerTol.style.display = 'flex';
                if(cloneAddBtn) cloneAddBtn.style.display = 'none';
                
                const formulaBtn = document.getElementById('btnOpenFormulaModal');
                if (formulaBtn) formulaBtn.style.display = 'none';
                
                // Reset clones on math operation
                document.querySelectorAll('.calc-source-dyn').forEach((el, i) => { if(i>0) el.parentElement.remove(); });
            }
        };
        // Limpiamos la basura visual del estado anterior forzándolo al disparar el trigger síncronamente
        selOp.onchange();
        if (window.lucide) window.lucide.createIcons();
    }

    // [UX FIX] Escuchar cualquier cambio dentro de la configuración para activar el botón de guardado
    const computedPanel = document.getElementById('vrwComputedMode');
    if (computedPanel) {
        computedPanel.addEventListener('change', () => {
            if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.enableSaveButton === 'function') {
                window.viewerRuleWorkshop.enableSaveButton();
            }
        });
    }
}

// [NUEVO V8.5] UI Dinámica para Clones Multicolumna
window.addCloneSourceUI = function() {
    const container = document.getElementById('calcOperandsContainer');
    if(!container) return;
    const baseSel = document.getElementById('calcFieldA');
    if(!baseSel) return;
    
    // Find how many currently exist
    const count = document.querySelectorAll('.calc-source-dyn').length + 1;
    
    const wrapper = document.createElement('div');
    wrapper.className = "space-y-1 relative";
    
    const label = document.createElement('label');
    label.className = "text-[10px] font-bold text-slate-500 uppercase flex justify-between";
    label.innerHTML = `Origen (REF ${count}) <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-400 font-bold"><i data-lucide="x" class="w-3 h-3 inline"></i></button>`;
    
    const sel = document.createElement('select');
    sel.className = "calc-source-dyn w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none";
    sel.innerHTML = baseSel.innerHTML; // Copy options
    sel.value = "";
    
    wrapper.appendChild(label);
    wrapper.appendChild(sel);
    container.appendChild(wrapper);
    if(window.lucide) lucide.createIcons();
};

// --- GUARDAR LA NUEVA COLUMNA ---
function saveComputedColumn(closeModal = true) {
    if (!window._activeComputedContext) return false;

    // Capturar el ID original de la columna en edición antes de que el modal cierre y borre el contexto
    const activeCompId = window._activeComputedContext.originalCompId || window._activeComputedContext.colIndex;
    let finalCompId = activeCompId;

    const op = document.getElementById('calcOperation').value;
    const nameInput = document.getElementById('calcColName') ? document.getElementById('calcColName').value.trim() : null;
    const tolerateEmpty = document.getElementById('calcTolerateEmpty') ? document.getElementById('calcTolerateEmpty').checked : true;
    
    let operandsList = [];

    if (op === 'CLONE' || op === 'CLONE_SEMANTIC') {
        const selects = document.querySelectorAll('.calc-source-dyn');
        selects.forEach(s => {
            if(s.value && s.value.trim() !== '') operandsList.push(s.value);
        });
        
        if (op === 'CLONE_SEMANTIC') {
            const vColIdSemanticKey = document.getElementById('calcFieldSemanticKey') ? document.getElementById('calcFieldSemanticKey').value : null;
            if (vColIdSemanticKey && vColIdSemanticKey.trim() !== '') operandsList.push(vColIdSemanticKey);
        }

        if (operandsList.length === 0) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Por favor completá al menos una Columna Origen a Clonar.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            else alert("Por favor completá al menos una Columna Origen a Clonar.");
            return false;
        }
    } else if (op === 'CUSTOM_FORMULA') {
        const finalFormula = window._tempCustomFormula ? window._tempCustomFormula : document.getElementById('customFormulaInput')?.value;
        if (!finalFormula || finalFormula.trim() === '') {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Debes construir una fórmula válida primero.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            else alert("Debes construir una fórmula válida primero.");
            return false;
        }
        operandsList = [finalFormula.trim()];
    } else {
        const vColIdA = document.getElementById('calcFieldA') ? document.getElementById('calcFieldA').value : null;
        const vColIdB = document.getElementById('calcFieldB') ? document.getElementById('calcFieldB').value : null;
        
        if (!vColIdA || !vColIdB) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Por favor completá todos los operandos.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            else alert("Por favor completá todos los operandos.");
            return false;
        }
        if (vColIdA === vColIdB) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Atención', text: 'Elegí columnas distintas para el cálculo.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            else alert("Elegí columnas distintas para el cálculo.");
            return false;
        }
        operandsList = [vColIdA, vColIdB];
    }

    const targetMasterField = { ...window._activeComputedContext.masterField };
    if (nameInput) targetMasterField.nombre_campo = nameInput;

    if (!Array.isArray(window.computedColumns)) {
        window.computedColumns = [];
    }

    // Actualizar en memoria
    if (window._activeComputedContext.originalCompId) {
        const id = window._activeComputedContext.originalCompId;
        const idx = window.computedColumns.findIndex(c => c.id === id);
        if (idx !== -1) {
            window.computedColumns[idx].masterField = targetMasterField;
            window.computedColumns[idx].macro = op || 'PRICE_MINUS_DISCOUNT_PERCENT';
            window.computedColumns[idx].operands = operandsList;
            window.computedColumns[idx].tolerateEmpty = tolerateEmpty;
            console.log("✅ Columna Calculada Actualizada:", window.computedColumns[idx]);
        } else if (id.startsWith('col_ph_')) {
            // [V5.20 FIX UX] Convert Ghost Placeholder natively into a Computed Column
            // Remove from virtualColumns so it doesn't render as physical anymore
            const ghostIdx = window.virtualColumns.findIndex(c => c.id === id);
            let ghostDataIdx = undefined;
            if (ghostIdx !== -1) {
                ghostDataIdx = window.virtualColumns[ghostIdx].dataIdx;
                window.virtualColumns.splice(ghostIdx, 1);
                
                // [QA BUGFIX] Limpiar residuo físico en currentSheetData para que
                // el Schema Merge del render engine no re-inyecte una columna huérfana.
                if (ghostDataIdx !== undefined && window.currentSheetData && Array.isArray(window.currentSheetData)) {
                    window.currentSheetData.forEach(row => {
                        if (Array.isArray(row) && row.length > ghostDataIdx) {
                            row[ghostDataIdx] = undefined;
                        }
                    });
                    // Recalcular longitud efectiva eliminando undefineds trailing
                    window.currentSheetData.forEach(row => {
                        if (Array.isArray(row)) {
                            while (row.length > 0 && row[row.length - 1] === undefined) {
                                row.pop();
                            }
                        }
                    });
                    console.log(`🧹 [COMPUTED] Residuo físico limpiado en currentSheetData (dataIdx: ${ghostDataIdx})`);
                }
            }
            
            // Push to computed array — almacenar _consumedDataIdx para que el Schema Merge
            // del render engine sepa no re-inyectar esta posición como columna virtual
            window.computedColumns.push({
                id: id,
                masterField: targetMasterField,
                macro: op || 'PRICE_MINUS_DISCOUNT_PERCENT',
                operands: operandsList,
                tolerateEmpty: tolerateEmpty,
                _consumedDataIdx: ghostDataIdx // Marca de posición consumida para Schema Merge guard
            });
            console.log("✅ Ghost Column convertido exitosamente a Columna Calculada!");
        }
    } else {
        // Ajouter en memoria
        const id = 'comp_' + Date.now();
        finalCompId = id;
        window.computedColumns.push({
            id: id,
            masterField: targetMasterField, // Destination
            macro: op || 'PRICE_MINUS_DISCOUNT_PERCENT', // V5 Rule constant for now (hardcoded map to UI Operation)
            operands: operandsList,
            tolerateEmpty: tolerateEmpty
        });
        console.log("✅ Columna Calculada Añadida al V5 Engine:", window.computedColumns);
    }

    // Cerrar el Workshop y forzar el volcado de reglas del Pipeline (si es que se asignaron reglas extra)
    if (closeModal && window.viewerRuleWorkshop) {
        if (typeof window.viewerRuleWorkshop.applyMapping === 'function') {
            window.viewerRuleWorkshop.applyMapping(); // Automáticamente cierra el panel
        } else {
            window.viewerRuleWorkshop.close();
        }
        // Limpiar busqueda
        window._activeComputedContext = null;
    }

    // [QA BUGFIX DEFINITIVO] Limpiar el draftPipeline huérfano del ghost DESPUÉS de que
    // applyMapping()/close() lo re-crearon.
    if (window.draftPipelines && window.computedColumns) {
        // En lugar de buscar el último elemento ciegamente, buscamos el que acabamos de editar o crear
        const targetId = activeCompId || (window.computedColumns.length > 0 ? window.computedColumns[window.computedColumns.length - 1].id : null);
        const savedCompConfig = window.computedColumns.find(c => c.id === targetId);
        
        if (savedCompConfig && savedCompConfig.id.startsWith('col_ph_')) {
            const isTextMacro = (savedCompConfig.macro === 'CLONE' || savedCompConfig.macro === 'CLONE_SEMANTIC');
            // FIX QA AMNESIA: Si es un texto o fusión semántica, la regla de transformación 
            // (el diccionario generado por AST) DEBE vivir en draftPipelines. Solo eliminamos para cálculo duro.
            if (!isTextMacro && window.draftPipelines[savedCompConfig.id]) {
                delete window.draftPipelines[savedCompConfig.id];
                console.log(`🧹 [COMPUTED] Pipeline huérfano matemático post-close '${savedCompConfig.id}' eliminado de draftPipelines`);
            }
        }
    }

    // Disparar Render Phase 1 & Phase 2 in-place (V5 Canvas)
    // [BUGFIX AMNESIA] Solo renderizar si closeModal es true (cuando no viene desde applyMapping).
    // Si viene desde applyMapping, delegamos el render final a él para evitar que el AG-Grid lea 
    // pipelines que todavía no fueron guardados en memoria y borre visualmente los datos.
    if (closeModal && (!window.viewerRuleWorkshop || typeof window.viewerRuleWorkshop.applyMapping !== 'function')) {
        if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
            window.renderVirtualTable(window.currentSheetData);
        }
    }

    // Notify User explicitly when saving locally without modal close
    if (!closeModal && window.Toast) {
        window.Toast.fire({
            icon: 'success',
            title: 'Fórmula guardada'
        });
    }

    return finalCompId;
}

// --- BORRAR COLUMNA ---
function deleteComputedColumn(indexStr) {
    const idx = parseInt(indexStr, 10);
    if (Array.isArray(window.computedColumns) && !isNaN(idx) && idx >= 0 && idx < window.computedColumns.length) {
        window.computedColumns.splice(idx, 1);

        console.log(`🗑️ Columna Calculada eliminada en el Engine.`);

        if (typeof window.renderVirtualTable === 'function' && window.currentSheetData) {
            window.renderVirtualTable(window.currentSheetData);
        }
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, false); // Autoguardado silencioso
        }
    }

    return true;
}

function editComputedColumn(vColId) {
    if (!window.computedColumns) return;
    
    // Buscar la configuración de esta columna en nuestros registros
    const compConfig = window.computedColumns.find(c => c.id === vColId || c.masterField?.nombre_campo === vColId);
    if (!compConfig) {
        console.warn("⚠️ [EDIT.COMPUTED] Columna calculada no encontrada en engine.", vColId);
        return;
    }

    // Inyectar el estado antes de abrir la UI para que la UX sepa re-hidratarse
    window._activeComputedContext = {
        masterField: compConfig.masterField,
        colName: compConfig.masterField?.nombre_campo || "Edición V5",
        colIndex: compConfig.id,
        originalCompId: compConfig.id // Fundamental para que el setTimeout sepa a quien pertenece
    };

    // Delegation to Workshop UX
    if (window.viewerRuleWorkshop) {
        window.viewerRuleWorkshop.open(compConfig.masterField, compConfig.id, compConfig.masterField?.nombre_campo || "Edición V5");
    }
}

// --- [NUEVO V9] EDITOR DE FÓRMULAS DINÁMICAS ---
window.openCustomFormulaModal = async function() {
    if (typeof Swal === 'undefined') return alert("SweetAlert2 no está disponible.");

    // Recolectar las columnas mapeadas para mostrar como tokens
    const columnsToProcess = [];
    if (window.virtualColumns) columnsToProcess.push(...window.virtualColumns);
    if (window.computedColumns) columnsToProcess.push(...window.computedColumns);

    let tokenButtons = '';
    const availableTokens = [];
    
    columnsToProcess.forEach(vCol => {
        const vColId = vCol.id;
        // Evitamos referenciarnos a nosotros mismos si ya estamos en una columna calculada guardada
        if (window._activeComputedContext && window._activeComputedContext.colIndex === vColId) return;

        let termName = vCol.masterField?.nombre_campo || 
                       (window.columnMapping ? window.columnMapping[vColId] : null) || 
                       (window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].colName : null);
        
        if (termName && termName !== 'Ignorar Columna') {
            const tokenStr = `{${vColId}}`;
            availableTokens.push({ id: vColId, name: termName });
            tokenButtons += `<button type="button" onclick="document.getElementById('customFormulaInput').value += ' ${tokenStr} '" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-[10px] text-slate-300 transition-colors truncate max-w-[150px]" title="${termName}">${termName}</button>`;
        }
    });

    if (availableTokens.length === 0) {
        return Swal.fire('Atención', 'No hay otras columnas mapeadas para construir una fórmula.', 'warning');
    }

    // Si ya existe una fórmula guardada, la recuperamos
    let existingFormula = '';
    if (window._activeComputedContext && window._activeComputedContext.originalCompId) {
        const compConfig = window.computedColumns.find(c => c.id === window._activeComputedContext.originalCompId);
        if (compConfig && compConfig.macro === 'CUSTOM_FORMULA' && compConfig.operands && compConfig.operands[0]) {
            existingFormula = compConfig.operands[0];
        }
    }

    const { value: formula } = await Swal.fire({
        title: '<div class="text-indigo-400 font-bold"><i data-lucide="function-square" class="inline w-5 h-5 mr-2"></i>Constructor de Fórmulas</div>',
        html: `
            <div class="text-left space-y-4 font-sans text-sm mt-4">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Expresión Aritmética</label>
                    <textarea id="customFormulaInput" rows="3" class="w-full bg-slate-950 border border-indigo-500/50 rounded-lg p-3 text-white font-mono text-sm outline-none focus:border-indigo-400 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)]" placeholder="Ej: ({col_1} * 1.07) / 1.21" oninput="if(this.value.includes('%')){ this.value = this.value.replace(/%/g, ''); Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'Uso de Porcentajes', text: 'Para aplicar porcentajes, utilice multiplicadores decimales (ej: para sumar 7%, multiplique por 1.07)', showConfirmButton: false, timer: 5000, background: '#1e293b', color: '#f8fafc'}); }">${existingFormula}</textarea>
                </div>
                
                <div class="space-y-2">
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Operadores</label>
                    <div class="flex flex-wrap gap-2">
                        ${['+', '-', '*', '/', '(', ')'].map(op => `<button type="button" onclick="document.getElementById('customFormulaInput').value += ' ${op} '" class="w-8 h-8 flex items-center justify-center bg-indigo-900/40 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white rounded font-bold transition-colors">${op}</button>`).join('')}
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-[10px] font-bold text-slate-500 uppercase">Variables Disponibles</label>
                    <div class="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar p-2 bg-slate-900/50 rounded border border-slate-700/50">
                        ${tokenButtons}
                    </div>
                </div>
            </div>
        `,
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true,
        confirmButtonText: 'Aplicar Fórmula',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#334155',
        width: '600px',
        didOpen: () => {
            if (window.lucide) window.lucide.createIcons({ root: Swal.getPopup() });
        },
        preConfirm: () => {
            let inputVal = document.getElementById('customFormulaInput').value.trim();
            if (!inputVal) {
                Swal.showValidationMessage('La fórmula no puede estar vacía');
                return false;
            }
            
            // Sanitización silenciosa: reemplazar comas decimales por puntos para JS nativo
            inputVal = inputVal.replace(/,/g, '.');
            document.getElementById('customFormulaInput').value = inputVal;

            // Sanitización básica: solo permitir math chars y tokens como {col_1}
            const cleanStr = inputVal.replace(/{[^}]+}/g, ''); // remove tokens temporarily
            if (/[^\d\.\s\+\-\*\/\(\)]/.test(cleanStr)) {
                Swal.showValidationMessage('La fórmula contiene caracteres inválidos. Usa solo números y operadores básicos.');
                return false;
            }
            return inputVal;
        }
    });

    if (formula) {
        // Guardamos la fórmula temporalmente en un atributo del modal parent o una variable global para el saveComputedColumn
        window._tempCustomFormula = formula;
        
        // Habilitamos el guardado en el Workshop
        if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.enableSaveButton === 'function') {
            window.viewerRuleWorkshop.enableSaveButton();
        }
        
        // Alerta leve para indicar que está lista
        Swal.fire({
            toast: true, position: 'bottom-end',
            icon: 'success', title: 'Fórmula asignada. Haz clic en Guardar Cambios.',
            showConfirmButton: false, timer: 3000, background: '#1e293b', color: '#f8fafc'
        });
    }
};

window.ViewerUI = window.ViewerUI || {};
window.ViewerUI.deleteComputedColumn = deleteComputedColumn;

// Exponemos las funciones para que el HTML pueda llamarlas (onclick)
window.openCalculationModal = openCalculationModal;
window.saveComputedColumn = saveComputedColumn;
window.editComputedColumn = editComputedColumn;