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

    async handleGenerate() {
        const promptText = this.promptEl.value.trim();
        if (!promptText) return;

        // Prevent Double Click
        this.btnEl.disabled = true;
        
        try {
            if (!window.viewerRuleWorkshop || typeof window.viewerRuleWorkshop.getActiveState !== 'function') {
                throw new Error("Taller inalcanzable");
            }

            const state = window.viewerRuleWorkshop.getActiveState();
            if (!state || !state.colIndex) throw new Error("Abre el taller de una columna");

            // Geometrics Sampling (Objeción 1)
            this._setStatus('Muestreando Disp...', 'working');
            
            const vCol = window.virtualColumns ? window.virtualColumns.find(v => v.id === state.colIndex) : null;
            if (!vCol || vCol.dataIdx === undefined) throw new Error("Columna virtual corrupta.");
            
            const samples = aiSampler.extractSmartSample(vCol.dataIdx, state.pipeline, 100);
            if (samples.length === 0) throw new Error("Sin datos para muestrear");

            const colTitle = window.currentSheetData[0][vCol.dataIdx] || "¿?";

            const payload = {
                column_name: colTitle,
                prompt: promptText,
                samples: samples,
                require_ast: true // Indicador obligatorio para el backend/chofer de devolver arbol JSON
            };

            this._setStatus('Pensando...', 'working');
            
            // Request to Service
            const responseData = await aiService.generateETLRule(payload);
            
            // Revisa si trajo un arreglo de reglas válidas
            if (!responseData || !Array.isArray(responseData.rules) || responseData.rules.length === 0) {
                throw new Error("El modelo retornó formato pipeline inválido o vacío.");
            }

            this._setStatus('Inyectando AST...', 'working');

            // Inyectar visual y conceptualmente al sistema local
            if (typeof window.viewerRuleWorkshop.createLocalRuleDirect === 'function') {
                for (let rConfig of responseData.rules) {
                    const aiRuleObj = { ...rConfig, fromAI: true };
                    await window.viewerRuleWorkshop.createLocalRuleDirect(aiRuleObj);
                }
                
                this.promptEl.value = "";
                this._setStatus('Conectado', 'success');
                
                // Calcular Exito AST sobre la iteracion final completa (usando el current pipeline)
                const finalState = window.viewerRuleWorkshop.getActiveState();
                this._evaluateUX(vCol.dataIdx, state.pipeline, finalState.pipeline);
            } else {
                throw new Error("El API del Taller visual (createLocalRule) fue cerrado.");
            }

        } catch (err) {
            console.error("❌ Chofer AST Falló:", err);
            this._setStatus('Error Crítico', 'error');
            this._setFeedback(`Fallo: ${err.message}`, 'error');
        } finally {
            // Anti-Spam de 1.5 secs extra local UI
            setTimeout(() => { if (aiService.isHealthy) this.btnEl.disabled = false; }, 1500);
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
