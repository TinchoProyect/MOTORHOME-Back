/**
 * VIEWER RULE WORKSHOP (V4)
 * Phase 3: The Right Panel and Rule Pipeline Builder
 */

let isPanelOpen = false;
let currentDraftPipeline = [];
let activeContext = {
    masterField: null,
    colIndex: null,
    colName: null
};

// Available Rules Catalog (Fetched from API)
let catalogRules = [];

export async function initRuleWorkshop() {
    console.log('🔗 [WORKSHOP] Inicializado');
    await loadRuleCatalog();
}

async function loadRuleCatalog() {
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}/api/mapping/rules`);
        if (response.ok) {
            catalogRules = await response.json();
            console.log(`✅ [WORKSHOP] Catálogo de reglas cargado: ${catalogRules.length} reglas.`);
            renderRuleSelector();
        } else {
            console.error(`❌ [WORKSHOP] Error HTTP cargando reglas: ${response.status}`);
        }
    } catch (err) {
        console.error("Error cargando catálogo de reglas:", err);
    }
}

function renderRuleSelector() {
    const selector = document.getElementById('vrwRuleSelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">Seleccionar transformación...</option>';

    catalogRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule.id;
        option.textContent = rule.nombre_regla;
        selector.appendChild(option);
    });
}

// OPEN PANEL
export function open(masterField, colIndex, colName) {
    if (!masterField) return;

    activeContext = { masterField, colIndex, colName };
    isPanelOpen = true;

    // Retrieve draft pipeline if it already exists in memory for this column
    if (window.draftPipelines && window.draftPipelines[colIndex]) {
        currentDraftPipeline = [...window.draftPipelines[colIndex].rules];
    } else {
        currentDraftPipeline = [];
    }

    // UI Updates
    document.getElementById('vrwCurrentMappingInfo').innerHTML = `
        <span class="text-slate-400">Enlazando columna:</span>
        <span class="text-white text-sm">"${colName}" <i data-lucide="arrow-right" class="w-3 h-3 inline"></i> ${masterField.nombre_campo}</span>
    `;

    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.remove('hidden', 'translate-x-full', 'opacity-0');
    }

    if (window.lucide) window.lucide.createIcons();
    renderPipeline();

    // Trigger Preview Immediately
    triggerPreview();
}

// CLOSE PANEL
export function close() {
    isPanelOpen = false;
    currentDraftPipeline = [];
    activeContext = { masterField: null, colIndex: null, colName: null };

    const panel = document.getElementById('viewerRightPanel');
    if (panel) {
        panel.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => panel.classList.add('hidden'), 300);
    }

    if (window.viewerMapper) {
        window.viewerMapper.cancelMapping();
    }
}

// PIPELINE MANAGEMENT
export function addSelectedRule() {
    const selector = document.getElementById('vrwRuleSelector');
    if (!selector || !selector.value) {
        alert("Atención: Selecciona una transformación del catálogo primero.");
        return;
    }

    const ruleId = selector.value;
    // ruleId from DOM is a string, rule.id from DB is an int.
    const ruleObj = catalogRules.find(r => r.id.toString() === ruleId);

    if (ruleObj) {
        console.log(`➕ [WORKSHOP] Añadiendo Regla: ${ruleObj.nombre_regla} (ID: ${ruleObj.id})`);
        // We push a clone
        currentDraftPipeline.push({ ...ruleObj });
        renderPipeline();
        selector.value = ""; // reset

        triggerPreview();
    } else {
        console.error(`❌ [WORKSHOP] Regla ID ${ruleId} no encontrada en catálogo.`);
    }
}

export function removeRule(index) {
    currentDraftPipeline.splice(index, 1);
    renderPipeline();
    triggerPreview();
}

// RENDER
function renderPipeline() {
    const container = document.getElementById('vrwRulesPipeline');
    const emptyState = document.getElementById('vrwEmptyState');
    const flowLine = document.getElementById('vrwFlowLine');
    const countBadge = document.getElementById('vrwRuleCount');

    if (!container) return;

    // Reset components (keeping empty state in DOM for hiding/showing)
    const existingChips = container.querySelectorAll('.vrw-rule-chip');
    existingChips.forEach(c => c.remove());

    countBadge.textContent = `${currentDraftPipeline.length} reglas`;

    if (currentDraftPipeline.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (flowLine) flowLine.classList.add('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (flowLine) flowLine.classList.remove('hidden');

    currentDraftPipeline.forEach((rule, index) => {
        const chip = document.createElement('div');
        chip.className = "vrw-rule-chip bg-slate-950 border border-emerald-500/30 p-2.5 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-right-4";

        chip.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="bg-slate-800 text-slate-400 font-mono text-[9px] w-5 h-5 flex items-center justify-center rounded-full border border-slate-700">${index + 1}</div>
                <div>
                    <h4 class="text-xs font-bold text-emerald-400">${rule.nombre_regla}</h4>
                    <p class="text-[9px] text-slate-500 mt-0.5 leading-tight">${rule.descripcion || 'Regla de limpieza nativa.'}</p>
                </div>
            </div>
            <button onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.removeRule(${index})" class="text-slate-600 hover:text-red-400 transition-colors bg-slate-900 hover:bg-red-500/10 p-1.5 rounded-md border border-transparent hover:border-red-500/30">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        `;
        container.appendChild(chip);
    });

    if (window.lucide) window.lucide.createIcons();
}

// BIND TO VIEWER CORE & PREVIEW
function triggerPreview() {
    if (window.viewerETL && typeof window.viewerETL.previewColumn === 'function') {
        window.viewerETL.previewColumn(activeContext.colIndex, currentDraftPipeline);
    }
}

// APPLY MAPPING (SAVE to Memory Drafts)
export function applyMapping() {
    if (!window.draftPipelines) window.draftPipelines = {};

    window.draftPipelines[activeContext.colIndex] = {
        masterField: activeContext.masterField,
        colName: activeContext.colName,
        rules: [...currentDraftPipeline]
    };

    console.log(`✅ [WORKSHOP] Mapeo guardado en RAM: Columna ${activeContext.colIndex} -> ${activeContext.masterField.nombre_campo}`);

    // Commit visual changes in the main Table (Header naming)
    if (window.viewerETL && typeof window.viewerETL.commitColumnMapping === 'function') {
        window.viewerETL.commitColumnMapping(activeContext.colIndex, activeContext.masterField, currentDraftPipeline);
    }

    close();
}

window.viewerRuleWorkshop = {
    init: initRuleWorkshop,
    open,
    close,
    addSelectedRule,
    removeRule,
    applyMapping
};

// Auto-initialize on load
initRuleWorkshop();
