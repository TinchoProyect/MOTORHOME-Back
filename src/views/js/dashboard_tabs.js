/**
 * DASHBOARD TABS - Orquestador de Tablero Unificado
 * Responsabilidad: Gestionar Pestañas (Drive/DB) y Carga de Archivos Procesados.
 * v2.7 (Context Aware & Secure Loading)
 */

console.log("%c 🗂️ DASHBOARD TABS: READY ", "background: #3b82f6; color: #fff; font-weight: bold; padding: 4px;");

// State
let dashboardTabState = 'DRIVE'; // 'DRIVE' | 'DB'
window.selectedFiles = new Map(); // Selection State (Context Aware Map)

// Selection Logic
window.toggleSelection = function (id, el, isExtraido = false, fileName = "") {
    if (el.checked) {
        window.selectedFiles.set(id, { isExtraido: !!isExtraido, fileName: fileName });
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
window.initDashboardTabs = function (contextMode = 'listas', processedDB = []) {
    console.log("[Dashboard] Initializing Tabs... Context:", contextMode);
    // Bind Tab Click Events
    const btnDrive = document.getElementById('tabPending');
    const btnDB = document.getElementById('tabProcessed');
    const btnConciliadas = document.getElementById('tabConciliadas');

    if (btnDrive) btnDrive.onclick = () => switchDashboardTab('DRIVE', contextMode, processedDB);
    if (btnDB) btnDB.onclick = () => switchDashboardTab('DB', contextMode, processedDB);
    if (btnConciliadas) btnConciliadas.onclick = () => switchDashboardTab('CONCILIADAS', contextMode, processedDB);

    // Default to Drive (Pending)
    switchDashboardTab('DRIVE', contextMode, processedDB);
};

// Switch Logic
window.switchDashboardTab = function (mode, contextMode = 'listas', processedDB = []) {
    dashboardTabState = mode;
    const btnDrive = document.getElementById('tabPending');
    const btnDB = document.getElementById('tabProcessed');
    const btnConciliadas = document.getElementById('tabConciliadas');

    // Contenedores
    const containerDrive = document.getElementById('fileListDrive');
    const containerDB = document.getElementById('fileListDB');
    const uploadBtnContainer = document.getElementById('uploadButtonContainer');

    // Estilos basados en contexto (Facturas usan Amber, Listas usan Blue/Emerald)
    const activeDriveColor = contextMode === 'facturas' ? 'amber' : 'blue';
    const activeDBColor = contextMode === 'facturas' ? 'amber' : 'emerald';

    // Update UI Classes
    if (mode === 'DRIVE') {
        if (btnDrive) {
            btnDrive.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-${activeDriveColor}-500 bg-${activeDriveColor}-500/10 text-${activeDriveColor}-400`;
        }
        if (btnDB) {
            btnDB.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-${activeDBColor}-300`;
        }
        if (btnConciliadas) {
            btnConciliadas.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-emerald-300`;
        }

        if (containerDrive) containerDrive.classList.remove('hidden');
        if (containerDB) containerDB.classList.add('hidden');

        // Contextual UI Reactivity (Render Upload Feature ONLY in DRIVE mode)
        if (uploadBtnContainer && window.currentDriveFolderId) {
            uploadBtnContainer.innerHTML = `
                <input type="file" id="nativeFileUpload_${window.currentDriveFolderId}" accept=".xlsx,.xls,.csv" class="hidden" multiple onchange="window.uploadSelectedFile(event, '${window.currentDriveFolderId}')">
                <button onclick="document.getElementById('nativeFileUpload_${window.currentDriveFolderId}').click()" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 border border-blue-500/50 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0" 
                    id="btnNativeUpload_${window.currentDriveFolderId}">
                    <i data-lucide="upload-cloud" class="w-4 h-4" id="iconNativeUpload_${window.currentDriveFolderId}"></i> Buscar Archivo
                </button>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
    } else {
        // DB or CONCILIADAS Mode
        if (btnDrive) {
            btnDrive.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-${activeDriveColor}-300`;
        }
        if (btnDB) {
            btnDB.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${mode === 'DB' ? `border-${activeDBColor}-500 bg-${activeDBColor}-500/10 text-${activeDBColor}-400` : `border-transparent text-slate-500 hover:text-${activeDBColor}-300`}`;
        }
        if (btnConciliadas) {
            btnConciliadas.className = `px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${mode === 'CONCILIADAS' ? `border-emerald-500 bg-emerald-500/10 text-emerald-400` : `border-transparent text-slate-500 hover:text-emerald-300`}`;
        }

        if (containerDrive) containerDrive.classList.add('hidden');
        if (containerDB) containerDB.classList.remove('hidden');

        // Contextual UI Reactivity
        if (uploadBtnContainer) {
            uploadBtnContainer.innerHTML = '';
        }

        // Trigger Load
        if (contextMode === 'facturas') {
            window.renderFacturasDBGrid(processedDB);
        } else {
            window.loadProcessedFiles();
        }
    }
}

// Render DB Grid for Facturas
window.renderFacturasDBGrid = function(allFacturas) {
    console.log(`[UI VIGÍA] Renderizando Facturas DB Grid. Estado actual del Tab: ${dashboardTabState}`);
    console.log(`[UI VIGÍA] Total de facturas recibidas (allFacturas):`, allFacturas.length);
    console.log(`[UI VIGÍA] Contenido crudo de allFacturas:`, allFacturas);

    const container = document.getElementById('fileListDB');
    if (!container) return;

    // Filtrar facturas según el tab actual
    const facturas = dashboardTabState === 'CONCILIADAS' 
        ? allFacturas.filter(f => f.status_conciliacion === 'CONCILIADO_OK').sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision))
        : allFacturas.filter(f => f.status_conciliacion !== 'CONCILIADO_OK');

    console.log(`[UI VIGÍA] Facturas después del filtrado (${dashboardTabState}):`, facturas.length);

    if (!facturas || facturas.length === 0) {
        container.innerHTML = `
            <div class="flex-grow flex flex-col items-center justify-center text-slate-600 h-full py-20">
                <i data-lucide="archive" class="w-16 h-16 mb-4 opacity-20"></i>
                <p class="text-sm">No hay facturas en esta bandeja.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let html = '';
    let currentMonthYear = '';

    if (dashboardTabState === 'CONCILIADAS') {
        html += `<div class="overflow-y-auto custom-scrollbar pr-2 pb-10 pt-2 h-full w-full">`;
    } else {
        html += `<div class="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/30 m-2 mt-4 shadow-inner">
            <table class="w-full text-left text-xs text-slate-300">
                <thead class="bg-slate-900/80 text-[10px] uppercase font-bold text-slate-500 sticky top-0 shadow-sm border-b border-slate-800">
                    <tr>
                        <th class="p-4">Fecha</th>
                        <th class="p-4">Número</th>
                        <th class="p-4 text-right">Importe Total</th>
                        <th class="p-4 text-center">Estado</th>
                        <th class="p-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/50">`;
    }


    facturas.forEach(fac => {
        let statusBadge = '<span class="px-2 py-1 rounded text-[9px] font-bold bg-slate-800 text-slate-400">PENDIENTE</span>';
        
        if (fac.status_conciliacion === 'OBSERVADO_POR_DESVIOS') {
            statusBadge = '<span class="px-2 py-1 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30" title="Desvíos hallados en el cruce logístico">OBSERVADO</span>';
        } else if (fac.status_conciliacion === 'CONCILIADO_OK') {
            statusBadge = '<span class="px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="Cruce perfecto con Pedido B2B">CONCILIADO OK</span>';
        } else if (fac.status === 'REVISADO_HITL') {
            statusBadge = '<span class="px-2 py-1 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30" title="Esperando Conciliación">REVISADO HITL</span>';
        } else if (fac.status === 'PROCESADO') {
            statusBadge = '<span class="px-2 py-1 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">PROCESADO</span>';
        }

        const dateStr = fac.fecha_emision ? new Date(fac.fecha_emision).toLocaleDateString() : '-';
        const formattedTotal = window.formatCurrency ? window.formatCurrency(fac.importe_total) : fac.importe_total;

        if (dashboardTabState === 'CONCILIADAS') {
            const fileDate = new Date(fac.fecha_emision || fac.created_at);
            const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            const capitalizedMonthYear = `${monthNames[fileDate.getMonth()]} ${fileDate.getFullYear()}`;

            if (capitalizedMonthYear !== currentMonthYear) {
                if (currentMonthYear !== '') html += `</div></div>`; 
                html += `
                    <div class="mb-6">
                        <div class="flex items-center gap-3 mb-4 mt-8 first:mt-2">
                            <div class="h-px bg-slate-800/80 flex-1"></div>
                            <span class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-slate-900/50 px-3 py-1 rounded-full border border-emerald-500/30 shadow-inner backdrop-blur-md">
                                <i data-lucide="calendar" class="w-3 h-3 inline-block mr-1 mb-0.5 opacity-70"></i> ${capitalizedMonthYear}
                            </span>
                            <div class="h-px bg-slate-800/80 flex-1"></div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                `;
                currentMonthYear = capitalizedMonthYear;
            }

            html += `
                <div class="bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:border-emerald-500/40 rounded-xl p-4 flex flex-col justify-between shadow-lg shadow-black/20 hover:-translate-y-1 transition-all h-full group">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                                <i data-lucide="receipt" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="text-sm font-bold text-slate-200">Factura ${fac.numero_comprobante || 'S/N'}</h4>
                                <p class="text-[10px] font-mono text-slate-500">${dateStr}</p>
                            </div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-end">
                        <div>
                            <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Importe Asentado</p>
                            <p class="text-lg font-bold font-mono text-emerald-400">$ ${formattedTotal}</p>
                        </div>
                        <button onclick="window.viewConciliacionReport('${fac.id}')" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-emerald-500/30 shadow-sm flex items-center gap-2">
                            <i data-lucide="file-search" class="w-3 h-3"></i> Trazabilidad
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <tr class="hover:bg-slate-800/30 transition-colors group">
                    <td class="p-4 font-mono">${dateStr}</td>
                    <td class="p-4 font-mono font-bold text-white">${fac.numero_comprobante || 'S/N'}</td>
                    <td class="p-4 text-right text-amber-400 font-mono font-bold">$ ${formattedTotal}</td>
                    <td class="p-4 text-center">${statusBadge}</td>
                    <td class="p-4 text-right flex items-center justify-end gap-2">
                        <button onclick="window.deleteFacturaExtraccion('${fac.id}')" class="px-2 py-1 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white rounded text-[10px] transition-colors border border-red-500/30" title="Deshacer Extracción (Eliminar)">
                            <i data-lucide="trash-2" class="w-3 h-3 inline"></i>
                        </button>
                        <button onclick="window.viewFacturaDetails('${fac.id}')" class="px-3 py-1 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded text-[10px] transition-colors" title="Ver Detalles de la Factura">
                            <i data-lucide="eye" class="w-3 h-3 inline"></i>
                        </button>
                        ${fac.status_conciliacion !== 'CONCILIADO_OK' ? `
                        <button onclick="window.openConciliacionModal('${fac.id}')" class="px-3 py-1 bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600 text-amber-500 hover:text-white rounded text-[10px] transition-colors font-bold uppercase tracking-wider flex items-center gap-1" title="Conciliar con Pedido B2B">
                            <i data-lucide="git-merge" class="w-3 h-3"></i> Conciliar
                        </button>
                        ` : `
                        <button onclick="window.viewConciliacionReport('${fac.id}')" class="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded text-[10px] transition-colors font-bold uppercase tracking-wider flex items-center gap-1" title="Ver Reporte de Cruce">
                            <i data-lucide="check-circle" class="w-3 h-3"></i> Reporte
                        </button>
                        `}
                    </td>
                </tr>
            `;
        }
    });

    if (dashboardTabState === 'CONCILIADAS') {
        if (currentMonthYear !== '') html += `</div></div></div>`; // Cierra la iteración
    } else {
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.deleteFacturaExtraccion = async function(id) {
    if (!window.Swal) return;
    
    const result = await Swal.fire({
        title: '¿Deshacer Extracción?',
        text: "Esta acción eliminará el registro de la base de datos y devolverá el archivo a la solapa PENDIENTES. Perderá las validaciones HITL y la conciliación (si tuviera).",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#1e293b', color: '#f8fafc'
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'Eliminando...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/facturas/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        Swal.fire({
            icon: 'success', title: 'Extracción Eliminada',
            text: 'El comprobante ha regresado a estado Pendiente.',
            timer: 2000, showConfirmButton: false,
            background: '#1e293b', color: '#f8fafc'
        });

        // Recargar la grilla actual (estando en la pestaña procesadas)
        if (window.exploreSupplierFiles && window.currentDriveFolderId) {
            window.exploreSupplierFiles(window.currentDriveFolderId, 'facturas');
        }

    } catch (error) {
        console.error("Error al eliminar extracción:", error);
        Swal.fire('Error', 'No se pudo eliminar la extracción: ' + error.message, 'error');
    }
};

// Logic: Load Processed Files
window.loadProcessedFiles = async function() {
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

    // INVENTARIO DE MATRICES (TOOLBOX)
    let toolsHtml = `
    <div class="mb-4 bg-slate-900/40 p-3 rounded-xl border border-slate-800 flex items-center justify-between shadow-inner" id="inventoryToolbox">
        <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 flex-1" id="toolboxButtons">
            <button onclick="window.toggleFlujoFilter('ALL', this)" class="toolbox-btn active shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 bg-blue-500/10 text-blue-400 border-blue-500 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <i data-lucide="layers" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i> Ver Todos
            </button>
            <div class="w-px h-5 bg-slate-800 mx-1"></div>
            <button onclick="window.toggleFlujoFilter('CRUDO', this)" class="toolbox-btn shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 bg-slate-800 text-slate-400 border-transparent hover:text-slate-200">
                <i data-lucide="file-warning" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i> Sueltos (Crudos)
            </button>
    `;

    if (flujosDisponibles && flujosDisponibles.length > 0) {
        flujosDisponibles.forEach(f => {
            toolsHtml += `
            <button onclick="window.toggleFlujoFilter('${f.id_flujo}', this)" class="toolbox-btn shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 bg-slate-800 text-slate-400 border-transparent hover:text-indigo-300">
                <i data-lucide="wrench" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i> ${f.nombre_flujo}
            </button>
            `;
        });
    }

    toolsHtml += `
        </div>
        <div class="shrink-0 pl-4 border-l border-slate-800 ml-2">
            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest"><i data-lucide="hammer" class="w-3 h-3 inline-block mb-0.5 mr-1"></i> Inventario de Matrices</span>
        </div>
    </div>
    `;

    let html = `<div class="flex-1 overflow-y-auto custom-scrollbar w-full pr-2 pb-10 pt-2 h-full">` + toolsHtml;

    // Preparar opciones del select (movidas al bucle)

    let currentMonthYear = '';

    sortedFiles.forEach((file, index) => {
        const fileDate = new Date(file.created_at);
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const capitalizedMonthYear = `${monthNames[fileDate.getMonth()]} ${fileDate.getFullYear()}`;

        if (capitalizedMonthYear !== currentMonthYear) {
            if (currentMonthYear !== '') html += `</div>`; // Cerrar grid anterior
            
            html += `
                <div class="flex items-center gap-3 mb-4 mt-8 first:mt-2">
                    <div class="h-px bg-slate-800/80 flex-1"></div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800/50 shadow-inner backdrop-blur-md">
                        <i data-lucide="calendar" class="w-3 h-3 inline-block mr-1 mb-0.5 opacity-70"></i> ${capitalizedMonthYear}
                    </span>
                    <div class="h-px bg-slate-800/80 flex-1"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            `;
            currentMonthYear = capitalizedMonthYear;
        }

        const isNewest = index === 0;
        const currentBorderClass = isNewest ? 'border-emerald-500/60 shadow-lg shadow-emerald-900/30' : 'border-slate-800';
        const badgeHtml = isNewest ? `<div class="absolute -top-3 left-6 bg-emerald-600 text-white font-bold text-[9px] px-3 py-0.5 rounded-full shadow-lg shadow-emerald-900/50 border border-emerald-400/50 z-20 whitespace-nowrap tracking-wider">RECIENTE</div>` : '';
        const isExtraido = file.status_global === 'EXTRAIDO';
        const extraidoBadgeHtml = isExtraido ? `<div class="absolute -top-3 right-6 bg-indigo-900/80 text-indigo-300 font-bold text-[9px] px-3 py-0.5 rounded-full shadow-lg shadow-indigo-900/50 border border-indigo-500/30 z-20 whitespace-nowrap tracking-wider flex items-center gap-1"><i data-lucide="database" class="w-3 h-3"></i> EXTRAÍDO</div>` : '';

        // Normalización Semántica (Hotfix QA)
        let displayName = file.nombre_archivo || 'Documento Desconocido';
        if (displayName.toLowerCase().includes('ingestado manualmente')) {
            // Capitalize 'Archivo' correctly if needed by the regex replacement
            displayName = displayName.replace(/ingestado manualmente/i, 'extraído manualmente');
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        }

        // Preparar opciones para este archivo (evaluando selección)
        let currentOptionsHtml = `<option value="">-- Sin Flujo (Crudo) --</option>`;
        let asignadoName = "Sin asignar";
        if (flujosDisponibles && flujosDisponibles.length > 0) {
            flujosDisponibles.forEach(f => {
                const isSelected = file.flujo_asignado_id === f.id_flujo ? 'selected' : '';
                if (file.flujo_asignado_id === f.id_flujo) asignadoName = f.nombre_flujo;
                currentOptionsHtml += `<option value="${f.id_flujo}" data-name="${String(f.nombre_flujo).replace(/"/g, '&quot;')}" ${isSelected}>${f.nombre_flujo}</option>`;
            });
        }

        const fileDataId = file.flujo_asignado_id || 'CRUDO';

        if (isExtraido) {
            // TARJETA COMPACTA (EXTRAÍDO)
            html += `
                <div class="file-card-item bg-slate-950/80 backdrop-blur-md border border-indigo-500/40 rounded-2xl p-5 flex flex-col justify-between shadow-2xl shadow-indigo-900/20 hover:border-indigo-400/60 transition-all h-full min-h-max relative overflow-hidden group" data-flujo-id="${fileDataId}">
                    <div class="absolute top-4 right-4 z-10" onclick="event.stopPropagation()">
                        <input type="checkbox" 
                            class="w-5 h-5 rounded-md border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 cursor-pointer transition-colors"
                            onchange="toggleSelection('${file.id}', this, true, '${displayName}')"
                        >
                    </div>
                    <div>
                        <div class="flex items-start justify-between mb-3 pr-8">
                            <div class="w-12 h-12 rounded-2xl bg-indigo-900/40 flex items-center justify-center border border-indigo-500/30 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                <i data-lucide="database" class="w-6 h-6 text-indigo-400"></i>
                            </div>
                            <span class="bg-indigo-600 text-white font-bold text-[9px] px-2.5 py-1 rounded shadow-lg shadow-indigo-900/50 tracking-widest flex items-center gap-1.5 uppercase border border-indigo-500/50 -mt-1 -mr-2">
                                <i data-lucide="lock" class="w-2.5 h-2.5"></i> Extraído
                            </span>
                        </div>
                        <p class="text-[13px] font-bold text-slate-200 line-clamp-2 leading-snug tracking-wide" title="${displayName}">${displayName}</p>
                        <p class="text-[10px] text-indigo-300/80 font-mono mt-2 flex items-center gap-1.5">
                            <i data-lucide="calendar" class="w-3 h-3"></i> ${new Date(file.created_at).toLocaleDateString()} &middot; ${file.items_count || 0} ítems
                        </p>
                        <p class="text-[10px] text-slate-400 font-mono font-medium mt-3 mb-4 flex items-center gap-1.5 bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-800 shadow-inner tracking-tight" title="${file.flujo_name || 'Suelto'}">
                            <i data-lucide="workflow" class="w-3.5 h-3.5 text-indigo-400"></i> <span class="truncate">Flujo: <span class="text-slate-300 font-bold">${file.flujo_name || 'Sin Asignar'}</span></span>
                        </p>
                    </div>
                    <div class="mt-auto">
                        <button class="w-full bg-red-950/40 hover:bg-red-600 text-red-500 hover:text-white border border-red-900/50 hover:border-red-500 text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-red-600/40" onclick="window.revertExtraction('${file.id}')">
                            <i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Deshacer Extracción
                        </button>
                    </div>
                </div>
            `;
        } else {
            // TARJETA COMPLETA (PENDIENTE EXTRACCIÓN)
            html += `
                <div class="file-card-item group relative bg-slate-900/60 hover:bg-slate-900/90 border ${currentBorderClass} hover:border-emerald-400/80 rounded-2xl p-5 flex flex-col justify-between transition-all shadow-xl hover:-translate-y-1 hover:shadow-emerald-900/30 h-full min-h-max" data-flujo-id="${fileDataId}">
                    
                    ${badgeHtml}

                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-lg shadow-emerald-500/10">
                            <i data-lucide="file-check" class="w-6 h-6 text-emerald-400"></i>
                        </div>
                        
                        <div class="flex-1 min-w-0 pr-8">
                            <p class="text-[13px] font-bold text-slate-200 line-clamp-2 leading-snug tracking-wide group-hover:text-emerald-400 transition-colors" title="${displayName}">${displayName}</p>
                            <div class="flex items-center gap-4 mt-2">
                                <span class="text-[10px] text-emerald-500 font-mono font-bold flex items-center gap-1.5"><i data-lucide="layers" class="w-3 h-3"></i> ${file.items_count || 0} ITEMS</span>
                                <span class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5"><i data-lucide="calendar" class="w-3 h-3"></i> ${new Date(file.created_at).toLocaleDateString()}</span>
                            </div>
                            <div id="status_label_${file.id}">
                                <div class="mt-3 flex items-start gap-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50 shadow-inner">
                                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 mt-0.5 ${file.flujo_asignado_id ? 'bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.05)]' : 'bg-slate-800 text-slate-500 border border-slate-700'}">
                                        <i data-lucide="${file.flujo_asignado_id ? 'pin' : 'circle-dashed'}" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>
                                        ${file.flujo_asignado_id ? 'Fijado' : 'Sin fijar'}
                                    </span>
                                    <span class="text-[10px] font-medium text-slate-300 whitespace-normal break-words leading-tight" title="${asignadoName}">${asignadoName}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="absolute top-4 right-4 z-10" onclick="event.stopPropagation()">
                        <input type="checkbox" 
                            class="w-5 h-5 rounded-md border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer transition-colors"
                            onchange="toggleSelection('${file.id}', this, false, '${displayName.replace(/'/g, "\\'")}')"
                        >
                    </div>

                    <div class="mt-5 pt-4 border-t border-slate-800 flex flex-col gap-2">
                        <label id="flujo_title_${file.id}" class="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1" style="display: ${file.flujo_asignado_id ? 'none' : 'block'};">Asignación de Flujo (Plantilla)</label>
                        <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                            <div id="flujo_selector_wrapper_${file.id}" class="flex-1 flex items-center gap-2" style="display: ${file.flujo_asignado_id ? 'none' : 'flex'};">
                                <div class="relative flex-1">
                                    <i data-lucide="workflow" class="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                                    <select id="flujo_select_${file.id}" class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-medium rounded-xl pl-9 pr-8 flex-1 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer hover:border-slate-600 transition-colors shadow-inner truncate py-2" onchange="document.getElementById('edit_flujo_btn_${file.id}').style.display = this.value ? 'flex' : 'none'; document.getElementById('delete_flujo_btn_${file.id}').style.display = this.value ? 'flex' : 'none';">
                                        ${currentOptionsHtml}
                                    </select>
                                    <i data-lucide="chevron-down" class="absolute right-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                                </div>
                                <button onclick="deleteFlujoPermanente('${file.id}')" id="delete_flujo_btn_${file.id}" class="p-2 shrink-0 border rounded-xl transition-all items-center justify-center text-slate-400 bg-slate-900 border-slate-800 hover:border-red-500/50 hover:text-red-400" title="Eliminar Flujo Permanentemente" style="display: ${file.flujo_asignado_id ? 'flex' : 'none'}; cursor: pointer;">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                                <button onclick="editFlujoName('${file.id}')" id="edit_flujo_btn_${file.id}" class="p-2 shrink-0 border rounded-xl transition-all items-center justify-center text-slate-400 bg-slate-900 border-slate-800 hover:border-indigo-500/50 hover:text-indigo-400" title="Editar nombre del Flujo" style="display: ${file.flujo_asignado_id ? 'flex' : 'none'}; cursor: pointer;">
                                    <i data-lucide="edit-3" class="w-4 h-4"></i>
                                </button>
                            </div>
                            <button onclick="pinFlujo('${file.id}')" id="pin_btn_${file.id}" data-ispinned="${file.flujo_asignado_id ? 'true' : 'false'}" class="p-2 shrink-0 border rounded-xl transition-all flex items-center justify-center ${file.flujo_asignado_id ? 'w-full py-2.5 text-fuchsia-400 bg-fuchsia-900/20 border-fuchsia-500/30 hover:border-fuchsia-500/60 hover:bg-fuchsia-900/40 shadow-inner' : 'text-slate-500 bg-slate-900 border-slate-800 hover:border-fuchsia-500/50'}" title="${file.flujo_asignado_id ? 'Desfijar Plantilla' : 'Fijar flujo por defecto'}">
                                <i data-lucide="${file.flujo_asignado_id ? 'pin-off' : 'pin'}" class="w-4 h-4 ${file.flujo_asignado_id ? 'mr-2' : ''}"></i>
                                ${file.flujo_asignado_id ? '<span class="text-[10px] font-bold uppercase tracking-wider">Desfijar Plantilla</span>' : ''}
                            </button>
                        </div>
                    </div>
                        
                        <button class="w-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-600/40" onclick="openProcessedFile('${file.id}', '${file.nombre_archivo}', '${file.created_at}')">
                            Abrir Documento <i data-lucide="arrow-right" class="w-3.5 h-3.5 relative top-px"></i>
                        </button>
                </div>
            `;
        }
    });

    if (currentMonthYear !== '') html += `</div>`; // Cerrar grid
    html += `</div>`; // Cerrar scroll container
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

window.revertExtraction = async function(fileId) {
    const providerContext = window.globalContext?.providerId || window.currentActiveProviderId;

    const result = await Swal.fire({
        title: 'Gestión de Eliminación',
        text: 'Seleccione el alcance de la reversión:',
        icon: 'warning',
        input: 'radio',
        inputOptions: {
            'ROLLBACK': '<div class="mb-1"><b class="text-white">Opción 1 (Rollback Físico):</b></div><div class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Anula la Extracción y la Ingesta. Borra los productos de la Tabla Maestra y purga los datos crudos de la base de datos. Mueve el archivo físico en Drive de vuelta a "Pendientes". Útil para empezar de cero cuando la lectura original fue un error total.</div>',
            'UNLINK': '<div class="mb-1"><b class="text-white">Opción 2 (Desvinculación Lógica):</b></div><div class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Anula la Extracción y la Ingesta. Borra los productos de la Tabla Maestra y purga la base de datos, pero el archivo físico queda archivado en "Procesados" (Drive). El sistema se olvida de su existencia. Útil para descartar listas inservibles sin guardar basura en la base de datos.</div>',
            'REMOVE_EXTRACTION': '<div class="mb-1"><b class="text-emerald-400">Opción 3 (Reseteo de Ingesta - Recomendado):</b></div><div class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Anula solo la Extracción. Borra los productos de la Tabla Maestra pero conserva la Ingesta original en la base de datos. El archivo sigue visible en la solapa "Procesados" y retrocede a estado "Confirmado". Útil para volver a extraer los datos hacia la Tabla Maestra corrigiendo reglas, sin tener que volver a ingestar el archivo original.</div>'
        },
        inputValue: 'REMOVE_EXTRACTION',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ejecutar Reversión',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc',
        customClass: {
            popup: 'border border-slate-700 bg-slate-900 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl',
            inputRadio: 'text-left text-sm text-slate-300 gap-4 flex flex-col pt-4',
            radioLabel: 'ml-2 leading-relaxed' 
        },
        didOpen: (popup) => {
            const radioContainer = popup.querySelector('.swal2-radio');
            if (radioContainer) {
                radioContainer.style.background = 'transparent';
                radioContainer.style.display = 'flex';
                radioContainer.style.flexDirection = 'column';
                radioContainer.style.alignItems = 'flex-start';
                radioContainer.style.gap = '1.25rem';
                radioContainer.style.marginTop = '1rem';
                
                const labels = radioContainer.querySelectorAll('.swal2-label');
                labels.forEach(l => {
                    l.style.textAlign = 'left';
                    l.style.display = 'block';
                    l.style.marginLeft = '0.5rem';
                    l.style.lineHeight = '1.2';
                });
            }
        },
        inputValidator: (value) => {
            if (!value) {
                return 'Debe seleccionar una opción'
            }
        }
    });

    if (result.isConfirmed) {
        try {
            const action = result.value;
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            Swal.fire({
                title: 'Ejecutando Transacción Atómica...',
                allowOutsideClick: false,
                background: '#0f172a',
                color: '#f8fafc',
                customClass: { popup: 'border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl' },
                didOpen: () => { Swal.showLoading() }
            });

            const res = await fetch(`${backendUrl}/api/files/rollback`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileIds: [fileId], action: action, providerId: providerContext })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Fallo en el protocolo de Rollback");
            
            await Swal.fire({
                title: 'Transacción Exitosa',
                text: 'La base de datos fue sincronizada.',
                icon: 'success',
                background: '#0f172a',
                color: '#f8fafc',
                timer: 2000,
                showConfirmButton: false,
                customClass: {
                    popup: 'border border-emerald-900/50 shadow-[0_0_40px_rgba(16,185,129,0.15)] rounded-2xl'
                }
            });
            // Refresco UX: Actualizar tab de Archivos Crudos y Procesados Activos (Card Unlocking)
            if (window.loadProcessedFiles) {
                window.loadProcessedFiles();
            }
            if (window.loadFiles && window.currentDriveFolderId) {
                window.loadFiles(window.currentDriveFolderId);
            }
            if (window.renderProviderData && window.globalContext && window.globalContext.providerId) {
                window.renderProviderData(window.globalContext.providerId);
            }
        } catch (e) {
            Swal.fire({
                title: 'Error',
                text: e.message,
                icon: 'error',
                background: '#0f172a',
                color: '#f8fafc',
                customClass: { popup: 'border border-red-900/50 shadow-[0_0_40px_rgba(239,68,68,0.15)] rounded-2xl' }
            });
        }
    }
};

window.pinFlujo = async function(fileId) {
    const selectEl = document.getElementById(`flujo_select_${fileId}`);
    const btn = document.getElementById(`pin_btn_${fileId}`);
    if (!selectEl || !btn) return;

    const isCurrentlyPinned = btn.getAttribute('data-ispinned') === 'true';
    let flujo_id = selectEl.value === "" ? null : selectEl.value;

    if (isCurrentlyPinned) {
        flujo_id = null; // Unpin action
    }

    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-fuchsia-400"></i>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/files/processed/${fileId}/flujo`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flujo_id })
        });
        const result = await res.json();
        
        if (!result.success) throw new Error(result.error);

        btn.innerHTML = `<i data-lucide="${flujo_id ? 'check' : 'check-circle'}" class="w-4 h-4 text-emerald-400"></i>`;
        if (window.lucide) window.lucide.createIcons();
        
        // Update Asignado Label UI
        const isFijado = flujo_id !== null;
        let asignadoName = "Sin asignar";
        if (isFijado && selectEl.options[selectEl.selectedIndex]) {
            asignadoName = selectEl.options[selectEl.selectedIndex].text;
        }

        const labelContainer = document.getElementById(`status_label_${fileId}`);
        if(labelContainer) {
            labelContainer.innerHTML = `
                <div class="mt-3 flex items-start gap-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50 shadow-inner animate-in fade-in zoom-in-95 duration-200">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 mt-0.5 ${isFijado ? 'bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.05)]' : 'bg-slate-800 text-slate-500 border border-slate-700'}">
                        <i data-lucide="${isFijado ? 'pin' : 'circle-dashed'}" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>
                        ${isFijado ? 'Fijado' : 'Sin fijar'}
                    </span>
                    <span class="text-[10px] font-medium text-slate-300 whitespace-normal break-words leading-tight" title="${asignadoName}">${asignadoName}</span>
                </div>
            `;
        }

        // Toggling specific wrappers
        const wrapper = document.getElementById(`flujo_selector_wrapper_${fileId}`);
        const titleLbl = document.getElementById(`flujo_title_${fileId}`);
        if (wrapper && titleLbl) {
            wrapper.style.display = isFijado ? 'none' : 'flex';
            titleLbl.style.display = isFijado ? 'none' : 'block';
        }

        setTimeout(() => {
            btn.setAttribute('data-ispinned', isFijado ? 'true' : 'false');
            if (isFijado) {
                btn.className = "p-2 shrink-0 border rounded-xl transition-all flex items-center justify-center w-full py-2.5 text-fuchsia-400 bg-fuchsia-900/20 border-fuchsia-500/30 hover:border-fuchsia-500/60 hover:bg-fuchsia-900/40 shadow-inner";
                btn.title = "Desfijar Plantilla";
                btn.innerHTML = `<i data-lucide="pin-off" class="w-4 h-4 mr-2"></i><span class="text-[10px] font-bold uppercase tracking-wider">Desfijar Plantilla</span>`;
            } else {
                btn.className = "p-2 shrink-0 border rounded-xl transition-all flex items-center justify-center text-slate-500 bg-slate-900 border-slate-800 hover:border-fuchsia-500/50";
                btn.title = "Fijar flujo por defecto";
                btn.innerHTML = `<i data-lucide="pin" class="w-4 h-4"></i>`;
            }
            if (window.lucide) window.lucide.createIcons();
        }, 1500);

    } catch (err) {
        console.error("Error pinning:", err);
        alert("Error fijando el flujo.");
        btn.innerHTML = originalHtml;
        if (window.lucide) window.lucide.createIcons();
    }
}

// Logic: Modificar Nombre del Flujo
window.editFlujoName = async function(fileId) {
    const selectEl = document.getElementById(`flujo_select_${fileId}`);
    if (!selectEl || !selectEl.value) return;

    const flujo_id = selectEl.value;
    const currentName = selectEl.options[selectEl.selectedIndex].text;

    if (!window.Swal) return;

    const { value: newName, isConfirmed, isDenied } = await Swal.fire({
        title: 'Editar Asignación de Flujo',
        input: 'text',
        inputLabel: 'Nuevo nombre de plantilla',
        inputValue: currentName,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Guardar cambios',
        denyButtonText: 'Eliminar Asignación',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        denyButtonColor: '#dc2626',
        background: '#0f172a',
        color: '#f8fafc',
        inputValidator: (value) => {
            if (!value || value.trim().length === 0) return 'El nombre no puede estar vacío';
        }
    });

    if (isDenied) {
        // [Ticket #014] Vía rápida para desvincular (Unpin)
        try {
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            await fetch(`${backendUrl}/api/files/processed/${fileId}/flujo`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flujo_id: null })
            });
            Swal.fire({ icon: 'success', title: 'Asignación eliminada', background: '#0f172a', color: '#f8fafc', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            if (window.loadProcessedFiles) window.loadProcessedFiles();
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: e.message, background: '#0f172a', color: '#f8fafc' });
        }
        return;
    }

    if (!isConfirmed || newName.trim() === currentName) return;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/flujos/${flujo_id}/nombre`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_flujo: newName.trim() })
        });
        const result = await res.json();

        if (!result.success) throw new Error(result.error);

        // Actualizamos caché global para que el Visor (initViewerFlujosContext) tome el cambio
        if (window.cachedFlujos && Array.isArray(window.cachedFlujos)) {
             const flujoEntry = window.cachedFlujos.find(f => f.id_flujo === flujo_id);
             if (flujoEntry) flujoEntry.nombre_flujo = newName.trim();
        }

        // DOM PATCHING MASIVO: Encontrar todos los selects y labels de la grilla que usen este flujo
        const allSelects = document.querySelectorAll('select[id^="flujo_select_"]');
        allSelects.forEach(sel => {
             for (let prop of sel.options) {
                  if (prop.value === flujo_id) {
                       prop.text = newName.trim();
                       prop.dataset.name = newName.trim();
                  }
             }
        });

        // Actualizar labels fijados (Status Labels)
        const allStatusLabels = document.querySelectorAll('div[id^="status_label_"]');
        allStatusLabels.forEach(labelContainer => {
             // Verificamos si este label está asociado al flujo que acabamos de renombrar
             // Extraemos el id_archivo del id del contenedor
             const fileIdMatched = labelContainer.id.replace('status_label_', '');
             const attachedSelect = document.getElementById(`flujo_select_${fileIdMatched}`);
             if (attachedSelect && attachedSelect.value === flujo_id) {
                  const textSpan = labelContainer.querySelector('.text-slate-300');
                  if (textSpan) {
                       textSpan.textContent = newName.trim();
                       textSpan.title = newName.trim();
                  }
             }
        });

        Swal.fire({
            icon: 'success',
            title: 'Renombrado exitoso',
            background: '#0f172a',
            color: '#f8fafc',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });

    } catch (err) {
        console.error("Error naming:", err);
        Swal.fire({
            icon: 'error',
            title: 'Error de Red',
            text: err.message,
            background: '#0f172a',
            color: '#f8fafc'
        });
    }
}

// Logic: Eliminar Flujo Permanente
window.deleteFlujoPermanente = async function(fileId) {
    const selectEl = document.getElementById(`flujo_select_${fileId}`);
    if (!selectEl || !selectEl.value) return;

    const flujo_id = selectEl.value;
    const currentName = selectEl.options[selectEl.selectedIndex].text;

    if (!window.Swal) return;

    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar Flujo Permanente?',
        text: `Estás a punto de eliminar el flujo "${currentName}". Esto no afectará a los archivos ya extraídos con este flujo, pero eliminará la plantilla de las opciones futuras.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    });

    if (!isConfirmed) return;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/flujos/${flujo_id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();

        if (!result.success) throw new Error(result.error);

        // Actualizamos caché global
        if (window.cachedFlujos && Array.isArray(window.cachedFlujos)) {
             window.cachedFlujos = window.cachedFlujos.filter(f => f.id_flujo !== flujo_id);
        }

        Swal.fire({ icon: 'success', title: 'Flujo eliminado', background: '#0f172a', color: '#f8fafc', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        if (window.loadProcessedFiles) window.loadProcessedFiles();

    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message, background: '#0f172a', color: '#f8fafc' });
    }
}

// Gateway Interceptor
window.showConfigurationGateway = async function(rawListId, fileName, fileCreatedAt) {
    const providerId = window.globalContext?.providerId || window.currentActiveProviderId;
    const providerContext = window.resolveProviderContext ? window.resolveProviderContext(providerId) : null;
    const providerName = (providerContext && providerContext.nombre) ? providerContext.nombre : (window.currentActiveProviderName || 'PROVEEDOR');
    
    // Generar nombre por defecto A la [PROVEEDOR] - [FECHA_INGESTA]
    const targetDate = fileCreatedAt ? new Date(fileCreatedAt) : new Date();
    const formattedDate = targetDate.toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const suggestedName = `${providerName} - ${formattedDate}`;

    // Necesitamos obtener las opciones del select actual para la pestaña "Existente"
    const selectEl = document.getElementById(`flujo_select_${rawListId}`);
    let optionsHtml = '';
    let hasOptions = false;
    if (selectEl) {
        optionsHtml = selectEl.innerHTML;
        hasOptions = selectEl.options && selectEl.options.length > 1; // 1 is usually the empty placeholder
    }

    const { value: formValues } = await Swal.fire({
        title: '<i data-lucide="shield-alert" class="w-8 h-8 text-indigo-400 inline-block mr-2 -mt-1"></i> Gateway de Extracción',
        html: `
            <div class="text-left mt-2">
                <p class="text-[13px] text-slate-400 mb-5 leading-relaxed tracking-wide">El archivo analizado se encuentra virgen (<b>Estado Crudo</b>). Debes establecer sus reglas de lectura fundacionales antes de acceder al Visor Universal:</p>
                
                <div class="mb-4">
                    <label class="flex items-center gap-3 cursor-pointer bg-slate-900 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors ${!hasOptions ? 'opacity-50 grayscale' : ''}">
                        <input type="radio" name="gateway_mode" value="EXISTING" class="w-4 h-4 text-indigo-500 accent-indigo-500 focus:ring-indigo-500" ${!hasOptions ? 'disabled' : ''}>
                        <div class="flex-1">
                            <span class="block text-[13px] font-bold text-slate-200 tracking-wider">A. Asignar Herramienta Existente</span>
                            <select id="gateway_existing_select" class="mt-2 w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:border-indigo-500 shadow-inner" ${!hasOptions ? 'disabled' : ''}>
                                ${optionsHtml || '<option value="">(No hay flujos en este proveedor)</option>'}
                            </select>
                        </div>
                    </label>
                </div>
                
                <div>
                    <label class="flex items-start gap-3 cursor-pointer bg-slate-900 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors">
                        <input type="radio" name="gateway_mode" value="NEW" class="w-4 h-4 mt-1.5 text-emerald-500 accent-emerald-500 focus:ring-emerald-500" ${!hasOptions ? 'checked' : ''}>
                        <div class="flex-1">
                            <span class="block text-[13px] font-bold text-emerald-400 tracking-wider flex items-center gap-2"><i data-lucide="plus-circle" class="w-4 h-4 inline"></i> B. Alta de Nueva Herramienta</span>
                            <div class="mt-3 space-y-3">
                                <div>
                                    <label class="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Nomenclatura (Sugerida)</label>
                                    <input type="text" id="gateway_new_name" value="${suggestedName}" class="w-full bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold text-xs rounded-lg p-2.5 outline-none focus:border-emerald-500 shadow-inner placeholder-slate-600" placeholder="Nombre Base...">
                                </div>
                                <div>
                                    <label class="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Detalle de Identidad</label>
                                    <input type="text" id="gateway_new_detail" class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:border-emerald-500 shadow-inner placeholder-slate-600" placeholder="Ej: Lista de Precios de Ferretería...">
                                </div>
                            </div>
                        </div>
                    </label>
                </div>
            </div>
        `,
        background: '#0f172a',
        color: '#f8fafc',
        showCancelButton: true,
        confirmButtonText: 'Configurar y extraer',
        cancelButtonText: 'Cancelar Ingreso',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#334155',
        customClass: { popup: 'border border-slate-700 shadow-2xl rounded-2xl' },
        didOpen: () => {
            if (window.lucide) window.lucide.createIcons();
            const radExisting = document.querySelector('input[value="EXISTING"]');
            const radNew = document.querySelector('input[value="NEW"]');
            
            // Si hay opciones y no forzó New manual, checkear Existing
            if (!radExisting.disabled && !radNew.checked) {
                radExisting.checked = true;
            } else if (radExisting.disabled) {
                radNew.checked = true;
            }
        },
        preConfirm: () => {
            const modeInput = document.querySelector('input[name="gateway_mode"]:checked');
            if(!modeInput) {
                 Swal.showValidationMessage('Debes seleccionar una opción.');
                 return false;
            }
            const mode = modeInput.value;
            if (mode === 'EXISTING') {
                const sel = document.getElementById('gateway_existing_select').value;
                if (!sel) {
                    Swal.showValidationMessage('Debes seleccionar explícitamente un flujo.');
                    return false;
                }
                return { mode: 'EXISTING', flujoId: sel };
            } else {
                let name = document.getElementById('gateway_new_name').value.trim();
                const detail = document.getElementById('gateway_new_detail').value.trim();
                if (!name) {
                    Swal.showValidationMessage('El nombre base de la herramienta es imperativo.');
                    return false;
                }
                if (detail) {
                    name += ` | ${detail}`;
                }
                return { mode: 'NEW', name: name };
            }
        }
    });

    if (!formValues) return null; // Aborto de Ingesta

    // Construcción Determinista
    let finalFlujoId = null;
    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

    if (formValues.mode === 'EXISTING') {
        finalFlujoId = formValues.flujoId;
    } else {
        // [MODO NEW] Inyección Inmediata de Esqueleto
        Swal.fire({
            title: 'Forjando Herramienta...',
            text: 'Generando matriz de configuración...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const createPayload = {
                proveedor_id: providerId,
                nombre_flujo: formValues.name,
                config_payload: { isMultiSheet: true, sheets: {} }
            };

            const resFlujo = await fetch(`${backendUrl}/api/flujos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createPayload)
            });

            const resultFlujo = await resFlujo.json();
            if (!resFlujo.ok) throw new Error(resultFlujo.error || "Falla nativa al crear flujo");
            
            finalFlujoId = resultFlujo.flujo.id_flujo;
            
            // FIX: Actualizar caché global para evitar "Blank State" y Amnesia en el Header
            if (window.cachedFlujos && Array.isArray(window.cachedFlujos)) {
                window.cachedFlujos.push({
                    id_flujo: finalFlujoId,
                    nombre_flujo: formValues.name,
                    proveedor_id: providerId
                });
            }
        } catch (e) {
            Swal.fire({ title: 'Error de Forja', text: e.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
            return null;
        }
    }

    // [VINCULO A FUEGO] Pinning Automático en DB
    try {
        Swal.fire({
            title: 'Vinculando Archivo',
            text: 'Estableciendo enlaces de memoria (Pinning)...',
            background: '#0f172a', color: '#f8fafc',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const resPin = await fetch(`${backendUrl}/api/files/processed/${rawListId}/flujo`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flujo_id: finalFlujoId })
        });
        
        if (resPin.ok) {
            // Sincronizar el DOM para evitar que el usuario vuelva a pasar por este gateway si cierra el modal
            if (selectEl) {
                // Agregar la opción nueva si no existía (Modo New)
                if (formValues.mode === 'NEW') {
                    const newOpt = document.createElement('option');
                    newOpt.value = finalFlujoId;
                    newOpt.text = formValues.name;
                    selectEl.appendChild(newOpt);
                }
                selectEl.value = finalFlujoId;
                
                // Actualizar interfaz visual para fijarlo (Pin)
                const pinBtn = document.getElementById(`pin_btn_${rawListId}`);
                if (pinBtn) {
                     pinBtn.dataset.ispinned = "true";
                     pinBtn.className = "p-2 shrink-0 border rounded-xl transition-all flex items-center justify-center w-full py-2.5 text-fuchsia-400 bg-fuchsia-900/20 border-fuchsia-500/30 hover:border-fuchsia-500/60 hover:bg-fuchsia-900/40 shadow-inner";
                     pinBtn.innerHTML = '<i data-lucide="pin-off" class="w-4 h-4 mr-2"></i><span class="text-[10px] font-bold uppercase tracking-wider">Desfijar Plantilla</span>';
                }
                const selectWrapper = document.getElementById(`flujo_selector_wrapper_${rawListId}`);
                if(selectWrapper) selectWrapper.style.display = 'none';
                
                const titleLabel = document.getElementById(`flujo_title_${rawListId}`);
                if(titleLabel) titleLabel.style.display = 'none';

                // Añadir Badge
                const labelContainer = document.getElementById(`status_label_${rawListId}`);
                if (labelContainer) {
                     labelContainer.innerHTML = `
                        <div class="mt-3 flex items-start gap-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50 shadow-inner">
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 mt-0.5 bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.05)]">
                                <i data-lucide="pin" class="w-3 h-3 inline-block -mt-0.5 mr-1"></i>Fijado
                            </span>
                            <span class="text-[10px] font-medium text-slate-300 whitespace-normal break-words leading-tight" title="${formValues.name || 'Plantilla Asignada'}">${formValues.name || 'Plantilla Asignada'}</span>
                        </div>
                     `;
                }
                
                if (window.lucide) window.lucide.createIcons();
            }
        }
        Swal.close();
    } catch (e) {
        console.warn("⚠️ API Pinning falló", e);
    }

    return finalFlujoId;
};

// Logic: Open Processed File (Content Fetch + Adapter)
window.openProcessedFile = async function (rawListId, fileName, fileCreatedAt) {
    console.log(`[Dashboard] Opening processed file ${rawListId}...`);

    // [QA-2] Obtener flujo seleccionado del combobox si existe
    let selectedFlujoId = null;
    const selectEl = document.getElementById(`flujo_select_${rawListId}`);
    if (selectEl) {
        if (selectEl.value !== "") {
            selectedFlujoId = selectEl.value;
            console.log(`[Dashboard] Se aplicará Flujo ID: ${selectedFlujoId}`);
        } else {
            selectedFlujoId = "CRUDO";
        }
    }

    // [QA Gateway] Intercepción obligatoria si es CRUDO
    if (selectedFlujoId === "CRUDO") {
        selectedFlujoId = await window.showConfigurationGateway(rawListId, fileName, fileCreatedAt);
        if (!selectedFlujoId) {
            console.log("[Dashboard] Entrada al Visor Universal cancelada por usuario (Gateway).");
            return; // ABORT LOGIC
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
            // [FIX] Pasamos explícitamente proveedorId y archivo_origen (fileId) para evitar Amnesia de Contexto (Fallo 1)
            window.globalContext.fileId = rawListId;
            window.globalContext.providerId = window.currentActiveProviderId;
            
            window.loadVirtualWorkbook(workbookMap, fileName, providerName, selectedFlujoId, window.currentActiveProviderId, rawListId);
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

// Logic: Toggle de Filtrado Visual por Matrices de Extracción
window.toggleFlujoFilter = function(flujoId, evtTarget) {
    // 1. Resaltar botón activo y oscurecer los demás
    const toolsBtns = document.querySelectorAll('.toolbox-btn');
    toolsBtns.forEach(btn => {
        btn.classList.remove('active', 'border-blue-500', 'bg-blue-500/10', 'text-blue-400', 'shadow-[0_0_15px_rgba(59,130,246,0.1)]', 'border-indigo-500', 'bg-indigo-500/10', 'text-indigo-400', 'shadow-[0_0_15px_rgba(99,102,241,0.1)]');
        btn.classList.add('bg-slate-800', 'text-slate-400', 'border-transparent');
    });

    if (evtTarget) {
        evtTarget.classList.remove('bg-slate-800', 'text-slate-400', 'border-transparent');
        // Usar Indigo para Herramientas y Azul para Ver Todos
        if (flujoId === 'ALL') {
            evtTarget.classList.add('active', 'border-blue-500', 'bg-blue-500/10', 'text-blue-400', 'shadow-[0_0_15px_rgba(59,130,246,0.1)]');
        } else {
            evtTarget.classList.add('active', 'border-indigo-500', 'bg-indigo-500/10', 'text-indigo-400', 'shadow-[0_0_15px_rgba(99,102,241,0.1)]');
        }
    }

    // 2. Filtrado Lógico (DOM Isolation)
    const allCards = document.querySelectorAll('.file-card-item');
    allCards.forEach(card => {
        if (flujoId === 'ALL') {
            card.classList.remove('hidden');
            card.style.display = '';
        } else {
            const cardFlujo = card.getAttribute('data-flujo-id');
            if (cardFlujo === flujoId) {
                card.classList.remove('hidden');
                card.style.display = '';
            } else {
                card.classList.add('hidden');
                card.style.display = 'none';
            }
        }
    });
};