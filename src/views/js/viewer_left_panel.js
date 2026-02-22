// src/views/js/viewer_left_panel.js
import { masterTableService } from './services/master_table_service.js';

let activeFields = [];
let groupedFields = {};
let activeTab = null;
let isCollapsed = false;

// =========================================================================
// 1. DATA LOADING
// =========================================================================
export async function initLeftPanel() {
    const aside = document.getElementById('viewerLeftPanel');
    const header = document.getElementById('vlpTabsHeader');
    const content = document.getElementById('vlpTabsContent');

    if (!aside || !header || !content) return;

    // Cargar estado guardado de colapso
    const savedState = localStorage.getItem('viewerLeftPanelCollapsed');
    if (savedState !== null) {
        isCollapsed = savedState === 'true';
    }

    // TODO: En el futuro esto dejará de tener remove, solo responde a un botón en el toolbar
    aside.classList.remove('hidden');
    applyPanelState();

    header.innerHTML = '<div class="p-3 text-xs text-slate-500 font-mono italic">Cargando diccionario...</div>';
    content.innerHTML = '';

    try {
        const result = await masterTableService.fetchMasterFields();
        if (!result.success) throw new Error("Fallo la carga de campos maestros");

        // Filtrar solo los activos
        activeFields = (result.data || []).filter(f => f.esta_activo);

        if (activeFields.length === 0) {
            header.innerHTML = '';
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center p-6 text-center h-full">
                    <i data-lucide="database" class="w-12 h-12 text-slate-700 mb-4"></i>
                    <p class="text-sm font-bold text-slate-500">Diccionario Vacío</p>
                    <p class="text-[10px] text-slate-600">No hay campos activos para mapear.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        buildTabs();
    } catch (error) {
        console.error("[ViewerLeftPanel] Error:", error);
        header.innerHTML = '';
        content.innerHTML = `
            <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                <p class="text-xs font-bold text-red-400">Error Cargando Datos</p>
                <p class="text-[10px] text-red-500/80">${error.message}</p>
            </div>
        `;
    }
}

// =========================================================================
// 2. TAB BUILDING & LOGIC
// =========================================================================
function buildTabs() {
    const header = document.getElementById('vlpTabsHeader');

    // Agrupar por tipo_dato
    groupedFields = {};
    activeFields.forEach(field => {
        const tipo = field.tipo_dato || 'Otros';
        if (!groupedFields[tipo]) groupedFields[tipo] = [];
        groupedFields[tipo].push(field);
    });

    const categories = Object.keys(groupedFields).sort();

    // Crear la UI de las Tabs
    header.innerHTML = '';
    categories.forEach((cat, index) => {
        const btn = document.createElement('button');
        btn.className = `px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors tab-btn`;
        btn.innerText = cat;
        btn.dataset.category = cat;

        btn.onclick = () => switchTab(cat);
        header.appendChild(btn);
    });

    // Abrir la primera tab por defecto
    if (categories.length > 0) {
        switchTab(categories[0]);
    }
}

function switchTab(category) {
    activeTab = category;

    // Update Button Styles
    const header = document.getElementById('vlpTabsHeader');
    const buttons = header.querySelectorAll('.tab-btn');

    buttons.forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('text-blue-400', 'border-blue-500', 'bg-blue-500/10');
            btn.classList.remove('text-slate-500', 'border-transparent', 'hover:text-slate-300');
        } else {
            btn.classList.remove('text-blue-400', 'border-blue-500', 'bg-blue-500/10');
            btn.classList.add('text-slate-500', 'border-transparent', 'hover:text-slate-300');
        }
    });

    // Render Content
    renderTabContent(category);
}

// =========================================================================
// 3. RENDER FIELDS IN TAB (Glassmorphism Cards)
// =========================================================================
function renderTabContent(category) {
    const content = document.getElementById('vlpTabsContent');
    content.innerHTML = '';

    const fields = groupedFields[category] || [];

    fields.forEach(field => {
        const isReq = field.es_requerido;
        const isId = field.es_identificador;

        const reqBadge = isReq
            ? `<span class="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 text-amber-500 text-[9px] rounded-md font-bold uppercase tracking-widest shrink-0">Req</span>`
            : '';

        const idBadge = isId
            ? `<div class="p-1 bg-blue-500/20 rounded-md text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]" title="Identificador (DNI)"><i data-lucide="key" class="w-3 h-3"></i></div>`
            : `<div class="p-1 bg-slate-800 rounded-md text-slate-500"><i data-lucide="database" class="w-3 h-3"></i></div>`;

        // Card Container
        const card = document.createElement('div');
        // Usamos drag clases provisionales para el futuro mapper
        card.className = "flex items-center gap-3 p-3 mb-2 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/50 hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:-translate-y-0.5 select-none";

        card.innerHTML = `
            ${idBadge}
            <div class="flex-grow min-w-0">
                <p class="text-xs font-bold text-slate-200 truncate" title="${field.nombre_campo}">${field.nombre_campo}</p>
            </div>
            ${reqBadge}
            <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-600 shrink-0"></i>
        `;

        content.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 4. TOGGLE COLLAPSE LOGIC
// =========================================================================
function togglePanel() {
    isCollapsed = !isCollapsed;
    localStorage.setItem('viewerLeftPanelCollapsed', isCollapsed);
    applyPanelState();
}

function applyPanelState() {
    const aside = document.getElementById('viewerLeftPanel');
    const floatingToggle = document.getElementById('vlpFloatingToggle');

    if (!aside || !floatingToggle) return;

    if (isCollapsed) {
        // Colapsado: Ocultar panel desplazando a la izquierda (-100%) y revelando el botón flotante
        aside.classList.add('-translate-x-full', 'opacity-0');
        aside.classList.remove('translate-x-0', 'opacity-100');

        // Timeout para aplicar hidden después de la animación para sacar el elemento del flujo visual
        setTimeout(() => {
            if (isCollapsed) { aside.classList.add('hidden'); }
        }, 300);

        floatingToggle.classList.remove('hidden');
    } else {
        // Expandido: Mostrar panel y ocultar el botón flotante
        aside.classList.remove('hidden');
        floatingToggle.classList.add('hidden');

        // Timeout ultra-corto para forzar reflow del DOM y permitir que CSS ejecute la transición desde hidden
        setTimeout(() => {
            aside.classList.remove('-translate-x-full', 'opacity-0');
            aside.classList.add('translate-x-0', 'opacity-100');
        }, 10);
    }
}

// =========================================================================
// 5. GLOBAL BINDINGS
// =========================================================================
window.viewerLeftPanel = {
    init: initLeftPanel,
    toggle: togglePanel
};
