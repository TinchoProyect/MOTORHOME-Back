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
window.toggleSelection = function (id, el, isExtraido = false) {
    if (el.checked) {
        window.selectedFiles.set(id, { isExtraido: !!isExtraido });
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
    const uploadBtnContainer = document.getElementById('uploadButtonContainer');

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

        // Contextual UI Reactivity (Render Upload Feature ONLY in DRIVE mode)
        if (uploadBtnContainer && window.currentDriveFolderId) {
            uploadBtnContainer.innerHTML = `
                <input type="file" id="nativeFileUpload_${window.currentDriveFolderId}" accept=".xlsx,.xls,.csv" class="hidden" onchange="window.uploadSelectedFile(event, '${window.currentDriveFolderId}')">
                <button onclick="document.getElementById('nativeFileUpload_${window.currentDriveFolderId}').click()" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 border border-blue-500/50 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0" 
                    id="btnNativeUpload_${window.currentDriveFolderId}">
                    <i data-lucide="upload-cloud" class="w-4 h-4" id="iconNativeUpload_${window.currentDriveFolderId}"></i> Buscar Archivo
                </button>
            `;
            if (window.lucide) window.lucide.createIcons();
        }

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

        // Contextual UI Reactivity (Hide / Destroy Upload Button in PROCESADOS mode)
        if (uploadBtnContainer) {
            uploadBtnContainer.innerHTML = '';
        }

        // Trigger Load
        window.loadProcessedFiles();
    }
}

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

    let html = `<div class="flex-1 overflow-y-auto custom-scrollbar w-full pr-2 pb-10 pt-2 h-full">`;

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

        if (isExtraido) {
            // TARJETA COMPACTA (EXTRAÍDO)
            html += `
                <div class="bg-slate-950/80 backdrop-blur-md border border-indigo-500/40 rounded-2xl p-5 flex flex-col justify-between shadow-2xl shadow-indigo-900/20 hover:border-indigo-400/60 transition-all h-full min-h-max relative overflow-hidden group">
                    <div class="absolute top-4 right-4 z-10" onclick="event.stopPropagation()">
                        <input type="checkbox" 
                            class="w-5 h-5 rounded-md border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 cursor-pointer transition-colors"
                            onchange="toggleSelection('${file.id}', this, true)"
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
                        <p class="text-[10px] text-indigo-300/80 font-mono mt-2 mb-4 flex items-center gap-1.5">
                            <i data-lucide="calendar" class="w-3 h-3"></i> ${new Date(file.created_at).toLocaleDateString()} &middot; ${file.items_count || 0} ítems
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
                <div class="group relative bg-slate-900/60 hover:bg-slate-900/90 border ${currentBorderClass} hover:border-emerald-400/80 rounded-2xl p-5 flex flex-col justify-between transition-all shadow-xl hover:-translate-y-1 hover:shadow-emerald-900/30 h-full min-h-max">
                    
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
                            onchange="toggleSelection('${file.id}', this, false)"
                        >
                    </div>

                    <div class="mt-5 pt-4 border-t border-slate-800 flex flex-col gap-2">
                        <label id="flujo_title_${file.id}" class="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1" style="display: ${file.flujo_asignado_id ? 'none' : 'block'};">Asignación de Flujo (Plantilla)</label>
                        <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                            <div id="flujo_selector_wrapper_${file.id}" class="flex-1 flex items-center gap-2" style="display: ${file.flujo_asignado_id ? 'none' : 'flex'};">
                                <div class="relative flex-1">
                                    <i data-lucide="workflow" class="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                                    <select id="flujo_select_${file.id}" class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-medium rounded-xl pl-9 pr-8 flex-1 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer hover:border-slate-600 transition-colors shadow-inner truncate py-2" onchange="document.getElementById('edit_flujo_btn_${file.id}').style.display = this.value ? 'flex' : 'none'">
                                        ${currentOptionsHtml}
                                    </select>
                                    <i data-lucide="chevron-down" class="absolute right-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none"></i>
                                </div>
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
                        
                        <button class="w-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-600/40" onclick="openProcessedFile('${file.id}', '${file.nombre_archivo}')">
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
            'ROLLBACK': '<b>Rollback Total:</b> Mover archivo al Inbox y borrar Base de Datos.',
            'UNLINK': '<b>Solo Desvincular:</b> Mantener archivo procesado y limpiar Base de Datos.',
            'REMOVE_EXTRACTION': '<b>Retirar Extracción:</b> Revertir Extracción pero mantener Estado Ingestado.'
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
            popup: 'border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl',
            inputRadio: 'text-left text-sm text-slate-300 gap-4 flex flex-col pt-4',
            radioLabel: 'ml-2 leading-relaxed' 
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
            if (window.fetchPendingFiles) window.fetchPendingFiles();
            if (window.fetchProcessedFiles && window.globalContext && window.globalContext.providerId) {
                window.fetchProcessedFiles(window.globalContext.providerId);
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

    const { value: newName, isConfirmed } = await Swal.fire({
        title: 'Renombrar Flujo',
        input: 'text',
        inputLabel: 'Nuevo nombre de plantilla',
        inputValue: currentName,
        showCancelButton: true,
        confirmButtonText: 'Guardar cambios',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        background: '#0f172a',
        color: '#f8fafc',
        inputValidator: (value) => {
            if (!value || value.trim().length === 0) return 'El nombre no puede estar vacío';
        }
    });

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