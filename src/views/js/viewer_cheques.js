// viewer_cheques.js - Satélite de Gestión de Cheques
console.log("%c 💳 VISOR CHEQUES: READY ", "background: #8b5cf6; color: #fff; font-weight: bold; padding: 4px;");

window.openConsultaCheques = async function() {
    const mainContent = document.getElementById('reportDisplay');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <header class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                    <i data-lucide="wallet" class="w-7 h-7 text-fuchsia-500"></i>
                    Consulta de Cheques
                </h1>
                <p class="text-slate-400 text-sm mt-1">Gestión de Valores de Terceros (Físicos y E-cheqs)</p>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="window.abrirCarpetaDriveCheques()" 
                    class="px-3 py-2 bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 shrink-0"
                    title="Ver carpeta original en Google Drive">
                    Drive <i data-lucide="external-link" class="w-3 h-3"></i>
                </button>
                <button onclick="window.ingestarChequesDrive()" 
                    class="px-3 py-2 bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-blue-400 border border-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 shrink-0"
                    title="Forzar lectura de archivos en Drive e ingestar nuevos cheques">
                    Sincronizar <i data-lucide="refresh-ccw" class="w-3 h-3"></i>
                </button>
                <button onclick="window.openConsultaCheques()" class="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    Actualizar
                </button>
            </div>
        </header>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl h-[calc(100vh-140px)] relative">
            
            <div class="p-4 border-b border-slate-800 bg-slate-800/50 flex gap-4">
                <button onclick="window.loadCheques('EN_CARTERA')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase focus:ring-2 focus:ring-fuchsia-500">En Cartera</button>
                <button onclick="window.loadCheques('TODOS')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase focus:ring-2 focus:ring-fuchsia-500">Histórico Completo</button>
            </div>

            <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div class="overflow-x-auto rounded-lg border border-slate-800">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-800/80 border-b border-slate-700">
                                <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimiento</th>
                                <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nº Cheque / Emisor</th>
                                <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Importe</th>
                                <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Estado</th>
                                <th class="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="chequesGrid" class="text-xs text-slate-300">
                            <tr>
                                <td colspan="5" class="p-8 text-center"><i data-lucide="loader-2" class="w-6 h-6 animate-spin text-fuchsia-500 mx-auto"></i></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.loadCheques('EN_CARTERA');
};

window.loadCheques = async function(filtro = 'EN_CARTERA') {
    const grid = document.getElementById('chequesGrid');
    if (!grid) return;

    grid.innerHTML = `<tr><td colspan="5" class="p-8 text-center"><i data-lucide="loader-2" class="w-6 h-6 animate-spin text-fuchsia-500 mx-auto"></i></td></tr>`;

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const url = filtro === 'TODOS' ? `${backendBaseUrl}/api/cheques/todos` : `${backendBaseUrl}/api/cheques/disponibles`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) throw new Error(data.message);

        const cheques = data.data || [];

        if (cheques.length === 0) {
            grid.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">No hay cheques ${filtro === 'EN_CARTERA' ? 'en cartera' : 'registrados'}.</td></tr>`;
            return;
        }

        let html = '';
        const hoy = new Date();

        cheques.forEach(c => {
            const importeStr = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c.importe);
            
            // Lógica de Vencimiento
            let trCls = 'hover:bg-slate-800/30 transition-colors border-b border-slate-800/50';
            let alertHtml = '';
            
            if (c.estado_interno === 'EN_CARTERA' && c.fecha_vencimiento_calculada) {
                const fVenc = new Date(c.fecha_vencimiento_calculada);
                const diffTime = fVenc - hoy;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 7 && diffDays >= 0) {
                    trCls = 'bg-red-900/20 hover:bg-red-900/30 border-b border-red-500/30';
                    alertHtml = `<i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 inline-block mr-1" title="Vence en ${diffDays} días"></i>`;
                } else if (diffDays < 0) {
                    trCls = 'bg-slate-900/50 border-b border-slate-800/50 opacity-60';
                    alertHtml = `<i data-lucide="clock" class="w-4 h-4 text-slate-500 inline-block mr-1" title="Vencido hace ${Math.abs(diffDays)} días"></i>`;
                }
            }

            let estadoHtml = `<span class="px-2 py-1 bg-slate-800 rounded text-[10px] font-bold">${c.estado_interno}</span>`;
            if (c.estado_interno === 'EN_CARTERA') estadoHtml = `<span class="px-2 py-1 bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/30 rounded text-[10px] font-bold">EN CARTERA</span>`;
            if (c.estado_interno === 'ENDOSADO') estadoHtml = `<span class="px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold">ENDOSADO</span>`;
            if (c.estado_interno === 'ACREDITADO') estadoHtml = `<span class="px-2 py-1 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">ACREDITADO</span>`;
            if (c.estado_interno === 'DEVUELTO') estadoHtml = `<span class="px-2 py-1 bg-red-900/30 text-red-400 border border-red-500/30 rounded text-[10px] font-bold">DEVUELTO</span>`;

            let btnHtml = '';
            if (c.estado_interno === 'EN_CARTERA') {
                btnHtml = `
                    <button onclick="window.abrirModalEndoso('${c.id}', '${c.numero_cheque}', ${c.importe})" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold transition-colors">Endosar</button>
                    <button onclick="window.acreditarCheque('${c.id}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition-colors ml-1">Acreditar</button>
                    <button onclick="window.rechazarCheque('${c.id}')" class="px-2 py-1 bg-slate-700 hover:bg-red-600 text-white rounded text-[10px] font-bold transition-colors ml-1">Rechazar</button>
                `;
            }

            html += `
                <tr class="${trCls}">
                    <td class="p-3 font-mono text-slate-400 whitespace-nowrap">${alertHtml} ${c.fecha_vencimiento_calculada || 'N/A'}</td>
                    <td class="p-3 text-[11px]">
                        <strong>#${c.numero_cheque}</strong><br>
                        <span class="text-slate-500">${c.librador_razon_social} (${c.banco_emisor})</span>
                    </td>
                    <td class="p-3 font-mono font-bold text-right text-fuchsia-300">${importeStr}</td>
                    <td class="p-3 text-center">${estadoHtml}</td>
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

window.abrirCarpetaDriveCheques = async function() {
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendBaseUrl}/api/cheques/config`);
        const data = await response.json();
        
        if (data.success && data.folderId) {
            window.open(`https://drive.google.com/drive/folders/${data.folderId}`, '_blank');
        } else {
            Swal.fire('Atención', 'El ID de la carpeta de Drive (DRIVE_CHEQUES_FOLDER_ID) no está configurado en el servidor.', 'warning');
        }
    } catch (error) {
        Swal.fire('Error', 'No se pudo obtener la configuración de Drive.', 'error');
    }
};

window.ingestarChequesDrive = async function() {
    Swal.fire({
        title: 'Buscando Extractos...',
        html: 'Conectando con Google Drive y procesando archivos CSV de cheques...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendBaseUrl}/api/cheques/ingestar`, { method: 'POST' });
        const data = await response.json();

        if (!data.success) throw new Error(data.message);

        Swal.fire({
            title: 'Ingesta Finalizada',
            text: data.message,
            icon: 'success',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#3b82f6'
        }).then(() => {
            window.loadCheques('EN_CARTERA');
        });

    } catch (error) {
        Swal.fire('Error de Ingesta', error.message, 'error');
    }
};

window.abrirModalEndoso = async function(id, numCheque, importe) {
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const pRes = await fetch(`${backendBaseUrl}/api/master-table/proveedores`);
        const pData = await pRes.json();
        const proveedores = pData.data || [];

        let options = '<option value="">-- Seleccionar Proveedor --</option>';
        proveedores.forEach(p => {
            options += `<option value="${p.id}">${p.razon_social} (${p.cuit || 'Sin CUIT'})</option>`;
        });

        const importeStr = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(importe);

        Swal.fire({
            title: 'Endosar Cheque',
            html: `
                <div class="text-left space-y-4">
                    <div class="p-3 bg-slate-800 rounded border border-slate-700 text-xs font-mono text-slate-300">
                        Cheque Nº: <strong>${numCheque}</strong><br>
                        Importe: <strong class="text-fuchsia-400">${importeStr}</strong>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Endosar a favor de</label>
                        <select id="endoso_prov_id" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 outline-none focus:border-blue-500">
                            ${options}
                        </select>
                    </div>
                </div>
            `,
            background: '#0f172a', color: '#f8fafc',
            showCancelButton: true,
            confirmButtonText: 'Confirmar Endoso',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#334155',
            preConfirm: () => {
                const provId = document.getElementById('endoso_prov_id').value;
                if (!provId) {
                    Swal.showValidationMessage('Debes seleccionar un proveedor destino.');
                    return false;
                }
                return provId;
            }
        }).then(async (res) => {
            if (res.isConfirmed) {
                await window.ejecutarAccionCheque(id, 'endosar', { proveedor_id: res.value });
            }
        });

    } catch (e) {
        Swal.fire('Error', 'No se pudieron cargar los proveedores', 'error');
    }
};

window.acreditarCheque = function(id) {
    Swal.fire({
        title: '¿Acreditar Cheque?',
        text: "Este cheque se marcará como depositado en cuenta propia.",
        icon: 'question',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Acreditar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await window.ejecutarAccionCheque(id, 'acreditar', {});
        }
    });
};

window.rechazarCheque = function(id) {
    Swal.fire({
        title: '¿Marcar como Devuelto?',
        text: "El cheque se registrará como rechazado.",
        icon: 'warning',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, Devuelto'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await window.ejecutarAccionCheque(id, 'rechazar', {});
        }
    });
};

window.ejecutarAccionCheque = async function(id, accion, data) {
    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendBaseUrl}/api/cheques/${id}/${accion}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        window.loadCheques('EN_CARTERA');

        Swal.fire({
            toast: true, position: 'bottom-end',
            icon: 'success', title: json.message || 'Acción completada',
            showConfirmButton: false, timer: 2000,
            background: '#0f172a', color: '#f8fafc'
        });

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
};
