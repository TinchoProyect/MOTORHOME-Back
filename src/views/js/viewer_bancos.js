window.openBancosIngesta = async function() {
    // 1. Mostrar pantalla de carga (Fase 1)
    Swal.fire({
        title: 'Conectando con Google Drive...',
        html: 'Buscando extractos bancarios disponibles.',
        background: '#0f172a',
        color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        
        const response = await fetch(`${backendBaseUrl}/api/bancos/list-files`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Error al listar archivos de Drive');
        }

        const files = data.files;
        const folderId = data.folderId; // Extraemos el folderId enviado por el backend

        // Función auxiliar para abrir la carpeta
        window.openBancosFolderInDrive = function() {
            if (folderId) window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
        };

        if (!files || files.length === 0) {
            Swal.fire({
                title: 'Bandeja Vacía',
                html: `
                    <div class="text-sm text-slate-300 mt-2">
                        <p>No se encontraron extractos bancarios en la carpeta configurada.</p>
                        <button type="button" onclick="window.openBancosFolderInDrive()" class="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 rounded-lg p-2 text-xs font-bold transition-colors flex justify-center items-center gap-2">
                            <i data-lucide="external-link" class="w-4 h-4"></i> Abrir Carpeta en Google Drive
                        </button>
                    </div>
                `,
                icon: 'info',
                background: '#0f172a', color: '#f8fafc',
                confirmButtonColor: '#3b82f6',
                didOpen: () => {
                    if (window.lucide) window.lucide.createIcons();
                }
            });
            return;
        }

        // 2. Generar el selector (Fase 2)
        let optionsHtml = '<select id="banco_file_id" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-sm font-mono focus:border-blue-500 focus:outline-none">';
        files.forEach(f => {
            optionsHtml += `<option value="${f.id}">${f.name}</option>`;
        });
        optionsHtml += '</select>';

        Swal.fire({
            title: 'Ingesta Bancaria',
            html: `
                <div class="text-left text-sm text-slate-300 space-y-4 mt-4">
                    <p>Seleccione el extracto bancario que desea procesar.</p>
                    <div class="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg flex items-start gap-3">
                        <i data-lucide="shield-check" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5"></i>
                        <p class="text-xs text-amber-200"><strong>Blindaje Activo:</strong> El sistema detectará pagos duplicados automáticamente si los archivos poseen fechas superpuestas.</p>
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="text-[10px] font-bold text-slate-500 uppercase">Archivo Disponible en Drive</label>
                            <button type="button" onclick="window.openBancosFolderInDrive()" class="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                                <i data-lucide="external-link" class="w-3 h-3"></i> Subir nuevo archivo
                            </button>
                        </div>
                        ${optionsHtml}
                    </div>
                </div>
            `,
            background: '#0f172a',
            color: '#f8fafc',
            width: '500px',
            showCancelButton: true,
            confirmButtonText: 'Procesar Extracto',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#334155',
            didOpen: () => {
                if (window.lucide) window.lucide.createIcons();
            },
            preConfirm: () => {
                const fileId = document.getElementById('banco_file_id').value;
                if (!fileId) {
                    Swal.showValidationMessage('Debe seleccionar un archivo');
                    return false;
                }
                return fileId;
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await procesarExtractoBancario(result.value);
            }
        });

    } catch (error) {
        Swal.fire({
            title: 'Error de Conexión',
            text: error.message,
            icon: 'error',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#ef4444'
        });
    }
};

async function procesarExtractoBancario(fileId) {
    Swal.fire({
        title: 'Procesando Extracto...',
        html: 'Descargando archivo desde Drive y ejecutando heurística de vinculación.',
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

        if (!data.success) {
            throw new Error(data.error || 'Error desconocido del servidor');
        }

        const res = data.resultados;

        Swal.fire({
            title: 'Reporte de Ingesta',
            html: `
                <div class="text-left text-sm text-slate-300 space-y-4 mt-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Pagos Válidos</p>
                            <p class="text-2xl font-mono font-bold text-blue-400">${res.leidos_validos}</p>
                        </div>
                        <div class="bg-slate-900 border border-emerald-500/30 p-4 rounded-xl text-center">
                            <p class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-1">Insertados</p>
                            <p class="text-2xl font-mono font-bold text-emerald-400">${res.insertados}</p>
                        </div>
                    </div>

                    <div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2 mb-2">Detalles de Omisión</h4>
                        <ul class="text-xs space-y-2">
                            <li class="flex justify-between"><span>Bloqueados por Duplicidad (Hash):</span> <span class="font-mono text-amber-400">${res.duplicados_hash}</span></li>
                            <li class="flex justify-between"><span>Sin CUIT en descripción:</span> <span class="font-mono text-slate-500">${res.omitidos_parser.sin_cuit}</span></li>
                            <li class="flex justify-between"><span>CUIT ajeno a LAMDA:</span> <span class="font-mono text-slate-500">${res.omitidos_parser.cuit_no_encontrado}</span></li>
                            <li class="flex justify-between"><span>Ingresos / Créditos ignorados:</span> <span class="font-mono text-slate-500">${res.omitidos_parser.ingresos}</span></li>
                        </ul>
                    </div>
                </div>
            `,
            background: '#0f172a', color: '#f8fafc',
            icon: 'success',
            confirmButtonText: 'Finalizar',
            confirmButtonColor: '#3b82f6'
        });

    } catch (err) {
        Swal.fire({
            title: 'Fallo de Ingesta',
            text: err.message,
            icon: 'error',
            background: '#0f172a', color: '#f8fafc',
            confirmButtonColor: '#ef4444'
        });
    }
}
