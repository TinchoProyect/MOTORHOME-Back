/**
 * DASHBOARD TABS - Orquestador de Tablero Unificado
 * Responsabilidad: Gestionar Pestañas (Drive/DB) y Carga de Archivos Procesados.
 * v2.7 (Context Aware & Secure Loading)
 */

console.log("%c 🗂️ DASHBOARD TABS: READY ", "background: #3b82f6; color: #fff; font-weight: bold; padding: 4px;");

// State
let dashboardTabState = 'DRIVE'; // 'DRIVE' | 'DB'
window.selectedFiles = new Set(); // Selection State

// Selection Logic
window.toggleSelection = function (id, el) {
    if (el.checked) {
        window.selectedFiles.add(id);
    } else {
        window.selectedFiles.delete(id);
    }

    // Notify Action Module
    if (window.DashboardActions) {
        window.DashboardActions.renderActionBar(window.selectedFiles.size);
    }
};

window.clearSelection = function () {
    window.selectedFiles.clear();
    if (window.DashboardActions) {
        window.DashboardActions.renderActionBar(0);
    }
};

// Init
window.initDashboardTabs = function () {
    console.log("[Dashboard] Initializing Tabs...");
    // Bind Tab Click Events
    const btnDrive = document.getElementById('tabPending');
    const btnDB = document.getElementById('tabProcessed');

    if (btnDrive) btnDrive.onclick = () => switchDashboardTab('DRIVE');
    if (btnDB) btnDB.onclick = () => switchDashboardTab('DB');

    // Default to Drive (Pending)
    switchDashboardTab('DRIVE');
};

// Switch Logic
window.switchDashboardTab = function (mode) {
    dashboardTabState = mode;
    const btnDrive = document.getElementById('tabPending');
    const btnDB = document.getElementById('tabProcessed');

    // Contenedores
    const containerDrive = document.getElementById('fileListDrive');
    const containerDB = document.getElementById('fileListDB');

    // Update UI Classes
    if (mode === 'DRIVE') {
        if (btnDrive) {
            btnDrive.classList.add('text-blue-400', 'border-b-2', 'border-blue-500', 'bg-blue-500/10');
            btnDrive.classList.remove('text-slate-500', 'hover:text-blue-300');
        }
        if (btnDB) {
            btnDB.classList.remove('text-emerald-400', 'border-b-2', 'border-emerald-500', 'bg-emerald-500/10');
            btnDB.classList.add('text-slate-500', 'hover:text-emerald-300');
        }

        if (containerDrive) containerDrive.classList.remove('hidden');
        if (containerDB) containerDB.classList.add('hidden');

    } else {
        // DB Mode
        if (btnDrive) {
            btnDrive.classList.remove('text-blue-400', 'border-b-2', 'border-blue-500', 'bg-blue-500/10');
            btnDrive.classList.add('text-slate-500', 'hover:text-blue-300');
        }
        if (btnDB) {
            btnDB.classList.add('text-emerald-400', 'border-b-2', 'border-emerald-500', 'bg-emerald-500/10');
            btnDB.classList.remove('text-slate-500', 'hover:text-emerald-300');
        }

        if (containerDrive) containerDrive.classList.add('hidden');
        if (containerDB) containerDB.classList.remove('hidden');

        // Trigger Load
        loadProcessedFiles();
    }
}

// Logic: Load Processed Files
async function loadProcessedFiles() {
    const providerId = window.currentActiveProviderId;
    const container = document.getElementById('fileListDB');
    if (!providerId || !container) return;

    // Reset Selection
    if (window.clearSelection) window.clearSelection();

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-emerald-500/50">
            <i data-lucide="loader-2" class="w-10 h-10 animate-spin mb-4"></i>
            <span class="text-xs font-mono">Buscando en Bodega...</span>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        // Cache Busting
        const ts = new Date().getTime();
        
        // Carga Concurrente de Archivos y Flujos (Evita Waterfall / Bloqueo)
        const [resParams, resFlujos] = await Promise.all([
            fetch(`${backendUrl}/api/files/processed-list?providerId=${providerId}&_t=${ts}`),
            fetch(`${backendUrl}/api/flujos/${providerId}`).catch(e => ({ ok: false }))
        ]);

        const result = await resParams.json();
        if (!result.success) throw new Error(result.error);

        let flujosDisponibles = [];
        if (resFlujos.ok) {
            flujosDisponibles = await resFlujos.json();
            window.cachedFlujosProviderId = providerId;
            window.cachedFlujos = flujosDisponibles;
        }

        renderProcessedGrid(result.files, flujosDisponibles);

    } catch (error) {
        console.error("Error loading processed:", error);
        container.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error: ${error.message}</div>`;
    }
}

function renderProcessedGrid(files, flujosDisponibles = []) {
    const container = document.getElementById('fileListDB');
    if (!container) return;

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-600">
                <i data-lucide="archive" class="w-16 h-16 mb-4 opacity-20"></i>
                <p class="text-sm">Sin archivos procesados</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();

        return;
    }

    // Ordenar archivos por fecha más reciente primero
    const sortedFiles = [...files].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pr-2 pb-10 pt-6">`;

    // Preparar opciones del select
    let flujosOptionsHtml = `<option value="">-- Sin Flujo (Crudo) --</option>`;
    if (flujosDisponibles && flujosDisponibles.length > 0) {
        flujosDisponibles.forEach(f => {
            flujosOptionsHtml += `<option value="${f.id_flujo}">${f.nombre_flujo}</option>`;
        });
    }

    sortedFiles.forEach((file, index) => {
        const isNewest = index === 0;
        const currentBorderClass = isNewest ? 'border-emerald-500/60 shadow-lg shadow-emerald-900/30' : 'border-slate-800';
        const badgeHtml = isNewest ? `<div class="absolute -top-3 left-6 bg-emerald-600 text-white font-bold text-[9px] px-3 py-0.5 rounded-full shadow-lg shadow-emerald-900/50 border border-emerald-400/50 z-20 whitespace-nowrap tracking-wider">RECIENTE</div>` : '';

        html += `
            <div class="group relative bg-slate-900/60 hover:bg-slate-900/90 border ${currentBorderClass} hover:border-emerald-400/80 rounded-2xl p-5 flex flex-col justify-between transition-all shadow-xl hover:-translate-y-1 hover:shadow-emerald-900/30 min-h-[160px]">
                
                ${badgeHtml}

                <div class="flex items-start gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-lg shadow-emerald-500/10">
                        <i data-lucide="file-check" class="w-6 h-6 text-emerald-400"></i>
                    </div>
                    
                    <div class="flex-1 min-w-0 pr-8">
                        <p class="text-[13px] font-bold text-slate-200 line-clamp-2 leading-snug tracking-wide group-hover:text-emerald-400 transition-colors" title="${file.nombre_archivo}">${file.nombre_archivo}</p>
                        <div class="flex items-center gap-4 mt-2">
                            <span class="text-[10px] text-emerald-500 font-mono font-bold flex items-center gap-1.5"><i data-lucide="layers" class="w-3 h-3"></i> ${file.items_count || 0} ITEMS</span>
                            <span class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5"><i data-lucide="calendar" class="w-3 h-3"></i> ${new Date(file.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>

                <div class="absolute top-4 right-4 z-10" onclick="event.stopPropagation()">
                    <input type="checkbox" 
                        class="w-5 h-5 rounded-md border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer transition-colors"
                        onchange="toggleSelection('${file.id}', this)"
                    >
                </div>

                <div class="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                    <div class="flex-1 relative" onclick="event.stopPropagation()">
                        <i data-lucide="workflow" class="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                        <select id="flujo_select_${file.id}" class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-medium rounded-xl pl-9 pr-3 py-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer hover:border-slate-600 transition-colors shadow-inner">
                            ${flujosOptionsHtml}
                        </select>
                        <i data-lucide="chevron-down" class="absolute right-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                    </div>
                    
                    <button class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-600/40" onclick="openProcessedFile('${file.id}', '${file.nombre_archivo}')">
                        Abrir <i data-lucide="arrow-right" class="w-3 h-3"></i>
                    </button>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

// Logic: Open Processed File (Content Fetch + Adapter)
window.openProcessedFile = async function (rawListId, fileName) {
    console.log(`[Dashboard] Opening processed file ${rawListId}...`);

    // [QA-2] Obtener flujo seleccionado del combobox si existe
    let selectedFlujoId = null;
    const selectEl = document.getElementById(`flujo_select_${rawListId}`);
    if (selectEl) {
        if (selectEl.value !== "") {
            selectedFlujoId = selectEl.value;
            console.log(`[Dashboard] Se aplicará Flujo ID: ${selectedFlujoId}`);
        } else {
            // [QA-3] Bug 3: Fuerza estado sin hidratación
            selectedFlujoId = "CRUDO";
            console.log(`[Dashboard] Se aplicará modo puro CRUDO sin plantillas V3/V4 pre-existentes.`);
        }
    }

    // 1. UI Loading
    // [TABULA RASA] - Ensure Start Clean for Reader Mode
    if (window.resetViewerState) window.resetViewerState();

    const modal = document.getElementById('viewerModal');
    const loader = document.getElementById('viewerLoader');

    modal.classList.remove('hidden'); // Show Viewer
    loader.classList.remove('hidden'); // Show Loader (Downloading Stream...)

    // Inicializar Panel Izquierdo si está disponible
    if (window.viewerLeftPanel) {
        window.viewerLeftPanel.init();
    }
    // Hide specialized buttons for "Read Mode" immediately
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.add('hidden');

    // Update Title with Tag
    const title = document.getElementById('viewerTitle');
    if (title) title.textContent = fileName;

    try {
        // 2. Fetch Content
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/files/processed-content/${rawListId}`);
        const result = await res.json();

        if (!result.success) throw new Error(result.error);

        // 3. ADAPTOR: JSON Items -> Workbook Map (Multi-Sheet)
        if (typeof window.adaptJsonToWorkbook !== 'function') throw new Error("Viewer Adapter not loaded (adaptJsonToWorkbook).");

        const workbookMap = window.adaptJsonToWorkbook(result.items);

        // 4. INJECT into Viewer Engine
        // [REFACTOR] Use Centralized Provider Resolver
        const providerContext = window.resolveProviderContext(window.currentActiveProviderId);
        const providerName = providerContext.nombre;

        if (window.loadVirtualWorkbook) {
            // Pasamos el providerName como 3er argumento y selectedFlujoId
            window.loadVirtualWorkbook(workbookMap, fileName, providerName, selectedFlujoId);
        } else {
            console.warn("Viewer Engine does not support external loading yet.");
            alert("Error: El motor del visor no admite carga externa. Actualizar viewer_engine.");
            loader.classList.add('hidden');
            modal.classList.add('hidden');
        }

    } catch (error) {
        console.error("Error opening processed:", error);
        alert("Error al abrir archivo: " + error.message);
        loader.classList.add('hidden');
        modal.classList.add('hidden');
    }
};