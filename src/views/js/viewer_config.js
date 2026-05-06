window.openGlobalConfig = async function() {
    Swal.fire({
        title: 'Cargando Configuración...',
        background: '#0f172a',
        color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        const response = await fetch(`${backendBaseUrl}/api/config`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al obtener configuración');
        }

        const configItems = data.config || [];

        let configHtml = '<div class="text-left text-sm text-slate-300 space-y-4 mt-4">';
        
        if (configItems.length === 0) {
            configHtml += `
                <div class="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg">
                    <p class="text-xs text-amber-200">No se encontraron parámetros de sistema. Asegúrate de ejecutar la migración <strong>044_configuracion_sistema.sql</strong> en la base de datos.</p>
                </div>
            `;
        } else {
            configItems.forEach(item => {
                let extraButtons = '';

                // Lógica mágica para drive_folder_bancos_id
                if (item.llave === 'drive_folder_bancos_id') {
                    if (!item.valor || item.valor.trim() === '') {
                        extraButtons = `
                            <button type="button" onclick="window.provisionBancosFolder()" class="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-2 text-xs font-bold transition-colors flex justify-center items-center gap-2">
                                <i data-lucide="wand-2" class="w-4 h-4"></i> Provisionar Carpeta Automáticamente
                            </button>
                        `;
                    } else {
                        extraButtons = `
                            <button type="button" onclick="window.openDriveFolder('${item.valor}')" class="mt-2 w-full bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 rounded-lg p-2 text-xs font-bold transition-colors flex justify-center items-center gap-2">
                                <i data-lucide="external-link" class="w-4 h-4"></i> Abrir Carpeta en Google Drive
                            </button>
                        `;
                    }
                }

                configHtml += `
                    <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl relative group">
                        <label class="block text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">${item.llave}</label>
                        <p class="text-[10px] text-slate-500 mb-2">${item.descripcion || 'Sin descripción'}</p>
                        <div class="flex items-center gap-2">
                            <input type="text" id="config_${item.llave}" value="${item.valor}" ${item.valor ? 'readonly' : ''} class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs font-mono focus:border-blue-500 focus:outline-none transition-colors ${item.valor ? 'opacity-70 cursor-not-allowed' : ''}">
                            ${!item.valor ? `
                            <button type="button" onclick="window.saveConfig('${item.llave}')" class="bg-blue-600 hover:bg-blue-500 text-white rounded-lg p-2 transition-colors" title="Guardar">
                                <i data-lucide="save" class="w-4 h-4"></i>
                            </button>
                            ` : `
                            <button type="button" class="bg-slate-700 text-slate-400 rounded-lg p-2 cursor-not-allowed" title="Valor Bloqueado (Gestionado Automáticamente)">
                                <i data-lucide="lock" class="w-4 h-4"></i>
                            </button>
                            `}
                        </div>
                        ${extraButtons}
                    </div>
                `;
            });
        }
        
        configHtml += '</div>';

        Swal.fire({
            title: 'Parámetros del Sistema',
            html: configHtml,
            background: '#0f172a',
            color: '#f8fafc',
            width: '600px',
            showConfirmButton: false,
            showCloseButton: true,
            didOpen: () => {
                if (window.lucide) window.lucide.createIcons();
            }
        });

    } catch (error) {
        Swal.fire({
            title: 'Error',
            text: error.message,
            icon: 'error',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#ef4444'
        });
    }
};

window.saveConfig = async function(llave) {
    const inputEl = document.getElementById(`config_${llave}`);
    if (!inputEl) return;

    const valor = inputEl.value.trim();

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        const response = await fetch(`${backendBaseUrl}/api/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ llave, valor })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al guardar configuración');
        }

        // Mostrar notificación sutil
        const Toast = Swal.mixin({
            toast: true,
            position: 'bottom-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            background: '#0f172a',
            color: '#f8fafc'
        });

        Toast.fire({
            icon: 'success',
            title: 'Configuración guardada'
        });

    } catch (error) {
        Swal.fire({
            title: 'Error al Guardar',
            text: error.message,
            icon: 'error',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#ef4444'
        });
    }
};

window.provisionBancosFolder = async function() {
    Swal.fire({
        title: 'Provisionando...',
        html: 'Creando carpeta global en Google Drive y vinculando ID automáticamente.',
        background: '#0f172a',
        color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        const response = await fetch(`${backendBaseUrl}/api/config/provision-bancos-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error en el aprovisionamiento');
        }

        Swal.fire({
            title: '¡Infraestructura Creada!',
            html: `La carpeta fue aprovisionada correctamente.<br><span class="text-xs text-slate-400 font-mono mt-2 block">ID: ${data.folderId}</span>`,
            icon: 'success',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#3b82f6'
        }).then(() => {
            // Recargar modal para mostrar el nuevo botón de "Abrir en Drive"
            window.openGlobalConfig();
        });

    } catch (error) {
        Swal.fire({
            title: 'Fallo al Provisionar',
            text: error.message,
            icon: 'error',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#ef4444'
        });
    }
};

window.openDriveFolder = function(folderId) {
    if (folderId) {
        window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    }
};

