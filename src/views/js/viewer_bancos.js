// viewer_bancos.js - Satélite de Ingesta Bancaria (HITL)
console.log("%c 🏦 VISOR BANCOS HITL: READY ", "background: #2563eb; color: #fff; font-weight: bold; padding: 4px;");

window.openBancosIngesta = async function() {
    // Reemplazar la vista principal con el Workspace de Bancos
    const mainContent = document.getElementById('reportDisplay');
    if (!mainContent) return;

    // Renderizar Skeleton Layout
    mainContent.innerHTML = `
        <header class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                    <i data-lucide="landmark" class="w-7 h-7 text-blue-500"></i>
                    Ingesta Bancaria
                </h1>
                <p class="text-slate-400 text-sm mt-1">Mesa de Mapeo y Conciliación Automática (HITL)</p>
            </div>
            <div class="flex items-center gap-3">
                <button id="btnBancosRefresh" onclick="window.openBancosIngesta()" class="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    Actualizar
                </button>
            </div>
        </header>

        <div class="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
            <!-- Columna Izquierda: Bandeja Drive -->
            <div class="col-span-12 lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl relative">
                <div class="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                    <h2 class="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                        <i data-lucide="hard-drive" class="w-4 h-4 text-blue-400"></i> Archivos en Drive
                    </h2>
                    <button onclick="window.openBancosFolderInDrive()" title="Abrir carpeta en Google Drive" class="text-slate-400 hover:text-blue-400 transition-colors">
                        <i data-lucide="external-link" class="w-4 h-4"></i>
                    </button>
                </div>
                <div id="bancosDriveList" class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    <div class="flex justify-center items-center h-32">
                        <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-blue-500"></i>
                    </div>
                </div>
            </div>

            <!-- Columna Derecha: Mesa HITL -->
            <div class="col-span-12 lg:col-span-9 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl relative">
                <div class="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                    <h2 class="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2" id="hitlTitle">
                        <i data-lucide="table" class="w-4 h-4 text-emerald-400"></i> Movimientos Pendientes de Revisión
                    </h2>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 bg-amber-900/30 border border-amber-500/30 text-amber-400 rounded text-[10px] font-bold">Blindaje Anti-Duplicados Activo</span>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div class="overflow-x-auto rounded-lg border border-slate-800">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-800/80 border-b border-slate-700">
                                    <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Concepto / Descripción</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Monto</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                                    <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody id="bancosHitlGrid" class="text-xs text-slate-300">
                                <tr>
                                    <td colspan="5" class="p-8 text-center text-slate-500">
                                        Seleccione un archivo procesado de la lista izquierda para ver sus movimientos.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    await window.loadBancosDriveFiles();
    window.loadBancosMovimientos(null); // Load all by default or let user click
};

window.loadBancosDriveFiles = async function() {
    const listContainer = document.getElementById('bancosDriveList');
    if (!listContainer) return;

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendBaseUrl}/api/bancos/list-files`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Error al listar archivos');
        }

        const files = data.files || [];
        window.currentDriveFolderId = data.folderId;

        window.openBancosFolderInDrive = function() {
            if (window.currentDriveFolderId) {
                window.open(`https://drive.google.com/drive/folders/${window.currentDriveFolderId}`, '_blank');
            }
        };

        if (files.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center p-6 text-slate-500">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <p class="text-xs">Bandeja Vacía</p>
                    <button onclick="window.openBancosFolderInDrive()" class="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold transition-colors w-full">
                        Subir Archivos
                    </button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        let html = '';
        files.forEach(f => {
            const isProcesado = f.estado === 'PROCESADO';
            const icon = isProcesado ? 'check-circle-2' : 'file-spreadsheet';
            const iconColor = isProcesado ? 'text-emerald-500' : 'text-blue-400';
            const bgColor = isProcesado ? 'bg-slate-800/30' : 'bg-slate-800';
            const borderCls = isProcesado ? 'border-emerald-500/20' : 'border-slate-700';
            
            html += `
                <div class="p-3 ${bgColor} border ${borderCls} rounded-lg hover:border-blue-500/50 transition-colors cursor-pointer group" onclick="window.seleccionarArchivoBancos('${f.id}', '${f.name}', ${isProcesado})">
                    <div class="flex items-start gap-3">
                        <i data-lucide="${icon}" class="w-5 h-5 ${iconColor} shrink-0 mt-0.5"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-medium text-slate-200 truncate" title="${f.name}">${f.name}</p>
                            <p class="text-[10px] text-slate-500 mt-1">${isProcesado ? 'Ingestado' : 'Pendiente de Ingesta'}</p>
                        </div>
                        ${!isProcesado ? `
                            <button onclick="event.stopPropagation(); window.ingestarArchivoBancos('${f.id}')" class="opacity-0 group-hover:opacity-100 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-all shrink-0" title="Procesar ahora">
                                <i data-lucide="play" class="w-3 h-3"></i>
                            </button>
                        ` : `
                            <span class="p-1.5 text-emerald-500 shrink-0"><i data-lucide="check" class="w-4 h-4"></i></span>
                        `}
                    </div>
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

    } catch (error) {
        listContainer.innerHTML = `<div class="p-4 text-xs text-red-400 text-center">${error.message}</div>`;
    }
};

window.seleccionarArchivoBancos = function(fileId, fileName, isProcesado) {
    if (!isProcesado) {
        Swal.fire({
            title: 'Archivo No Ingestado',
            text: 'Este extracto aún no ha sido procesado por el motor incremental. Haz clic en el botón de "Play" azul para ingestarlo.',
            icon: 'info',
            background: '#0f172a', color: '#f8fafc'
        });
        return;
    }
    
    document.getElementById('hitlTitle').innerHTML = `<i data-lucide="table" class="w-4 h-4 text-emerald-400"></i> Movimientos: ${fileName}`;
    window.loadBancosMovimientos(fileId);
};

window.ingestarArchivoBancos = async function(fileId) {
    Swal.fire({
        title: 'Procesando Extracto...',
        html: 'Calculando hashes MD5 y cruzando con padrón de proveedores...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendBaseUrl}/api/bancos/ingestar/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        const res = data.resultados;
        Swal.fire({
            title: 'Ingesta Finalizada',
            html: `
                <div class="text-left text-sm text-slate-300 space-y-4 mt-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-slate-900 border border-emerald-500/30 p-4 rounded-xl text-center">
                            <p class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-1">Nuevos</p>
                            <p class="text-2xl font-mono font-bold text-emerald-400">${res.insertados}</p>
                        </div>
                        <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Omitidos (Duplicados)</p>
                            <p class="text-2xl font-mono font-bold text-slate-400">${res.duplicados_hash}</p>
                        </div>
                    </div>
                    <div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-xs text-center">
                        <span class="text-emerald-400 font-bold">${res.auto_vinculados}</span> Auto-Vinculados &nbsp;|&nbsp; 
                        <span class="text-amber-400 font-bold">${res.pendientes_hitl}</span> Requieren Revisión
                    </div>
                </div>
            `,
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Ver Movimientos'
        }).then(() => {
            window.openBancosIngesta(); // Refresh todo
        });

    } catch (error) {
        Swal.fire('Error de Ingesta', error.message, 'error');
    }
};

window.loadBancosMovimientos = async function(archivoId) {
    const grid = document.getElementById('bancosHitlGrid');
    if (!grid) return;

    grid.innerHTML = `<tr><td colspan="5" class="p-8 text-center"><i data-lucide="loader-2" class="w-6 h-6 animate-spin text-blue-500 mx-auto"></i></td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        let url = `${backendBaseUrl}/api/bancos/movimientos`;
        if (archivoId) url += `?archivoId=${archivoId}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) throw new Error(data.error);

        const movs = data.data || [];
        
        if (movs.length === 0) {
            grid.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">No hay movimientos registrados.</td></tr>`;
            return;
        }

        let html = '';
        movs.forEach(m => {
            const montoStr = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(m.monto_pago);
            let estadoHtml = '';
            let btnHtml = '';
            let trCls = 'hover:bg-slate-800/30 transition-colors border-b border-slate-800/50';

            if (m.estado === 'PENDIENTE') {
                estadoHtml = `<span class="px-2 py-1 bg-amber-900/30 border border-amber-500/30 text-amber-500 rounded text-[10px] font-bold">REVISIÓN REQUERIDA</span>`;
                const safeDesc = m.descripcion_original.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                btnHtml = `
                    <button onclick="window.abrirModalVincular('${m.hash_id}', '${safeDesc}')" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold transition-colors">Vincular</button>
                    <button onclick="window.ignorarMovimiento('${m.hash_id}')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[10px] font-bold transition-colors ml-1">Ignorar</button>
                `;
            } else if (m.estado === 'VINCULADO' || m.estado === 'AUTO_VINCULADO') {
                const provName = m.proveedores ? (m.proveedores.nombre || m.proveedores.afip_razon_social) : 'Proveedor';
                estadoHtml = `
                    <div class="flex items-center gap-1 text-emerald-400">
                        <i data-lucide="check-circle-2" class="w-3 h-3"></i>
                        <span class="text-[10px] font-bold">${provName}</span>
                    </div>
                `;
                trCls = 'bg-emerald-900/10 border-b border-slate-800/50';
            } else if (m.estado === 'IGNORADO') {
                estadoHtml = `<span class="text-[10px] font-bold text-slate-500">IGNORADO</span>`;
                trCls = 'opacity-50 border-b border-slate-800/50';
            }

            // Highlighting detected CUIT
            let descRender = m.descripcion_original;
            if (m.cuit_detectado) {
                descRender = descRender.replace(new RegExp(m.cuit_detectado, 'g'), `<span class="bg-blue-900/50 text-blue-300 px-1 rounded">${m.cuit_detectado}</span>`);
            }

            html += `
                <tr class="${trCls}">
                    <td class="p-3 font-mono text-slate-400">${m.fecha_pago}</td>
                    <td class="p-3 text-[11px]">${descRender}</td>
                    <td class="p-3 font-mono font-bold text-right text-slate-200">${montoStr}</td>
                    <td class="p-3">${estadoHtml}</td>
                    <td class="p-3 text-right whitespace-nowrap">${btnHtml}</td>
                </tr>
            `;
        });

        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

    } catch (error) {
        grid.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">${error.message}</td></tr>`;
    }
};

window.abrirModalVincular = async function(hashId, descripcionOriginal) {
    // 1. Fetch proveedores para el select
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const pRes = await fetch(`${backendBaseUrl}/api/master-table/proveedores`);
        const pData = await pRes.json();
        const proveedores = pData.data || [];

        let options = '<option value="">-- Seleccionar Proveedor --</option>';
        proveedores.forEach(p => {
            options += `<option value="${p.id}">${p.razon_social} (${p.cuit || 'Sin CUIT'})</option>`;
        });

        Swal.fire({
            title: 'Vincular Movimiento',
            html: `
                <div class="text-left space-y-4">
                    <div class="p-3 bg-slate-800 rounded border border-slate-700 text-xs font-mono text-slate-300 break-words">
                        ${descripcionOriginal}
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Destinatario del Pago</label>
                        <select id="hitl_prov_id" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 outline-none focus:border-blue-500">
                            ${options}
                        </select>
                    </div>

                    <div class="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg mt-2">
                        <label class="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" id="hitl_save_memory" class="mt-1" onchange="document.getElementById('hitl_memory_pattern_container').classList.toggle('hidden', !this.checked)">
                            <div class="text-xs text-amber-200">
                                <strong>Guardar en Diccionario (Memoria)</strong><br>
                                Recordar este vínculo para futuros extractos.
                            </div>
                        </label>
                        <div id="hitl_memory_pattern_container" class="mt-2 hidden">
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Frase Clave (Alias/CBU)</label>
                            <input type="text" id="hitl_memory_pattern" placeholder="Ej: JUAN PEREZ, o 0140..." class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500">
                            <p class="text-[9px] text-slate-500 mt-1">Ingresa la palabra clave exacta contenida en la descripción original que debe disparar el vínculo automático.</p>
                        </div>
                    </div>
                </div>
            `,
            background: '#0f172a', color: '#f8fafc',
            showCancelButton: true,
            confirmButtonText: 'Vincular y Asentar',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#334155',
            preConfirm: () => {
                const provId = document.getElementById('hitl_prov_id').value;
                const saveMemory = document.getElementById('hitl_save_memory').checked;
                const pattern = document.getElementById('hitl_memory_pattern').value.trim();

                if (!provId) {
                    Swal.showValidationMessage('Debes seleccionar un proveedor.');
                    return false;
                }
                if (saveMemory && pattern.length < 3) {
                    Swal.showValidationMessage('El patrón de búsqueda debe tener al menos 3 caracteres.');
                    return false;
                }

                return { provId, saveMemory, pattern };
            }
        }).then(async (res) => {
            if (res.isConfirmed) {
                await window.ejecutarAccionHITL(hashId, 'VINCULAR', res.value);
            }
        });

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron cargar los proveedores', 'error');
    }
};

window.ignorarMovimiento = function(hashId) {
    Swal.fire({
        title: '¿Ignorar movimiento?',
        text: "Este registro no descontará saldo a ningún proveedor.",
        icon: 'warning',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, ignorar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await window.ejecutarAccionHITL(hashId, 'IGNORAR', {});
        }
    });
};

window.ejecutarAccionHITL = async function(hashId, accion, data) {
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendBaseUrl}/api/bancos/movimientos/${hashId}/vincular`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accion: accion,
                proveedor_id: data.provId,
                guardar_memoria: data.saveMemory,
                patron_busqueda: data.pattern
            })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        // Recargar grilla
        window.loadBancosMovimientos(null); // idealmente reload the current file, but null loads all or we can track current state

        Swal.fire({
            toast: true, position: 'bottom-end',
            icon: 'success', title: 'Acción completada',
            showConfirmButton: false, timer: 2000,
            background: '#0f172a', color: '#f8fafc'
        });

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
};
