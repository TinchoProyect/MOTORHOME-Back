
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
        const nameInput = form.querySelector('input[name="nombre"]');
        if (nameInput) {
            nameInput.addEventListener('blur', triggerProvisioning);
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
async function exploreSupplierFiles(folderId) {
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

        renderFileGrid(data.files, folderId);

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

function renderFileGrid(files, folderId) {
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

                    <!-- TABS (PHASE 5) -->
                    <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 ml-4">
                        <button id="tabPending" class="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-blue-500 bg-blue-500/10 text-blue-400">
                            <i data-lucide="hard-drive" class="w-3 h-3"></i> Pendientes
                        </button>
                        <button id="tabProcessed" class="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-emerald-300">
                            <i data-lucide="archive" class="w-3 h-3"></i> Procesados
                        </button>
                    </div>
                </div>
                
                <a href="https://drive.google.com/drive/folders/${folderId}" target="_blank" class="px-3 py-1.5 bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 border border-slate-700 rounded-lg text-xs font-medium transition-all flex items-center gap-2">
                    Drive Exte&shy;rno <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
            </div>

            <!-- CONTAINER DRIVE (DEFAULT) -->
            <div id="fileListDrive" class="flex-1 overflow-hidden flex flex-col">
    `;

    // Grid de Contenido Drive
    if (files.length === 0) {
        html += `
            <div class="flex-grow flex flex-col items-center justify-center text-slate-600">
                <i data-lucide="folder-open" class="w-16 h-16 mb-4 opacity-20"></i>
                <p class="text-sm">Carpeta vacía</p>
            </div>
        `;
    } else {
        html += `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-10">`;

        files.forEach(file => {
            const iconName = getIcon(file.mimeType);
            const colorClass = getColor(file.mimeType);

            html += `
                <div onclick="handleFileClick('${file.id}', '${file.name}')" class="cursor-pointer group relative bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-blue-500/30 rounded-xl p-4 flex flex-col items-center gap-3 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10">
                    <!-- External Link (Corner) -->
                    <a href="${file.webViewLink}" target="_blank" onclick="event.stopPropagation()" class="absolute top-2 right-2 p-1 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Abrir en Drive">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                    
                    <!-- Icon -->
                    <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-lg ${colorClass.replace('text-', 'shadow-').replace('400', '900')}/20">
                        <i data-lucide="${iconName}" class="w-6 h-6 ${colorClass}"></i>
                    </div>
                    
                    <!-- Name -->
                    <p class="text-[10px] text-center text-slate-300 font-medium line-clamp-2 w-full px-1 group-hover:text-white transition-colors">${file.name}</p>
                    
                    <!-- Date -->
                    <span class="text-[9px] text-slate-600 font-mono mt-auto">${new Date(file.modifiedTime).toLocaleDateString()}</span>
                </div>
            `;
        });

        html += `</div>`;
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
    if (window.initDashboardTabs) window.initDashboardTabs();
}

async function handleFileClick(fileId, fileName) {
    console.log("Abriendo visor para:", fileName);
    // Bridge to Global openFileViewer (defined in HTML)
    if (typeof window.openFileViewer === 'function') {
        window.openFileViewer(fileId, fileName);
    } else {
        console.error("Error: openFileViewer not found on window.");
        alert("Error de sistema: Motor de visor no inicializado.");
    }
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
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">${supplier.categoria || 'GENERAL'}</span>
                    </div>
                    <div class="flex items-center gap-4 text-slate-500 text-xs font-mono pl-6">
                        <span>CUIT: <span class="text-slate-400">${supplier.cuit || 'N/A'}</span></span>
                    </div>
                </div>
                <button onclick="editSupplier('${supplier.id}')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 rounded-lg text-xs font-bold transition-all flex items-center gap-2 group">
                    <i data-lucide="pencil" class="w-3 h-3 group-hover:text-white transition-colors"></i> EDITAR
                </button>
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
                ${supplier.drive_folder_id
            ? `<div onclick="exploreSupplierFiles('${supplier.drive_folder_prices_id || supplier.drive_folder_id}')" class="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800 group hover:border-blue-500/30 transition-colors cursor-pointer">
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
            : `<div class="text-xs text-slate-600 italic py-2">Sin carpeta vinculada</div>`
        }
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
        </div >
    `;
    lucide.createIcons();
}

async function loadProveedores() {
    reportDisplay.innerHTML = `<div class="flex items-center justify-center h-full text-blue-400">
    <i data-lucide="loader-2" class="w-8 h-8 animate-spin mr-2"></i>
                                    Cargando proveedores...
                                </div > `;
    lucide.createIcons();

    const { data, error } = await supabaseClient
        .from('proveedores')
        .select('*')
        .order('nombre', { ascending: true }); // Orden alfabético

    if (error) {
        console.error("Error al cargar proveedores:", error);
        reportDisplay.innerHTML = `<div class="text-red-500">Error al cargar proveedores: ${error.message}</div>`;
        return;
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
                            ${supplier.categoria || 'General'}
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
    const inputs = form.querySelectorAll('input, select');
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

    openSupplierModal(true);
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
    helpText.innerText = "Validación automática al ingresar nombre.";
    helpText.className = "text-[9px] text-slate-600 ml-1 mt-1";

    document.getElementById('h_rootId').value = "";
    document.getElementById('h_pricesId').value = "";
    document.getElementById('h_extractedId').value = "";
    lucide.createIcons();
}

async function triggerProvisioning() {
    const form = document.getElementById('supplierForm');
    const nameInput = form.querySelector('input[name="nombre"]');
    const driveDisplay = document.getElementById('driveFolderDisplay');
    const statusContainer = document.getElementById('driveStatusContainer');
    const helpText = document.getElementById('driveHelpText');

    const name = nameInput.value.trim();

    // Si estamos editando y ya tiene ID, no re-provisionamos salvo que se pida (Futuro)
    // Si es Alta nueva:
    if (!editingSupplierId) {
        if (name.length < 3) return;
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
    } else {
        // Modo Edición: Solo mostrar estado
        if (document.getElementById('h_rootId').value) {
            driveDisplay.value = "Infraestructura Vinculada";
            statusContainer.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4 text-green-500"></i>';
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

    // Fix Checkbox
    supplierData.activo = !!formData.get('activo');

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
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
