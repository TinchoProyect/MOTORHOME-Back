import aiService from "./viewer_ai_service.js";
import aiSampler from "./viewer_ai_sampler.js";

/**
 * Viewer AI UI Controller
 * Montador de Componentes Limpio (Cero Tótem)
 */

class ViewerAiUi {
    constructor() {
        this.container = null;
        this.statusEl = null;
        this.promptEl = null;
        this.feedbackEl = null;
        this.btnEl = null;
    }

    async init() {
        // Enforce DOM completely mounted
        setTimeout(() => this._mountComponent(), 500);
    }

    _mountComponent() {
        const standardModeContainer = document.getElementById('vrwStandardMode');
        if (!standardModeContainer) return;

        // Comprobación de que no se ha montado ya
        if (document.getElementById('m_ai_copilot_container')) return;

        // Inyeccion Cero Totem
        const wrapper = document.createElement('div');
        wrapper.id = 'm_ai_copilot_container';
        wrapper.className = "bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/30 shrink-0 mt-4 relative overflow-hidden";
        
        wrapper.innerHTML = `
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"></div>
            <div class="flex items-center justify-between mb-2 relative z-10">
                <label class="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <i data-lucide="bot" class="w-3.5 h-3.5 text-indigo-400"></i> Chofer IA Copilot
                </label>
                <div class="flex items-center gap-2">
                    <i id="vaiHealthIndicator" data-lucide="activity" class="w-3 h-3 text-slate-600 animate-pulse"></i>
                    <span id="vaiStatus" class="text-[9px] text-slate-500 font-mono">Buscando Nodo...</span>
                </div>
            </div>
            
            <div class="flex flex-col gap-2 relative z-10">
                <textarea id="vaiPrompt" rows="2" placeholder="Ej: Condiciona la extracción aislando los prefijos..." 
                    class="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-indigo-500/50 transition-colors shadow-inner resize-none font-mono placeholder:text-slate-600 custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed" 
                    disabled></textarea>
                
                <div class="flex items-center justify-between">
                    <div id="vaiFeedback" class="text-[9px] font-bold px-2 py-0.5 rounded-full hidden"></div>
                    <button id="vaiTriggerBtn" class="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-[10px] font-bold uppercase shrink-0 min-w-min ml-auto" disabled>
                        <i data-lucide="zap" class="w-3.5 h-3.5"></i> Generar AST
                    </button>
                </div>
            </div>
        `;

        standardModeContainer.appendChild(wrapper);
        if (window.lucide) window.lucide.createIcons();

        // Bindings
        this.statusEl = document.getElementById('vaiStatus');
        this.promptEl = document.getElementById('vaiPrompt');
        this.feedbackEl = document.getElementById('vaiFeedback');
        this.btnEl = document.getElementById('vaiTriggerBtn');
        this.healthIcon = document.getElementById('vaiHealthIndicator');

        this.btnEl.onclick = () => this.handleGenerate();

        // Inicializar Health Check periódico (cada 15 secs solo si el panel esta abierto)
        this._runHealthCheck();
        setInterval(() => {
            const panel = document.getElementById('viewerRightPanel');
            if (panel && !panel.classList.contains('hidden')) {
                this._runHealthCheck();
            }
        }, 15000);
    }

    async _runHealthCheck() {
        const isOk = await aiService.checkHealth();
        if (isOk) {
            if (this.healthIcon) this.healthIcon.classList.replace('text-slate-600', 'text-emerald-500');
            if (aiService.isProcessing) return; // Evita pisar 'Pensando...' y no rehabilita botones aún
            
            this._setStatus('Conectado', 'success');
            this.promptEl.disabled = false;
            this.btnEl.disabled = false;
        } else {
            this._setStatus('Nodo Off-line', 'error');
            this.promptEl.disabled = true;
            this.btnEl.disabled = true;
            if (this.healthIcon) this.healthIcon.classList.replace('text-emerald-500', 'text-red-500');
        }
    }

    _setStatus(text, state = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        const colors = {
            'info': 'text-indigo-400',
            'success': 'text-emerald-400',
            'error': 'text-red-400',
            'working': 'text-amber-400 animate-pulse'
        };
        this.statusEl.className = `text-[9px] font-mono ${colors[state] || colors.info}`;
    }

    _setFeedback(htmlText, type = 'success') {
        if (!this.feedbackEl) return;
        this.feedbackEl.innerHTML = htmlText;
        this.feedbackEl.className = `text-[9px] font-bold px-2 py-0.5 rounded-full ${
            type === 'success' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/30' :
            (type === 'warning' ? 'bg-amber-900/40 text-amber-400 border border-amber-500/30' :
            'bg-red-900/40 text-red-400 border border-red-500/30')
        }`;
        this.feedbackEl.classList.remove('hidden');
    }

    async _buildUniqueSet(dataIdx, pipeline) {
        return new Promise((resolve) => {
            const rawRows = window.currentSheetData.slice(1);
            const total = rawRows.length;
            const uniqueSet = new Set();
            const chunkSize = 5000;
            let i = 0;

            const processChunk = () => {
                const end = Math.min(i + chunkSize, total);
                for (; i < end; i++) {
                    let val = "";
                    if (Array.isArray(dataIdx)) {
                        val = dataIdx.map(idx => String(rawRows[i][idx] || "").trim()).filter(v => v).join(" | ");
                    } else {
                        val = String(rawRows[i][dataIdx] || "").trim();
                    }
                    if (!val) continue;
                    if (pipeline && pipeline.length > 0 && typeof window.viewerETL !== 'undefined') {
                        const mutateRs = window.viewerETL.transformCell(val, pipeline);
                        if (mutateRs.rejected) continue;
                        val = mutateRs.display || mutateRs.result || "";
                    }
                    if (val.trim()) uniqueSet.add(val.trim());
                }
                
                // Excluir Strings gigantes (Data profiling no sirve en párrafos)
                for (let k of uniqueSet) { if (k.length > 150) uniqueSet.delete(k); }
                
                if (i < total) {
                    this._setStatus(`Escaneando: ${Math.floor((i/total)*100)}%`, 'working');
                    setTimeout(processChunk, 0); // Lote asíncrono preventivo
                } else {
                    resolve(Array.from(uniqueSet));
                }
            };
            processChunk();
        });
    }

    async handleGenerate() {
        const promptText = this.promptEl.value.trim();
        if (!promptText) return;

        this.btnEl.disabled = true;
        
        try {
            if (!window.viewerRuleWorkshop || typeof window.viewerRuleWorkshop.getActiveState !== 'function') {
                throw new Error("Taller inalcanzable");
            }

            const state = window.viewerRuleWorkshop.getActiveState();
            if (!state || !state.colIndex) throw new Error("Abre el taller de una columna");

            let extractionDataIdx = undefined;
            let targetColName = "Columna Desconocida";
            let foundPhysical = false;
            let vCol = window.virtualColumns ? window.virtualColumns.find(v => v.id === state.colIndex) : null;
            
            // [UX FIX] Auto-guardar ecuación si el usuario está en el Taller con una operación matemática abierta 
            // pero olvidó presionar "Guardar Ecuación" antes de intentar extraer AST con Chofer IA.
            if (window._activeComputedContext && window._activeComputedContext.colIndex === state.colIndex && typeof window.saveComputedColumn === 'function') {
                console.log(`[Chofer IA] 🪄 Salvando ecuación matemática en vuelo para ${state.colIndex} de forma automática...`);
                window.saveComputedColumn(false);
            }

            // 1. Rastreo Bimodal Primero (Prioridad a Computadas y Clones Pivot multi-columna)
            if (window.computedColumns && Array.isArray(window.computedColumns)) {
                const compDef = window.computedColumns.find(c => c.id === state.colIndex);
                if (compDef && compDef.operands && compDef.operands.length > 0) {
                    
                    let resolvedIndices = [];
                    let hasMissing = false;
                    
                    for (let opIdx of compDef.operands) {
                        const sourceCol = window.virtualColumns ? window.virtualColumns.find(v => v.id === opIdx) : null;
                        if (sourceCol && sourceCol.dataIdx !== undefined && sourceCol.dataIdx !== null) {
                            resolvedIndices.push(sourceCol.dataIdx);
                        } else if (sourceCol) {
                            // [V5.25 NUEVO] Rastreo en cascada profunda: Es posible que el origen sea OTRA columna computada.
                            const sourceComp = window.computedColumns.find(c => c.id === opIdx);
                            if (sourceComp && sourceComp.operands && sourceComp.operands.length > 0) {
                                const deepCol = window.virtualColumns ? window.virtualColumns.find(v => v.id === sourceComp.operands[0]) : null;
                                if (deepCol && deepCol.dataIdx !== undefined && deepCol.dataIdx !== null) {
                                    resolvedIndices.push(deepCol.dataIdx);
                                } else {
                                    hasMissing = true;
                                }
                            } else {
                                hasMissing = true;
                            }
                        } else {
                            hasMissing = true;
                        }
                    }
                    
                    if (resolvedIndices.length > 0 && !hasMissing) {
                        // Si hay 1 solo elemento se mantiene el formato de entero para retro-compatibilidad
                        extractionDataIdx = resolvedIndices.length === 1 ? resolvedIndices[0] : resolvedIndices;
                        targetColName = compDef.masterField && compDef.masterField.nombre_campo ? compDef.masterField.nombre_campo : "Clon Computado";
                        console.log(`[Chofer IA] Rastreo Bimodal Multi-Columna: Pivotando dataIdx orígenes [${resolvedIndices.join(", ")}] operando sobre clon/fórmula.`);
                        foundPhysical = true;
                    } else {
                        console.warn(`[Chofer IA] Rastreo Bimodal abortado: Fallo en resolución híbrida de las N-columnas.`);
                    }
                }
            }

            // 2. Intentar lectura física (Fallback V4) si no es computada o si falló el bimodal
            if (!foundPhysical) {
                // [FIX V8] Sólo intentar extraer datos físicos si no es un Placeholder Inyectado vacío
                if (vCol && vCol.dataIdx !== undefined && vCol.dataIdx !== null && !vCol.isGhostPlaceholder && !String(vCol.id).startsWith('col_ph_')) {
                    extractionDataIdx = vCol.dataIdx;
                    targetColName = window.currentSheetData && window.currentSheetData[0] ? window.currentSheetData[0][extractionDataIdx] || targetColName : targetColName;
                } else if (vCol && (vCol.isGhostPlaceholder || String(vCol.id).startsWith('col_ph_'))) {
                    console.warn(`[Chofer IA] Bloqueo de Ingesta Fantasma: La columna ${state.colIndex} es un placeholder vacío. No se ha definido su origen de clonación (Computada) en el Editor Matemático.`);
                } else if (vCol) {
                    console.warn(`[Chofer IA] Fallback 1 abortado: Columna destino ${state.colIndex} encontrada pero sin dataIdx físico.`);
                }
            }
            
            if (extractionDataIdx === undefined) {
                 throw new Error("Columna fantasma sin vincular. Debes asignar una regla de 'Clonación' en el Editor de Célculos (ƒx) antes de usar Chofer IA.");
            }
            
            // FASE 2: Data Profiling Activo (Extracción Silente Completa)
            this._setStatus('Extrayendo Perfil...', 'working');
            const uniqueDictionary = await this._buildUniqueSet(extractionDataIdx, state.pipeline);
            
            if (uniqueDictionary.length === 0) throw new Error("La columna carece de datos parseables.");
            
            // Overlays Cinematográficos
            if (window.Swal) {
                Swal.fire({
                    title: 'Inspeccionando Matriz...',
                    html: `Mapeo completado: <b>${uniqueDictionary.length}</b> valores únicos detectados.<br>
                           Solicitando filtrado semántico al Motor IA...`,
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); },
                    background: '#0f172a', color: '#f8fafc'
                });
            }

            const isFormattingPattern = promptText.toLowerCase().match(/(extraer|quit|borrar|separar|remplazar|reemplazar|regex|limpiar)/);
            const useClustering = uniqueDictionary.length <= 60 && !isFormattingPattern;

            const payload = {
                column_name: targetColName,
                prompt: promptText,
                samples: useClustering ? uniqueDictionary : uniqueDictionary.slice(0, 15), 
                require_ast: !useClustering
            };

            this._setStatus('IA Analizando...', 'working');
            
            if (useClustering) {
                // === RUTA LENTA: DISCOVER ENTITIES (CLUSTERING) ===
                const responseData = await aiService.discoverEntities(payload);
                if (window.Swal && Swal.isVisible()) Swal.close();
                
                if (!responseData || !responseData.cluster || typeof responseData.cluster !== 'object' || Array.isArray(responseData.cluster)) {
                    throw new Error("El modelo retornó formato de cluster inválido.");
                }
                
                const clusterMap = responseData.cluster;
                if (Object.keys(clusterMap).length === 0) throw new Error("La IA no detectó ninguna coincidencia.");
                
                await this._displayConsensusModal(clusterMap, promptText, vCol);

            } else {
                // === RUTA RÁPIDA: GENERATE ETL RULE (AST TRANSLATION) ===
                // Usada para operaciones regex puras y diccionarios gigantes. Evita un OOM en el Motor IA.
                const responseData = await aiService.generateETLRule(payload);
                if (window.Swal && Swal.isVisible()) Swal.close();

                if (!responseData || !responseData.rules || !Array.isArray(responseData.rules)) {
                     throw new Error("El modelo retornó reglas de mutación inválidas o la falló la traducción de AST.");
                }
                
                if (responseData.rules.length === 0) throw new Error("La IA no pudo derivar una regla determinista a partir del prompt.");
                
                this._setStatus('Aterrizando Regla...', 'working');
                
                if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                     for (let rule of responseData.rules) {
                         rule.fromAI = true;
                         await window.viewerRuleWorkshop.createLocalRuleDirect(rule);
                     }
                     this.promptEl.value = "";
                     this._setStatus('Conectado', 'success');
                } else {
                     throw new Error("API del Taller Cerrada.");
                }
            }

        } catch (err) {
            console.error("❌ Chofer AST Falló:", err);
            if (window.Swal && Swal.isVisible()) Swal.close();
            this._setStatus('Error Crítico', 'error');
            this._setFeedback(`Fallo: ${err.message}`, 'error');
        } finally {
            setTimeout(() => { if (aiService.isHealthy) this.btnEl.disabled = false; }, 1500);
        }
    }
    
    async _displayConsensusModal(clusterMap, promptText, vCol) {
        if (!window.Swal) return;
        
        let accordionHtml = Object.keys(clusterMap).map((masterVal, gIdx) => {
             const rawValues = clusterMap[masterVal];
             if (!Array.isArray(rawValues)) return '';
             
             let childrenHtml = rawValues.map((val, idx) => `
                <div class="flex items-center gap-2 mb-1.5 pl-3 p-1.5 border-l-2 border-slate-700/50 hover:bg-slate-800/50 transition">
                    <input type="checkbox" id="hitl_chk_${gIdx}_${idx}" data-master="${masterVal.replace(/"/g, '&quot;')}" value="${val.replace(/"/g, '&quot;')}" checked class="hitl-raw-chk form-checkbox h-3.5 w-3.5 text-indigo-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer">
                    <label for="hitl_chk_${gIdx}_${idx}" class="text-[11px] text-slate-400 cursor-pointer select-none truncate font-mono">${val}</label>
                </div>
             `).join('');

             return `
             <div class="mb-3 bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden">
                 <div class="bg-indigo-950/20 p-2 border-b border-indigo-500/10 flex items-center justify-between">
                     <span class="text-xs font-bold text-indigo-300 font-mono tracking-wide">${masterVal}</span>
                     <span class="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">${rawValues.length} crudos</span>
                 </div>
                 <div class="p-2 py-1 bg-slate-950/30">
                    ${childrenHtml}
                 </div>
             </div>
             `;
        }).join('');
        
        const { isConfirmed } = await Swal.fire({
            title: 'Mapeo Semántico Completado',
            html: `<div class="text-[11px] text-slate-400 mb-3 text-left">La IA ha agrupado los siguientes valores (Target Maestros) en base a tu petición <i>"${promptText}"</i>.<br>Desmarca las variaciones crudas incorrectas:</div>
                   <div class="max-h-[350px] overflow-y-auto text-left custom-scrollbar pr-1" id="hitl_checkbox_container">
                      ${accordionHtml}
                   </div>`,
            showCancelButton: true,
            confirmButtonText: '<i data-lucide="merge" class="w-4 h-4 inline mt-0.5"></i> Insertar Regla (MAP_REPLACE)',
            cancelButtonText: 'Descartar',
            confirmButtonColor: '#4f46e5',
            background: '#0f172a', color: '#f8fafc',
            width: '500px'
        });
        
        if (isConfirmed) {
            const finalMap = {};
            let mappedCount = 0;
            const masterSet = new Set();
            
            document.querySelectorAll('.hitl-raw-chk').forEach(chk => {
                if (chk.checked) {
                     finalMap[chk.value] = chk.getAttribute('data-master');
                     masterSet.add(chk.getAttribute('data-master'));
                     mappedCount++;
                }
            });
            
            if (mappedCount === 0) return;
            
            this._setStatus('Aterrizando Regla...', 'working');
            
            // CREAR AST ESTÁTICO DE MAPEO ESTRUCTURAL (Determinismo Absoluto)
            const aiRuleObj = {
                nombre_regla: `[IA] Mapeo Semántico: ${promptText}`,
                descripcion: `Regla determinista generada bajo perfilamiento. Clusterizó ${mappedCount} variaciones bajo ${masterSet.size} grupos maestros. Purga el resto.`,
                tipo: 'ast_conditional',
                logica: [
                     {
                         condicion: { operador: "IN_DICT_KEYS", valor: finalMap },
                         accion: { tipo_accion: "DICTIONARY_REPLACE", valor: finalMap } // Estandariza Mapeo Maestro
                     },
                     {
                         condicion: { operador: "DEFAULT" },
                         accion: { tipo_accion: "DROP" } // Excluye alienígenas
                     }
                ],
                fromAI: true
            };
            
            if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                this.promptEl.value = "";
                this._setStatus('Conectado', 'success');
            } else {
                throw new Error("API del Taller Cerrada.");
            }
        } else {
             this._setStatus('Descartado', 'success');
        }
    }

    _evaluateUX(dataIdx, oldPipeline, currentPipeline) {
        if (!window.currentSheetData || !window.viewerETL) return;
        
        let nullsAfter = 0;
        let altered = 0;
        let maxLimit = Math.min(window.currentSheetData.length - 1, 1000);
        
        const combined = currentPipeline || [];

        for (let i = 1; i <= maxLimit; i++) {
            const raw = String(window.currentSheetData[i][dataIdx] || "");
            const oldRs = oldPipeline && oldPipeline.length ? window.viewerETL.transformCell(raw, oldPipeline) : { result: raw };
            const oldVal = String(oldRs.display || oldRs.result || "");
            
            const newRs = window.viewerETL.transformCell(raw, combined);
            const newVal = String(newRs.display || newRs.result || "");

            if (newRs.rejected || newVal.trim() === '') nullsAfter++;
            else if (oldVal !== newVal) altered++;
        }
        
        this._setFeedback(`✓ ${altered} Modificadas <span class="pl-2 relative"><span class="absolute left-1 border-l border-emerald-700/50 h-3 top-0.5"></span>Nulos finales: ${nullsAfter}</span>`, altered > 0 ? 'success' : 'warning');
    }
}
const viewerAiUi = new ViewerAiUi();
window.viewerAiUi = viewerAiUi;
export default viewerAiUi;
