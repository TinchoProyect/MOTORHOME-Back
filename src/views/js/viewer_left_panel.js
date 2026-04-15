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
        // Cargar Diccionario y Categorías Reales en paralelo
        const [result, catResult] = await Promise.all([
            masterTableService.fetchMasterFields(true),
            masterTableService.fetchCategories()
        ]);
        
        if (!result.success) throw new Error("Fallo la carga de campos maestros");

        // Construir mapa maestro de orden visual y nombres canónicos
        const categoriesOrderMap = {};
        const categoriesNameMap = {};
        (catResult.data || []).forEach(cat => {
            const normalizedMapKey = (cat.nombre || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            categoriesOrderMap[normalizedMapKey] = cat.orden_visual;
            categoriesNameMap[normalizedMapKey] = cat.nombre; // Guardamos el nombre "oficial" (ej: "presentación")
        });

        // Filtrar solo los activos (Validación extra por seguridad en UI)
        activeFields = (result.data || []).filter(f => f.esta_activo);

        // Expose globally for V5 UUID resolving
        window.masterDictionary = activeFields;

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

        buildTabs(categoriesOrderMap, categoriesNameMap);
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

// Helper robusto para comparación sin acentos ni keys extras
const normalizeKey = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// =========================================================================
// 2. TAB BUILDING & LOGIC
// =========================================================================
function buildTabs(categoriesOrderMap, categoriesNameMap) {
    const header = document.getElementById('vlpTabsHeader');

    // Mapeo Inteligente (Nombre -> Orden Visual)
    const categoryMetadata = {};
    groupedFields = {};

    activeFields.forEach(field => {
        // [FIX V5.2 y Tildes] Obtenemos el originario
        const rawCategoryStr = field.diccionario_categorias?.nombre || field.tipo_dato || 'Otros';
        const normalizedName = normalizeKey(rawCategoryStr);
        
        // Resolución Semántica: Si el string heredado ('Presentacion') coincide conceptualmente con 
        // una categoría oficial de la base ('presentación'), usamos ESTRICTAMENTE la oficial.
        // Esto previene que se abran 2 solapas distintas por culpa de un acento.
        const catName = categoriesNameMap[normalizedName] || rawCategoryStr;
        
        // El orden prioritario es la tabla de referencias, luego el devuelto por la fila, y sino 99.
        const catOrder = categoriesOrderMap[normalizedName] ?? (field.diccionario_categorias?.orden_visual ?? 99);

        if (!groupedFields[catName]) {
            groupedFields[catName] = [];
            categoryMetadata[catName] = catOrder;
        }
        groupedFields[catName].push(field);
    });

    // Ordenamiento Numérico Posicional
    const sortedCategoryPairs = Object.entries(categoryMetadata)
        .sort((a, b) => a[1] - b[1]); // Compara el 'orden_visual' (indice 1 del par)

    const categories = sortedCategoryPairs.map(pair => pair[0]); // Extrae solo los nombres

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

        // [V4] FASE 1: Click en Tarjeta Maestra
        card.onclick = () => {
            // Block if V3 Header Formatter is open
            if (window.mappingMode) {
                console.warn("⚠️ [V4] Fase 1 bloqueada: El panel de Formateo de Encabezados (V3) está activo.");
                if (typeof Swal !== 'undefined') {
                    Swal.fire("Acción Bloqueada", "Bloqueo Activo: Cierra el botón de 'Mapear Columnas' (Encabezados) antes de vincular campos maestros.", "warning");
                } else {
                    alert("Cierra 'Mapear Columnas' antes de vincular campos maestros.");
                }
                return;
            }

            if (window.viewerMapper && typeof window.viewerMapper.activatePointerMode === 'function') {
                console.log(`🎯 [V4] FASE 1: Campo Maestro seleccionado -> ${field.nombre_campo}`);

                // Visual Highlight
                document.querySelectorAll('#tab-content div').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-900/20'));
                card.classList.add('border-blue-500', 'bg-blue-900/20');

                window.viewerMapper.activatePointerMode(field);
            }
        };

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

// =========================================================================
// 6. PRODUCCIÓN EXTERNA (Recipe Render)
// =========================================================================
window.addEventListener('ProductionDataReady', (e) => {
    const data = e.detail;
    const header = document.getElementById('vlpTabsHeader');
    const content = document.getElementById('vlpTabsContent');
    
    // Purge logic dict UI and switch to Recipe mode
    if (header && content) {
        header.innerHTML = '<div class="px-4 py-3 text-[10px] font-black tracking-widest uppercase text-emerald-400 flex items-center gap-2"><i data-lucide="beaker" class="w-4 h-4 text-emerald-400"></i> RECETA DE PRODUCCIÓN</div>';
        
        content.innerHTML = `
           <div class="p-4 space-y-4">
               <div class="p-3 bg-slate-900 border border-emerald-500/30 rounded-xl relative overflow-hidden shadow-lg">
                   <div class="absolute -top-2 -right-2 opacity-10 pointer-events-none"><i data-lucide="package-search" class="w-20 h-20 text-emerald-500"></i></div>
                   <h4 class="text-[9px] uppercase text-emerald-500 font-bold tracking-widest mb-1 title-shadow">Artículo Vinculado</h4>
                   <p class="text-xs text-slate-200 font-black tracking-wide">${data.articulo_nombre || data.articulo || 'Sin denominación'}</p>
               </div>
               
               <h4 class="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-b border-slate-700/50 pb-2 mb-2">Ingredientes Requeridos</h4>
               <div class="space-y-2" id="vlpRecipeIngredients">
                   <!-- Ingredients Dynamic Render -->
               </div>
               
               <div class="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-center mt-4">
                   <p class="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Cálculo de Retorno</p>
                   <p class="text-[10px] text-slate-400 italic">A la espera de ingreso de Kilos producidos para estipular merma final.</p>
               </div>
           </div>
        `;
        
        const ingList = document.getElementById('vlpRecipeIngredients');
        let mapped = data.ingredientes || data.receta || [];
        
        if (!Array.isArray(mapped) || mapped.length === 0) {
            ingList.innerHTML = `<p class="text-[10px] text-slate-500 mt-4 text-center italic">Este artículo no posee una receta asignada o hubo un error de mapeo.</p>`;
        } else {
            mapped.forEach(ing => {
                let stockVal = ing.stock !== undefined ? ing.stock : '0.00';
                let propVal = ing.proporcion_kilo !== undefined ? `${ing.proporcion_kilo} Kg` : '0.00 Kg';
                let nombreIng = ing.nombre || ing.insumo || 'Ingrediente Base';
                
                let el = document.createElement('div');
                el.className = "flex flex-col p-3 bg-slate-800/60 border border-slate-700 rounded-lg hover:border-emerald-500/40 hover:bg-slate-800 transition-all shadow-sm";
                el.innerHTML = `
                    <p class="text-[11px] font-bold text-slate-200 uppercase truncate mb-3" title="${nombreIng}">${nombreIng}</p>
                    <div class="flex justify-between items-center text-[10px] font-bold tracking-wide">
                        <span class="text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-500/20 tooltip" title="Stock actual en depósito central">📦 Depósito: ${stockVal}</span>
                        <span class="text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">⚖️ Req/Kg: ${propVal}</span>
                    </div>
                `;
                ingList.appendChild(el);
            });
        }
        
        if (window.lucide) window.lucide.createIcons();
    }
});
