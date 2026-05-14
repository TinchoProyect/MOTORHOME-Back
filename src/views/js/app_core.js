
/**
 * APP CORE - Sistema de Gestión de Proveedores
 * Módulo Central de Lógica de Negocio
 * v2.5
 */

console.log("%c 🚀 SYSTEM REBOOT: v2.5 - APP CORE MODULE LOADED ", "background: #22c55e; color: #000; font-weight: bold; padding: 4px;");

// 1. Configuración de Seguridad y Backend
const sbUrl = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_URL : "";
const sbKey = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_ANON_KEY : "";
// Usar API Key real de config.js para la IA
const apiKey = (typeof CONFIG !== 'undefined') ? CONFIG.GEMINI_API_KEY : "";
// Restaurar variable global para API Backend (Fix 405/RefError)
const backendBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

// Renombrado a supabaseClient para evitar conflicto con window.supabase
let supabaseClient = null;

// 3. Lógica del Chasis (Interfaz Original del Chapista)
// Elementos UI Globales
let terminalInput, aiLoader, historyContent, micBtn, reportDisplay, logoutBtn;

// Estado Global de Proveedores
window.currentSuppliers = []; // AHORA PÚBLICO
let editingSupplierId = null;
window.currentDriveFolderId = null; // [CONTEXT FIX] Global Memory for Drive Folder

// Placeholder for real metrics
let realMetrics = {
    proveedoresCount: 142, // Example initial value
    inversion: "$158.420.000 Pesos",
    deuda: "$24.150.800 Pesos"
};


// 2. Guardia de Sesión (Protección de Ruta)
async function initSystem() {
    // Inicializar referencias DOM aquí para asegurar que existen
    terminalInput = document.getElementById('terminalInput');
    aiLoader = document.getElementById('aiLoader');
    historyContent = document.getElementById('historyContent');
    micBtn = document.getElementById('micBtn');
    reportDisplay = document.getElementById('reportDisplay');
    logoutBtn = document.getElementById('logoutBtn');

    // Setup UI Listeners that need DOM
    setupUIListeners();

    if (!sbUrl || !sbKey) {
        console.error("CRITICAL: Faltan credenciales del sistema.");
        window.location.href = 'acceso.html'; // Expulsión preventiva
        return;
    }

    // Inicializar Cliente Supabase
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(sbUrl, sbKey);
        window.supabaseClient = supabaseClient; // Bind for legacy HTML support
    } else {
        console.error("Supabase SDK not loaded");
        return;
    }

    // Verificar Sesión Activa
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        // Si no hay sesión, REDIRIGIR AL LOGIN
        console.warn("⚠️ Acceso no autorizado. Redirigiendo a puerta de enlace...");
        window.location.href = 'acceso.html';
    } else {
        // Sesión Válida: Mostrar Interfaz y Cargar Datos
        document.body.style.visibility = 'visible';
        console.log("✅ Sistema Operativo. Usuario:", session.user.email);

        // Actualizar UI con datos de usuario
        const userEmailCtx = document.getElementById('userEmail');
        const userAvatarCtx = document.getElementById('userAvatar');

        if (userEmailCtx) userEmailCtx.innerText = session.user.email;
        if (userAvatarCtx) {
            userAvatarCtx.innerText = session.user.email.substring(0, 2).toUpperCase();
            userAvatarCtx.classList.remove('animate-pulse'); // Stop loading animation
        }

        // [TICKET #038] Cargar categorías dinámicas antes del resto de dependencias UI
        await loadCategorias();

        // Cargar Sidebar de Proveedores (Lazy Load inicial)
        loadSuppliersSidebar();
    }

    // Listener de Auth State Change (para logout global)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') window.location.href = 'acceso.html';
    });
}

function setupUIListeners() {
    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (supabaseClient) await supabaseClient.auth.signOut();
            window.location.href = 'acceso.html';
        });
    }

    // Manejo de Enter en Textarea
    if (terminalInput) {
        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendToAI();
            }
        });

        // Auto-crecimiento del textarea
        terminalInput.addEventListener('input', function () {
            this.style.height = 'auto'; // Reset para calcular
            this.style.height = (this.scrollHeight) + 'px';
        });

        terminalInput.addEventListener('focus', () => toggleFocusMode(true));
    }

    // Initialize Provisioning Logic Listeners
    const form = document.getElementById('supplierForm');
    if (form) {
        const nameInput = document.getElementById('supplierNameInput');
        const cuitInput = document.getElementById('supplierCuitInput');
        
        if (nameInput) {
            nameInput.addEventListener('input', validateFormState);
        }

        if (cuitInput) {
            cuitInput.addEventListener('input', function(e) {
                // Máscara CUIT: XX-XXXXXXXX-X
                let val = this.value.replace(/[^0-9]/g, '');
                if (val.length > 2 && val.length <= 10) {
                    val = val.slice(0, 2) + '-' + val.slice(2);
                } else if (val.length > 10) {
                    val = val.slice(0, 2) + '-' + val.slice(2, 10) + '-' + val.slice(10, 11);
                }
                this.value = val;
                validateFormState();
            });
        }

        const catSelect = document.getElementById('supplierCategoriaSelect');
        if (catSelect) {
            catSelect.addEventListener('change', function(e) {
                if (this.value === 'GESTIONAR_RUBROS') {
                    openCategoriasModal();
                    this.value = ''; // Temporariamente reset
                }
            });
        }

        form.addEventListener('submit', handleSupplierSubmit);
    }

    // Global Click for Supplier Modal
    const modal = document.getElementById('supplierModal');
    if (modal) {
        window.onclick = function (event) {
            if (event.target == modal) closeSupplierModal();
        }
    }
}


// --- EXPLORADOR DE ARCHIVOS (DRIVE) ---
async function exploreSupplierFiles(folderId, contextMode = 'listas') {
    if (!folderId) return;

    // [CONTEXT FIX] Capture this folder as the active Drive Context
    window.currentDriveFolderId = folderId;
    console.log(`[Context] Drive Folder Locked: ${folderId}`);

    // Context Inference & Global State Hydration
    // Accessing window.currentActiveProviderId to share state with other modules if needed
    // But currentActiveProviderId is set in showSingleSupplier

    // [REFACTOR] Centralized Provider Resolution
    const provider = window.resolveProviderContext(window.currentActiveProviderId);

    // We need globalContext from Viewer Engine... 
    // If GlobalContext is defined in HTML (lines 804), we can access via window.globalContext logic if needed?
    // Actually, let's look at how it was. helper variables like map/viewer are in HTML.
    // We can try to set them if they are global. 

    if (provider.id && typeof window.globalContext !== 'undefined') {
        window.globalContext.providerId = provider.id;
        window.globalContext.providerName = provider.nombre;
        window.globalContext.fileType = (provider.drive_folder_prices_id === folderId) ? "LISTA_PRECIOS" : "GENERAL";
        window.globalContext.timestamp = new Date().toISOString();
    }

    // Mostrar estado de carga en el panel central
    if (!reportDisplay) reportDisplay = document.getElementById('reportDisplay');
    reportDisplay.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-blue-400 animate-in fade-in duration-300">
            <div class="relative w-16 h-16 mb-4">
                <div class="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                <div class="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                <i data-lucide="hard-drive" class="absolute inset-0 m-auto w-6 h-6 text-white animate-pulse"></i>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Conectando con Drive</h3>
            <p class="text-xs text-slate-500 font-mono">ID: ${folderId}</p>
        </div>
    `;
    lucide.createIcons();

    try {
        // Fetch archivos usando la URL base (backendBaseUrl ya definido anteriormente)
        const ts = new Date().getTime();
        const url = backendBaseUrl
            ? `${backendBaseUrl}/api/files/list?folderId=${folderId}&_t=${ts}`
            : `/api/files/list?folderId=${folderId}&_t=${ts}`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) throw new Error(data.error || "Error desconocido");

        let processedDB = [];
        if (contextMode === 'facturas') {
            const pid = window.currentActiveProviderId || window.globalContext?.providerId;
            if (pid) {
                try {
                    const resDB = await fetch(`${backendBaseUrl}/api/facturas/provider/${pid}?_t=${ts}`);
                    const dbJson = await resDB.json();
                    if (dbJson.success) {
                        processedDB = dbJson.data || [];
                    }
                } catch (e) {
                    console.error("[exploreSupplierFiles] Error fetching facturas db:", e);
                }
            }
        }

        renderFileGrid(data.files, folderId, contextMode, processedDB);

    } catch (error) {
        console.error("Error explorador:", error);
        reportDisplay.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-red-400">
                <i data-lucide="alert-triangle" class="w-12 h-12 mb-4 opacity-80"></i>
                <p class="text-lg font-bold">Error de Conexión</p>
                <p class="text-sm text-slate-500 max-w-md text-center mt-2">${error.message}</p>
                <button onclick="showSuppliersList()" class="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">Volver</button>
            </div>
        `;
        lucide.createIcons();
    }
}

// ⚠️ GLOBAL EXPOSE FOR EXTERNAL MODULES (DASHBOARD REFRESH BUG FIX)
window.exploreSupplierFiles = exploreSupplierFiles;
window.loadFiles = exploreSupplierFiles; // Alias requerido por viewer_ingest.js

function renderFileGrid(files, folderId, contextMode = 'listas', processedDB = []) {
    // Helpers de Iconos
    const getIcon = (mime) => {
        if (mime.includes('folder')) return 'folder';
        if (mime.includes('image')) return 'image';
        if (mime.includes('pdf')) return 'file-text';
        if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'table';
        return 'file';
    };

    const getColor = (mime) => {
        if (mime.includes('folder')) return 'text-yellow-500';
        if (mime.includes('image')) return 'text-purple-400';
        if (mime.includes('pdf')) return 'text-red-400';
        if (mime.includes('spreadsheet')) return 'text-emerald-400';
        return 'text-slate-400';
    };

    // Get Provider Context
    const provider = currentSuppliers.find(s => s.id === window.currentActiveProviderId) || { nombre: 'Proveedor', id: null };

    // PHASE 5: UNIFIED DASHBOARD LAYOUT
    let html = `
        <div class="h-full flex flex-col animate-in slide-in-from-bottom-4 duration-500 p-2">
            <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div class="flex items-center gap-4">
                    <!-- Nav Controls -->
                    <div class="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                        <button onclick="showSuppliersList()" class="p-2 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-colors flex items-center gap-2" title="Ir a Lista de Proveedores">
                            <i data-lucide="list" class="w-4 h-4"></i>
                            <span class="text-[10px] uppercase font-bold hidden md:inline">Lista</span>
                        </button>
                        <div class="w-[1px] h-4 bg-slate-700"></div>
                        <button onclick="showSingleSupplier('${provider.id}')" class="p-2 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-colors flex items-center gap-2" title="Volver a Ficha">
                            <i data-lucide="arrow-left" class="w-4 h-4"></i>
                            <span class="text-[10px] uppercase font-bold hidden md:inline">Volver</span>
                        </button>
                    </div>

                    <!-- SUPPLIER CONTEXT HEADER -->
                    <div class="flex flex-col ml-4 pl-4 border-l border-slate-800/50 justify-center">
                        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-0.5">Auditoría Activa</span>
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-white tracking-wide leading-none">${provider.nombre}</span>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">${provider.categoria || 'GENERAL'}</span>
                        </div>
                    </div>

                    <!-- TABS (CONTEXT AWARE) -->
                    <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 ml-4">
                        <button id="tabPending" class="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-blue-500 bg-blue-500/10 text-blue-400">
                            <i data-lucide="${contextMode === 'facturas' ? 'receipt' : 'hard-drive'}" class="w-3 h-3"></i> Pendientes
                        </button>
                        <button id="tabProcessed" class="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-emerald-300">
                            <i data-lucide="${contextMode === 'facturas' ? 'archive' : 'archive'}" class="w-3 h-3"></i> Procesad${contextMode === 'facturas' ? 'a' : 'o'}s
                        </button>
                        ${contextMode === 'facturas' ? `
                        <button id="tabConciliadas" class="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-emerald-300">
                            <i data-lucide="check-square" class="w-3 h-3"></i> Conciliadas
                        </button>
                        ` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2 relative">
                    <!-- Contenedor Reactivo Inyectable para UploadButton (Oculto en Db/Procesados o Facturas) -->
                    ${contextMode === 'listas' ? `<div id="uploadButtonContainer"></div>` : ''}

                    <a href="https://drive.google.com/drive/folders/${folderId}" target="_blank" 
                        class="px-3 py-2 bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 shrink-0"
                        title="Ver carpeta original en Google Drive">
                        Drive <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                </div>
            </div>

            <!-- CONTAINER DRIVE (DEFAULT) -->
            <div id="fileListDrive" class="flex-1 overflow-hidden flex flex-col">
    `;

    // Filter Drive files
    let driveFiles = files;
    if (contextMode === 'facturas' && processedDB.length > 0) {
        driveFiles = files.filter(f => {
            const dbMatch = processedDB.find(db => db.archivo_id === f.id);
            if (!dbMatch) return true; // Keep virgin files
            // Keep if pending
            if (dbMatch.status === 'PENDIENTE') {
                f._isPending = true;
                return true;
            }
            return false; // Filter out REVISADO_HITL or CONCILIADO_OK
        });
    } else if (contextMode === 'listas' && window.currentProviderLists && window.currentProviderLists.length > 0) {
        driveFiles = files.filter(f => !window.currentProviderLists.some(db => db.archivo_id === f.id));
    }

    // Sort by modified time descending
    driveFiles.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());

    // Grid de Contenido Drive
    if (driveFiles.length === 0) {
        html += `
            <div class="flex-grow flex flex-col items-center justify-center text-slate-600">
                <i data-lucide="folder-open" class="w-16 h-16 mb-4 opacity-20"></i>
                <p class="text-sm">Carpeta vacía</p>
            </div>
        `;
    } else {
        if (contextMode === 'facturas') {
            // Group by Month/Year
            const groupedFiles = {};
            driveFiles.forEach(file => {
                const d = new Date(file.modifiedTime);
                const monthYear = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase();
                if (!groupedFiles[monthYear]) groupedFiles[monthYear] = [];
                groupedFiles[monthYear].push(file);
            });

            // Render as Table
            html += `
            <div class="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/30 m-2 mt-2 shadow-inner">
                <table class="w-full text-left text-xs text-slate-300">
                    <thead class="bg-slate-900/80 text-[10px] uppercase font-bold text-slate-500 sticky top-0 shadow-sm border-b border-slate-800">
                        <tr>
                            <th class="p-4">Comprobante</th>
                            <th class="p-4">Fecha Modif.</th>
                            <th class="p-4 text-center">Estado Inicial</th>
                            <th class="p-4 text-right">Acción IA</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/50">
            `;
            
            for (const [monthYear, gFiles] of Object.entries(groupedFiles)) {
                html += `
                    <tr>
                        <td colspan="4" class="p-2 bg-slate-800/50 border-y border-slate-700/50">
                            <span class="text-[10px] font-bold text-emerald-500 tracking-widest uppercase ml-2 flex items-center gap-2">
                                <i data-lucide="calendar-days" class="w-3 h-3"></i> ${monthYear}
                            </span>
                        </td>
                    </tr>
                `;
                gFiles.forEach(file => {
                    const isPending = file._isPending;
                    const statusBadge = isPending 
                        ? '<span class="px-2 py-1 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">BORRADOR / PRE-EXTRAÍDA</span>' 
                        : '<span class="px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">NUEVA</span>';

                    html += `
                    <tr class="hover:bg-slate-800/30 transition-colors group">
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <i data-lucide="file-text" class="w-4 h-4 text-red-400"></i>
                                <span class="font-medium text-slate-300 line-clamp-1 group-hover:text-amber-400 cursor-pointer transition-colors" onclick="window.open('${file.webViewLink}', '_blank')" title="Abrir PDF original">${file.name}</span>
                            </div>
                        </td>
                        <td class="p-4 font-mono text-[10px] text-slate-500">${new Date(file.modifiedTime).toLocaleDateString()}</td>
                        <td class="p-4 text-center">${statusBadge}</td>
                        <td class="p-4 text-right">
                            <button id="btn_ai_${file.id}" onclick="window.openVisorFacturas('${file.id}', '${file.name.replace(/'/g, "\\'")}', window.currentActiveProviderId || window.globalContext?.providerId, '${file.webViewLink}', this)" class="px-4 py-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-500 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all inline-flex items-center gap-1.5 border border-amber-500/30 hover:border-amber-500">
                                <i data-lucide="bot" class="w-3 h-3 pointer-events-none"></i> <span class="pointer-events-none">Procesar con IA</span>
                            </button>
                        </td>
                    </tr>
                    `;
                });
            }
            html += `
                    </tbody>
                </table>
            </div>`;
        } else {
            // Render as Generic Grid
            html += `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-10">`;

            driveFiles.forEach(file => {
                const iconName = getIcon(file.mimeType);
                const colorClass = getColor(file.mimeType);
                const clickAction = `handleFileClick('${file.id}', '${file.name}', 'ingestion')`;

                html += `
                    <div class="group relative bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-blue-500/30 hover:shadow-blue-900/10 rounded-xl p-4 flex flex-col items-center gap-3 transition-all hover:-translate-y-1 hover:shadow-xl">
                        <!-- Checkbox Batch Selection (Fase 3: Soporte Multiactivo) -->
                        <div class="absolute top-2 left-2 z-10" onclick="event.stopPropagation()">
                            <input type="checkbox" 
                                class="w-4 h-4 rounded-md border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer transition-colors"
                                onchange="if(window.toggleSelection) window.toggleSelection('${file.id}', this, false, '${file.name.replace(/'/g, "\\'")}')"
                                title="Seleccionar para Procesamiento por Lote"
                            >
                        </div>

                        <!-- External Link (Corner) -->
                        <a href="${file.webViewLink}" target="_blank" class="absolute top-2 right-2 p-1 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Abrir en Drive">
                            <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                        
                        <!-- Icon -->
                        <div onclick="${clickAction}" class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-lg ${colorClass.replace('text-', 'shadow-').replace('400', '900')}/20 cursor-pointer">
                            <i data-lucide="${iconName}" class="w-6 h-6 ${colorClass}"></i>
                        </div>
                        
                        <!-- Name -->
                        <p onclick="${clickAction}" class="text-[10px] text-center text-slate-300 font-medium line-clamp-2 w-full px-1 group-hover:text-white transition-colors cursor-pointer" title="${file.name.replace(/'/g, "\\'")}">${file.name}</p>
                        
                        <!-- Date -->
                        <span class="text-[9px] text-slate-600 font-mono mt-auto mb-2">${new Date(file.modifiedTime).toLocaleDateString()}</span>
                    </div>
                `;
            });

            html += `</div>`;
        }
    }

    html += `</div>`; // Close fileListDrive

    // CONTAINER DB (HIDDEN)
    html += `
            <div id="fileListDB" class="hidden flex-1 overflow-hidden flex flex-col text-white">
                <!-- Injected via DashboardTabs -->
            </div>
        </div>
    `;

    reportDisplay.innerHTML = html;
    lucide.createIcons();

    // Init Phase 5 Tabs
    if (window.initDashboardTabs) {
        window.initDashboardTabs(contextMode, processedDB);
    }
}

// ============================================================================
// Carga Estricta de Archivos a Google Drive (Upload Node Pipe)
// ============================================================================
window.uploadSelectedFile = async function(event, folderId) {
    const files = event.target.files;
    if (!files || files.length === 0 || !folderId) return;

    // Strict Size Bound Verification Frontend-side
    const maxMB = 50;
    for (let i = 0; i < files.length; i++) {
        if (files[i].size > maxMB * 1024 * 1024) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Carga DENEGADA', text: `Un archivo supera el límite máximo estricto de ${maxMB} MB.`, icon: 'error', background: '#0f172a', color: '#f8fafc' });
            else alert(`Error: Archivo muy grande. Límite ${maxMB} MB.`);
            event.target.value = ''; // Reset input
            return;
        }
    }

    const btn = document.getElementById(`btnNativeUpload_${folderId}`);
    const icon = document.getElementById(`iconNativeUpload_${folderId}`);

    // UI Loading Lock
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-white"></i> Inyectando...`;
        lucide.createIcons();
    }

    // Prepare Multipart FormData
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    formData.append('folderId', folderId);

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}/api/files/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Fallo en la comunicación con la API.");
        }

        console.log(`[UploadService] Archivos inyectados con éxito:`, data.files || data.file);
        // Limpiamos el File Input Local por seguridad
        event.target.value = '';

        // Feedback
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Ingesta Exitosa',
                text: 'Los archivos ya se encuentran persistidos en Drive.',
                icon: 'success',
                timer: 2000,
                background: '#0f172a', color: '#f8fafc',
                showConfirmButton: false
            });
        }

        // Determinist Lifecycle: Rehidratación ciega de la lista actual.
        // Dado que este archivo forzosamente reside en "Pendientes", explorar la carpeta refresca visualmente este tab.
        window.exploreSupplierFiles(folderId);

    } catch (error) {
        console.error("[UploadService] Error: ", error);
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error de Ingesta', text: error.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Error al subir archivo: " + error.message);
        
        // Restore UI Lock
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="upload-cloud" class="w-4 h-4"></i> Buscar Archivo`;
            lucide.createIcons();
        }
    }
}

async function handleFileClick(fileId, fileName, context = null) {
    console.log("Abriendo visor para:", fileName);

    const providerId = window.currentActiveProviderId;
    
    // ==========================================
    // INTERCEPTOR PARA OCR LISTAS DE PRECIOS (HITL)
    // ==========================================
    if (context === 'ingestion') {
        const lowerFileName = fileName.toLowerCase();
        const isImage = lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg') || lowerFileName.endsWith('.png') || lowerFileName.endsWith('.webp');
        if (isImage) {
            console.log("[Router] Redirigiendo imagen a Visor OCR Listas de Precios");
            if (window.openVisorOcrListas) {
                window.openVisorOcrListas(fileId, fileName, providerId);
                return;
            } else {
                console.error("Módulo viewer_ocr_listas.js no cargado");
            }
        }
    }

    if (!window.openFileViewer) {
        console.error("Módulo ViewerEngine no cargado");
        return;
    }
    
    // [FLUJOS] Interceptar apertura para consultar si existen plantillas
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/flujos/${providerId}`);
        const flujos = await res.json();

        // Aplicamos política estricta de omisión si el contexto es 'ingestion' (pestaña Pendientes)
        if (flujos && flujos.length > 0 && context !== 'ingestion') {
            // Mostrar modal inyectado al vuelo
            mostrarModalSelectorFlujos(fileId, fileName, providerId, flujos);
        } else {
            // No hay flujos o se omitieron por contexto (Blank Slate directo)
            window.openFileViewer(fileId, fileName, providerId, null);
        }
    } catch (e) {
        console.error("Error consultando flujos, se abre en crudo:", e);
        window.openFileViewer(fileId, fileName, providerId, null);
    }
}

// [FLUJOS UI] Generador del Modal de Selector de Plantillas
function mostrarModalSelectorFlujos(fileId, fileName, providerId, flujos) {
    // 1. Limpiar mallas si quedó alguna
    const existing = document.getElementById('flujoSelectorOverlay');
    if (existing) existing.remove();

    // 2. Construir HTML
    const overlay = document.createElement('div');
    overlay.id = 'flujoSelectorOverlay';
    overlay.className = "fixed inset-0 z-[6000] bg-slate-950/80 backdrop-blur-sm flex py-20 px-4 justify-center overflow-y-auto animate-in fade-in duration-200";
    
    let flujosHtml = '';
    flujos.forEach(f => {
        flujosHtml += `
            <button onclick="ejecutarAperturaConFlujo('${fileId}', '${fileName}', '${providerId}', '${f.id_flujo}')" class="w-full text-left p-4 mb-3 border border-slate-700 bg-slate-800/50 hover:bg-emerald-900/30 hover:border-emerald-500 rounded-lg transition-all group">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-slate-800 group-hover:bg-emerald-500/20 rounded shadow">
                        <i data-lucide="layers" class="w-5 h-5 text-slate-400 group-hover:text-emerald-400"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-slate-200 group-hover:text-white">${f.nombre_flujo}</h4>
                        <p class="text-[10px] text-slate-500 font-mono mt-1">Actualizado: ${new Date(f.fecha_actualizacion).toLocaleString()}</p>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 ml-auto transition-opacity"></i>
                </div>
            </button>
        `;
    });

    overlay.innerHTML = `
        <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-emerald-900/20 w-full max-w-md h-fit overflow-hidden animate-in zoom-in-95 duration-300">
            <div class="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <div class="flex items-center gap-2 text-white">
                    <i data-lucide="workflow" class="w-4 h-4 text-emerald-400"></i>
                    <h3 class="font-bold text-sm tracking-wide">Seleccionar Plantilla</h3>
                </div>
                <button onclick="document.getElementById('flujoSelectorOverlay').remove()" class="text-slate-500 hover:text-red-400 P-1">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="p-5">
                <p class="text-xs text-slate-400 mb-4">Se detectaron flujos pre-configurados para este proveedor. ¿Deseas aplicar alguno al archivo <b>${fileName}</b>?</p>
                <div class="max-h-[40vh] overflow-y-auto mb-4 custom-scrollbar pr-2">
                    ${flujosHtml}
                </div>
                <div class="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <button onclick="ejecutarAperturaConFlujo('${fileId}', '${fileName}', '${providerId}', null)" class="text-[11px] text-slate-400 hover:text-blue-400 font-medium px-2 py-1 flex items-center gap-1 transition-colors">
                        <i data-lucide="file-plus-2" class="w-3 h-3"></i> Omitir e Iniciar Vacío
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });
}

window.ejecutarAperturaConFlujo = function(fileId, fileName, providerId, idFlujo) {
    const overlay = document.getElementById('flujoSelectorOverlay');
    if (overlay) overlay.remove();
    console.log("[Flujos] Apertura decidida. Flujo asociado:", idFlujo || "N/A (Blank Slate)");
    window.openFileViewer(fileId, fileName, providerId, idFlujo);
}


// --- LÓGICA DE NAVEGACIÓN DINÁMICA DE PROVEEDORES ---

// Alias para compatibilidad con instrucciones de usuario
async function showSuppliersList() {
    await loadProveedores();
}

function handleProveedoresClick() {
    const submenu = document.getElementById('suppliersSubmenu');
    // Toggle visibilidad
    submenu.classList.toggle('hidden');

    // Cargar lista si está vacío (lazy load)
    if (!submenu.classList.contains('hidden')) { // Si se abre
        loadSuppliersSidebar();
    }
    // Mostrar lista general en el centro
    showSuppliersList();
}

async function loadSuppliersSidebar() {
    const container = document.getElementById('suppliersSubmenu');
    if (!container) return; // Guard clause

    const { data, error } = await supabaseClient
        .from('proveedores')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });

    if (error) {
        console.error("Error sidebar:", error);
        container.innerHTML = '<span class="text-[9px] text-red-400 px-2">Error</span>';
        return;
    }

    container.innerHTML = ''; // Limpiar

    if (data.length === 0) {
        container.innerHTML = '<span class="text-[9px] text-slate-600 px-2 italic">Sin proveedores</span>';
        return;
    }

    data.forEach(p => {
        const btn = document.createElement('button');
        btn.onclick = (e) => {
            e.stopPropagation(); // Evitar cerrar menú si fuera necesario
            showSingleSupplier(p.id);
        };
        btn.className = "text-left py-1.5 px-2 text-[10px] text-slate-500 hover:text-blue-400 hover:bg-slate-900/50 rounded transition-colors whitespace-nowrap overflow-hidden text-ellipsis";
        btn.innerText = p.nombre;
        container.appendChild(btn);
    });
}

async function showSingleSupplier(id) {
    // Set Global Context for File Operations
    window.currentActiveProviderId = id;

    // Buscar datos completos (Optimización: buscar en cache local si existe, o fetch)
    let supplier = currentSuppliers.find(s => s.id === id);

    if (!supplier) {
        // Fetch on demand si no está en cache
        reportDisplay.innerHTML = `<div class="flex items-center justify-center h-full text-blue-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i> Cargando ficha...</div>`;
        lucide.createIcons();
        const { data } = await supabaseClient.from('proveedores').select('*').eq('id', id).single();
        supplier = data;
    }

    if (!supplier) {
        reportDisplay.innerHTML = '<div class="text-red-500">Proveedor no encontrado</div>';
        return;
    }

    // Renderizar Ficha Técnica
    reportDisplay.innerHTML = `
        <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 p-2">
            <!--Header Ficha-->
            <div class="flex justify-between items-start mb-8 border-b border-slate-800 pb-6">
                <div>
                    <div class="flex items-center gap-3 mb-2">
                        <!-- Back Button -->
                        <button onclick="showSuppliersList()" class="mr-2 text-slate-500 hover:text-white hover:bg-slate-800/50 p-1 rounded-full transition-colors" title="Volver al Listado">
                            <i data-lucide="arrow-left" class="w-6 h-6"></i>
                        </button>

                        <!-- Status Dot (Relocated) -->
                        <div class="w-3 h-3 rounded-full ${supplier.activo ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'}"></div>
                        
                        <h2 class="text-3xl font-bold text-white tracking-tight">${supplier.nombre}</h2>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">${supplier.categoria_display || 'GENERAL'}</span>
                    </div>
                    <div class="flex items-center gap-4 text-slate-500 text-xs font-mono pl-6">
                        <span>CUIT: <span class="text-slate-400">${supplier.cuit || 'N/A'}</span></span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.openCuentaCorriente('${supplier.id}', '${supplier.nombre.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/50 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-900/20">
                        <i data-lucide="wallet" class="w-3 h-3"></i> CUENTA CORRIENTE
                    </button>
                    <button onclick="openManualEntryModal('${supplier.id}', '${supplier.nombre.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/50 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20">
                        <i data-lucide="plus-circle" class="w-3 h-3"></i> CARGA MANUAL
                    </button>
                    <button onclick="editSupplier('${supplier.id}')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 rounded-lg text-xs font-bold transition-all flex items-center gap-2 group">
                        <i data-lucide="pencil" class="w-3 h-3 group-hover:text-white transition-colors"></i> EDITAR
                    </button>
                </div>
            </div>

            <!--Grid de Información-->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <!-- Columna 1: Operativa e Infra -->
                <div class="space-y-6">
                    
                    <!-- Drive (Ahora sube al tope de col 1) -->


            <!-- Drive -->
            <div class="p-6 bg-slate-900/30 rounded-xl border border-slate-800/50">
                <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <i data-lucide="hard-drive" class="w-3 h-3"></i> Digital Assets
                </h3>
                <div class="space-y-3">
                ${supplier.drive_folder_id
            ? `
                   <div onclick="exploreSupplierFiles('${supplier.drive_folder_prices_id || supplier.drive_folder_id}', 'listas')" class="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800 group hover:border-blue-500/30 transition-colors cursor-pointer">
                       <div class="flex items-center gap-3">
                           <div class="p-2 bg-slate-900 rounded-md text-blue-500">
                               <i data-lucide="${supplier.drive_folder_prices_id ? 'layers' : 'folder'}" class="w-5 h-5"></i>
                           </div>
                           <div class="flex flex-col">
                               <span class="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                                   ${supplier.drive_folder_prices_id ? 'Listas de Precios' : 'Carpeta Vinculada'}
                               </span>
                               <span class="text-[9px] text-slate-600 font-mono">
                                   ID: ${(supplier.drive_folder_prices_id || supplier.drive_folder_id).substring(0, 8)}...
                               </span>
                           </div>
                       </div>
                       <div class="flex items-center gap-2">
                           ${supplier.drive_folder_extracted_id ? '<span title="Extracciones Activas" class="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"></span>' : ''}
                           <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors"></i>
                       </div>
                   </div>`
            : `<div class="text-xs text-slate-600 italic py-2">Sin Listas de Precios vinculadas</div>`
        }
        
        ${supplier.drive_folder_facturas_id ? `
                   <div onclick="exploreSupplierFiles('${supplier.drive_folder_facturas_id}', 'facturas')" class="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800 group hover:border-amber-500/30 transition-colors cursor-pointer">
                       <div class="flex items-center gap-3">
                           <div class="p-2 bg-slate-900 rounded-md text-amber-500">
                               <i data-lucide="receipt" class="w-5 h-5"></i>
                           </div>
                           <div class="flex flex-col">
                               <span class="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                                   Bandeja de Facturas
                               </span>
                               <span class="text-[9px] text-slate-600 font-mono">
                                   ID: ${supplier.drive_folder_facturas_id.substring(0, 8)}...
                               </span>
                           </div>
                       </div>
                       <div class="flex items-center gap-2">
                           <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors"></i>
                       </div>
                   </div>` : `
                   <div id="btnCrearFacturas_${supplier.id}" onclick="event.stopPropagation(); window.provisionFacturasFolder('${supplier.id}', '${supplier.drive_folder_id || ''}')" class="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-amber-900/50 group hover:border-amber-500/50 transition-colors cursor-pointer">
                       <div class="flex items-center gap-3">
                           <div class="p-2 bg-slate-900 rounded-md text-slate-500 group-hover:text-amber-500 transition-colors">
                               <i data-lucide="plus-circle" class="w-5 h-5"></i>
                           </div>
                           <div class="flex flex-col">
                               <span class="text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
                                   Habilitar Bandeja de Facturas
                               </span>
                               <span class="text-[9px] text-slate-600 font-mono group-hover:text-amber-400/70">
                                   Clic para provisionar infraestructura
                               </span>
                           </div>
                       </div>
                   </div>`}
               </div>
            </div>
        </div>

        <!-- Columna 2: Contacto y Datos -->
        <div class="p-6 bg-slate-900/30 rounded-xl border border-slate-800/50 h-full">
            <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <i data-lucide="user-check" class="w-3 h-3"></i> Contacto y Logística
            </h3>

            <div class="space-y-6">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <span class="block text-[9px] text-slate-500 uppercase mb-1">Responsable</span>
                        <span class="text-sm text-slate-300 font-medium border-b border-transparent hover:border-blue-500/50 transition-colors inline-block pb-0.5">
                            ${supplier.contacto_nombre || '-'}
                        </span>
                    </div>
                    <div>
                        <span class="block text-[9px] text-slate-500 uppercase mb-1">Teléfono</span>
                        <span class="text-sm text-slate-300 font-mono">${supplier.contacto_telefono || '-'}</span>
                    </div>
                </div>

                <div>
                    <span class="block text-[9px] text-slate-500 uppercase mb-1">Email Corporativo</span>
                    <a href="mailto:${supplier.contacto_email}" class="flex items-center gap-2 text-sm text-blue-400/80 hover:text-blue-400 transition-colors">
                        <i data-lucide="mail" class="w-3 h-3"></i>
                        ${supplier.contacto_email || '-'}
                    </a>
                </div>

                <div class="pt-4 border-t border-slate-800/50">
                    <span class="block text-[9px] text-slate-500 uppercase mb-1">Dirección Operativa</span>
                    <div class="flex items-start gap-2 text-slate-400 text-xs">
                        <i data-lucide="map-pin" class="w-3 h-3 mt-0.5 shrink-0 text-slate-600"></i>
                        ${supplier.direccion || 'Sin dirección registrada'}
                    </div>
                </div>
                        </div>
        </div>
    </div>
    
    <!-- [NEW] Visor Local de Artículos -->
    <div class="mt-6 p-6 bg-slate-900/40 rounded-xl border border-slate-800/50">
        <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <i data-lucide="layout-list" class="w-3 h-3 text-blue-400"></i> Catálogo Activo del Proveedor
            </h3>
            <div class="relative w-64">
                <i data-lucide="search" class="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500"></i>
                <input type="text" id="catalogoSearchInput" onkeyup="window.filterCatalogoActivo()" placeholder="Buscar por SKU o descripción..." class="w-full bg-slate-950/50 border border-slate-700/50 text-slate-300 text-xs rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-inner transition-all placeholder-slate-600">
            </div>
        </div>
        <div class="overflow-y-auto max-h-[300px] custom-scrollbar rounded-lg border border-slate-800/50 bg-slate-950/30 relative">
            <table class="w-full text-left border-collapse" id="catalogoActivoTable">
                <thead class="sticky top-0 bg-slate-900/90 backdrop-blur border-b border-slate-800 z-10 shadow-sm">
                    <tr>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Cód / SKU</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Descripción</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">P. Neto</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">P. Promo</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Origen</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody id="supplierLocalGrid" class="divide-y divide-slate-800/50 text-xs text-slate-300">
                    <tr>
                        <td colspan="4" class="p-8 text-center text-slate-500 flex-col items-center gap-2 hidden">
                            <i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500"></i>
                            <span class="text-[10px] uppercase tracking-widest">Cargando catálogo operativo...</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
        </div >
    `;
    lucide.createIcons();
    if (window.loadSupplierArticles) window.loadSupplierArticles(supplier.id);
}

async function loadProveedores() {
    reportDisplay.innerHTML = `<div class="flex items-center justify-center h-full text-blue-400">
    <i data-lucide="loader-2" class="w-8 h-8 animate-spin mr-2"></i>
                                    Cargando proveedores...
                                </div > `;
    lucide.createIcons();

    const { data, error } = await supabaseClient
        .from('proveedores')
        .select('*, categorias_proveedores(nombre)')
        .order('nombre', { ascending: true }); // Orden alfabético

    if (error) {
        console.error("Error al cargar proveedores:", error);
        reportDisplay.innerHTML = `<div class="text-red-500">Error al cargar proveedores: ${error.message}</div>`;
        return;
    }

    // [TICKET #038] Mapeo resolutivo de FK
    if (data) {
        data.forEach(s => {
            s.categoria_display = (s.categorias_proveedores && s.categorias_proveedores.nombre) ? s.categorias_proveedores.nombre : 'GENERAL';
        });
    }

    // 🔥 CAMBIO CRÍTICO AQUÍ: Usamos window.currentSuppliers
    window.currentSuppliers = data;

    // Actualizar métricas reales
    realMetrics.proveedoresCount = data.length;

    if (data.length === 0) {
        reportDisplay.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-slate-500" >
                <i data-lucide="inbox" class="w-12 h-12 mb-4 opacity-50"></i>
                <p class="text-sm">No hay proveedores registrados.</p>
                <button onclick="openSupplierModal()" class="mt-4 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs transition-colors border border-blue-500/30">
                    + Dar de Alta
                </button>
            </div >
    `;
    } else {
        // Renderizar la tabla de proveedores
        let tableHtml = `
    <div class="flex justify-between items-center mb-4" >
                <h3 class="text-xl font-bold text-white">Listado de Proveedores</h3>
                <span class="text-xs text-slate-500 font-mono">${data.length} REGISTROS</span>
            </div >
    <div class="overflow-x-auto custom-scrollbar rounded-xl border border-slate-800">
        <table class="min-w-full divide-y divide-slate-800 bg-slate-900/40">
            <thead class="bg-slate-950/50">
                <tr>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Empresa</th>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden md:table-cell">CUIT</th>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Categoría</th>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden md:table-cell">Contacto</th>
                    <th class="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/50">
                `;
        data.forEach(supplier => {
            tableHtml += `
                <tr class="hover:bg-blue-600/5 transition-colors group">
                    <td class="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-800/50 transition-colors" onclick="showSingleSupplier('${supplier.id}')" title="Click para ver ficha">
                        <div class="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">${supplier.nombre}</div>
                        <div class="text-[10px] text-slate-500 md:hidden">${supplier.cuit || ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-400 font-mono hidden md:table-cell">${supplier.cuit || '-'}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                            ${supplier.categoria_display || 'GENERAL'}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                        <div class="text-xs text-slate-300">${supplier.contacto_nombre || '-'}</div>
                        <div class="text-[10px] text-slate-500">${supplier.contacto_email || ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div class="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button onclick="editSupplier('${supplier.id}')" class="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-transparent hover:border-blue-500/30" title="Editar">
                                <i data-lucide="pencil" class="w-3 h-3"></i>
                            </button>
                            <button onclick="deleteSupplier('${supplier.id}', '${supplier.nombre}')" class="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/30" title="Eliminar">
                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tableHtml += `
            </tbody>
        </table>
    </div>
`;
        reportDisplay.innerHTML = tableHtml;
    }
    lucide.createIcons();
    realMetrics.proveedoresCount = data.length;
}

const getMetricsContext = () => {
    return {
        proveedores: `${realMetrics.proveedoresCount} registrados en base de datos.`,
        inversion: realMetrics.inversion,
        deuda: realMetrics.deuda
    };
};

// LÓGICA MODAL PROVEEDORES + SUPABASE INTEGRATION

function openSupplierModal(isEdit = false) {
    const modal = document.getElementById('supplierModal');
    const form = document.getElementById('supplierForm');
    const modalTitle = modal.querySelector('h2');
    const modalSubtitle = modal.querySelector('p');
    const modalSubmitBtn = form.querySelector('button[type="submit"]');

    modal.classList.remove('hidden');
    // loadDriveFolders deprecated in favor of auto-provisioning

    if (!isEdit) {
        // Modo Alta
        editingSupplierId = null;
        form.reset();
        if (modalTitle) modalTitle.innerText = "Registro de Proveedor";
        if (modalSubtitle) modalSubtitle.innerText = "Alta de Entidad Operativa";
        if (modalSubmitBtn) {
            modalSubmitBtn.innerText = "Registrar Proveedor";
            modalSubmitBtn.classList.replace('bg-emerald-600', 'bg-blue-600');
        }

        // Reset Provisioning UI
        resetProvisioningUI();

        // [TICKET #037] Reset UI Validations
        const cuitInput = document.getElementById('supplierCuitInput');
        const errorMsg = document.getElementById('cuitErrorMsg');
        const submitBtn = document.getElementById('supplierSubmitBtn');
        if (cuitInput) {
            cuitInput.classList.remove('border-red-500', 'text-red-400');
            cuitInput.classList.add('border-slate-800');
        }
        if (errorMsg) errorMsg.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = true; // Por defecto deshabilitado en Alta

    } else {
        // Modo Edición
        if (modalTitle) modalTitle.innerText = "Editar Proveedor";
        if (modalSubtitle) modalSubtitle.innerText = "Modificación de Datos Maestros";
        if (modalSubmitBtn) {
            modalSubmitBtn.innerText = "Guardar Cambios";
            modalSubmitBtn.classList.remove('bg-blue-600');
            modalSubmitBtn.classList.add('bg-emerald-600');
        }

        // UI Provisioning Edición
        setTimeout(() => {
            const driveDisplay = document.getElementById('driveFolderDisplay');
            const statusContainer = document.getElementById('driveStatusContainer');
            if (document.getElementById('h_rootId').value) {
                driveDisplay.value = "Infraestructura Vinculada";
                statusContainer.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4 text-green-500"></i>';
                lucide.createIcons();
            }
        }, 100);
    }
}

function closeSupplierModal() {
    const modal = document.getElementById('supplierModal');
    const form = document.getElementById('supplierForm');
    const modalSubmitBtn = form.querySelector('button[type="submit"]');

    modal.classList.add('hidden');
    form.reset();
    editingSupplierId = null;
    if (modalSubmitBtn) {
        modalSubmitBtn.classList.remove('bg-emerald-600');
        modalSubmitBtn.classList.add('bg-blue-600');
    }
}

function editSupplier(id) {
    const supplier = currentSuppliers.find(s => s.id === id);
    if (!supplier) return;

    const form = document.getElementById('supplierForm');
    editingSupplierId = id;

    // Rellenar formulario inputs
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        const key = input.name;
        if (supplier[key] !== undefined) {
            if (input.type === 'checkbox') {
                input.checked = supplier[key];
            } else {
                input.value = supplier[key];
            }
        }
    });

    const afipContainer = document.getElementById('afipDataContainer');
    if (afipContainer) {
        if (supplier['afip_razon_social'] || supplier['afip_domicilio'] || supplier['afip_estado']) {
            afipContainer.classList.remove('hidden');
        } else {
            afipContainer.classList.add('hidden');
        }
    }

    openSupplierModal(true);
    
    // [TICKET #037] Forzar validación tras cargar datos
    validateFormState();
}


// --- SISTEMA DE APROVISIONAMIENTO DRIVE (AUTO-PILOT) ---

function resetProvisioningUI() {
    const driveDisplay = document.getElementById('driveFolderDisplay');
    const statusContainer = document.getElementById('driveStatusContainer');
    const helpText = document.getElementById('driveHelpText');

    if (!driveDisplay) return;
    driveDisplay.value = "";
    driveDisplay.classList.remove('text-green-400', 'font-bold', 'text-red-400');
    driveDisplay.classList.add('text-slate-400');
    statusContainer.innerHTML = '<i data-lucide="circle-dashed" class="w-4 h-4 text-slate-700"></i>';
    helpText.innerText = "Creación opcional. Requiere ingresar el Nombre primero.";
    helpText.className = "text-[9px] text-slate-600 ml-1 mt-1";

    document.getElementById('h_rootId').value = "";
    document.getElementById('h_pricesId').value = "";
    document.getElementById('h_extractedId').value = "";
    document.getElementById('h_facturasId').value = "";
    lucide.createIcons();
}

async function triggerProvisioning() {
    const form = document.getElementById('supplierForm');
    const nameInput = form.querySelector('input[name="nombre"]');
    const driveDisplay = document.getElementById('driveFolderDisplay');
    const statusContainer = document.getElementById('driveStatusContainer');
    const helpText = document.getElementById('driveHelpText');

    const name = nameInput.value.trim();

    // Permitir aprovisionamiento si no existe rootId, independientemente de si es alta nueva o edición.
    if (name.length < 3) {
        alert("Por favor, ingrese un Nombre / Empresa válido (mínimo 3 caracteres) antes de crear la infraestructura.");
        return;
    }
    if (document.getElementById('h_rootId').value) return; // Ya aprovisionado

    // UI Loading
    driveDisplay.value = "Conectando con Drive...";
    driveDisplay.classList.add('animate-pulse');
    statusContainer.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-500"></i>';
    helpText.innerText = "Creando carpetas seguras...";
    lucide.createIcons();

    try {
        // Usar backendBaseUrl global
        const baseUrl = backendBaseUrl;
        const response = await fetch(`${baseUrl}/api/files/drive/provision-vendor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorName: name })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        // Success Bindings
        document.getElementById('h_rootId').value = result.data.rootId;
        document.getElementById('h_pricesId').value = result.data.pricesId;
        document.getElementById('h_extractedId').value = result.data.extractedId;
        document.getElementById('h_facturasId').value = result.data.facturasId;

        // UI Success
        driveDisplay.value = `Vinculado: ${result.data.rootId.substring(0, 8)}...`;
        driveDisplay.classList.remove('animate-pulse', 'text-slate-400');
        driveDisplay.classList.add('text-green-400', 'font-bold');

        statusContainer.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4 text-green-500"></i>';
        helpText.innerText = "Infraestructura certificada: Raíz + Precios + Extracción.";
        helpText.className = "text-[9px] text-green-500/80 ml-1 mt-1 font-bold";
        lucide.createIcons();

    } catch (e) {
        console.error("Provisioning Error:", e);
        driveDisplay.value = "Error de Conexión";
        statusContainer.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 text-red-500"></i>';
        helpText.innerText = "Error: " + e.message;
        helpText.className = "text-[9px] text-red-500 ml-1 mt-1";
        lucide.createIcons();
    }
}

window.provisionFacturasFolder = async function(providerId, rootId) {
    if (!rootId || rootId === 'null' || rootId === 'undefined') {
        const btn = document.getElementById(`btnCrearFacturas_${providerId}`);
        if (btn) btn.innerHTML = '<div class="p-3 text-xs text-amber-500 animate-pulse font-bold tracking-widest uppercase">Creando Base...</div>';
        
        try {
            const baseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            const supplier = window.currentSuppliers.find(s => s.id === providerId);
            const response = await fetch(`${baseUrl}/api/files/drive/provision-vendor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorName: supplier.nombre })
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            
            // Update Supabase
            const { error } = await supabaseClient
                .from('proveedores')
                .update({ 
                    drive_folder_id: result.data.rootId,
                    drive_folder_prices_id: result.data.pricesId,
                    drive_folder_extracted_id: result.data.extractedId,
                    drive_folder_facturas_id: result.data.facturasId
                })
                .eq('id', providerId);
                
            if (error) throw error;
            
            // Update local cache
            if (supplier) {
                supplier.drive_folder_id = result.data.rootId;
                supplier.drive_folder_prices_id = result.data.pricesId;
                supplier.drive_folder_extracted_id = result.data.extractedId;
                supplier.drive_folder_facturas_id = result.data.facturasId;
            }
            
            if (typeof showSingleSupplier === 'function') showSingleSupplier(providerId);
        } catch (e) {
            alert("Error al provisionar infraestructura base: " + e.message);
            if (typeof showSingleSupplier === 'function') showSingleSupplier(providerId);
        }
        return;
    }

    const btn = document.getElementById(`btnCrearFacturas_${providerId}`);
    if (btn) btn.innerHTML = '<div class="p-3 text-xs text-amber-500 animate-pulse font-bold tracking-widest uppercase">Creando...</div>';
    
    try {
        const baseUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${baseUrl}/api/files/drive/provision-facturas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rootId })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        // Update Supabase
        const { error } = await supabaseClient
            .from('proveedores')
            .update({ drive_folder_facturas_id: result.data.facturasId })
            .eq('id', providerId);
            
        if (error) throw error;
        
        // Update local cache
        const supplier = window.currentSuppliers.find(s => s.id === providerId);
        if (supplier) supplier.drive_folder_facturas_id = result.data.facturasId;
        
        // Refresh view
        if (typeof showSingleSupplier === 'function') {
            showSingleSupplier(providerId);
        }
    } catch (e) {
        alert("Error al habilitar bandeja: " + e.message);
        if (typeof showSingleSupplier === 'function') {
            showSingleSupplier(providerId); // Reset UI
        }
    }
}


// Función Eliminar
async function deleteSupplier(id, nombre) {
    if (!confirm(`¿Está seguro que desea eliminar a "${nombre}" ? `)) return;

    try {
        const { error } = await supabaseClient
            .from('proveedores')
            .delete()
            .eq('id', id);

        if (error) throw error;

        renderChatMessage('LAMDA_AI', `🗑️ Proveedor "${nombre}" eliminado.`);
        loadProveedores(); // Recargar

    } catch (error) {
        console.error("Error delete:", error);
        alert(error.message);
    }
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('supplierForm');
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
    btn.disabled = true;
    lucide.createIcons();

    // Recolección de datos
    const formData = new FormData(form);
    const supplierData = Object.fromEntries(formData.entries());

    // [TICKET #037] Defensa en Profundidad
    if (!supplierData.nombre || supplierData.nombre.trim().length < 3) {
        alert("El Nombre / Empresa debe tener al menos 3 caracteres.");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }
    if (supplierData.cuit && supplierData.cuit.trim().length > 0 && !validarCuit(supplierData.cuit)) {
        alert("El CUIT ingresado es inválido matemáticamente.");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    // Fix Checkbox
    supplierData.activo = !!formData.get('activo');

    // [TICKET #036] Tolerancia a Nulos en Infraestructura Drive
    if (!supplierData.drive_folder_id) supplierData.drive_folder_id = null;
    if (!supplierData.drive_folder_prices_id) supplierData.drive_folder_prices_id = null;
    if (!supplierData.drive_folder_extracted_id) supplierData.drive_folder_extracted_id = null;
    if (!supplierData.drive_folder_facturas_id) supplierData.drive_folder_facturas_id = null;

    try {
        let error = null;

        if (editingSupplierId) {
            // UPDATE
            const response = await supabaseClient
                .from('proveedores')
                .update(supplierData)
                .eq('id', editingSupplierId);
            error = response.error;
        } else {
            // INSERT
            const response = await supabaseClient
                .from('proveedores')
                .insert([supplierData]);
            error = response.error;
        }

        if (error) throw error;

        // Éxito
        closeSupplierModal();

        const actionVerb = editingSupplierId ? "actualizado" : "registrado";
        renderChatMessage('LAMDA_AI', `✅ Proveedor "${supplierData.nombre}" ${actionVerb} correctamente.`);

        // Recargar Lista
        loadProveedores();

    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}


// --- LÓGICA DE INTERACCIÓN DE CHAT MEJORADA ---

function sweepWorkspace() {
    if (reportDisplay.innerHTML.trim() === "") return;
    reportDisplay.classList.add('workspace-sweep');
    setTimeout(() => {
        reportDisplay.innerHTML = '';
        reportDisplay.classList.remove('workspace-sweep');
    }, 600);
}

function toggleFocusMode(active) {
    document.body.classList.toggle('focus-active', active);
    // Solo si desactivamos explícitamente y no estamos grabando
    if (!active && !isRecording) terminalInput.blur();
}

// 2. MOTOR DE VOZ
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let isRecording = false;
let recognition = null;

if (typeof SpeechRecognition !== 'undefined') {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isRecording = true;
        toggleFocusMode(true);
        micBtn.classList.add('mic-active');
        micBtn.innerHTML = '<i data-lucide="square" class="w-5 h-5 fill-current"></i>';
        lucide.createIcons();
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }

        if (finalTranscript) {
            const separator = terminalInput.value.length > 0 ? " " : "";
            terminalInput.value += separator + finalTranscript;
            terminalInput.dispatchEvent(new Event('input'));
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            try { recognition.start(); } catch (e) { }
        } else {
            micBtn.classList.remove('mic-active');
            micBtn.innerHTML = '<i data-lucide="mic" class="w-5 h-5"></i>';
            lucide.createIcons();
            const sendBtn = document.getElementById('sendBtn');
            if (sendBtn) sendBtn.disabled = false;
        }
    };
}

function toggleVoice() {
    if (!recognition) return alert("Navegador no soporta voz.");
    if (isRecording) {
        isRecording = false;
        recognition.stop();
    } else {
        recognition.start();
    }
}

// 3. ENVÍO
async function sendToAI() {
    const text = terminalInput.value.trim();
    if (!text) return;

    // Reset UI
    terminalInput.value = '';
    terminalInput.style.height = '52px';
    toggleFocusMode(false);

    renderChatMessage('GERENCIA', text); // Rol Usuario
    aiLoader.classList.remove('hidden');
    appendHistory('GERENCIA', text);

    try {
        // Llamada a TaskAction o Gemini
        // We will stick to the basic Gemini call logic for now, or route through taskAction specific checks
        // The original called callGemini directly in sendToAI but also had taskAction. 
        // We will call callGemini logic here or assume 'text' is the prompt.
        // But wait, the original sendToAI called callGemini directly.

        const response = await callGemini(text);
        renderChatMessage('LAMDA_AI', response);
        appendHistory('LAMDA_AI', response);

    } catch (e) {
        console.error("Gemini Error:", e);
        renderChatMessage('SISTEMA', '⚠️ DATA_LINK_FAILURE: ' + e.message);
    } finally {
        aiLoader.classList.add('hidden');
    }
}

function renderChatMessage(role, text) {
    if (!reportDisplay) reportDisplay = document.getElementById('reportDisplay');
    const isUser = role === 'GERENCIA';

    const html = `
        <div class="message-entrance ${isUser ? 'flex flex-col items-end' : ''} mb-6">
            <div class="flex items-center gap-3 mb-2 opacity-30">
                <div class="h-[1px] w-8 bg-blue-500"></div>
                <span class="text-[7px] font-mono tracking-[0.4em] uppercase text-blue-400">${role}</span>
            </div>
            <div class="p-7 rounded-[2.5rem] max-w-[88%] md:max-w-[80%] shadow-2xl relative overflow-hidden transition-all duration-500 ${isUser ? 'bg-blue-600/10 border border-blue-500/20 text-white rounded-tr-none' : 'bg-slate-950/60 border border-slate-800 text-blue-50 rounded-tl-none'}">
                <div class="absolute inset-0 bg-gradient-to-br ${isUser ? 'from-blue-500/10' : 'from-slate-800/20'} to-transparent"></div>
                <div class="text-[16px] leading-[1.7] whitespace-pre-wrap relative z-10 font-medium tracking-tight font-sans">${text}</div>
            </div>
        </div>
    `;

    reportDisplay.insertAdjacentHTML('beforeend', html);
    requestAnimationFrame(() => {
        reportDisplay.scrollTop = reportDisplay.scrollHeight;
    });
}

function toggleDropdown(dropdownId, containerId) {
    const dropdown = document.getElementById(dropdownId);
    const container = document.getElementById(containerId);

    const allDropdowns = ['tasksDropdown', 'infoDropdown', 'chartsDropdown', 'listsDropdown', 'settingsDropdown'];
    const allContainers = ['tasksMenuContainer', 'infoMenuContainer', 'chartsMenuContainer', 'listsMenuContainer', 'settingsMenuContainer'];

    allDropdowns.forEach((id, index) => {
        if (id !== dropdownId) {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
            const cont = document.getElementById(allContainers[index]);
            if (cont) cont.classList.remove('menu-open');
        }
    });

    dropdown.classList.toggle('hidden');
    container.classList.toggle('menu-open');
}

async function taskAction(taskName) {
    if (taskName && taskName.toLowerCase().includes('alta de proveedor')) {
        openSupplierModal();
        renderChatMessage('SISTEMA', 'Abriendo formulario de alta...');
        return;
    }

    aiLoader.classList.remove('hidden');
    const metrics = getMetricsContext();
    const prompt = `Usuario solicita: "${taskName}".Contexto: Proveedores ${metrics.proveedores}, Inversión ${metrics.inversion}, Deuda ${metrics.deuda}. Genera un informe táctico corto.`;

    renderChatMessage('GERENCIA', `Ejecutar comando: ${taskName} `);

    const sysPrompt = (typeof CONFIG !== 'undefined') ? CONFIG.PROMPT_DASHBOARD : "Eres la IA de gestión.";

    try {
        const response = await callGemini(prompt, sysPrompt);
        renderChatMessage('LAMDA_AI', response);
        appendHistory('SISTEMA', `Acción: ${taskName}`);
    } catch (e) {
        renderChatMessage('SISTEMA', 'Error ejecutando acción.');
    } finally {
        aiLoader.classList.add('hidden');
    }
}

async function callGemini(prompt, sysInstr = null) {
    const finalSysInstr = sysInstr || ((typeof CONFIG !== 'undefined') ? CONFIG.PROMPT_DASHBOARD : "Eres el analista de LAMDA.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: finalSysInstr }] }
    };
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.ok) {
            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta del núcleo IA.";
        }
        return "Error en la respuesta del satélite IA.";
    } catch (e) { return "Error fatal de conexión."; }
}

function appendHistory(role, text) {
    if (!historyContent) return;
    const div = document.createElement('div');
    div.className = "mb-4";
    div.innerHTML = `<div class="text-[9px] font-bold mb-1 ${role === 'GERENCIA' ? 'text-slate-500' : 'text-blue-500'}">[${new Date().toLocaleTimeString()}] ${role}</div>
                     <div class="p-3 rounded-lg border ${role === 'GERENCIA' ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-blue-600/5 border-blue-500/20 text-blue-100'}">${text}</div>`;
    historyContent.appendChild(div);
    historyContent.scrollTop = historyContent.scrollHeight;
}

function toggleHistory() {
    const h = document.getElementById('historyOverlay');
    if (h) h.classList.toggle('hidden');
}

function updateTime() {
    const now = new Date();
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const day = now.getDate();
    const year = now.getFullYear();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const el = document.getElementById('systemTime');
    if (el) el.innerText = `${day}_${months[now.getMonth()]}_${year}_${h}:${m}`;
}

// BINDINGS GLOBALES (Para onclicks en HTML y compatibilidad)
window.initSystem = initSystem;
window.exploreSupplierFiles = exploreSupplierFiles;
window.handleFileClick = handleFileClick;
window.handleProveedoresClick = handleProveedoresClick;
window.loadSuppliersSidebar = loadSuppliersSidebar;
window.loadProveedores = loadProveedores;
window.showSuppliersList = showSuppliersList;
window.showSingleSupplier = showSingleSupplier;
window.openSupplierModal = openSupplierModal;
window.closeSupplierModal = closeSupplierModal;
window.editSupplier = editSupplier;
window.triggerProvisioning = triggerProvisioning;
window.deleteSupplier = deleteSupplier;
window.sweepWorkspace = sweepWorkspace;
window.toggleVoice = toggleVoice;
window.sendToAI = sendToAI;
window.toggleDropdown = toggleDropdown;
window.taskAction = taskAction;
window.toggleHistory = toggleHistory;
window.toggleHistory = toggleHistory;
window.currentActiveProviderId = null; // Inicializar

// EXPOSURE OF STATE FOR LEGACY HMTL (Viewer/Mapping Phase 3 dependency)
window.getSupabaseClient = () => supabaseClient;
window.getCurrentSuppliers = () => currentSuppliers;
// Direct access if needed, though getters are safer:
window.supabaseClient = supabaseClient; // Will be null until init
// We need to update this assignment inside initSystem too if it changes reference, 
// but since it's an object created once, `window.supabaseClient` needs to be set AFTER createClient.

// Start Timer
setInterval(updateTime, 1000);
updateTime();

// Auto-boot if document ready (or wait)
// We call initSystem from module end? No, HTML handles entry point usually, but old pattern was auto-run.
// Let's attach to DOMContentLoaded to be safe.
document.addEventListener('DOMContentLoaded', () => {
    // initSystem will be called manually or here? 
    // HTML had `initSystem()` call in script.
    initSystem();
});

// =============================================================================
// [TICKET #037] MOTOR DE VALIDACIÓN MÓDULO 11 Y ESTADO UI
// =============================================================================
function validarCuit(cuit) {
    const raw = cuit.replace(/[^0-9]/g, '');
    if (raw.length === 0) return true; // Tolerancia a nulos
    if (raw.length !== 11) return false;

    const cuitPre = raw.substring(0, 2);
    const cuitDig = parseInt(raw.substring(10, 11));
    const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
    
    if (!validPrefixes.includes(cuitPre)) return false;

    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(raw[i]) * weights[i];
    }
    
    let calculated = 11 - (sum % 11);
    if (calculated === 11) calculated = 0;
    if (calculated === 10) return false; // CUIT inválido matemáticamente
    
    return calculated === cuitDig;
}

window.validarCuit = validarCuit; // Expose just in case

function validateFormState() {
    const nameInput = document.getElementById('supplierNameInput');
    const cuitInput = document.getElementById('supplierCuitInput');
    const submitBtn = document.getElementById('supplierSubmitBtn');
    const errorMsg = document.getElementById('cuitErrorMsg');

    if (!nameInput || !cuitInput || !submitBtn) return;

    const nameValid = nameInput.value.trim().length >= 3;
    const cuitValid = validarCuit(cuitInput.value);

    // Feedback visual CUIT
    if (cuitInput.value.trim().length > 0 && !cuitValid) {
        cuitInput.classList.add('border-red-500', 'text-red-400');
        cuitInput.classList.remove('border-slate-800');
        if (errorMsg) errorMsg.classList.remove('hidden');
    } else {
        cuitInput.classList.remove('border-red-500', 'text-red-400');
        cuitInput.classList.add('border-slate-800');
        if (errorMsg) errorMsg.classList.add('hidden');
    }

    submitBtn.disabled = !(nameValid && cuitValid);
}

// =============================================================================
// [TICKET #038] GESTIÓN DINÁMICA DE CATEGORÍAS (CRUD)
// =============================================================================
window.categoriasMaestras = [];

async function loadCategorias() {
    const select = document.getElementById('supplierCategoriaSelect');
    if (!select) return;

    try {
        const { data, error } = await supabaseClient
            .from('categorias_proveedores')
            .select('*')
            .order('nombre', { ascending: true });

        if (error) throw error;

        window.categoriasMaestras = data || [];
        renderSelectCategorias(select);
        renderListaCategoriasModal();

    } catch (error) {
        console.error("Error cargando categorías:", error);
        select.innerHTML = '<option value="">Error al cargar rubros</option>';
    }
}

function renderSelectCategorias(selectElement) {
    // Preservar la selección actual si existe
    const currentValue = selectElement.value;
    
    let html = '<option value="" class="bg-slate-900">Seleccionar rubro...</option>';
    window.categoriasMaestras.forEach(cat => {
        html += `<option value="${cat.id}" class="bg-slate-900">${cat.nombre}</option>`;
    });
    html += '<option value="GESTIONAR_RUBROS" class="bg-slate-800 text-emerald-400 font-bold">[ + ] Gestionar Rubros</option>';
    
    selectElement.innerHTML = html;
    
    // Restaurar si el id todavía existe
    if (currentValue && window.categoriasMaestras.find(c => c.id === currentValue)) {
        selectElement.value = currentValue;
    } else {
        selectElement.value = "";
    }
}

function openCategoriasModal() {
    const modal = document.getElementById('categoriasModal');
    if (modal) modal.classList.remove('hidden');
    renderListaCategoriasModal();
}

function closeCategoriasModal() {
    const modal = document.getElementById('categoriasModal');
    if (modal) modal.classList.add('hidden');
    // Resetear select si se quedó en "GESTIONAR_RUBROS"
    const select = document.getElementById('supplierCategoriaSelect');
    if (select && select.value === 'GESTIONAR_RUBROS') {
        select.value = '';
    }
}

function renderListaCategoriasModal() {
    const container = document.getElementById('listaCategoriasContainer');
    if (!container) return;

    if (window.categoriasMaestras.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic py-2">No hay rubros registrados.</p>';
        return;
    }

    let html = '';
    window.categoriasMaestras.forEach(cat => {
        html += `
            <div class="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-800 rounded-lg group">
                <span class="text-xs font-bold text-slate-300">${cat.nombre}</span>
                <button type="button" onclick="deleteCategoria('${cat.id}')" class="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Eliminar">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

async function addCategoria() {
    const input = document.getElementById('nuevaCategoriaInput');
    const nombre = input.value.trim();
    if (!nombre) return;

    try {
        const { data, error } = await supabaseClient
            .from('categorias_proveedores')
            .insert([{ nombre }])
            .select();

        if (error) {
            if (error.code === '23505') throw new Error("El rubro ya existe.");
            throw error;
        }

        input.value = ''; // Limpiar
        await loadCategorias(); // Recargar globalmente
    } catch (error) {
        alert("Error al crear categoría: " + error.message);
    }
}

async function deleteCategoria(id) {
    try {
        const { error } = await supabaseClient
            .from('categorias_proveedores')
            .delete()
            .eq('id', id);

        if (error) {
            // Verificar constraint FK (error code 23503 usualmente en postgres)
            if (error.code === '23503') {
                throw new Error("No se puede eliminar la categoría porque hay proveedores asignados a ella.");
            }
            throw error;
        }

        await loadCategorias();
    } catch (error) {
        alert("Error al eliminar: " + error.message);
    }
}

window.openCategoriasModal = openCategoriasModal;
window.closeCategoriasModal = closeCategoriasModal;
window.addCategoria = addCategoria;
window.deleteCategoria = deleteCategoria;

// =============================================================================
// [TICKET #039] INTEGRACIÓN PADRÓN ARCA (ALCANCE 13)
// =============================================================================

async function consultarPadronARCA() {
    const cuitInput = document.getElementById('supplierCuitInput');
    const nameInput = document.getElementById('supplierNameInput');
    const btn = document.getElementById('btnBuscarARCA');
    const statusMsg = document.getElementById('arcaStatusMsg');
    const errorMsg = document.getElementById('cuitErrorMsg');

    if (!cuitInput) return;
    
    const cuit = cuitInput.value.replace(/[^0-9]/g, '');

    if (cuit.length !== 11 || !validarCuit(cuitInput.value)) {
        if (errorMsg) {
            errorMsg.innerText = 'Ingrese un CUIT válido (Módulo 11) antes de buscar.';
            errorMsg.classList.remove('hidden');
        }
        return;
    }

    // UI Estado de Carga
    const originalBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ARCA`;
    if (window.lucide) window.lucide.createIcons();
    
    if (statusMsg) statusMsg.classList.add('hidden');
    if (errorMsg) errorMsg.classList.add('hidden');

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}/api/arca/padron/${cuit}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Error en respuesta de ARCA');
        }

        // Autocompletar campos AFIP
        const afipContainer = document.getElementById('afipDataContainer');
        const afipRS = document.getElementById('afipRazonSocialInput');
        const afipDom = document.getElementById('afipDomicilioInput');
        const afipEstado = document.getElementById('afipEstadoInput');

        if (afipContainer) afipContainer.classList.remove('hidden');
        if (afipRS) afipRS.value = data.razonSocial;
        if (afipDom) afipDom.value = data.domicilio;
        if (afipEstado) afipEstado.value = data.estado;

        // Mostrar Éxito
        if (statusMsg) {
            statusMsg.innerHTML = `<i data-lucide="check-circle-2" class="w-3 h-3"></i> Validado en ARCA (${data.estado || 'OK'})`;
            statusMsg.classList.remove('hidden');
        }

        if (window.lucide) window.lucide.createIcons();

    } catch (error) {
        console.error('[ARCA] Error Frontend:', error);
        if (errorMsg) {
            errorMsg.innerText = error.message;
            errorMsg.classList.remove('hidden');
        }
    } finally {
        // Restaurar UI
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
        if (window.lucide) window.lucide.createIcons();
        if (typeof validateFormState === 'function') validateFormState();
    }
}

window.consultarPadronARCA = consultarPadronARCA;

// ==========================================
// V6.1: FLUJO DE CARGA MANUAL (DOBLE VÍA DATA-DRIVEN)
// ==========================================

window.lamdaMasterDictionaryCache = null;

window.buildManualEntryForm = async function(prefillData = null) {
    const container = document.getElementById('manualEntryDynamicContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="p-8 text-center text-slate-500"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500"></i><span class="text-xs">Cargando esquema...</span></div>';
    if(window.lucide) lucide.createIcons();

    // Precarga de memoria para Rubros Maestros
    if (!window.categoriasMaestras || window.categoriasMaestras.length === 0) {
        if (typeof window.loadCategorias === 'function') {
            await window.loadCategorias();
        }
    }

    // [FIX TICKET] Cargar Gestión Semántica de Rubros Maestros
    let rubrosMaestros = [];
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const resRubros = await fetch(`${backendUrl}/api/rubros`);
        const jsonRubros = await resRubros.json();
        if (jsonRubros.success) rubrosMaestros = jsonRubros.data || [];
    } catch (e) {
        console.error("Error cargando Gestión Semántica de Rubros:", e);
    }

    // REMOVED CACHE: Fetch dynamically every time to ensure reactivity to new fields (Incidencia B)
    let dict = [];
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/master-table/dictionary`);
        const json = await res.json();
        if (json.success) dict = json.data || [];
    } catch (e) {
        container.innerHTML = '<div class="text-red-400 text-sm text-center">Error al cargar diccionario maestro.</div>';
        return;
    }
    let html = '';

    const fieldsToRender = dict.filter(f => f.visible_en_manual);

    fieldsToRender.forEach(f => {
        const slug = f.nombre_campo.replace(/\s+/g, '_').toLowerCase();
        const typeStr = (f.tipo_dato || '').toLowerCase() === 'oferta' || (f.tipo_dato || '').toLowerCase() === 'precio' ? 'type="number" step="0.01"' : 'type="text"';
        const isCode = slug === 'codigo' || slug === 'sku';
        const value = prefillData && prefillData[slug] ? prefillData[slug] : '';
        const reqStr = f.es_requerido ? 'required' : '';

        let inputHtml = '';

        if (slug === 'rubro') {
            let options = '<option value="" class="bg-slate-900">Seleccionar Rubro Maestro...</option>';
            rubrosMaestros.forEach(cat => {
                const nombreRubro = cat.nombre_rubro || '';
                const isSelected = (String(value).trim().toUpperCase() === String(nombreRubro).trim().toUpperCase()) ? 'selected' : '';
                options += `<option value="${nombreRubro}" class="bg-slate-900" ${isSelected}>${nombreRubro}</option>`;
            });
            inputHtml = `<select ${reqStr} id="dyn_${slug}" name="${slug}" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50">${options}</select>`;
        } else if (slug === 'unidad') {
            let options = '<option value="" class="bg-slate-900">Seleccionar Unidad Validad...</option>';
            if (window.lamdaUnidadesValidadas) {
                // Normalizar valor precargado para evitar desajustes visuales y duplicados funcionales
                let normalValue = value ? String(value).trim() : '';
                if (normalValue) normalValue = normalValue.charAt(0).toUpperCase() + normalValue.slice(1).toLowerCase();

                Array.from(window.lamdaUnidadesValidadas).sort().forEach(u => {
                    const sel = (normalValue === u) ? 'selected' : '';
                    options += `<option value="${u}" class="bg-slate-900" ${sel}>${u}</option>`;
                });
            }
            inputHtml = `<select ${reqStr} id="dyn_${slug}" name="${slug}" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50">${options}</select>`;
        } else {
            inputHtml = `
            <div class="flex gap-2">
                <input ${typeStr} ${reqStr} id="dyn_${slug}" name="${slug}" class="w-full form-input bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50" value="${value}" placeholder="Ingrese ${f.nombre_campo}">
                ${isCode ? `<button type="button" onclick="window.generateFrontendSku && window.generateFrontendSku('dyn_${slug}')" class="bg-blue-900/30 hover:bg-blue-800/50 text-blue-400 border border-blue-500/30 px-3 rounded-xl transition-colors flex items-center justify-center shrink-0" title="Generar código automático"><i data-lucide="wand-2" class="w-4 h-4"></i></button>` : ''}
            </div>`;
        }

        html += `<div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">${f.nombre_campo}</label>
            ${inputHtml}
        </div>`;
    });

    container.innerHTML = html;
    if(window.lucide) lucide.createIcons();
};

window.generateFrontendSku = async function(inputId = 'dyn_codigo') {
    const providerId = document.getElementById('manualEntryProviderId').value;
    const descInput = document.getElementById('dyn_descripcion') || document.getElementById('dyn_descripción');
    const desc = descInput ? descInput.value : "SINDESCRIPCION";
    
    if (!providerId) {
        if(window.Swal) Swal.fire('Error', 'Falta el proveedor actual.', 'error');
        return;
    }
    
    // Hash SHA-256 en frontend
    const textToHash = providerId + "-" + desc.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(textToHash);
    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0,8).toUpperCase();
        
        const generatedSku = "LMD-MAN-" + hashHex;
        // TICKET #014: Reparación de selector dinámico para la Varita Mágica
        const skuInput = document.getElementById(inputId);
        skuInput.value = generatedSku;
        
        // Destello visual
        skuInput.classList.add('bg-blue-900/50', 'ring-2', 'ring-blue-500');
        setTimeout(() => skuInput.classList.remove('bg-blue-900/50', 'ring-2', 'ring-blue-500'), 500);
    } catch(e) {
        console.error("Crypto error:", e);
    }
};

window.loadSupplierArticles = async function(providerId) {
    const grid = document.getElementById('supplierLocalGrid');
    if (!grid) return;
    
    grid.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500"></i>Cargando...</td></tr>';
    if(window.lucide) lucide.createIcons();
    
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(backendUrl + '/api/master-table/operativa');
        if (res.ok) {
            const json = await res.json();
            const data = json.data || [];
            
            // [V6.1 FIX] Extracción dinámica de unidades gestionadas en la Tabla Maestra
            if (!window.lamdaUnidadesValidadas) window.lamdaUnidadesValidadas = new Set(['Unidad', 'Kilogramo', 'Litro', 'Gramo']);
            data.forEach(r => {
                const dm = r.datos_maestros || {};
                const u = dm.Unidad || dm.unidad || dm.UNIDAD;
                if (u && String(u).trim()) window.lamdaUnidadesValidadas.add(String(u).trim());
            });

            const localData = data.filter(r => r.proveedor_id === providerId);
            
            if (localData.length === 0) {
                grid.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 text-[11px] italic">No hay artículos cargados para este proveedor.</td></tr>';
                return;
            }
            
            // [FILTRADO DE VIGENCIA ESTRICTA] - Obtener la última fecha de extracción automática válida
            let maxTimestamp = 0;
            localData.forEach(r => {
                const dm = r.datos_maestros || {};
                const origen = dm._origen || dm.Origen_Sistema || 'Drive / Auto';
                const isManual = String(origen).toLowerCase().includes('manual');
                // Ignoramos manuales para el calculo del maxTimestamp, ya que no son parte del ciclo automático de ingesta
                if (!isManual && r.timestamp_extraccion) {
                    const ts = new Date(r.timestamp_extraccion).getTime();
                    if (ts > maxTimestamp) maxTimestamp = ts;
                }
            });
            
            // Función de filtrado para limpiar historiales obsoletos y bajas lógicas
            const filteredData = localData.filter(r => {
                const dm = r.datos_maestros || {};
                // Descartar Bajas explícitas
                if (dm._estado_delta === 'BAJA') return false;
                
                const origen = dm._origen || dm.Origen_Sistema || 'Drive / Auto';
                const isManual = String(origen).toLowerCase().includes('manual');
                
                if (isManual) return true; // Preservar ítems manuales inyectados
                
                // Si es automático, exigir que pertenezca a la última ingesta (tolerancia de 1 hora por asincronías)
                if (r.timestamp_extraccion && maxTimestamp > 0) {
                    const ts = new Date(r.timestamp_extraccion).getTime();
                    // Toleramos pequeña diferencia por si el lote tuvo delay
                    if (maxTimestamp - ts > 3600000) {
                        return false; 
                    }
                }
                return true;
            });
            
            if (filteredData.length === 0) {
                grid.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 text-[11px] italic">No hay artículos vigentes. Todo el historial es obsoleto o ha sido dado de baja.</td></tr>';
                return;
            }

            const formatPrice = (val) => {
                if (val === undefined || val === null || val === '') return '-';
                // Convert to string and clean all non-numeric chars except dot and comma
                let strVal = String(val).replace(/[^\d.,-]/g, '');
                
                // Identify decimal separator logically
                const lastDot = strVal.lastIndexOf('.');
                const lastComma = strVal.lastIndexOf(',');
                
                if (lastDot > -1 && lastComma > -1) {
                    if (lastComma > lastDot) {
                        // 1.234,56 -> 1234.56
                        strVal = strVal.replace(/\./g, '').replace(',', '.');
                    } else {
                        // 1,234.56 -> 1234.56
                        strVal = strVal.replace(/,/g, '');
                    }
                } else if (lastComma > -1) {
                    // 1234,56 -> 1234.56
                    strVal = strVal.replace(',', '.');
                }
                
                const num = parseFloat(strVal);
                if (isNaN(num)) return val || '-';
                return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };
            
            let html = '';
            filteredData.forEach(r => {
                const dm = r.datos_maestros || {};
                const origen = dm._origen || dm.Origen_Sistema || 'Drive / Auto';
                const isManual = String(origen).toLowerCase().includes('manual');
                
                // Extraer Delta Badge
                let badgeHtml = isManual 
                    ? '<span class="px-2 py-0.5 rounded text-[9px] bg-blue-900/30 text-blue-400 border border-blue-500/30 font-bold uppercase tracking-widest"><i data-lucide="user" class="w-2.5 h-2.5 inline pb-0.5"></i> Manual</span>'
                    : '<span class="px-2 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-widest"><i data-lucide="bot" class="w-2.5 h-2.5 inline pb-0.5"></i> IA</span>';
                
                // Inject Delta si fue modificado algorítmicamente en la última extracción
                if (dm._estado_delta === 'MODIFICADO') {
                    badgeHtml += ' <span class="ml-1 px-2 py-0.5 rounded text-[9px] bg-amber-900/40 text-amber-400 border border-amber-500/30 font-bold uppercase tracking-widest" title="Precio actualizado respecto a ingesta previa">Delta</span>';
                }
                
                const badge = badgeHtml;
                
                const sku = dm.SKU || dm['Código'] || dm.codigo || '';
                const desc = dm['Descripción'] || dm.descripcion || dm.Producto || 'Sin descripción';
                const precio = dm.Precio || dm.precio || dm.Precio_Unitario || 0;
                
                // Extracción tolerante para la Promoción
                let precioPromo = '-';
                for (let key in dm) {
                    const cleanKey = key.toLowerCase().replace(/_/g, '').replace(/\s/g, '');
                    if (cleanKey === 'preciopromo' || cleanKey === 'promocion' || cleanKey === 'promo') {
                        precioPromo = dm[key];
                        break;
                    }
                }
                
                const unidad = dm.Unidad || dm.unidad || 'UN';

                const rStr = encodeURIComponent(JSON.stringify({ id: r.id, isManual, proveedor_id: providerId, nombre_proveedor: r.nombre_proveedor, ...dm }));
                
                html += `<tr class="hover:bg-slate-800/30 transition-colors catalogo-row">
                    <td class="py-2 px-4 font-mono text-[11px] text-blue-300 catalogo-sku">${sku || '-'}</td>
                    <td class="py-2 px-4 font-medium text-slate-200 truncate max-w-[200px] catalogo-desc" title="${desc}">${desc}</td>
                    <td class="py-2 px-4 font-mono text-emerald-400">$${formatPrice(precio)}</td>
                    <td class="py-2 px-4 font-mono text-fuchsia-400">${precioPromo !== '-' ? '$' + formatPrice(precioPromo) : '-'}</td>
                    <td class="py-2 px-4">${badge}</td>
                    <td class="py-2 px-4 text-right">
                        ${isManual ? 
                            `<button onclick="window.editManualArticle('${rStr}')" class="p-1.5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded transition-colors" title="Editar"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                             <button onclick="window.deleteManualArticle('${r.id}', '${providerId}')" class="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors ml-1" title="Eliminar"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` 
                        : '<span class="text-[9px] text-slate-600 italic">No editable</span>'}
                    </td>
                </tr>`;
            });
            grid.innerHTML = html;
            if(window.lucide) lucide.createIcons();
            
            // Actualizar cuenta en UI
            const container = grid.closest('.mt-6');
            if (container) {
                const activeHeader = container.querySelector('h3');
                if (activeHeader && activeHeader.innerHTML.indexOf('(') === -1) {
                    activeHeader.innerHTML += ` <span class="text-xs text-blue-500 ml-2">(${filteredData.length})</span>`;
                } else if (activeHeader) {
                    activeHeader.innerHTML = activeHeader.innerHTML.replace(/\(\d+\)/, `(${filteredData.length})`);
                }
            }
            
        }
    } catch(e) {
        console.error("Error loading articles:", e);
        grid.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-red-400">Error al cargar datos.</td></tr>';
    }
};

window.filterCatalogoActivo = function() {
    const input = document.getElementById('catalogoSearchInput');
    if (!input) return;
    const filter = input.value.toUpperCase();
    const table = document.getElementById('catalogoActivoTable');
    if (!table) return;
    const rows = table.getElementsByClassName('catalogo-row');
    
    for (let i = 0; i < rows.length; i++) {
        const skuCol = rows[i].getElementsByClassName('catalogo-sku')[0];
        const descCol = rows[i].getElementsByClassName('catalogo-desc')[0];
        if (skuCol || descCol) {
            const txtValue = (skuCol ? skuCol.textContent || skuCol.innerText : '') + ' ' + (descCol ? descCol.textContent || descCol.innerText : '');
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }       
    }
};

window.editManualArticle = function(recordDataEncoded) {
    try {
        const data = JSON.parse(decodeURIComponent(recordDataEncoded));
        
        document.getElementById('manualEntryRecordId').value = data.id;
        document.getElementById('manualEntryProviderId').value = data.proveedor_id;
        document.getElementById('manualEntryProviderName').value = data.nombre_proveedor || "Proveedor";
        
        window.buildManualEntryForm(data);
        
        const modal = document.getElementById('manualEntryModal');
        if(modal) modal.classList.remove('hidden');
    } catch(e) {
        console.error("Error decoding record:", e);
    }
};

window.deleteManualArticle = async function(id, providerId) {
    if(!window.Swal) return;
    const result = await Swal.fire({
        title: '¿Eliminar Artículo?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        background: '#0f172a', color: '#f8fafc',
        showCancelButton: true, confirmButtonText: 'Sí, Eliminar', cancelButtonText: 'Cancelar'
    });
    
    if (result.isConfirmed) {
        try {
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
            const res = await fetch(`${backendUrl}/api/master-table/manual-entry/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            Swal.fire({ title: 'Eliminado', text: 'El registro fue borrado.', icon: 'success', background: '#0f172a', color: '#f8fafc', timer: 1500, showConfirmButton: false });
            if(window.loadSupplierArticles) window.loadSupplierArticles(providerId);
        } catch(e) {
            Swal.fire('Error', e.message, 'error');
        }
    }
};


window.openManualEntryModal = function(providerId, providerName) {
    const modal = document.getElementById('manualEntryModal');
    if(!modal) return;
    
    document.getElementById('manualEntryRecordId').value = "";
    document.getElementById('manualEntryProviderId').value = providerId;
    document.getElementById('manualEntryProviderName').value = providerName;
    document.getElementById('manualEntryForm').reset();
    
    window.buildManualEntryForm(null);
    
    modal.classList.remove('hidden');
};

window.closeManualEntryModal = function() {
    const modal = document.getElementById('manualEntryModal');
    if(modal) modal.classList.add('hidden');
};

window.handleManualEntrySubmit = async function(e) {
    e.preventDefault();
    
    const providerId = document.getElementById('manualEntryProviderId').value;
    const providerName = document.getElementById('manualEntryProviderName').value;
    const recordId = document.getElementById('manualEntryRecordId').value;
    // TICKET #013: Recolección Data-Driven dinámica
    const container = document.getElementById('manualEntryDynamicContainer');
    const inputs = container.querySelectorAll('input, select');
    const datos_maestros = {};
    inputs.forEach(inp => {
        if(inp.name) {
            datos_maestros[inp.name] = inp.type === 'number' ? parseFloat(inp.value) : inp.value.trim();
        }
    });
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const ogHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...';
    submitBtn.disabled = true;
    if(window.lucide) lucide.createIcons();

    try {
        const payload = {
            id: recordId ? recordId : undefined,
            proveedor_id: providerId,
            nombre_proveedor: providerName,
            datos_maestros: {
                ...datos_maestros,
                "Origen_Sistema": "Carga Manual"
            }
        };

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/master-table/manual-entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        closeManualEntryModal();
        if(window.loadSupplierArticles) window.loadSupplierArticles(providerId);

        if(typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Artículo Creado',
                text: 'El artículo ha sido registrado manualmente.',
                icon: 'success',
                timer: 2000,
                background: '#0f172a', color: '#f8fafc',
                showConfirmButton: false
            });
        }
    } catch (err) {
        console.error("Error Carga Manual:", err);
        if(typeof Swal !== 'undefined') {
            Swal.fire({ title: 'Error', text: err.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        } else {
            alert(err.message);
        }
    } finally {
        submitBtn.innerHTML = ogHtml;
        submitBtn.disabled = false;
        if(window.lucide) lucide.createIcons();
    }
};
