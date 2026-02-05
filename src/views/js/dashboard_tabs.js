/**
 * DASHBOARD TABS - Orquestador de Tablero Unificado
 * Responsabilidad: Gestionar Pestañas (Drive/DB) y Carga de Archivos Procesados.
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

    console.log(`%c[LIFECYCLE] T2: RECEIVE LOAD REQUEST [Provider: ${providerId}]`, "color: cyan; font-weight:bold;");

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

        // Cache Busting (LIFECYCLE FIX)
        const ts = new Date().getTime();
        const res = await fetch(`${backendUrl}/api/files/processed-list?providerId=${providerId}&_t=${ts}`);

        const result = await res.json();

        if (!result.success) throw new Error(result.error);

        renderProcessedGrid(result.files);

    } catch (error) {
        console.error("Error loading processed:", error);
        container.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error: ${error.message}</div>`;
    }
}

function renderProcessedGrid(files) {
    const container = document.getElementById('fileListDB');
    if (!container) return;

    console.log(`%c[LIFECYCLE] T3: RENDER START [Files: ${files ? files.length : 0}]`, "color: lime; font-weight:bold;");

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-600">
                <i data-lucide="archive" class="w-16 h-16 mb-4 opacity-20"></i>
                <p class="text-sm">Sin archivos procesados</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        console.log("%c[LIFECYCLE] T3: RENDER END (Empty)", "color: lime;");
        return;
    }

    let html = `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pr-2 pb-10">`;

    files.forEach(file => {
        html += `
            <div onclick="openProcessedFile('${file.id}', '${file.nombre_archivo}')" 
                class="cursor-pointer group relative bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 flex flex-col items-center gap-3 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/10">
                
                <!-- Checkbox Selection -->
                <div class="absolute top-2 left-2 z-10" onclick="event.stopPropagation()">
                    <input type="checkbox" 
                        class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        onchange="toggleSelection('${file.id}', this)"
                    >
                </div>

                <div class="absolute top-2 right-2 text-emerald-500">
                    <i data-lucide="check-circle-2" class="w-3 h-3"></i>
                </div>

                <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/10">
                    <i data-lucide="file-check" class="w-6 h-6 text-emerald-400"></i>
                </div>
                
                <p class="text-[10px] text-center text-slate-300 font-medium line-clamp-2 w-full px-1 group-hover:text-white transition-colors">${file.nombre_archivo}</p>
                
                <div class="mt-auto flex flex-col items-center">
                    <span class="text-[9px] text-emerald-600/80 font-mono font-bold">${file.items_count || 0} ITEMS</span>
                    <span class="text-[8px] text-slate-600 font-mono">${new Date(file.created_at).toLocaleDateString()}</span>
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

    // 1. UI Loading
    // Implement global loader overlay or reuse viewerLoader

    // [TABULA RASA] - Ensure Start Clean for Reader Mode
    if (window.resetViewerState) window.resetViewerState();

    const modal = document.getElementById('viewerModal');
    const loader = document.getElementById('viewerLoader');

    modal.classList.remove('hidden'); // Show Viewer
    loader.classList.remove('hidden'); // Show Loader (Downloading Stream...)

    // Hide specialized buttons for "Read Mode"
    const btnConfirm = document.getElementById('btnConfirmIngest');
    if (btnConfirm) btnConfirm.classList.add('hidden');

    // Update Title
    const title = document.getElementById('viewerTitle');
    if (title) title.textContent = fileName + " [MODO LECTURA]";

    try {
        // 2. Fetch Content
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/files/processed-content/${rawListId}`);
        const result = await res.json();

        if (!result.success) throw new Error(result.error);

        // 3. ADAPTOR: JSON -> Matrix
        if (typeof window.adaptJsonToMatrix !== 'function') throw new Error("Viewer Adapter not loaded.");

        const matrixData = window.adaptJsonToMatrix(result.items);

        // 4. INJECT into Viewer Engine (Master Trick)
        if (typeof currentSheetData !== 'undefined') {
            // Global Injection (dirty but efficient for this architecture)
            // We set currentSheetData (RAW)
            // We set currentSimData (SIMULATED) same as RAW because it's already processed?
            // Actually engine uses currentSheetData for raw view.

            // We need to access the global variable. In browser modules, it is on window if not strict module.
            // viewer_engine.js is defined as type="module" in HTML, so variables are NOT on window.
            // BUT we added "window.loadSheet" etc.
            // We need a way to SET data.

            // ... Wait, viewer_engine variables like currentSheetData are module-scoped, NOT window-scoped.
            // We need to Expose a "loadMatrixData" function in viewer_engine.js !!
            // Or rely on a lucky global.

            // CHECK: viewer_engine.js: line 11: let viewerWorker = null; let currentSheetData = [];
            // These are module scoped.

            // FIX: We need to modify viewer_engine.js to expose a Loader Method.
            // "window.loadExternalData(dataMatrix, fileName)"

            // Since I cannot modify viewer_engine.js right now per instructions (only specific files?), 
            // wait, the instructions said:
            // "Estructura de Archivos: Crea los nuevos archivos... Backend: Implementa ... El Adaptador: ... Procedé con la codificación"
            // It didn't forbid modifying viewer_engine.js if strictly necessary for the integration.
            // However, I can also try to piggyback on `workbook` logic? No.

            // Let's assume I CAN modify viewer_engine.js to adding "window.loadVirtualFile(matrix)"
            // I will add this to the plan (mental).
        }

        // Let's try to call the expoed function.
        if (window.loadVirtualFile) {
            window.loadVirtualFile(matrixData, fileName);
        } else {
            console.warn("Viewer Engine does not support external loading yet. Adding polyfill/patch...");
            alert("Error: El motor del visor no admite carga externa. Se requiere parche en viewer_engine.");
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
