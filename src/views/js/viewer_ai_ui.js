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
        this.setupBindings();
        
        this.isInitialized = true;
    }

    /**
     * Muestra la librería de prompts asociada al Campo Maestro Activo
     */
    async showPromptLibrary() {
        if (!this.activeMasterFieldId) {
            Swal.fire({ title: 'Atención', text: 'No hay una Columna Maestra ACTIVA para buscar el historial.', icon: 'warning', background: '#0f172a', color: '#f8fafc' });
            return;
        }

        Swal.fire({
            title: 'Cargando Librería...',
            background: '#0f172a', color: '#f8fafc',
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
            const res = await fetch(`${backendUrl}/api/ai/prompts/${encodeURIComponent(this.activeMasterFieldId)}`);
            if (!res.ok) throw new Error("Fetch failed");
            const prompts = await res.json();

            if (!prompts || prompts.length === 0) {
                Swal.fire({
                    title: '<span class="text-indigo-300">Librería Vacía</span>',
                    html: '<p class="text-sm text-slate-400">Aún no hay prompts guardados exitosamente para este Campo Maestro.</p>',
                    icon: 'info',
                    background: '#0f172a', color: '#f8fafc',
                    confirmButtonColor: '#4f46e5'
                });
                return;
            }

            let htmlList = `<div class="flex flex-col gap-3 mt-4 text-left max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">`;
            prompts.forEach((p, idx) => {
                const dateStr = new Date(p.lastUsed).toLocaleDateString();
                // Escape de comillas para onclick
                const safePrompt = p.prompt.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                htmlList += `
                    <div class="group bg-slate-900 border border-slate-700/50 hover:border-indigo-500/50 rounded-lg p-3 transition-colors cursor-pointer relative" onclick="window._vaiSelectPrompt('${safePrompt}', '${p.intent || ''}')">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">${p.intent || 'General'}</span>
                            <span class="text-[9px] text-slate-500 font-mono">${dateStr}</span>
                        </div>
                        <p class="text-xs text-slate-300 font-mono italic">"${p.prompt}"</p>
                        <div class="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none"></div>
                    </div>
                `;
            });
            htmlList += `</div>`;
            
            // Función Helper global para la selección
            window._vaiSelectPrompt = (promptText, intentVal) => {
                const txtArea = document.getElementById('vaiPrompt');
                if(txtArea) {
                    txtArea.value = promptText;
                    if (intentVal) {
                        this.selectedIntent = intentVal;
                        // Forzar estilo visual en los chips (simular click)
                        document.querySelectorAll('.vai-quick-btn').forEach(b => {
                            if (b.dataset.intent === intentVal) {
                                b.classList.replace('bg-slate-800/80', 'bg-indigo-600');
                                b.classList.replace('text-slate-400', 'text-white');
                            } else {
                                b.classList.replace('bg-indigo-600', 'bg-slate-800/80');
                                b.classList.replace('text-white', 'text-slate-400');
                            }
                        });
                    }
                }
                Swal.close();
            };

            Swal.fire({
                title: '<span class="text-xl text-indigo-300 font-light">Librería de Prompts</span><br><span class="text-xs text-slate-400">Campo Maestro Destino</span>',
                html: htmlList,
                width: '600px',
                background: '#0f172a',
                color: '#f8fafc',
                showConfirmButton: false,
                showCloseButton: true,
                customClass: { popup: 'border border-indigo-500/30' }
            });

        } catch (err) {
            console.error("Error cargando librería:", err);
            Swal.fire({ title: 'Error', text: 'No se pudo cargar el historial de Prompts.', icon: 'error', background: '#0f172a', color: '#f8fafc' });
        }
    }

    /**
     * Define el contexto del Campo Maestro activo para asociarlo a las operaciones del Chofer IA.
     */
    setActiveMasterField(masterFieldObj) {
        // [GLOBAL SCOPE QA FIX] Change from local UUID to universal semantic name
        this.activeMasterFieldId = masterFieldObj ? String(masterFieldObj.nombre_campo).toUpperCase().trim() : null;
        
        // Habilitar o deshabilitar boton de libreria
        const historyBtn = document.getElementById('vaiHistoryBtn');
        if (historyBtn) {
            if (this.activeMasterFieldId) {
                historyBtn.classList.remove('hidden');
                historyBtn.classList.add('flex');
            } else {
                historyBtn.classList.add('hidden');
                historyBtn.classList.remove('flex');
            }
        }
    }

    setupBindings() {
        // Enforce DOM completely mounted
        setTimeout(() => this._mountComponent(), 500);
    }

    /**
     * Entrypoint called by ViewerRuleWorkshop when the modal opens
     */
    init() {
        this._mountComponent();
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
                    <button id="vaiHistoryBtn" class="hidden items-center justify-center gap-1 px-2 py-1 bg-indigo-900/30 hover:bg-indigo-500/40 border border-indigo-500/30 text-indigo-200 hover:text-white rounded transition-colors text-[9px] font-bold tracking-wider" title="Ver Prompts Exitosos para esta Columna Maestra">
                        <i data-lucide="library" class="w-3 h-3"></i> Librería
                    </button>
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
                <button data-intent="Fusión Semántica Asistida" data-route="caza-rubros" data-placeholder="[Automático] Extraerá la Llave Maestra e importará el valor oficial..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-orange-600/40 text-slate-400 hover:text-orange-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-orange-500/50 font-mono">Caza-Rubros</button>
                    </div>
                
                <div class="flex items-center justify-between">
                    <div id="vaiFeedback" class="text-[9px] font-bold px-2 py-0.5 rounded-full hidden"></div>
                    <div class="flex items-center gap-2 ml-auto">
                        <button id="vaiTriggerBtn" class="bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-600/50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-[10px] font-bold uppercase shrink-0 min-w-min" disabled title="Forzar barrido completo (ignora estado actual)">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Generar desde cero
                        </button>
                        <button id="vaiReprocessAnomaliesBtn" class="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-[10px] font-bold uppercase shrink-0 min-w-min" disabled>
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i> Reprocesar Anomalías
                        </button>
                    </div>
                </div>
            </div>
        `;

        standardModeContainer.appendChild(wrapper);
        if (window.lucide) window.lucide.createIcons();

        // Bindings
        
        const historyBtn = document.getElementById('vaiHistoryBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.showPromptLibrary();
            });
        }

        this.statusEl = document.getElementById('vaiStatus');
        this.promptEl = document.getElementById('vaiPrompt');
        this.feedbackEl = document.getElementById('vaiFeedback');
        this.btnEl = document.getElementById('vaiTriggerBtn');
        this.btnAnomaliesEl = document.getElementById('vaiReprocessAnomaliesBtn');
        this.healthIcon = document.getElementById('vaiHealthIndicator');

        this.btnEl.onclick = () => this.handleGenerate({ onlyAnomalous: false });
        if (this.btnAnomaliesEl) this.btnAnomaliesEl.onclick = () => this.handleGenerate({ onlyAnomalous: true });
        
        const clearBtn = document.getElementById('vaiBtnClearReg');
        if (clearBtn) {
            clearBtn.onclick = async () => {
                if (window.viewerRuleWorkshop) {
                    await window.viewerRuleWorkshop.clearPipeline();
                }
            };
        }
        
        // [BUGFIX] Habilitar botón instantáneamente si el usuario escribe o pega texto (siempre que el vigía haya dado OK previo)
        this.promptEl.addEventListener('input', () => {
            if (this.btnEl.disabled && this.promptEl.value.trim() !== '' && this.statusEl.innerText === 'Conectado') {
                this.btnEl.disabled = false;
                if (this.btnAnomaliesEl) this.btnAnomaliesEl.disabled = false;
            } else if (this.promptEl.value.trim() === '') {
                this.btnEl.disabled = true;
                if (this.btnAnomaliesEl) this.btnAnomaliesEl.disabled = true;
            }
        });

        this.selectedIntent = null;
        this.selectedRoute = null;

        const quickBtns = wrapper.querySelectorAll('.vai-quick-btn');
        quickBtns.forEach(btn => {
            btn.onclick = () => {
                if (this.promptEl.disabled) return;
                
                const hoverColorClass = btn.dataset.route === 'cluster' ? 'bg-purple-600' : (btn.dataset.route === 'literal' ? 'bg-teal-600' : (btn.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));
                const borderColorClass = btn.dataset.route === 'cluster' ? 'border-purple-500' : (btn.dataset.route === 'literal' ? 'border-teal-500' : (btn.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));
                
                if (this.selectedIntent === btn.dataset.intent) {
                    // Deseleccionar
                    this.selectedIntent = null;
                    this.selectedRoute = null;
                    btn.classList.remove(hoverColorClass, 'text-white', borderColorClass);
                    btn.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                    this.promptEl.value = '';
                    this.promptEl.disabled = false;
                } else {
                    // Limpiar todos
                    quickBtns.forEach(b => {
                        const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : (b.dataset.route === 'literal' ? 'bg-teal-600' : (b.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));
                        const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : (b.dataset.route === 'literal' ? 'border-teal-500' : (b.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));
                        b.classList.remove(hColor, 'text-white', bColor);
                        b.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    });
                    
                    // Seleccionar actual
                    this.selectedIntent = btn.dataset.intent;
                    this.selectedRoute = btn.dataset.route;
                    btn.classList.remove('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    btn.classList.add(hoverColorClass, 'text-white', borderColorClass);
                                        if (this.selectedRoute === 'caza-rubros') {
                        this.promptEl.value = "[Automático] Fusión Semántica Activa. El sistema evaluará el diccionario y agrupará orígenes utilizando conocimiento general guiado por el contexto de la regla.";
                        this.promptEl.disabled = true;
                    } else {
                        this.promptEl.value = '';
                        this.promptEl.disabled = false;
                        if(btn.dataset.placeholder) {
                            this.promptEl.placeholder = btn.dataset.placeholder;
                        }
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
            if (this.btnAnomaliesEl) this.btnAnomaliesEl.disabled = false;
        } else {
            this._setStatus('Nodo Off-line', 'error');
            this.promptEl.disabled = true;
            this.btnEl.disabled = true;
            if (this.btnAnomaliesEl) this.btnAnomaliesEl.disabled = true;
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

    async _buildUniqueSet(extractionDataIdx, pipeline, options = { onlyAnomalous: false }) {
        // [UNIFICACIÓN ESTRUCTURAL] El Chofer IA deja de tener su propio motor de lectura en crudo.
        // Forzamos la actualización silenciosa del Sandbox del Visor de Extracción
        // para absorber todas las lógicas de limpieza, vacíos y flags de rechazo.
        if (typeof window.generatePreview === 'function') {
            try {
                console.log("[Chofer IA] Pidiendo sincronización con la Tubería Central de Extracción...");
                await window.generatePreview(true); // skipModal = true
            } catch (e) {
                console.warn("[Chofer IA] Warning al sincronizar con Extracción:", e);
            }
        }

        // [TICKET #028] VIGÍA EXTREMO PARA DIAGNOSTICAR TAMAÑO DE LA MATRIZ (Silenciado en Producción)
        // console.error("🚨 [VIGÍA EXTREMO] _buildUniqueSet invocado.");
        
        return new Promise((resolve) => {
            let rawRows = [];
            
            // Consumir EXCLUSIVAMENTE el array ya procesado o hacer fallback a crudo si falla el visor
            if (window.currentSimData && Array.isArray(window.currentSimData)) {
                 // [V8 - SCOPE AISLANTE MULTI-HOJA] Garantizar extracción determinista de la solapa activa
                 const activeSheetName = window.currentSheetName || null;
                 
                 rawRows = window.currentSimData.filter(row => {
                     // 1. Filtrar basura subyacente (Rechazados, Vacíos)
                     if (row._rejectedSim) return false;
                     // 2. Firewall Multi-Hoja (Evita purgar OTRAS solapas con diferentes columnas)
                     if (row._sourceSheet && activeSheetName && row._sourceSheet !== activeSheetName) return false;
                     
                     return true;
                 });
                 console.log(`[Chofer IA - Sincronizado] Saneamiento Estricto: Heredando ${rawRows.length} registros purificados (Aislados a Hoja: ${activeSheetName || 'Principal'}).`);
            } else {
                 const currentOffset = (window.currentOffset && typeof window.currentOffset.row === 'number') ? window.currentOffset.row : 0;
                 rawRows = window.currentSheetData ? window.currentSheetData.slice(currentOffset + 1) : [];
                 console.warn(`[Chofer IA - Alerta] Visor de Extracción inaccesible. Modo de lectura Cruda Fallback (${rawRows.length} registros).`);
            }
            
            // Obtener Master Key Index (Resolución Determinista desde Virtual Column ID)
            // calcFieldSemanticKey contiene un Virtual Column ID (ej. "col_0"),
            // NO un UUID de campo maestro. Debemos resolver el dataIdx físico
            // buscando esa columna virtual en window.virtualColumns.
            let masterKeyDataIdx = null;
            let masterFieldObj = null; // Para SchemaSanitizer
            const elSemanticKey = document.getElementById('calcFieldSemanticKey');
            if (elSemanticKey && elSemanticKey.value && window.virtualColumns) {
                 const semanticVCol = window.virtualColumns.find(v => v.id === elSemanticKey.value);
                 if (semanticVCol && semanticVCol.dataIdx !== undefined && semanticVCol.dataIdx !== null) {
                     masterKeyDataIdx = semanticVCol.dataIdx;
                 }
                 // Resolver también el masterFieldObj para SchemaSanitizer
                 if (window.draftPipelines && window.draftPipelines[elSemanticKey.value]) {
                     const mfId = window.draftPipelines[elSemanticKey.value].masterField?.id;
                     if (mfId && window.masterDictionary) {
                         masterFieldObj = window.masterDictionary.find(m => String(m.id) === String(mfId));
                     }
                 }
            }
            
            let codigoColId = null;
            if (window.virtualColumns && window.draftPipelines) {
                for (const vCol of window.virtualColumns) {
                    const draft = window.draftPipelines[vCol.id];
                    if (draft && draft.masterField) {
                        const lowerName = String(draft.masterField.nombre_campo || "").toLowerCase().trim();
                        if (lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku') {
                            codigoColId = vCol.id;
                            break;
                        }
                    }
                }
            }

            // [TICKET #032] Fallback: Si no hay llave semántica definida, usar el Código/SKU nativo si fue detectado
            if (masterKeyDataIdx === null && codigoColId !== null && window.virtualColumns) {
                if (typeof codigoColId === 'string' && codigoColId.startsWith('col_')) {
                    const fallbackVCol = window.virtualColumns.find(c => c.id === codigoColId);
                    if (fallbackVCol && fallbackVCol.dataIdx !== undefined) {
                        masterKeyDataIdx = fallbackVCol.dataIdx;
                    } else {
                        masterKeyDataIdx = parseInt(codigoColId.replace('col_', ''), 10);
                    }
                } else if (typeof codigoColId === 'number') {
                    masterKeyDataIdx = codigoColId;
                }
            }

            const resolveRawLocal = (r, tId) => {
                let physicalIdx = tId;
                if (window.computedColumns) {
                    const comp = window.computedColumns.find(c => c.id === tId);
                    if (comp && comp.operands && comp.operands.length > 0) return resolveRawLocal(r, comp.operands[0]); 
                }
                if (typeof physicalIdx === 'string' && window.virtualColumns) {
                    const vCol = window.virtualColumns.find(c => String(c.id) === String(physicalIdx));
                    if (vCol && vCol.dataIdx !== undefined) physicalIdx = vCol.dataIdx;
                }
                if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) physicalIdx = parseInt(physicalIdx.replace('col_', ''), 10);
                if (typeof physicalIdx !== 'number' || isNaN(physicalIdx) || physicalIdx < 0) return "";
                return String(r[physicalIdx] || "");
            };

            const total = rawRows.length;
            const uniqueSet = new Set();
            this._rawTotalUniqueItems = new Set(); // Guardián de métricas totales pre-Delta
            const chunkSize = 5000;
            let i = 0;
            
            // [VIGÍA DE ESTADÍSTICAS TICKET #021]
            let stats = { totalRows: total, skippedBySku: 0, skippedByMaster: 0, skippedByEmpty: 0, skippedByRegex: 0, added: 0 };
            
            // console.error("🚨 [VIGÍA EXTREMO] extractionDataIdx:", extractionDataIdx);

            const processChunk = () => {
                const end = Math.min(i + chunkSize, total);
                for (; i < end; i++) {
                    // [Filtro Estricto de Huérfanos] - Si no tiene Código válido, ignorarlo.
                    if (codigoColId !== null) {
                        let skuVal = String(resolveRawLocal(rawRows[i], codigoColId)).trim();
                        if (!skuVal || !/[a-zA-Z0-9]/.test(skuVal)) {
                            stats.skippedBySku++;
                            continue;
                        }
                    }

                    if (masterKeyDataIdx !== null) {
                        let mVal = String(rawRows[i][masterKeyDataIdx] || "").trim();
                        
                        // [SchemaSanitizer] Casteo Estricto desde la Definición del Maestro (ya resuelto arriba)
                        if (window.SchemaSanitizer && masterFieldObj) {
                             mVal = window.SchemaSanitizer.cast(mVal, masterFieldObj);
                        }
                        
                        if (!mVal || !/[a-zA-Z0-9]/.test(mVal)) {
                            stats.skippedByMaster++;
                            continue;
                        }
                    }

                    // [Ticket #020] Sanitización Estricta para AI Copilot
                    const sanitizeForAI = (rawVal) => {
                        let text = String(rawVal || "");
                        text = text.replace(/\r\n|\n|\r/g, " "); // Saltos de línea a espacios
                        text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ""); // Purga de control (nulos, etc)
                        return text.trim().replace(/\s+/g, " "); // Colapsar espacios
                    };

                    let val = "";
                    // [FIX TICKET #034] Priorizar la extracción post-ETL (_richContext) para columnas fantasmas (Caza Rubros)
                    // Si armamos 'val' con datos crudos saltando las transformaciones previas (ej. UPPERCASE de un operando),
                    // el Chofer arrojará un Falso Positivo (Cache Miss) porque el string no coincide case-sensitively con la Libreta.
                    
                    let localCompDefOperands = null;
                    let localCompDefDepths = null;
                    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
                        const localState = window.viewerRuleWorkshop.getActiveState();
                        
                        if (localState && localState.isOpen) {
                            // Si los operandos cambiaron en el DOM, también los leemos
                            const opValue = document.getElementById('calcOperation') ? document.getElementById('calcOperation').value : '';
                            if (opValue === 'CLONE' || opValue === 'CLONE_SEMANTIC') {
                                localCompDefOperands = [];
                                localCompDefDepths = [];
                                const depths = document.querySelectorAll('.calc-source-depth');
                                document.querySelectorAll('.calc-source-dyn').forEach((s, idx) => {
                                    if(s.value && s.value.trim() !== '') {
                                        localCompDefOperands.push(s.value);
                                        localCompDefDepths.push(depths[idx] ? depths[idx].value : 'clean');
                                    }
                                });
                            }
                        }
                        
                        if ((!localCompDefOperands || localCompDefOperands.length === 0) && localState && localState.colIndex && window.computedColumns) {
                            const cDef = window.computedColumns.find(c => c.id === localState.colIndex);
                            if (cDef && cDef.operands && cDef.operands.length > 0) {
                                localCompDefOperands = cDef.operands;
                                if (!localState.isOpen) {
                                    localCompDefDepths = cDef.dataDepths || [];
                                    // Si no hay depths, usar el legacy global
                                    if (localCompDefDepths.length === 0) {
                                        localCompDefDepths = localCompDefOperands.map(() => cDef.dataDepth || "clean");
                                    }
                                }
                            }
                        }
                    }

                    if (localCompDefOperands && rawRows[i]._richContext) {
                        val = localCompDefOperands.map((opId, index) => {
                             const op = rawRows[i]._richContext[opId];
                             if (!op) return "";
                             
                             let targetDataDepth = localCompDefDepths && localCompDefDepths[index] ? localCompDefDepths[index] : "clean";
                             let candidates = [];
                             if (targetDataDepth === 'raw') candidates = [op.raw];
                             else if (targetDataDepth === 'display') candidates = [op.display];
                             else candidates = [op.clean, op.raw, op.display];
                             
                             for (let c of candidates) {
                                  if (c !== undefined && c !== null && String(c).trim() !== '') {
                                      const s = String(c).trim();
                                      if (!s.startsWith('<')) return sanitizeForAI(s);
                                  }
                             }
                             return "";
                        }).filter(v => v).join(" ");
                    } else if (Array.isArray(extractionDataIdx)) {
                        val = extractionDataIdx.map(idx => sanitizeForAI(rawRows[i][idx])).filter(v => v).join(" ");
                    } else {
                        val = sanitizeForAI(rawRows[i][extractionDataIdx]);
                    }
                    if (!val) {
                        stats.skippedByEmpty++;
                        continue;
                    }
                    if (val.trim() && val.trim().length <= 150) this._rawTotalUniqueItems.add(val.trim());
                    
                    let effectiveVal = val;
                    if (pipeline && pipeline.length > 0 && typeof window.viewerETL !== 'undefined') {
                        // [FIX TICKET #034] Inyección de 'rawRows[i]' (contextRow)
                        // Crítico para que las columnas fantasmas procesadas por Caza-Rubros (combine_hash/numeric)
                        // puedan resolver operandos y generar el hash correcto antes de chocar contra el AST.
                        const mutateRs = window.viewerETL.transformCell(val, pipeline, rawRows[i]);
                        
                        // [NUEVO CORTAFUEGOS DE ECONOMÍA IA - REQUERIMIENTO 2]
                        if (options.onlyAnomalous) {
                             const outVal = String(mutateRs.display || mutateRs.result || "").trim();
                             let isResolved = true; // Asumimos resuelto por defecto
                             
                             if (mutateRs.rejected) {
                                 isResolved = false; // Anomalía estricta (Rojo)
                             } else {
                                 // Detectar Cache Miss analizando el pipeline
                                 let libretaDict = null;
                                 pipeline.forEach(r => {
                                      if (r.tipo === 'ast_conditional' && r.logica) {
                                           // [FIX TICKET #034] Escanear TODAS las ramas de la lógica, no solo la posición 0
                                           for (let b of r.logica) {
                                               const cond = b.condicion;
                                               const act = b.accion;
                                               if (cond && cond.operador === 'IN_DICT_KEYS' && typeof cond.valor === 'object' && cond.valor !== null) {
                                                   libretaDict = cond.valor; break;
                                               } else if (act && act.tipo_accion === 'DICTIONARY_REPLACE' && typeof act.valor === 'object' && act.valor !== null) {
                                                   libretaDict = act.valor; break;
                                               }
                                           }
                                      }
                                 });

                                 if (libretaDict && val.trim() !== "") {
                                      // [FIX TICKET #034] Heurística Case-Insensitive para emular comportamiento nativo del AST Parser
                                      const valLower = val.trim().toLowerCase();
                                      const outValLower = outVal.toLowerCase();
                                      
                                      const keyExists = Object.keys(libretaDict).some(k => {
                                           const kl = String(k).trim().toLowerCase();
                                           return kl === valLower || kl === outValLower;
                                      });
                                      
                                      if (!keyExists) {
                                          if (outVal === "" || outVal === val) {
                                               isResolved = false; // Cache Miss (Naranja)
                                          }
                                      }
                                 } else if (outVal === "") {
                                      isResolved = false; // Si quedó vacío
                                 }
                             }

                             if (isResolved) {
                                 stats.skippedByRegex++; // Repurposing metric
                                 continue; // ECONOMÍA IA: NO enviar al Chofer
                             }
                             effectiveVal = val;
                        } else {
                            // [COMPORTAMIENTO ORIGINAL LEGACY - Generar desde cero]
                            if (this.selectedRoute === 'caza-rubros') {
                                const hasAST = pipeline.some(r => r.tipo === 'ast_conditional');
                                const outVal = String(mutateRs.display || mutateRs.result || "").trim();
                                
                                // Si existe un AST, significa que hay reglas de categorización. 
                                // Si el valor resultante no está vacío, significa que el AST lo categorizó con éxito.
                                if (hasAST && !mutateRs.rejected && outVal !== "") {
                                    stats.skippedByRegex++;
                                    continue; // ¡Cruce de PK superado! Delta bypassing
                                }
                            } else {
                                // En modo extracción (HITL), si una regla rechaza la celda explícitamente, la saltamos.
                                // Pero NUNCA saltamos solo por no estar vacía. El string crudo debe fluir hacia el IA.
                                if (mutateRs.rejected) {
                                    stats.skippedByRegex++;
                                    continue;
                                }
                                // Usar el valor crudo inicial (val) o el transformado parcial (effectiveVal)
                                // Para IA, queremos nutrirlo del valor original para que el AST opere sobre la base cruda
                                effectiveVal = val; 
                            }
                        }
                    }
                    if (effectiveVal.trim()) {
                        uniqueSet.add(effectiveVal.trim());
                        stats.added++;
                    }
                }
                
                // Excluir Strings gigantes (Data profiling no sirve en párrafos)
                for (let k of uniqueSet) { if (k.length > 150) uniqueSet.delete(k); }
                
                if (i < total) {
                    this._setStatus(`Escaneando: ${Math.floor((i/total)*100)}%`, 'working');
                    setTimeout(processChunk, 0); // Lote asíncrono preventivo
                } else {
                    console.error(`🚨 VIGÍA DE ALERTA ROJA - TICKET #021: Resultados del Escaneo de Matriz IA:`, JSON.stringify(stats));
                    console.error(`🚨 VIGÍA DE ALERTA ROJA - TICKET #021: Únicos obtenidos antes de truncar:`, Array.from(uniqueSet));
                    resolve(Array.from(uniqueSet));
                }
            };
            processChunk();
        });
    }

    async handleGenerate(options = { onlyAnomalous: false }) {
        const promptText = this.promptEl.value.trim();
        if (!promptText) return;

        this.btnEl.disabled = true;
        
        console.log(`[Chofer IA] 🚀 Ejecutando handleGenerate(). Prompt detectado: "${promptText.substring(0, 30)}..."`);
        console.log(`[Chofer IA] Evaluando conectividad contra ActiveState del ViewerRuleWorkshop...`);
        
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
            let compDefOperands = null; // [FIX TICKET #034] Referencia estricta a operandos virtuales
            
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
                    compDefOperands = compDef.operands; // Guardamos para evaluación de val post-ETL
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
            
            // [FIX MERGE LÓGICA] Decisión Dinámica de Operatividad
            this._crystalizeMergeMode = true; // Safe merge por defecto
            let bypassPipelineForAI = /CLONE_SEMANTIC/i.test(promptText) ? [] : state.pipeline;
            
            // Modal interceptor para Caza-Rubros
            // [REQUERIMIENTO] Redundancia y Modal Interceptor (ELIMINADOS)
            // La Consola Semántica ya no pregunta si "Reprocesar todo". Se fuerza 
            // SIEMPRE la reactividad cruzando contra la Base de Datos (Delta Estricto).
            if (this.selectedRoute === 'caza-rubros' || /caza-rubros/i.test(this.promptEl.value)) {
                this._crystalizeMergeMode = true;
                bypassPipelineForAI = state.pipeline; // Aplicar Delta estricto siempre (Solo Huérfanos)
            }

            // Loader visual re-ubicado DENTRO de la cadena de ejecución inquebrantable
            if (window.Swal) {
                Swal.fire({
                    title: 'Despertando Chofer IA...',
                    html: 'Preparando entorno inteligente para ' + targetColName + '.<br>Calculando diccionario de valores únicos...',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    didOpen: () => { Swal.showLoading(); },
                    background: '#0f172a', color: '#f8fafc'
                });
            }

            const uniqueDictionary = await this._buildUniqueSet(extractionDataIdx, bypassPipelineForAI, options);
            
            // [TICKET #028] VIGÍA DEPURADOR DEL CHOFER IA (COMO ERROR PARA BYPASSEAR FILTROS)
            console.error("🚨 [VIGÍA - CHOFER IA] Array extraído (uniqueDictionary):", uniqueDictionary);
            
            if (uniqueDictionary.length === 0) {
                 if (window.Swal) Swal.close();
                 throw new Error("La columna carece de datos parseables bajo este contexto.");
            }
            
            // Predictive UI Modal (Requerimiento 1)
            if (options.onlyAnomalous && window.Swal) {
                if (Swal.isVisible()) Swal.close();
                const { isConfirmed } = await Swal.fire({
                     title: 'Auditoría Predictiva',
                     html: `Se detectaron <b>${uniqueDictionary.length}</b> valores anómalos o huérfanos tras aplicar las reglas actuales.<br><br>¿Desea realizar el gasto de IA enviando este lote al Chofer para su resolución?`,
                     icon: 'info',
                     showCancelButton: true,
                     confirmButtonText: 'Sí, procesar con IA',
                     cancelButtonText: 'Cancelar',
                     background: '#0f172a', color: '#f8fafc',
                     confirmButtonColor: '#4f46e5'
                });
                
                if (!isConfirmed) {
                     this.btnEl.disabled = false;
                     if (this.btnAnomaliesEl) this.btnAnomaliesEl.disabled = false;
                     this._setStatus('Cancelado por el usuario', 'info');
                     return;
                }
            }
            
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
            const forceClusterMode = this.selectedRoute === 'cluster' || this.selectedRoute === 'caza-rubros';
            const forceLiteralMode = this.selectedRoute === 'literal';
            
            // Si el diccionario es enorme, obligatoriamente se usa AST para evitar OOM, excepto que lo forcemos
            const useClustering = forceClusterMode ? true : (uniqueDictionary.length <= 60 && !forceAstMode && !forceLiteralMode);

            const combinedPrompt = this.selectedIntent ? `CONTEXTO DE LA TAREA: Operación estructurada del tipo "${this.selectedIntent}".\nINTRUCCIONES ESPECÍFICAS DEL USUARIO: ${promptText}` : promptText;

            // Restringir max de muestras generativas.
            // Para AST bastan pocas líneas. Para CLUSTERING (HITL) o LITERAL, elevamos masivamente a 5000 para soportar
            // combinaciones multiorigen (ej. 4 columnas) sin requerir re-procesamientos manuales cíclicos del operador.
            const limiteMuestras = (useClustering || forceLiteralMode) ? 5000 : 25;
            const dictLimitado = uniqueDictionary.slice(0, limiteMuestras);
            
            if (uniqueDictionary.length > limiteMuestras && useClustering) {
                 console.warn(`[VIGÍA] Diccionario truncado: De ${uniqueDictionary.length} a ${limiteMuestras} para proteger la ventana LLM.`);
                 if (window.Swal) Swal.update({ 
                     html: `Mapeo completado: <b>${uniqueDictionary.length}</b> únicos detectados.<br>
                            <span class="text-xs text-orange-400"><i class="fas fa-exclamation-triangle"></i> Lote masivo: Evaluando primeros ${limiteMuestras}...</span><br>
                            Solicitando filtrado semántico al Motor IA...`
                 });
            }

            // [OPTIMIZACIÓN DE LATENCIA] - Implementación de Chunking en lotes de 100
            const chunkSize = 100;
            const totalChunks = Math.ceil(dictLimitado.length / chunkSize);
            let finalClusterData = {};
            let finalAstRules = [];
            
            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
                const startIdx = chunkIdx * chunkSize;
                const chunkSamples = dictLimitado.slice(startIdx, startIdx + chunkSize);
                
                const payload = {
                    column_name: targetColName,
                    prompt: combinedPrompt,
                    samples: chunkSamples, 
                    require_ast: !useClustering && !forceLiteralMode,
                    literal_mode: forceLiteralMode
                };

                console.warn(`🚨 VIGÍA DE ALERTA ROJA - TICKET #021: Payload exacto inyectado a la IA (Chunk ${chunkIdx+1}/${totalChunks}):`, payload);

                if (totalChunks > 1) {
                    this._setStatus(`IA Analizando Lote ${chunkIdx + 1}/${totalChunks}...`, 'working');
                    if (window.Swal) Swal.update({ title: `Analizando Lote ${chunkIdx + 1}/${totalChunks}...` });
                } else {
                    this._setStatus('IA Analizando...', 'working');
                }

                if (forceLiteralMode) {
                    const responseData = await aiService.discoverEntities(payload);
                    if (responseData && responseData.cluster && typeof responseData.cluster === 'object' && !Array.isArray(responseData.cluster)) {
                        Object.assign(finalClusterData, responseData.cluster);
                    }
                } else if (useClustering) {
                    const isCazaRubros = this.selectedRoute === 'caza-rubros' || /CLONE_SEMANTIC/i.test(promptText);
                    let responseData;
                    if (isCazaRubros) {
                        responseData = await aiService.categorizeRubros(payload);
                    } else {
                        responseData = await aiService.discoverEntities(payload);
                    }
                    if (responseData && responseData.cluster && typeof responseData.cluster === 'object' && !Array.isArray(responseData.cluster)) {
                        if (isCazaRubros) {
                            Object.assign(finalClusterData, responseData.cluster);
                        } else {
                            // Merge arr of strings
                            const c = responseData.cluster;
                            for (let cleanKey in c) {
                                if (!finalClusterData[cleanKey]) finalClusterData[cleanKey] = [];
                                finalClusterData[cleanKey].push(...c[cleanKey]);
                            }
                        }
                    }
                } else {
                    const responseData = await aiService.generateETLRule(payload);
                    if (responseData && responseData.rules && Array.isArray(responseData.rules)) {
                        finalAstRules.push(...responseData.rules);
                    }
                }
            }
            
            if (window.Swal && Swal.isVisible()) Swal.close();
            
            if (forceLiteralMode) {
                // === RUTA LENTA 2: LITERAL TRANSLATION (1-A-1) ===
                if (Object.keys(finalClusterData).length === 0) throw new Error("La IA no devolvió traducciones.");
                await this._displayLiteralModal(finalClusterData, promptText, vCol);

            } else if (useClustering) {
                // === DISCOVER ENTITIES O CATEGORIZACIÓN MAESTRA ===
                if (Object.keys(finalClusterData).length === 0) throw new Error("La IA no detectó ninguna coincidencia.");
                const isCazaRubros = this.selectedRoute === 'caza-rubros' || /CLONE_SEMANTIC/i.test(promptText);
                
                if (isCazaRubros) {
                    // Caza Rubros devuelve translationMap { "sku": "Rubro|ARGUMENTO|Razón" }
                    // Preservamos clusterMap como arreglo de Strings y guardamos el argumento en un mapa global.
                    const clusterMap = {};
                    this.argumentationMap = {};
                    for (const [rawKey, valString] of Object.entries(finalClusterData)) {
                        const parts = String(valString).split('|ARGUMENTO|');
                        const rubro = parts[0];
                        const arg = parts.length > 1 ? parts[1] : '';
                        
                        if (!clusterMap[rubro]) clusterMap[rubro] = [];
                        clusterMap[rubro].push(rawKey);
                        if (arg) this.argumentationMap[rawKey] = arg;
                    }
                    await this._displaySemanticAuditTray(clusterMap, promptText, vCol);
                } else {
                    await this._displayConsensusModal(finalClusterData, promptText, vCol);
                }

            } else {
                // === RUTA RÁPIDA: GENERATE ETL RULE (AST TRANSLATION) ===
                if (finalAstRules.length === 0) throw new Error("La IA no pudo derivar una regla determinista a partir del prompt.");
                const responseData = { rules: finalAstRules };
                
                if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                     
                     // [UX FEEDBACK] Pantalla Previa para Evaluar las Reglas AST Generadas
                     const userConfirmed = await this._displayASTModal(responseData, promptText);
                     
                     if (userConfirmed) {
                         this._setStatus('Aterrizando Regla...', 'working');
                         for (let rule of responseData.rules) {
                             rule.fromAI = true;
                             rule.promptData = { prompt: promptText, intent: this.selectedIntent || "Traductor AST" };
                             await window.viewerRuleWorkshop.createLocalRuleDirect(rule);
                         }
                         
                         // Guardar en el Historial Backend
                         if (this.activeMasterFieldId) {
                             this._savePromptToHistory(promptText, this.selectedIntent || 'General');
                         }

                         this.promptEl.value = "";
                         this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                         if (this.selectedIntent) {
                             this.selectedIntent = null;
                             this.selectedRoute = null;
                             const wrapper = this.container || document.getElementById('m_ai_copilot_container');
                             if (wrapper) {
                                 wrapper.querySelectorAll('.vai-quick-btn').forEach(b => {
                                     const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : (b.dataset.route === 'literal' ? 'bg-teal-600' : (b.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));
                                     const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : (b.dataset.route === 'literal' ? 'border-teal-500' : (b.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));
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
    
    async _displayConsensusModal(clusterMap, promptText, vCol, targetRuleIdx = null) {
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
                fromAI: true,
                promptData: { prompt: promptText, intent: this.selectedIntent || "Clustering Semántico" }
            };
            
            if (typeof window.viewerRuleWorkshop === 'object' && typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                if (targetRuleIdx !== null && targetRuleIdx !== undefined && typeof window.viewerRuleWorkshop.updateLocalRuleDictionary === 'function') {
                    window.viewerRuleWorkshop.updateLocalRuleDictionary(targetRuleIdx, finalMap);
                    console.log(`🤖 [CHOFER] Regla Consensus MERGEADA estructuralmente en la UI Activa [Idx: ${targetRuleIdx}].`);
                } else {
                    await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                }
                
                // Guardar en el Historial Backend
                if (this.activeMasterFieldId) {
                    this._savePromptToHistory(promptText, this.selectedIntent || 'General');
                }

                this.promptEl.value = "";
                this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                if (this.selectedIntent) {
                    this.selectedIntent = null;
                    this.selectedRoute = null;
                    const wrapper = this.container || document.getElementById('m_ai_copilot_container');
                    if (wrapper) {
                        wrapper.querySelectorAll('.vai-quick-btn').forEach(b => {
                            const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : (b.dataset.route === 'literal' ? 'bg-teal-600' : (b.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));
                            const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : (b.dataset.route === 'literal' ? 'border-teal-500' : (b.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));
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

    async _displayLiteralModal(translationMap, promptText, vCol, targetRuleIdx = null) {
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
                if (targetRuleIdx !== null && targetRuleIdx !== undefined && typeof window.viewerRuleWorkshop.updateLocalRuleDictionary === 'function') {
                    window.viewerRuleWorkshop.updateLocalRuleDictionary(targetRuleIdx, finalMap);
                    console.log(`🤖 [CHOFER] Regla Literal MERGEADA estructuralmente en la UI Activa [Idx: ${targetRuleIdx}].`);
                } else {
                    await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                }
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


    async _displayCategoryAuditPanel(translationMap, vCol) {
         let groupedMatches = {}; 
         let totalPending = 0;
         let exactMatches = {};
         let existingCategoriesCount = new Set();
         
         const rawKeys = Object.keys(translationMap);
         for (const rawKey of rawKeys) {
             let baseName = translationMap[rawKey] || "S/D";
             let narrativa = "";
             if (baseName.includes('|NARRATIVA|')) {
                 const parts = baseName.split('|NARRATIVA|');
                 baseName = parts[0];
                 narrativa = parts[1] || "";
             }
             
             if (baseName.includes('[NUEVO_RUBRO_PROPUESTO]')) {
                 const destName = baseName.replace('[NUEVO_RUBRO_PROPUESTO]:', '').replace(/<[^>]*>?/gm, '').trim().toUpperCase();
                 if(!groupedMatches[destName]) groupedMatches[destName] = { subItems: [], narrativa: "" };
                 groupedMatches[destName].subItems.push(rawKey);
                 if (narrativa && !groupedMatches[destName].narrativa) groupedMatches[destName].narrativa = narrativa;
                 totalPending++;
             } else {
                 exactMatches[rawKey] = baseName;
                 existingCategoriesCount.add(baseName);
             }
        }

        if (existingCategoriesCount.size >= 15) {
             if (window.Swal) {
                  Swal.fire({
                      toast: true, position: 'top-end', icon: 'warning',
                      title: 'Alerta de Arquitectura',
                      text: `Existen ${existingCategoriesCount.size} rubros cruzados. LAMDA recomienda 6-10 para no degradar la IA.`,
                      showConfirmButton: false, timer: 6000
                  });
             }
        }

        // Auto-ingest exact matches that don't need audit
        if (Object.keys(exactMatches).length > 0 && window.viewerRuleWorkshop) {
             await window.viewerRuleWorkshop.createLocalRuleDirect({
                 nombre_regla: "Términos Históricos Re-Conocidos (IA)",
                 accion: { tipo_accion: "DICTIONARY_REPLACE", valor: exactMatches }
             });
        }

        // GUI Overlay Construction
        const panelId = 'viewerRightPanel';
        let panel = document.getElementById(panelId);
        if (panel) panel.remove();
        
        panel = document.createElement('div');
        panel.id = panelId;
        panel.className = "fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-sm transition-all duration-300 pointer-events-none";
        
        panel.innerHTML = `
            <div class="w-full max-w-7xl h-full mx-auto shadow-2xl flex flex-col bg-slate-900 border border-slate-700 pointer-events-auto shadow-[0_15px_40px_-5px_rgba(0,0,0,0.8)] relative" style="animation: slideUp 0.3s ease-out forwards;">
                <!-- HEAD -->
                <div class="px-8 py-5 border-b border-slate-800 flex justify-between items-center shrink-0 bg-slate-950/80">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg border border-orange-400/50">
                            <i data-lucide="bot" class="w-5 h-5 text-white"></i>
                        </div>
                        <div>
                            <h2 class="text-white font-black text-lg tracking-wildest uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] title-shadow pt-1">Auditoría Jerárquica</h2>
                            <p class="text-orange-400 font-bold text-[10px] tracking-widest uppercase mt-0.5">Asistente de Ingesta Inteligente</p>
                        </div>
                    </div>
                    
                    <!-- ACTIONS -->
                    <div class="flex gap-4">
                        <button id="vaiCloseAuditBtn" class="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all flex items-center justify-center">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>

                <!-- TOOLBAR -->
                 <div class="flex justify-between items-center px-8 py-4 bg-slate-900 border-b border-slate-800/80 shadow-sm shrink-0">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2"><i data-lucide="layers" class="w-4 h-4 text-orange-500"></i> Sugerencias de Clasificación (${totalPending} SKUs huérfanos)</p>
                    <button id="vaiNewGroupBtn" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 text-xs font-bold rounded-lg uppercase tracking-widest transition-colors flex items-center gap-2"><i data-lucide="folder-plus" class="w-4 h-4"></i> Pendientes de Clasificación</button>
                </div>

                <!-- CARDS CONTAINER -->
                <div id="vaiAuditCardsContainer" class="flex-grow overflow-y-auto custom-scrollbar p-8 bg-slate-950 space-y-8">
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        const container = panel.querySelector('#vaiAuditCardsContainer');
        
        /** FUNCION RENDER GROUP **/
        const renderGroup = (groupName, items, narrativa = "") => {
            const cardId = 'vai_card_' + Math.random().toString(36).substr(2, 9);
            const card = document.createElement('div');
            card.id = cardId;
            card.className = "bg-slate-900 border border-slate-700/80 rounded-xl flex flex-col shadow-xl overflow-hidden group-card transition-all duration-300";
            
            // Render Header
            let rowsHtml = '';
            items.forEach((sku, idx) => {
                const skuId = cardId + '_sku_' + idx;
                rowsHtml += `
                    
                    <div id="${skuId}" class="flex items-center justify-between p-3 border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors grouper-row group" data-raw="${String(sku).replace(/"/g, '&quot;')}">
                        <div class="flex items-center gap-3 flex-1 min-w-0 pr-4">
                             <input type="checkbox" class="bulk-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                             <span class="text-[13px] text-slate-300 font-mono truncate group-hover:text-amber-200 transition-colors" title="${String(sku).replace(/"/g, '&quot;')}">${String(sku).replace(/</g, "&lt;")}</span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="text-slate-500 hover:text-blue-400 p-1.5 transition-colors move-sku-btn rounded hover:bg-slate-800" title="Transferir Artículo a Otro Lote"><i data-lucide="arrow-right-left" class="w-4 h-4"></i></button>
                            <button type="button" class="text-slate-500 hover:text-red-400 p-1.5 transition-colors remove-sku-btn rounded hover:bg-slate-800" title="Descartar Ítem del Mapeo"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
            });

            card.innerHTML = `
                
                <!-- CARD HEADER (Editable) -->
                <div class="bg-gradient-to-r from-slate-950/80 to-slate-900 p-6 border-b border-slate-800 flex flex-col gap-4">
                    <div class="flex justify-between items-start gap-6">
                        <div class="flex-1 flex flex-col gap-4">
                            <div class="space-y-1 relative">
                                <label class="text-[9px] font-black uppercase text-orange-500 tracking-widest pl-1 absolute -top-2 left-3 bg-slate-950 px-1 border border-orange-500/20 rounded z-10">Rubro Maestro (Destino)</label>
                                <input type="text" class="card-rubro-name w-full bg-slate-950 border border-slate-700/80 text-orange-400 text-sm font-black uppercase rounded-lg px-4 py-3.5 focus:border-orange-500 focus:bg-slate-900 shadow-inner outline-none transition-all" value="${groupName}">
                                <i data-lucide="edit-3" class="w-4 h-4 absolute right-4 top-4 text-slate-600 pointer-events-none"></i>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black uppercase text-slate-500 tracking-widest pl-1">Directiva de Clasificación / Narrativa (Opcional)</label>
                                <input type="text" class="card-rubro-desc w-full bg-slate-900/60 border border-slate-700/50 text-slate-300 text-xs rounded-lg px-4 py-2.5 focus:border-blue-500 outline-none transition-colors" placeholder="Ej: Agrupa todos los elementos derivados del plástico exceptuando PET..." value="${narrativa.replace(/"/g, '&quot;')}">
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-3 shrink-0 pt-2">
                            <span class="bg-slate-950 text-slate-400 border border-slate-700 px-4 py-1.5 rounded-lg text-xs font-mono shadow-inner"><span class="card-count font-bold text-orange-400">${items.length}</span> SKUs Inyectados</span>
                            <!-- ACTIONS CONTAINER -->
                            <div class="flex flex-col gap-2 w-full mt-2">
                                <button type="button" class="btn-approve-card px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-[0_4px_15px_rgba(234,88,12,0.3)] border border-orange-400/20 flex items-center justify-center gap-2">
                                    <i data-lucide="check-circle" class="w-4 h-4"></i> Ingestar
                                </button>
                                <button type="button" class="btn-discard-group px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 font-bold rounded-xl text-[9px] uppercase tracking-widest transition-colors border border-red-500/20 flex items-center justify-center gap-2" title="Descartar este bloque por completo">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Descartar
                                </button>
                            </div>
                        </div>
                    </div>
                    <!-- BULK ACTION BAR -->
                    <div class="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50 relative z-20">
                          <label class="flex items-center gap-2 cursor-pointer group px-2">
                               <input type="checkbox" class="select-all-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                               <span class="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-300">Seleccionar Todo</span>
                          </label>
                          <div class="flex items-center gap-2">
                               <button type="button" class="btn-bulk-move px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>📦 Mover Selección</button>
                               <button type="button" class="btn-bulk-trash px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>🗑️ Eliminar</button>
                          </div>
                    </div>
                </div>

                <!-- CARD BODY (Entities) -->
                <div class="bg-slate-900/50 flex flex-col card-body" style="max-height: 350px; overflow-y: auto;">
                    ${rowsHtml}
                    <div class="p-8 text-center text-xs text-slate-500 italic hidden empty-msg flex flex-col items-center justify-center gap-3">
                        <i data-lucide="ghost" class="w-8 h-8 opacity-40"></i>
                        Contenedor Semántico Vacío. Transfiera artículos o elimine este lote.
                    </div>
                </div>
            `;
            
            // ================= BULK ACTIONS LOGIC =================
            const bulkCheckboxes = card.querySelectorAll('.bulk-chk');
            const selectAllChk = card.querySelector('.select-all-chk');
            const btnBulkMove = card.querySelector('.btn-bulk-move');
            const btnBulkTrash = card.querySelector('.btn-bulk-trash');
            const btnDiscardGroup = card.querySelector('.btn-discard-group');
            
            const updateBulkButtonsState = () => {
                const checkedCount = card.querySelectorAll('.bulk-chk:checked').length;
                const totalCount = card.querySelectorAll('.bulk-chk').length;
                
                if (checkedCount > 0) {
                     btnBulkMove.disabled = false;
                     btnBulkTrash.disabled = false;
                } else {
                     btnBulkMove.disabled = true;
                     btnBulkTrash.disabled = true;
                }
                
                if (selectAllChk) selectAllChk.checked = (checkedCount === totalCount && totalCount > 0);
            };

            if (selectAllChk) {
                selectAllChk.addEventListener('change', (e) => {
                     const isChecked = e.target.checked;
                     card.querySelectorAll('.bulk-chk').forEach(chk => {
                          const row = chk.closest('.grouper-row');
                          if (row && row.style.display !== 'none') chk.checked = isChecked;
                     });
                     updateBulkButtonsState();
                });
            }

            // Must use event delegation or attach to each. We attach to each generated row initially.
            card.querySelectorAll('.bulk-chk').forEach(chk => chk.addEventListener('change', updateBulkButtonsState));
            
            if (btnBulkTrash) {
                 btnBulkTrash.onclick = () => {
                      card.querySelectorAll('.bulk-chk:checked').forEach(chk => {
                           const row = chk.closest('.grouper-row');
                           if(row) row.remove();
                      });
                      const remaining = card.querySelectorAll('.grouper-row').length;
                      card.querySelector('.card-count').innerText = remaining;
                      if(remaining === 0) {
                          const emptyMsg = card.querySelector('.empty-msg');
                          if(emptyMsg) emptyMsg.classList.remove('hidden');
                          const btnApprove = card.querySelector('.btn-approve-card');
                          if(btnApprove) btnApprove.classList.add('opacity-50', 'pointer-events-none');
                      }
                      if(selectAllChk) selectAllChk.checked = false;
                      updateBulkButtonsState();
                 };
            }
            
            if (btnDiscardGroup) {
                 btnDiscardGroup.onclick = () => { card.remove(); };
            }

            if (btnBulkMove) {
                 btnBulkMove.onclick = async () => {
                      const sel = card.querySelectorAll('.bulk-chk:checked');
                      if (sel.length === 0) return;
                      
                      let options = {};
                      document.querySelectorAll('.group-card').forEach(c => {
                           const nInput = c.querySelector('.card-rubro-name');
                           if(nInput) {
                               const n = nInput.value.trim().toUpperCase();
                               if(n && c.id !== cardId) options[c.id] = n;
                           }
                      });
                      
                      if (Object.keys(options).length === 0) {
                          if (window.Swal) Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'Aviso', text: 'Crea otro lote desde "Nuevo Lote" para poder transferir.', timer: 3000});
                          return;
                      }
                      
                      if(window.Swal) {
                          const { value: destCardId } = await Swal.fire({
                              title: 'Transferencia Masiva',
                              text: `Selecciona el Lote de destino para los ${sel.length} agrupamientos:`,
                              input: 'select',
                              inputOptions: options,
                              inputPlaceholder: '-- Determina un nuevo contenedor --',
                              showCancelButton: true,
                              cancelButtonText: 'Cancelar',
                              confirmButtonText: 'Mover Fila(s)',
                              background: '#0f172a', color: '#e2e8f0',
                              customClass: { input: 'bg-slate-900 border-slate-700 text-sm w-full p-2 rounded' }
                          });
                          
                          if (destCardId) {
                               const destCard = document.getElementById(destCardId);
                               if(destCard) {
                                    const destBody = destCard.querySelector('.card-body');
                                    let newTrashList = [];
                                    
                                    sel.forEach(chk => {
                                         const row = chk.closest('.grouper-row');
                                         if(row) {
                                             chk.checked = false;
                                             destBody.insertBefore(row, destBody.querySelector('.empty-msg'));
                                             newTrashList.push(row);
                                         }
                                    });
                                    
                                    newTrashList.forEach(row => {
                                        const tBtn = row.querySelector('.remove-sku-btn');
                                        if(tBtn) {
                                            tBtn.onclick = () => {
                                                row.remove();
                                                const ct2 = destCard.querySelectorAll('.grouper-row').length;
                                                const ctEl = destCard.querySelector('.card-count');
                                                if(ctEl) ctEl.innerText = ct2;
                                                if(ct2===0) {
                                                    const msg = destCard.querySelector('.empty-msg');
                                                    if(msg) msg.classList.remove('hidden');
                                                    destCard.querySelector('.btn-approve-card').classList.add('opacity-50', 'pointer-events-none');
                                                }
                                            };
                                        }
                                        const mBtn = row.querySelector('.move-sku-btn');
                                        if(mBtn) {
                                            mBtn.onclick = async () => {
                                                // Keep the old generic logic for moving since it calculates on the fly and gets prompt again.
                                                // We don't redefine single move because single move just relies on .closest('.grouper-row')
                                            }
                                        }
                                    });
                                    
                                    [card, destCard].forEach(c => {
                                        const ct = c.querySelectorAll('.grouper-row').length;
                                        const ctEl = c.querySelector('.card-count');
                                        if(ctEl) ctEl.innerText = ct;
                                        if(ct === 0) {
                                            const msg = c.querySelector('.empty-msg');
                                            if(msg) msg.classList.remove('hidden');
                                            const aBtn = c.querySelector('.btn-approve-card');
                                            if(aBtn) aBtn.classList.add('opacity-50', 'pointer-events-none');
                                        } else {
                                            const msg = c.querySelector('.empty-msg');
                                            if(msg) msg.classList.add('hidden');
                                            const aBtn = c.querySelector('.btn-approve-card');
                                            if(aBtn) aBtn.classList.remove('opacity-50', 'pointer-events-none');
                                        }
                                    });
                                    
                                    if(selectAllChk) selectAllChk.checked = false;
                                    updateBulkButtonsState();
                               }
                          }
                      }
                 };
            }

            // Single Delete Logic
            const trashBtns = card.querySelectorAll('.remove-sku-btn');
            trashBtns.forEach(btn => {
                btn.onclick = () => {
                    btn.closest('.grouper-row').remove();
                    const remaining = card.querySelectorAll('.grouper-row').length;
                    card.querySelector('.card-count').innerText = remaining;
                    if(remaining === 0) {
                        card.querySelector('.empty-msg').classList.remove('hidden');
                        card.querySelector('.btn-approve-card').classList.add('opacity-50', 'pointer-events-none');
                    }
                    updateBulkButtonsState();
                };
            });
            
            // Single Move Logic (Redeclared explicitly to persist re-moves correctly)
            const bindMoveLogic = (btn) => {
                btn.onclick = async () => {
                    const row = btn.closest('.grouper-row');
                    let options = {};
                    document.querySelectorAll('.group-card').forEach(c => {
                         const n = c.querySelector('.card-rubro-name').value.trim().toUpperCase();
                         if(n && c.id !== cardId) options[c.id] = n;
                    });
                    
                    if (Object.keys(options).length === 0) return;
                    
                    if(window.Swal) {
                        const { value: destCardId2 } = await Swal.fire({
                            title: 'Mover Artículo (1)',
                            input: 'select',
                            inputOptions: options,
                            showCancelButton: true
                        });
                        if (destCardId2) {
                             const destCard2 = document.getElementById(destCardId2);
                             if(destCard2) {
                                  const destBody2 = destCard2.querySelector('.card-body');
                                  destBody2.insertBefore(row, destBody2.querySelector('.empty-msg'));
                                  
                                  [card, destCard2].forEach(c => {
                                        const ct = c.querySelectorAll('.grouper-row').length;
                                        const ctEl = c.querySelector('.card-count');
                                        if(ctEl) ctEl.innerText = ct;
                                  });
                                  updateBulkButtonsState();
                             }
                        }
                    }
                };
            };
            const moveBtns = card.querySelectorAll('.move-sku-btn');
            moveBtns.forEach(bindMoveLogic);

            // APPROVE CARD (INGEST)
            const approveBtn = card.querySelector('.btn-approve-card');
            if (approveBtn) {
                approveBtn.onclick = async () => {
                    const destName = card.querySelector('.card-rubro-name').value.trim().toUpperCase();
                    if(!destName) return;
                    
                    const rows = card.querySelectorAll('.grouper-row');
                    let objMap = {};
                    rows.forEach(r => {
                         objMap[r.dataset.raw.replace(/&quot;/g, '"')] = destName;
                    });
                    
                    if (window.viewerRuleWorkshop) {
                         const state = window.viewerRuleWorkshop.getActiveState();
                         if (state) {
                              const newTranslationNode = {
                                  nombre_regla: "Clasificación IA: " + destName,
                                  accion: { tipo_accion: "DICTIONARY_REPLACE", valor: objMap }
                              };
                              await window.viewerRuleWorkshop.createLocalRuleDirect(newTranslationNode);
                              
                              if (window.Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Agrupamiento Ingestado', showConfirmButton: false, timer: 2000 });
                              
                              card.remove();
                              
                              const totalPendingCards = document.querySelectorAll('.group-card').length;
                              if (totalPendingCards === 0) {
                                  if (window.Swal) Swal.fire({title: "Auditoría Completa", icon: "success", background: "#0f172a", color: "#fff"});
                                  panel.remove();
                              }
                         }
                    }
                };
            }
            
            container.appendChild(card);
            if(window.lucide) window.lucide.createIcons({root: card});
        };
        
        // Render initial exact match groups
        for (const [gName, data] of Object.entries(groupedMatches)) {
            renderGroup(gName, data.subItems, data.narrativa);
        }
        
        // Add "New Empty Group" logic
        panel.querySelector('#vaiNewGroupBtn').onclick = () => {
             renderGroup("NUEVO_LOTE_"+Math.floor(Math.random()*1000), []);
        };

        const closeFn = () => {
             panel.classList.add('opacity-0');
             setTimeout(() => panel.remove(), 300);
        };

        panel.querySelector('#vaiCloseAuditBtn').onclick = closeFn;
        if(window.lucide) window.lucide.createIcons({root: panel});
    }

    _mergeDictionary(pipeline, newObj) {
         let base = {};
         if (pipeline && pipeline.length) {
              const ruleArr = Array.isArray(pipeline) ? pipeline : [pipeline];
              for(const r of ruleArr) {
                  if (r.accion && r.accion.tipo_accion === 'DICTIONARY_REPLACE') {
                      base = { ...base, ...r.accion.valor };
                  }
              }
         }
         return { ...base, ...newObj };
    }

    async _displaySemanticAuditTray(clusterMap, promptText, vCol, targetRuleIdx = null) {
        if (window.Swal && Swal.isVisible()) Swal.close();
        this._setStatus('Construyendo Bandeja...', 'working');

        // Obtener Lotes Maestros Oficiales (Evitar parches)
        let rubrosOficiales = [];
        try {
            const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
            const res = await fetch(`${backendUrl}/api/rubros`);
            if (res.ok) {
                const payload = await res.json();
                rubrosOficiales = payload.data || [];
            } else {
                rubrosOficiales = [{nombre_rubro: "SEMILLAS"}, {nombre_rubro: "CONDIMENTOS"}, {nombre_rubro: "LÁCTEOS"}, {nombre_rubro: "OTROS"}];
            }
        } catch(e) {
            rubrosOficiales = [{nombre_rubro: "SEMILLAS"}, {nombre_rubro: "CONDIMENTOS"}, {nombre_rubro: "LÁCTEOS"}, {nombre_rubro: "OTROS"}];
        }

        // Estado en Memoria (UI Tracker Dual-State)
        this.sourceAuditState = {};
        this.confirmedState = {};
        this.discardedItems = new Set();
        this.satCheckedItems = new Set();
        this.satGlobalChecked = new Set();
        
        for (const masterVal in clusterMap) {
            // Se inyecta la inferencia en state de "Origen" o pendientes
            this.sourceAuditState[masterVal] = {
                deleted: false,
                items: [...clusterMap[masterVal]]
            };
        }

        let existingTray = document.getElementById('semanticAuditTray');
        if (existingTray) existingTray.remove();

        const totalItems = Object.values(clusterMap).reduce((acc, curr) => acc + curr.length, 0);

        const trayHtml = `
        <div id="semanticAuditTray" class="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex flex-col p-6 shadow-[inset_0_0_100px_rgba(249,115,22,0.1)]">
            <div class="flex items-center justify-between border-b border-orange-500/30 pb-4 mb-4 shrink-0">
                <div>
                    <h2 class="text-2xl font-black text-orange-400 flex items-center gap-2"><i data-lucide="scan-line" class="w-6 h-6"></i> Consola Semántica (Caza-Rubros)</h2>
                    <p class="text-[12px] text-slate-400 font-mono flex items-center gap-2 mt-1 px-1">
                        <span class="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">Total Detectados: <strong class="text-orange-400" id="satTotalLbl">${this._rawTotalUniqueItems ? this._rawTotalUniqueItems.size : '...'}</strong></span>
                        <span class="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">Pendientes (Auditoría): <strong class="text-orange-400" id="satPendingLbl">${totalItems}</strong></span>
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <button id="satCancelBtn" class="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded font-bold transition">Cancelar</button>
                    <button id="satSaveBtn" class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold shadow-lg shadow-orange-900/50 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled><i data-lucide="merge" class="w-4 h-4"></i> Cristalizar AST</button>
                </div>
            </div>

            <!-- Toolbar Dinámica -->
            <div class="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800 mb-4 shrink-0">
                <div class="flex items-center gap-4">
                    <span class="text-xs text-slate-400 font-mono" id="satSelectionCounter">0 SKUs seleccionados</span>
                    <div class="h-4 w-px bg-slate-700"></div>
                    <select id="satTransferSelect" class="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:border-orange-500 outline-none max-w-[200px]">
                        <option value="">-- Mover SKUs a Maestro Oficial... --</option>
                        ${rubrosOficiales.map(r => `<option value="${r.nombre_rubro.replace(/"/g, '&quot;')}" data-id="${r.id || ''}" data-narrative="${(r.descripcion_narrativa || '').replace(/"/g, '&quot;')}">${r.nombre_rubro}</option>`).join('')}
                    </select>
                    <button onclick="window.viewerAiUi._openCreateRubroModal()" class="px-2 py-1.5 bg-emerald-900/30 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white rounded text-xs transition shadow-lg shadow-emerald-900/20" title="Crear Nuevo Rubro Maestro (In-Line)"><i data-lucide="plus" class="w-3 h-3"></i></button>
                    <button id="satEditRubroBtn" onclick="window.viewerAiUi._openEditRubroModal()" class="px-2 py-1.5 bg-sky-900/30 hover:bg-sky-600 border border-sky-500/30 text-sky-400 hover:text-white rounded text-xs transition shadow-lg shadow-sky-900/20 disabled:opacity-50" title="Editar Rubro Seleccionado (In-Line)" disabled><i data-lucide="edit-3" class="w-3 h-3"></i></button>
                    <button id="satTransferBtn" class="px-3 py-1.5 bg-indigo-900/50 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white rounded text-xs font-bold transition disabled:opacity-50 ml-1">Transferir</button>
                </div>
                <div>
                    <button id="satDeleteBtn" class="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-600 border border-rose-500/30 text-rose-400 hover:text-white rounded text-xs transition flex items-center gap-2 disabled:opacity-50"><i data-lucide="trash-2" class="w-3 h-3"></i> Desechar Elementos</button>
                </div>
            </div>

            <!-- Content Area (Dual Panel) -->
            <div class="flex-1 flex flex-col min-h-0 space-y-4">
                <!-- PANEL: Pendientes -->
                <div class="flex flex-col h-1/2 bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden shrink-0 shadow-lg" style="height: calc(50% - 0.5rem);">
                    <div class="bg-indigo-950/50 p-2 text-[10px] uppercase tracking-widest font-black text-indigo-400 border-b border-indigo-500/20 shrink-0 flex items-center justify-between"><span><i data-lucide="list-tree" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i> Sugerencias del Chofer IA (Pendientes de Asignación)</span> <span class="bg-indigo-500/30 text-indigo-200 px-1.5 rounded-sm" id="satSourceHeaderCount">-</span></div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3" id="satSourceContainer"></div>
                </div>
                
                <!-- PANEL: Confirmados -->
                <div class="flex flex-col h-1/2 bg-slate-900 border border-orange-500/50 rounded-lg overflow-hidden shrink-0 shadow-[0_0_15px_rgba(249,115,22,0.1)] relative" style="height: calc(50% - 0.5rem);">
                    <div class="bg-orange-950/50 p-2 text-[10px] uppercase tracking-widest font-black text-orange-400 border-b border-orange-500/20 shrink-0 flex items-center justify-between"><span><i data-lucide="inbox" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i> Bandeja Abierta (Confirmados listos para Cristalizar)</span> <span class="bg-orange-500/30 text-orange-200 px-1.5 rounded-sm" id="satConfirmedHeaderCount">-</span></div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 relative" id="satConfirmedContainer"></div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', trayHtml);
        if(window.lucide) window.lucide.createIcons();

        this._renderSemanticAuditTray();

        // Eventos Globales de Toolbar
        document.getElementById('satCancelBtn').onclick = () => {
             document.getElementById('semanticAuditTray').remove();
             this._setStatus('Descartado', 'success');
        };

        const getSelectedItems = () => {
             const checks = document.querySelectorAll('.sat-raw-chk:checked');
             return Array.from(checks).map(c => ({
                 val: decodeURIComponent(c.value), // [FIX QA] Decodifica el string raw exacto preservando espacios/newlines
                 master: c.getAttribute('data-master')
             }));
        };

        // Evento Transferir (POP & PUSH)
        document.getElementById('satTransferBtn').onclick = () => {
             const items = getSelectedItems();
             const targetMaster = document.getElementById('satTransferSelect').value;
             if (!targetMaster) {
                 if (window.Swal) Swal.fire('Error', 'Debe elegir un Rubro Maestro de destino en el desplegable.', 'warning');
                 return;
             }
             if (items.length === 0) return;

             // Feedback Visual Inmediato (Previene fallo silencioso por lag)
             const btn = document.getElementById('satTransferBtn');
             const originalText = btn.innerHTML;
             btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin inline-block mr-1"></i> Transfiriendo...`;
             btn.disabled = true;
             if(window.lucide) window.lucide.createIcons({root: btn.parentElement});
             
             // [REQ 1] Reactividad visual inmediata en contadores antes del recalculo pesado
             const sH = document.getElementById('satSourceHeaderCount');
             const cH = document.getElementById('satConfirmedHeaderCount');
             if (sH) {
                 const curS = parseInt(sH.innerText) || 0;
                 sH.innerText = `${Math.max(0, curS - items.length)} Ítems`;
                 sH.classList.add('bg-red-500/60', 'text-white', 'scale-110', 'transition-all', 'duration-300');
             }
             if (cH) {
                 const curC = parseInt(cH.innerText) || 0;
                 cH.innerText = `${curC + items.length} Ítems`;
                 cH.classList.add('bg-emerald-500/60', 'text-white', 'scale-110', 'transition-all', 'duration-300');
             }
             
             // Evitar Freeze Thread en Arrays grandes
             setTimeout(() => {
                 if (!this.confirmedState[targetMaster]) {
                     this.confirmedState[targetMaster] = { items: [] };
                 }
                 
                 const itemsToMove = new Set(items.map(it => it.val));
                 
                 for (const m in this.sourceAuditState) {
                     this.sourceAuditState[m].items = this.sourceAuditState[m].items.filter(x => !itemsToMove.has(x));
                 }
                 
                 itemsToMove.forEach(val => {
                     if (!this.confirmedState[targetMaster].items.includes(val)) {
                         this.confirmedState[targetMaster].items.push(val);
                     }
                     this.satCheckedItems.delete(encodeURIComponent(val));
                 });

                 for(let m in this.sourceAuditState) {
                     if (this.sourceAuditState[m].items.length === 0) delete this.sourceAuditState[m];
                 }

                 document.getElementById('satTransferSelect').value = "";
                 this.satGlobalChecked.clear();
                 this._renderSemanticAuditTray();
                 
                 // Finish loading
                 btn.innerHTML = originalText;
                 btn.disabled = false;
                 if (window.Swal) Swal.fire({toast: true, position: 'top-end', icon: 'success', title: `${items.length} SKUs Transferidos`, timer: 1500, showConfirmButton: false});
             }, 10);
        };

        // Evento Desechar (Basura a RAM)
        document.getElementById('satDeleteBtn').onclick = () => {
             const items = getSelectedItems();
             if(items.length === 0) return;
             
             // [REQ 1] Reactividad visual
             const sH = document.getElementById('satSourceHeaderCount');
             if (sH) {
                 const curS = parseInt(sH.innerText) || 0;
                 sH.innerText = `${Math.max(0, curS - items.length)} Ítems`;
                 sH.classList.add('bg-rose-500/60', 'text-white', 'scale-110', 'transition-all', 'duration-300');
             }
             
             items.forEach(it => {
                 this.discardedItems.add(it.val);
                 for (const m in this.sourceAuditState) {
                     this.sourceAuditState[m].items = this.sourceAuditState[m].items.filter(x => x !== it.val);
                 }
                 this.satCheckedItems.delete(encodeURIComponent(it.val));
             });
             for(let m in this.sourceAuditState) {
                 if (this.sourceAuditState[m].items.length === 0) delete this.sourceAuditState[m];
             }
             this.satGlobalChecked.clear();
             this._renderSemanticAuditTray();
        };

        // COMPILAR AST
        const satSaveBtn = document.getElementById('satSaveBtn');
        satSaveBtn.disabled = true; // [FIX UX SEGURIDAD] Disable by default
        
        satSaveBtn.onclick = async () => {
             const finalMap = {};
             let mappedCount = 0;
             const masterSet = new Set();
             // [CRITICAL UX FIX] Compilador lee exclusivamente el ConfirmedState.
             for(const m in this.confirmedState) {
                 if(this.confirmedState[m].items.length > 0) {
                     this.confirmedState[m].items.forEach(crudo => {
                         finalMap[crudo] = m;
                         masterSet.add(m);
                         mappedCount++;
                     });
                 }
             }

             if (mappedCount === 0) {
                 if (window.Swal) Swal.fire('Bandeja Vacía', 'Debe transferir artículos a la bandeja confirmada.', 'warning');
                 return;
             }

             const logica = [];
             
             let mergedMap = { ...finalMap };
             let mergedDiscarded = Array.from(this.discardedItems);

             // [FIX LÓGICA MERGE] Unir de forma no destructiva si el usuario eligió Procesar Faltantes
             if (this._crystalizeMergeMode) {
                  let existingPipeline = null;
                  if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
                       const actState = window.viewerRuleWorkshop.getActiveState();
                       if (actState) existingPipeline = actState.pipeline;
                  }
                  
                  if (existingPipeline) {
                       const ruleArr = Array.isArray(existingPipeline) ? existingPipeline : [existingPipeline];
                       ruleArr.forEach(r => {
                           if (r.logica && Array.isArray(r.logica)) {
                               r.logica.forEach(b => {
                                   if (b.condicion && b.condicion.operador === 'IN_DICT_KEYS' && b.accion && b.accion.tipo_accion === 'DICTIONARY_REPLACE') {
                                       mergedMap = { ...b.condicion.valor, ...mergedMap };
                                   }
                                   if (b.condicion && b.condicion.operador === 'IN_LIST' && b.accion && b.accion.tipo_accion === 'DROP') {
                                       mergedDiscarded = [...new Set([...(b.condicion.valor || []), ...mergedDiscarded])];
                                   }
                               });
                           }
                       });
                       console.log(`[Chofer IA - Merge] Consolidando diccionarios semánticos. AST previos mapeados integrados.`);
                  }
             }

             if (mergedDiscarded.length > 0) {
                 logica.push({
                      condicion: { operador: "IN_LIST", valor: mergedDiscarded },
                      accion: { tipo_accion: "DROP", valor: null }
                 });
             }
             
             logica.push({
                  condicion: { operador: "IN_DICT_KEYS", valor: mergedMap },
                  accion: { tipo_accion: "DICTIONARY_REPLACE", valor: mergedMap }
             });
             
             logica.push({
                  condicion: { operador: "DEFAULT" },
                  accion: { tipo_accion: "SET_VALUE", valor: "" }
             });

             const aiRuleObj = {
                 nombre_regla: `[IA] Caza Rubros: ${promptText}`,
                 descripcion: `Validado por Auditoría (HITL V2-C). Relacionó ${mappedCount} sub-items -> ${masterSet.size} Clústeres Oficiales. Desechó ${this.discardedItems.size} ítems sucios.`,
                 tipo: 'ast_conditional',
                 logica: logica,
                 fromAI: true
             };

             document.getElementById('semanticAuditTray').remove();
             this._setStatus('Aterrizando AST Estructural...', 'working');

             // [FIX QA 2] Inyección Visible y Sincronizada en el DOM del Taller.
             // Para que no se pise la memoria al presionar "Guardar" en el Taller y para resolver 
             // el "Type Casting" a 0,00 que sufría la persistencia por falta de regla activa.
             if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.getActiveState === 'function') {
                 if (targetRuleIdx !== null && targetRuleIdx !== undefined && typeof window.viewerRuleWorkshop.updateLocalRuleDictionary === 'function') {
                     // NUEVA RUTA: Parche en estado, manteniendo idempotencia y otras reglas colindantes
                     let logicaAppend = mergedDiscarded.length > 0 ? { dropped: mergedDiscarded } : null;
                     window.viewerRuleWorkshop.updateLocalRuleDictionary(targetRuleIdx, mergedMap, logicaAppend);
                     
                     // [HERD IMMUNITY QA] Inyección Transversal hacia Base de Datos Maestra
                     const destStateForce = window.viewerRuleWorkshop.getActiveState();
                     if (destStateForce && destStateForce.colIndex && destStateForce.pipeline) {
                         if (destStateForce.masterField && destStateForce.masterField.id) {
                             const payloadDict = {
                                 id: destStateForce.masterField.id,
                                 termino: destStateForce.masterField.nombre_campo || destStateForce.colName,
                                 reglas_procesamiento: destStateForce.pipeline,
                                 currentProviderId: window.globalContext ? window.globalContext.providerId : null
                             };
                             const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                             fetch(`${backendUrl}/api/files/dictionary/update`, {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify(payloadDict)
                             }).then(r => r.json()).then(res => {
                                 console.log("🌐 [HERD IMMUNITY] Actualización de AST perpetuada en Master Dictionary:", res);
                             }).catch(err => console.error("Error perpetuando AST global:", err));
                         }
                     }
                     console.log(`🤖 [CHOFER] Regla Caza-Rubro MERGEADA estructuralmente en la UI Activa [Idx: ${targetRuleIdx}].`);
                     this._setStatus('Persistencia Sincronizada', 'success');

                     // Trigger safe flush of Universal Views if headless
                     const destState = window.viewerRuleWorkshop.getActiveState();
                     if (destState && !destState.isOpen && typeof window.triggerSafeRender === 'function') {
                          window.triggerSafeRender();
                     }

                 } else {
                     const destState = window.viewerRuleWorkshop.getActiveState();
                     if (destState && destState.colIndex) {
                         
                         // Invocamos la API nativa con el flag clearFirst = true
                         // Esto elimina la basura local y ancla visualmente la regla al UI.
                         window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj, true);
                         
                         // [FIX AMNESIA] Forzar Sincronización Memoria Local a Global antes del Fetch al Backend
                         const destStateForce = window.viewerRuleWorkshop.getActiveState();
                     if (destStateForce && destStateForce.colIndex && destStateForce.pipeline) {
                         if (!window.draftPipelines) window.draftPipelines = {};
                         window.draftPipelines[destStateForce.colIndex] = {
                             masterField: destStateForce.masterField,
                             colName: destStateForce.colName,
                             rules: [...destStateForce.pipeline]
                         };

                         // [HERD IMMUNITY QA] Inyección Transversal hacia Base de Datos Maestra
                         if (destStateForce.masterField && destStateForce.masterField.id) {
                             const payloadDict = {
                                 id: destStateForce.masterField.id,
                                 termino: destStateForce.masterField.nombre_campo || destStateForce.colName,
                                 reglas_procesamiento: destStateForce.pipeline,
                                 currentProviderId: window.globalContext ? window.globalContext.providerId : null
                             };
                             const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                             fetch(`${backendUrl}/api/files/dictionary/update`, {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify(payloadDict)
                             }).then(r => r.json()).then(res => {
                                 console.log("🌐 [HERD IMMUNITY] AST perpetuado en Master Dictionary:", res);
                             }).catch(err => console.error("Error perpetuando AST global:", err));
                         }
                     }

                     console.log(`🤖 [CHOFER] Regla Caza-Rubro Inyectada estructuralmente en la UI Activa (${destState.colIndex}).`);
                     this._setStatus('Persistencia Sincronizada', 'success');

                     // Trigger safe flush of Universal Views if headless
                     if (!destState.isOpen && typeof window.triggerSafeRender === 'function') {
                          window.triggerSafeRender();
                     }

                     } else {
                         console.warn("🤖 [CHOFER] No hay contexto activo para inyectar Rubro.");
                         if (window.Swal) Swal.fire('Contexto Perdido', 'Abra el Taller en la columna deseada antes de cristalizar.', 'error');
                         this._setStatus('Error de Bind', 'error');
                     }
                 }
             } else {
                 console.error("API Error - Workshop Desconectado");
             }

             this.promptEl.value = "";
             if (this.selectedIntent) {
                 this.selectedIntent = null;
                 this.selectedRoute = null;
                 document.querySelectorAll('.vai-quick-btn').forEach(b => {
                     b.className = "vai-quick-btn px-2 py-1 bg-slate-800/80 hover:bg-slate-700/80 text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-500 rounded transition font-medium flex items-center";
                 });
             }
        };
    }

    _renderSemanticAuditTray() {
        const sourceContainer = document.getElementById('satSourceContainer');
        const confirmedContainer = document.getElementById('satConfirmedContainer');
        if(!sourceContainer || !confirmedContainer) return;
        
        // --- 1. RENDER SOURCE PANEL ---
        let sourceHtml = '';
        let sourceGroupIdx = 0;
        let sourceCount = 0;
        
        for (const masterVal in this.sourceAuditState) {
             const group = this.sourceAuditState[masterVal];
             if (group.deleted || group.items.length === 0) continue;
             sourceCount += group.items.length;
             
             let childrenHtml = group.items.map((val, idx) => {
                 const b64Val = encodeURIComponent(val);
                 const argInfo = this.argumentationMap && this.argumentationMap[val] 
                     ? `<span title="Justificación IA:\n${this.argumentationMap[val].replace(/"/g, '&quot;')}"><i data-lucide="info" class="w-3.5 h-3.5 text-sky-400 hover:text-sky-300 ml-2 shrink-0 cursor-help"></i></span>` 
                     : '';
                 return `
                 <div class="flex items-center justify-between mb-1 pl-3 p-1 border-l-2 border-slate-700/50 hover:bg-slate-800/50 transition">
                     <div class="flex items-center gap-2 truncate">
                         <input type="checkbox" id="sat_chk_${sourceGroupIdx}_${idx}" data-master="${masterVal.replace(/"/g, '&quot;')}" value="${b64Val}" class="sat-raw-chk form-checkbox h-3.5 w-3.5 text-indigo-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer mt-0.5" ${this.satCheckedItems && this.satCheckedItems.has(b64Val) ? 'checked' : ''}>
                         <label for="sat_chk_${sourceGroupIdx}_${idx}" class="text-xs text-slate-400 cursor-pointer select-none font-mono tracking-tight truncate" title="${val.replace(/"/g, '&quot;')}">${val}</label>
                     </div>
                     ${argInfo}
                 </div>
                 `;
             }).join('');

             sourceHtml += `
             <div class="bg-slate-800/50 border border-slate-700/30 rounded overflow-hidden shrink-0">
                 <div class="bg-slate-800 p-2 border-b border-slate-700/50 flex items-center justify-between hover:bg-slate-700/80 transition">
                     <label class="flex items-center gap-2 cursor-pointer w-full" for="sat_global_${sourceGroupIdx}">
                         <input type="checkbox" id="sat_global_${sourceGroupIdx}" class="sat-global-chk form-checkbox h-4 w-4 text-indigo-500 rounded border-indigo-500/50 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer" data-group="${sourceGroupIdx}" data-master="${masterVal.replace(/"/g, '&quot;')}" ${this.satGlobalChecked && this.satGlobalChecked.has(masterVal) ? 'checked' : ''}>
                         <span class="text-sm font-black text-indigo-300 font-mono tracking-widest truncate pr-2 select-none flex items-center gap-2"><i data-lucide="sparkles" class="w-4 h-4 text-indigo-500/50"></i> ${masterVal}</span>
                     </label>
                     <div class="flex items-center gap-2">
                         <span class="text-xs bg-black/30 text-slate-300 px-2 py-0.5 rounded-full font-bold shadow-inner shrink-0 border border-white/5">${group.items.length} SKUs</span>
                     </div>
                 </div>
                 <div class="p-2 py-2 bg-slate-950/50">
                    ${childrenHtml}
                 </div>
             </div>
             `;
             sourceGroupIdx++;
        }
        
        if (sourceHtml === '') {
             sourceHtml = `<div class="flex items-center justify-center p-8 text-slate-500 text-xs font-mono"><i data-lucide="check-circle" class="w-4 h-4 mr-2"></i> No hay ítems pendientes de curaduría.</div>`;
        }
        sourceContainer.innerHTML = sourceHtml;

        // --- 2. RENDER CONFIRMED PANEL ---
        let confirmedHtml = '';
        let confGroupIdx = 0;
        let confirmedCount = 0;
        
        for (const masterVal in this.confirmedState) {
             const group = this.confirmedState[masterVal];
             if (group.items.length === 0) continue;
             confirmedCount += group.items.length;
             
             let childrenHtml = group.items.map((val, idx) => {
                 const b64Val = encodeURIComponent(val);
                 const argInfo = this.argumentationMap && this.argumentationMap[val] 
                     ? `<span title="Justificación IA:\n${this.argumentationMap[val].replace(/"/g, '&quot;')}"><i data-lucide="info" class="w-3.5 h-3.5 text-sky-400 hover:text-sky-300 ml-2 shrink-0 cursor-help"></i></span>` 
                     : '';
                 return `
                 <div class="flex items-center justify-between mb-1 pl-3 p-1 border-l-2 border-orange-700/50 hover:bg-slate-800 transition group">
                     <div class="flex items-center gap-2 truncate flex-1">
                         <input type="checkbox" id="sat_conf_chk_${confGroupIdx}_${idx}" data-master="${masterVal.replace(/"/g, '&quot;')}" value="${b64Val}" class="sat-conf-chk form-checkbox h-3.5 w-3.5 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer mt-0.5" checked>
                         <label for="sat_conf_chk_${confGroupIdx}_${idx}" class="text-xs text-orange-100 cursor-pointer select-none font-mono tracking-tight truncate block overflow-hidden text-ellipsis whitespace-nowrap min-w-0" title="${val.replace(/"/g, '&quot;')}">${val}</label>
                     </div>
                     <div class="flex items-center gap-2 shrink-0 ml-2">
                         ${argInfo}
                         <button class="sat-item-restore opacity-0 group-hover:opacity-100 bg-rose-900/30 hover:bg-rose-600 text-rose-500 hover:text-white p-0.5 rounded transition" title="Quitar de la bandeja y devolver a Pendientes" data-master="${masterVal.replace(/"/g, '&quot;')}" data-val="${b64Val}">
                             <i data-lucide="x" class="w-3 h-3"></i>
                         </button>
                     </div>
                 </div>
                 `;
             }).join('');

             confirmedHtml += `
             <div class="bg-orange-950/20 border border-orange-500/30 rounded overflow-hidden shrink-0">
                 <div class="bg-orange-900/40 p-2 border-b border-orange-500/30 flex items-center justify-between">
                     <span class="text-sm font-black text-white font-mono tracking-widest truncate pr-2 flex items-center gap-2"><i data-lucide="check-circle-2" class="w-4 h-4 text-orange-400"></i> ${masterVal}</span>
                     <span class="text-xs bg-black/50 text-orange-200 px-2 py-0.5 rounded-full font-bold shadow-inner shrink-0 border border-orange-500/20">${group.items.length} SKUs Confirmados</span>
                 </div>
                 <div class="p-2 py-2 bg-slate-950/80">
                    ${childrenHtml}
                 </div>
             </div>
             `;
             confGroupIdx++;
        }
        
        if (confirmedHtml === '') {
             confirmedHtml = `<div class="absolute inset-0 flex flex-col items-center justify-center text-orange-500/50 pt-8" style="pointer-events:none;"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-20"></i><span class="text-xs font-mono font-bold">BANDEJA VACÍA</span><p class="text-[10px] text-orange-500/30 w-1/2 text-center mt-1">Transfiere ítems desde la bandeja superior para cristalizarlos.</p></div>`;
        }
        confirmedContainer.innerHTML = confirmedHtml;
        
        const hs = document.getElementById('satSourceHeaderCount');
        if (hs) {
            hs.innerText = `${sourceCount} Ítems`;
            setTimeout(() => hs.classList.remove('bg-red-500/60', 'bg-emerald-500/60', 'bg-rose-500/60', 'text-white', 'scale-110'), 350);
        }
        const hc = document.getElementById('satConfirmedHeaderCount');
        if (hc) {
            hc.innerText = `${confirmedCount} Ítems`;
            setTimeout(() => hc.classList.remove('bg-red-500/60', 'bg-emerald-500/60', 'bg-rose-500/60', 'text-white', 'scale-110'), 350);
        }
        
        if(window.lucide) {
            window.lucide.createIcons({root: sourceContainer});
            window.lucide.createIcons({root: confirmedContainer});
        }

        // Sub-Eventos
        const updateCounter = () => {
            const checks = sourceContainer.querySelectorAll('.sat-raw-chk:checked').length;
            document.getElementById('satSelectionCounter').innerText = `${checks} SKUs seleccionados`;
            const dis = checks === 0;
            document.getElementById('satTransferBtn').disabled = dis;
            document.getElementById('satDeleteBtn').disabled = dis;
            
            // Validador AST Final (Se habilita basado en Contenidos Confirmados)
            const saveBtn = document.getElementById('satSaveBtn');
            if(saveBtn) saveBtn.disabled = (confirmedCount === 0);
        };
        
        updateCounter();

        // Checkboxes Source Logic
        sourceContainer.querySelectorAll('.sat-raw-chk').forEach(chk => {
            chk.onchange = (e) => {
                if (e.target.checked) this.satCheckedItems.add(e.target.value);
                else this.satCheckedItems.delete(e.target.value);
                updateCounter();
            };
        });

        sourceContainer.querySelectorAll('.sat-global-chk').forEach(chk => {
            chk.onchange = (e) => {
                const gIdx = e.target.getAttribute('data-group');
                const mVal = e.target.getAttribute('data-master');
                const isChecked = e.target.checked;
                
                if (isChecked) this.satGlobalChecked.add(mVal);
                else this.satGlobalChecked.delete(mVal);
                
                sourceContainer.querySelectorAll(`.sat-raw-chk[id^="sat_chk_${gIdx}_"]`).forEach(c => {
                    c.checked = isChecked;
                    if (isChecked) this.satCheckedItems.add(c.value);
                    else this.satCheckedItems.delete(c.value);
                });
                updateCounter();
            };
        });

        // Restore Items Logic (UX Flexible)
        const restoreItem = (master, val) => {
            // [REQ 1] Reactividad visual inversa
            const sH = document.getElementById('satSourceHeaderCount');
            const cH = document.getElementById('satConfirmedHeaderCount');
            if (sH) sH.classList.add('bg-emerald-500/60', 'text-white', 'scale-110', 'transition-all', 'duration-300');
            if (cH) cH.classList.add('bg-red-500/60', 'text-white', 'scale-110', 'transition-all', 'duration-300');

            // Remueve de confirmed
            this.confirmedState[master].items = this.confirmedState[master].items.filter(x => x !== val);
            
            // Agrega a source ("Restituidos" si no recordamos rubro orginal)
            if (!this.sourceAuditState["[ARTÍCULOS AISLADOS (Restituidos)]"]) {
                this.sourceAuditState["[ARTÍCULOS AISLADOS (Restituidos)]"] = { deleted: false, items: [] };
            }
            if (!this.sourceAuditState["[ARTÍCULOS AISLADOS (Restituidos)]"].items.includes(val)) {
                this.sourceAuditState["[ARTÍCULOS AISLADOS (Restituidos)]"].items.push(val);
            }
            
            this._renderSemanticAuditTray();
        };

        confirmedContainer.querySelectorAll('.sat-item-restore').forEach(btn => {
            btn.onclick = (e) => {
                const master = e.currentTarget.getAttribute('data-master');
                const val = decodeURIComponent(e.currentTarget.getAttribute('data-val'));
                restoreItem(master, val);
            };
        });

        // Alternativa UX: Deseleccionar checkbox de confirmados restaura el item a pendientes
        confirmedContainer.querySelectorAll('.sat-conf-chk').forEach(chk => {
            chk.onchange = (e) => {
                if (!e.target.checked) {
                    const master = e.target.getAttribute('data-master');
                    const val = decodeURIComponent(e.target.value);
                    restoreItem(master, val);
                }
            };
        });
    }
    
    async _openCreateRubroModal() {
        const modalHtml = `
        <div id="satCreateRubroModal" class="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-md">
                <h3 class="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2"><i data-lucide="tag" class="w-5 h-5"></i> Crear Nuevo Rubro Maestro</h3>
                
                <div class="mb-4">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Nombre del Rubro <span class="text-red-500">*</span></label>
                    <input type="text" id="satNewRubroName" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded px-3 py-2 outline-none focus:border-orange-500" placeholder="Ej: FERRETERÍA">
                </div>
                
                <div class="mb-6">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Descripción Narrativa (Contexto Semántico) <span class="text-red-500">*</span></label>
                    <textarea id="satNewRubroNarrative" rows="3" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded px-3 py-2 outline-none focus:border-orange-500" placeholder="Ej: Herramientas, clavos, tornillos, materiales de construcción..."></textarea>
                </div>
                
                <div class="flex justify-end gap-3">
                    <button onclick="document.getElementById('satCreateRubroModal').remove()" class="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded font-bold transition">Cancelar</button>
                    <button id="satSubmitRubroBtn" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow-lg shadow-emerald-900/50 transition">Crear y Usar</button>
                </div>
            </div>
        </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if(window.lucide) window.lucide.createIcons({root: document.getElementById('satCreateRubroModal')});
        
        document.getElementById('satSubmitRubroBtn').onclick = async () => {
             const nombre_rubro = document.getElementById('satNewRubroName').value.trim();
             const descripcion_narrativa = document.getElementById('satNewRubroNarrative').value.trim();
             
             if(!nombre_rubro || !descripcion_narrativa) {
                 if(window.Swal) Swal.fire({icon: 'warning', title: 'Campos Incompletos', text: 'El Nombre y la Narrativa son obligatorios.', background: '#0f172a', color: '#f8fafc'});
                 else alert('El Nombre y la Narrativa son obligatorios.');
                 return;
             }
             
             const btnEl = document.getElementById('satSubmitRubroBtn');
             btnEl.disabled = true;
             btnEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-2"></i> Creando...`;
             if(window.lucide) window.lucide.createIcons({root: document.getElementById('satCreateRubroModal')});
             
             try {
                 const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
                 const res = await fetch(`${backendUrl}/api/rubros`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ nombre_rubro, descripcion_narrativa })
                 });
                 const data = await res.json();
                 
                 if(data.success) {
                      // Recargar la lista de rubros dinámicamente
                      const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
                      const rubrosRes = await fetch(`${backendUrl}/api/rubros`);
                      if(rubrosRes.ok) {
                          const payload = await rubrosRes.json();
                          const rubrosOficiales = payload.data || [];
                          const selectEl = document.getElementById('satTransferSelect');
                          if(selectEl) {
                              selectEl.innerHTML = '<option value="">-- Mover SKUs a Maestro Oficial... --</option>' + 
                                  rubrosOficiales.map(r => `<option value="${r.nombre_rubro.replace(/"/g, '&quot;')}">${r.nombre_rubro}</option>`).join('');
                              
                              // Auto-seleccionar el recién creado
                              selectEl.value = nombre_rubro.replace(/"/g, '&quot;');
                           }
                      }
                      
                      document.getElementById('satCreateRubroModal').remove();
                      if(window.Swal) Swal.fire({icon: 'success', title: 'Rubro Creado', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#0f172a', color: '#10b981'});
                 } else {
                      throw new Error(data.error || "Error al crear el Rubro");
                 }
             } catch(e) {
                 console.error(e);
                 if(window.Swal) Swal.fire({icon: 'error', title: 'Error In-Line', text: e.message, background: '#0f172a', color: '#f8fafc'});
                 else alert('Error: ' + e.message);
                 
                 btnEl.disabled = false;
                 btnEl.innerHTML = 'Crear y Usar';
             }
        };
    }

    _checkEditRubroState() {
        const selectEl = document.getElementById('satTransferSelect');
        const editBtn = document.getElementById('satEditRubroBtn');
        if (selectEl && editBtn) {
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const hasId = selectedOpt && selectedOpt.getAttribute('data-id') && selectedOpt.getAttribute('data-id') !== "";
            editBtn.disabled = !hasId;
        }
    }

    async _openEditRubroModal() {
        const selectEl = document.getElementById('satTransferSelect');
        if (!selectEl) return;
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (!selectedOpt || !selectedOpt.value) return;

        const id = selectedOpt.getAttribute('data-id');
        const currentName = selectedOpt.textContent || selectedOpt.value;
        const currentNarrative = selectedOpt.getAttribute('data-narrative') || '';

        if (!id) {
            if(window.Swal) Swal.fire({icon: 'warning', title: 'Edición no permitida', text: 'El rubro seleccionado se creó estáticamente o no tiene ID.', background: '#0f172a', color: '#f8fafc'});
            else alert("Rubro sin ID oficial");
            return;
        }

        const modalHtml = `
        <div id="satEditRubroModal" class="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-md">
                <h3 class="text-xl font-bold text-sky-400 mb-4 flex items-center gap-2"><i data-lucide="edit-3" class="w-5 h-5"></i> Editar Rubro Maestro</h3>
                
                <div class="mb-4">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Nombre del Rubro <span class="text-red-500">*</span></label>
                    <input type="text" id="satEditRubroName" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded px-3 py-2 outline-none focus:border-sky-500" value="${currentName.replace(/"/g, '&quot;')}">
                </div>
                
                <div class="mb-6">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Descripción Narrativa (Contexto Semántico) <span class="text-red-500">*</span></label>
                    <textarea id="satEditRubroNarrative" rows="3" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded px-3 py-2 outline-none focus:border-sky-500">${currentNarrative.replace(/&quot;/g, '"')}</textarea>
                </div>
                
                <div class="flex justify-end gap-3">
                    <button onclick="document.getElementById('satEditRubroModal').remove()" class="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded font-bold transition">Cancelar</button>
                    <button id="satSubmitEditRubroBtn" class="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold shadow-lg shadow-sky-900/50 transition">Guardar Cambios</button>
                </div>
            </div>
        </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if(window.lucide) window.lucide.createIcons({root: document.getElementById('satEditRubroModal')});

        document.getElementById('satSubmitEditRubroBtn').onclick = async () => {
             const nombre_rubro = document.getElementById('satEditRubroName').value.trim();
             const descripcion_narrativa = document.getElementById('satEditRubroNarrative').value.trim();
             
             if(!nombre_rubro || !descripcion_narrativa) {
                 if(window.Swal) Swal.fire({icon: 'warning', title: 'Campos Incompletos', text: 'El Nombre y la Narrativa son obligatorios.', background: '#0f172a', color: '#f8fafc'});
                 else alert('El Nombre y la Narrativa son obligatorios.');
                 return;
             }
             
             const btnEl = document.getElementById('satSubmitEditRubroBtn');
             btnEl.disabled = true;
             btnEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-2"></i> Guardando...`;
             if(window.lucide) window.lucide.createIcons({root: document.getElementById('satEditRubroModal')});
             
             try {
                 const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
                 const res = await fetch(`${backendUrl}/api/rubros/${id}`, {
                     method: 'PUT',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ nombre_rubro, descripcion_narrativa })
                 });
                 const data = await res.json();
                 
                 if(data.success) {
                      // Recargar la lista de rubros dinámicamente
                      const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
                      const rubrosRes = await fetch(`${backendUrl}/api/rubros`);
                      if(rubrosRes.ok) {
                          const payload = await rubrosRes.json();
                          const rubrosOficiales = payload.data || [];
                          const selectEl = document.getElementById('satTransferSelect');
                          if(selectEl) {
                              selectEl.innerHTML = '<option value="">-- Mover SKUs a Maestro Oficial... --</option>' + 
                                  rubrosOficiales.map(r => `<option value="${r.nombre_rubro.replace(/"/g, '&quot;')}" data-id="${r.id || ''}" data-narrative="${(r.descripcion_narrativa || '').replace(/"/g, '&quot;')}">${r.nombre_rubro}</option>`).join('');
                              
                              // Re-seleccionar
                              selectEl.value = nombre_rubro.replace(/"/g, '&quot;');
                           }
                      }
                      
                      document.getElementById('satEditRubroModal').remove();
                      if(window.Swal) Swal.fire({icon: 'success', title: 'Rubro Actualizado', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#0f172a', color: '#10b981'});
                 } else {
                      throw new Error(data.error || "Error al actualizar el Rubro");
                 }
             } catch(e) {
                 console.error(e);
                 if(window.Swal) Swal.fire({icon: 'error', title: 'Error In-Line', text: e.message, background: '#0f172a', color: '#f8fafc'});
                 else alert('Error: ' + e.message);
                 
                 btnEl.disabled = false;
                 btnEl.innerHTML = 'Guardar Cambios';
             }
        };
    }

    async _savePromptToHistory(promptText, intentVal) {
        if (!this.activeMasterFieldId || !promptText) return;
        try {
            const backendUrl = (typeof window.CONFIG !== 'undefined' && window.CONFIG.BACKEND_URL) ? window.CONFIG.BACKEND_URL : 'http://localhost:5655';
            await fetch(`${backendUrl}/api/ai/prompts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterFieldId: this.activeMasterFieldId,
                    prompt: promptText,
                    intent: intentVal || 'General'
                })
            });
            console.log(`[Chofer IA] Prompt guardado exitosamente en historial para maestro ${this.activeMasterFieldId}`);
        } catch(e) {
            console.warn("[Chofer IA] Prompt no pudo guardarse en el historial", e);
        }
    }
}
const viewerAiUi = new ViewerAiUi();
window.viewerAiUi = viewerAiUi;

// Auto-Sincronización Transversal: Escucha los cambios del modal Gestor Central de Rubros
document.addEventListener('lamda:rubros-updated', () => {
    if (viewerAiUi.isConsoleActive || document.getElementById('aiSemanticOverlay')) {
        // Si la UI AI está mínimamente activa, forzamos recarga sigilosa de los selectores.
        if (typeof viewerAiUi._loadRubros === 'function') {
            viewerAiUi._loadRubros();
        }
    }
});

export default viewerAiUi;
