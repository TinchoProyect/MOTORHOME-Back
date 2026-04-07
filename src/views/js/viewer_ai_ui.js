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
                    
                <div class="flex items-center gap-2 px-1 mb-1">
                    <label class="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" id="vaiIncrementalMode" class="form-checkbox h-3.5 w-3.5 text-indigo-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 transition-colors group-hover:border-indigo-400" checked>
                        <span class="text-[10px] text-slate-400 group-hover:text-slate-300 font-bold tracking-wide transition-colors" title="Solo enviará a la IA los registros que actualmente fallan o quedan vacíos. El resultado se fusionará conservando el trabajo previo.">🔥 Smart Scope: Ignorar OKs (Merge)</span>
                    </label>
                </div>

                <div class="flex flex-wrap gap-1" id="vaiQuickChips">
                    <button data-intent="Relleno de Vacíos" data-route="ast" data-placeholder="Ej: Rellenar con 0,00..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-indigo-600/40 text-slate-400 hover:text-indigo-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-indigo-500/50 font-mono">Rellenar vacíos</button>
                    <button data-intent="Extracción Específica" data-route="ast" data-placeholder="Ej: Extraer el primer número..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-indigo-600/40 text-slate-400 hover:text-indigo-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-indigo-500/50 font-mono">Extraer datos</button>
                    <button data-intent="Limpieza y Separación" data-route="ast" data-placeholder="Ej: Separar descripción y peso dejando solo desc..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-indigo-600/40 text-slate-400 hover:text-indigo-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-indigo-500/50 font-mono">Separar Limpiar</button>
                    <button data-intent="Limpieza Literal (1 a 1)" data-route="literal" data-placeholder="Ej: Purificar manteniendo estricto el original..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-teal-600/40 text-slate-400 hover:text-teal-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-teal-500/50 font-mono">Limpieza 1 a 1</button>
                    <button data-intent="Mapeo y Agrupación de Texto" data-route="cluster" data-placeholder="Ej: Agrupar marcas comerciales y uniformar nombres..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-purple-600/40 text-slate-400 hover:text-purple-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-purple-500/50 font-mono">Agrupar (HITL)</button>
                </div>
                
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

        this.selectedIntent = null;
        this.selectedRoute = null;

        const quickBtns = wrapper.querySelectorAll('.vai-quick-btn');
        quickBtns.forEach(btn => {
            btn.onclick = () => {
                if (this.promptEl.disabled) return;
                
                const hoverColorClass = btn.dataset.route === 'cluster' ? 'bg-purple-600' : (btn.dataset.route === 'literal' ? 'bg-teal-600' : 'bg-indigo-600');
                const borderColorClass = btn.dataset.route === 'cluster' ? 'border-purple-500' : (btn.dataset.route === 'literal' ? 'border-teal-500' : 'border-indigo-500');
                
                if (this.selectedIntent === btn.dataset.intent) {
                    // Deseleccionar
                    this.selectedIntent = null;
                    this.selectedRoute = null;
                    btn.classList.remove(hoverColorClass, 'text-white', borderColorClass);
                    btn.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                } else {
                    // Limpiar todos
                    quickBtns.forEach(b => {
                        const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : (b.dataset.route === 'literal' ? 'bg-teal-600' : 'bg-indigo-600');
                        const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : (b.dataset.route === 'literal' ? 'border-teal-500' : 'border-indigo-500');
                        b.classList.remove(hColor, 'text-white', bColor);
                        b.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    });
                    
                    // Seleccionar actual
                    this.selectedIntent = btn.dataset.intent;
                    this.selectedRoute = btn.dataset.route;
                    btn.classList.remove('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    btn.classList.add(hoverColorClass, 'text-white', borderColorClass);
                    if(btn.dataset.placeholder) {
                        this.promptEl.placeholder = btn.dataset.placeholder;
                    }
                    this.promptEl.focus();
                }
            };
        });

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
                    
                    let effectiveVal = val;
                    if (pipeline && pipeline.length > 0 && typeof window.viewerETL !== 'undefined') {
                        const mutateRs = window.viewerETL.transformCell(val, pipeline);
                        
                        if (this.incrementalMode) {
                            const outVal = String(mutateRs.display || mutateRs.result || "").trim();
                            if (!mutateRs.rejected && outVal !== "") {
                                continue; // Bypassed! Already successful
                            }
                        } else {
                            if (mutateRs.rejected) continue;
                            effectiveVal = mutateRs.display || mutateRs.result || "";
                        }
                    }
                    if (effectiveVal.trim()) uniqueSet.add(effectiveVal.trim());
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
            
            const incrementalCheckbox = document.getElementById('vaiIncrementalMode');
            this.incrementalMode = incrementalCheckbox ? incrementalCheckbox.checked : false;
            
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

            // Enrutamiento Heurístico original
            const isFormattingPattern = promptText.toLowerCase().match(/(extraer|quit|borrar|separar|remplazar|reemplazar|regex|limpiar|vaci|vacío|vacio|vacía|agregar|completar|rellenar|cero)/);
            
            // Si el chip seleccionado exige AST => fuerza AST. Si exige Cluster => fuerza Cluster.
            const forceAstMode = this.selectedRoute === 'ast' || (!this.selectedRoute && isFormattingPattern && this.selectedRoute !== 'literal');
            const forceClusterMode = this.selectedRoute === 'cluster';
            const forceLiteralMode = this.selectedRoute === 'literal';
            
            // Si el diccionario es enorme, obligatoriamente se usa AST para evitar OOM, excepto que lo forcemos
            const useClustering = forceClusterMode ? true : (uniqueDictionary.length <= 60 && !forceAstMode && !forceLiteralMode);

            const combinedPrompt = this.selectedIntent ? `CONTEXTO DE LA TAREA: Operación estructurada del tipo "${this.selectedIntent}".\nINTRUCCIONES ESPECÍFICAS DEL USUARIO: ${promptText}` : promptText;

            // Restringir max de muestras generativas.
            // Para AST bastan pocas líneas. Para CLUSTERING (HITL) o LITERAL, pasamos de 80 a 1200 para abarcar diccionarios
            const limiteMuestras = (useClustering || forceLiteralMode) ? 1200 : 25;
            const dictLimitado = uniqueDictionary.slice(0, limiteMuestras);
            
            if (uniqueDictionary.length > limiteMuestras && useClustering) {
                 console.warn(`[VIGÍA] Diccionario truncado: De ${uniqueDictionary.length} a ${limiteMuestras} para proteger la ventana LLM.`);
                 if (window.Swal) Swal.update({ 
                     html: `Mapeo completado: <b>${uniqueDictionary.length}</b> únicos detectados.<br>
                            <span class="text-xs text-orange-400"><i class="fas fa-exclamation-triangle"></i> Lote masivo: Evaluando primeros ${limiteMuestras}...</span><br>
                            Solicitando filtrado semántico al Motor IA...`
                 });
            }

            const payload = {
                column_name: targetColName,
                prompt: combinedPrompt,
                samples: dictLimitado, 
                require_ast: !useClustering && !forceLiteralMode,
                literal_mode: forceLiteralMode
            };

            this._setStatus('IA Analizando...', 'working');
            
            if (forceLiteralMode) {
                // === RUTA LENTA 2: LITERAL TRANSLATION (1-A-1) ===
                const responseData = await aiService.discoverEntities(payload);
                if (window.Swal && Swal.isVisible()) Swal.close();
                
                if (!responseData || !responseData.cluster || typeof responseData.cluster !== 'object' || Array.isArray(responseData.cluster)) {
                    throw new Error("El modelo retornó formato de traducción literal inválido.");
                }
                
                const translationMap = responseData.cluster;
                if (Object.keys(translationMap).length === 0) throw new Error("La IA no devolvió traducciones.");
                
                await this._displayLiteralModal(translationMap, promptText, vCol);

            } else if (useClustering) {
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
                
                if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                     
                     // [UX FEEDBACK] Pantalla Previa para Evaluar las Reglas AST Generadas
                     const userConfirmed = await this._displayASTModal(responseData, promptText);
                     
                     if (userConfirmed) {
                         this._setStatus('Aterrizando Regla...', 'working');
                         for (let rule of responseData.rules) {
                             rule.fromAI = true;
                             await window.viewerRuleWorkshop.createLocalRuleDirect(rule);
                         }
                         this.promptEl.value = "";
                         this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                         if (this.selectedIntent) {
                             this.selectedIntent = null;
                             this.selectedRoute = null;
                             const wrapper = this.container || document.getElementById('m_ai_copilot_container');
                             if (wrapper) {
                                 wrapper.querySelectorAll('.vai-quick-btn').forEach(b => {
                                     const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : 'bg-indigo-600';
                                     const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : 'border-indigo-500';
                                     b.classList.remove(hColor, 'text-white', bColor);
                                     b.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                                 });
                             }
                         }
                         this._setStatus('Conectado', 'success');
                     } else {
                         this._setStatus('Descartado', 'success');
                     }
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
                 <div class="bg-indigo-950/20 p-2 border-b border-indigo-500/10 flex items-center justify-between hover:bg-slate-800/40 transition">
                     <label class="flex items-center gap-2 cursor-pointer w-full" for="hitl_global_${gIdx}">
                         <input type="checkbox" id="hitl_global_${gIdx}" class="hitl-global-chk form-checkbox h-4 w-4 text-indigo-500 rounded border-indigo-500/50 bg-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer" checked data-group="${gIdx}">
                         <span class="text-xs font-bold text-indigo-300 font-mono tracking-wide truncate pr-2 select-none">${masterVal}</span>
                     </label>
                     <span class="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold shrink-0 shadow-sm border border-indigo-500/10">${rawValues.length} crudos</span>
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
            width: '500px',
            didOpen: () => {
                const container = document.getElementById('hitl_checkbox_container');
                if (!container) return;
                
                // Event Delegation para checkboxes
                container.addEventListener('change', (e) => {
                    if (e.target.classList.contains('hitl-global-chk')) {
                        const isChecked = e.target.checked;
                        const groupIdx = e.target.getAttribute('data-group');
                        const childChecks = container.querySelectorAll(`.hitl-raw-chk[id^="hitl_chk_${groupIdx}_"]`);
                        childChecks.forEach(chk => chk.checked = isChecked);
                        e.target.indeterminate = false;
                    } else if (e.target.classList.contains('hitl-raw-chk')) {
                       const parts = e.target.id.split('_');
                       if (parts.length >= 3) {
                           const groupIdx = parts[2];
                           const parentChk = container.querySelector(`#hitl_global_${groupIdx}`);
                           if (parentChk) {
                               const childChecks = container.querySelectorAll(`.hitl-raw-chk[id^="hitl_chk_${groupIdx}_"]`);
                               const allChecked = Array.from(childChecks).every(c => c.checked);
                               const someChecked = Array.from(childChecks).some(c => c.checked);
                               parentChk.checked = allChecked;
                               parentChk.indeterminate = someChecked && !allChecked;
                           }
                       }
                    }
                });
            }
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
                         accion: { tipo_accion: this.incrementalMode ? "PASS" : "DROP" } // "PASS" excludes alienígenas but keeps previous valid in Merge mode
                     }
                ],
                fromAI: true
            };
            
            if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                this.promptEl.value = "";
                this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                if (this.selectedIntent) {
                    this.selectedIntent = null;
                    this.selectedRoute = null;
                    const wrapper = this.container || document.getElementById('m_ai_copilot_container');
                    if (wrapper) {
                        wrapper.querySelectorAll('.vai-quick-btn').forEach(b => {
                            const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : 'bg-indigo-600';
                            const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : 'border-indigo-500';
                            b.classList.remove(hColor, 'text-white', bColor);
                            b.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                        });
                     }
                }
                this._setStatus('Conectado', 'success');
            } else {
                throw new Error("API del Taller Cerrada.");
            }
        } else {
             this._setStatus('Descartado', 'success');
        }
    }

    async _displayLiteralModal(translationMap, promptText, vCol) {
        if (!window.Swal) return;
        
        let tableRowsHtml = Object.entries(translationMap).map(([rawVal, cleanVal], idx) => {
             return `
               <tr class="border-b border-slate-700/50 hover:bg-slate-800/50 transition">
                   <td class="p-2 w-8 text-center border-r border-slate-700/50 text-slate-400">
                       <input type="checkbox" id="literal_chk_${idx}" data-raw="${String(rawVal).replace(/"/g, '&quot;')}" value="${String(cleanVal).replace(/"/g, '&quot;')}" checked class="literal-raw-chk form-checkbox h-3.5 w-3.5 text-teal-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer">
                   </td>
                   <td class="p-2 text-[10px] text-slate-400 font-mono truncate max-w-[200px]" title="${String(rawVal).replace(/"/g, '&quot;')}">${String(rawVal).replace(/</g, "&lt;")}</td>
                   <td class="p-2 text-[10px] font-bold text-teal-400 font-mono max-w-[200px] break-words" title="${String(cleanVal).replace(/"/g, '&quot;')}">${String(cleanVal).replace(/</g, "&lt;")}</td>
               </tr>
             `;
        }).join('');
        
        const { isConfirmed } = await Swal.fire({
            title: 'Traducción Literal (1 a 1)',
            html: `<div class="text-[11px] text-slate-400 mb-3 text-left">La IA ha analizado los crudos únicos y devuelto una limpieza 1 a 1 en base a tu petición <i>"${promptText}"</i>.<br>Desmarca las conversiones incorrectas para ignorarlas:</div>
                   <div class="max-h-[350px] overflow-y-auto text-left custom-scrollbar pr-1 border border-slate-700/50 rounded" id="literal_checkbox_container">
                      <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-900 sticky top-0 border-b border-slate-700/50 z-10 hover:bg-slate-800/80 transition">
                            <tr>
                                <th class="p-2 w-8 text-center border-r border-slate-700/50">
                                    <input type="checkbox" id="literal_global_chk" class="form-checkbox h-4 w-4 text-teal-500 rounded border-teal-500/50 bg-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer" checked>
                                </th>
                                <th class="p-2 text-[10px] font-bold text-slate-300 uppercase tracking-wider"><label for="literal_global_chk" class="cursor-pointer">Original Crudo</label></th>
                                <th class="p-2 text-[10px] font-bold text-teal-300 uppercase tracking-wider"><label for="literal_global_chk" class="cursor-pointer">Traducción Limpia</label></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                      </table>
                   </div>`,
            showCancelButton: true,
            confirmButtonText: '<i data-lucide="split-square-horizontal" class="w-4 h-4 inline mt-0.5"></i> Insertar Regla (DIRECT_REPLACE)',
            cancelButtonText: 'Descartar',
            confirmButtonColor: '#0d9488',
            background: '#0f172a', color: '#f8fafc',
            width: '600px',
            didOpen: () => {
                const container = document.getElementById('literal_checkbox_container');
                if (!container) return;
                
                container.addEventListener('change', (e) => {
                    if (e.target.id === 'literal_global_chk') {
                        const isChecked = e.target.checked;
                        const childChecks = container.querySelectorAll(`.literal-raw-chk`);
                        childChecks.forEach(chk => chk.checked = isChecked);
                        e.target.indeterminate = false;
                    } else if (e.target.classList.contains('literal-raw-chk')) {
                       const globalChk = document.getElementById('literal_global_chk');
                       if (globalChk) {
                           const childChecks = container.querySelectorAll(`.literal-raw-chk`);
                           const allChecked = Array.from(childChecks).every(c => c.checked);
                           const someChecked = Array.from(childChecks).some(c => c.checked);
                           globalChk.checked = allChecked;
                           globalChk.indeterminate = someChecked && !allChecked;
                       }
                    }
                });
                if(window.lucide) window.lucide.createIcons();
            }
        });
        
        if (isConfirmed) {
            const finalMap = {};
            let mappedCount = 0;
            
            document.querySelectorAll('.literal-raw-chk').forEach(chk => {
                if (chk.checked) {
                     finalMap[chk.getAttribute('data-raw')] = chk.value;
                     mappedCount++;
                }
            });
            
            if (mappedCount === 0) return;
            
            this._setStatus('Aterrizando Regla...', 'working');
            
            const aiRuleObj = {
                nombre_regla: `[IA] Limpieza Literal: ${promptText}`,
                descripcion: `Regla generada purificando 1 a 1 bajo la directiva AI. Convierte de forma dura ${mappedCount} valores únicos.`,
                tipo: 'ast_conditional',
                logica: [
                     {
                         condicion: { operador: "IN_DICT_KEYS", valor: finalMap },
                         accion: { tipo_accion: "DICTIONARY_REPLACE", valor: finalMap }
                     },
                     {
                         condicion: { operador: "DEFAULT" },
                         accion: { tipo_accion: this.incrementalMode ? "PASS" : "DROP" } 
                     }
                ],
                fromAI: true
            };
            
            if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                this.promptEl.value = "";
                this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                if (this.selectedIntent) {
                    const btn = document.querySelector(`button[data-intent="${this.selectedIntent}"]`);
                    if(btn) btn.click();
                }
                this._setStatus('Completado', 'success');
            } else {
                throw new Error("API del Taller Cerrada.");
            }
        } else {
             this._setStatus('Descartado', 'success');
        }
    }

    async _displayASTModal(responseData, promptText) {
        if (!window.Swal) return true;
        
        const reglasList = responseData.rules.map((r, i) => {
             // Constuir visualización del condicional
             let condText = "Desconocido";
             if(r.condicion) {
                 condText = r.condicion.operador;
                 if(r.condicion.valor) condText += ` ('${r.condicion.valor}')`;
             }
             
             // Construir visualización de la mutación
             const arrAct = [];
             if(r.accion) {
                 if(r.accion.tipo_accion) arrAct.push(`Tipo: <b class="text-indigo-400">${r.accion.tipo_accion}</b>`);
                 if(r.accion.target) arrAct.push(`Tag: <i>'${r.accion.target}'</i>`);
                 if(r.accion.valor) arrAct.push(`Regex/Val: <span class="bg-indigo-900/50 px-1 rounded">${r.accion.valor}</span>`);
                 if(r.accion.replacement !== undefined) arrAct.push(`Reemplazo: <span class="bg-indigo-900/50 px-1 rounded">'${r.accion.replacement}'</span>`);
             }
             
             return `
             <div class="mb-3 bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden">
                 <div class="bg-indigo-950/20 p-2 border-b border-indigo-500/10 flex items-center justify-between">
                     <span class="text-xs font-bold text-indigo-300 font-mono tracking-wide">Regla ${i+1}: ${r.nombre_regla || 'Secuencia'}</span>
                 </div>
                 <div class="p-3 py-2 bg-slate-950/30 text-[11px] text-slate-300 font-mono leading-relaxed space-y-1">
                     <div class="flex items-start gap-2">
                        <i data-lucide="filter" class="w-3.5 h-3.5 text-slate-500 mt-0.5"></i> 
                        <span class="text-slate-400 font-bold">Filtro:</span> <span>${condText}</span>
                     </div>
                     <div class="flex items-start gap-2">
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-slate-500 mt-0.5"></i> 
                        <span class="text-slate-400 font-bold">Mutación:</span> <span>${arrAct.length ? arrAct.join(' <span class="text-slate-600">|</span> ') : 'N/A'}</span>
                     </div>
                 </div>
             </div>
             `;
        }).join('');
        
        const explicacion = responseData.explicacion_global || "Se derivó AST algorítmico directamente basándose en tu requerimiento.";

        const { isConfirmed } = await Swal.fire({
            title: 'AST Aterrizado Exitosamente',
            html: `<div class="text-[11px] text-slate-400 mb-4 text-left">La IA ha transpilado tu petición <i>"${promptText}"</i> en un formato estrictamente predecible (Abstract Syntax Tree).<br><br><span class="text-indigo-300">${explicacion}</span></div>
                   <div class="max-h-[350px] overflow-y-auto text-left custom-scrollbar pr-2 pb-2">
                      ${reglasList}
                   </div>`,
            showCancelButton: true,
            confirmButtonText: '<i data-lucide="check" class="w-4 h-4 inline mt-0.5 mr-1"></i> Aceptar e Inyectar',
            cancelButtonText: 'Descartar',
            confirmButtonColor: '#4f46e5',
            background: '#0f172a', color: '#f8fafc',
            width: '550px',
            didOpen: () => { if(window.lucide) window.lucide.createIcons(); }
        });
        
        return isConfirmed;
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
