
/**
 * VIEWER ENGINE - Sistema de Gestión de Proveedores
 * Módulo de Visualización, Worker Excel y Herramientas de Mapeo
 * v1.4 (Final Fix - Cleaned & Bound)
 */

console.log("%c 🚀 VIEWER ENGINE: v1.4 - READY ", "background: #8b5cf6; color: #fff; font-weight: bold; padding: 4px;");

// --- 1. VARIABLES GLOBALES (Scope Módulo) ---
let viewerWorker = null;
let currentSheetData = [];
let workbook = null;       // LIBRO EXCEL
let currentFileBuffer = null; // BUFFER RAW (Rescate)
let useWorker = true;      // ESTADO DEL WORKER
let currentSheetName = ""; // HOJA ACTUAL
let sheetConfigStore = {}; // { "Sheet1": { offset: {}, mapping: {} } }

// Global Context
window.globalContext = {
    providerId: null,
    providerName: "",
    fileId: null,
    fileType: "GENERAL",
    timestamp: null
};

// --- Mapeo y Offset ---
let mappingMode = false;
let columnMapping = {}; // { colIndex: "Tipo" }
let offsetSelectionMode = false;
let currentOffset = null; // { row: 0, col: 0 }
let nomenclatureCache = []; // Cache de términos
let processingRules = {}; // Rules store
let simulationModeProcessed = true; // State for Toggle

// --- 2. CÓDIGO DEL OBRERO (Worker) ---
// Usamos CDN oficial para evitar errores de ruta relativa en Blobs
const WORKER_CODE = `
    importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

    let currentWorkbook = null;

    onmessage = function (e) {
        const { type, payload } = e.data;

        switch (type) {
            case 'INIT_FILE':
                try {
                    console.log('[Worker] Recibido archivo. Procesando...');
                    currentWorkbook = XLSX.read(payload, { type: 'array' });
                    postMessage({
                        type: 'SHEETS_READY',
                        payload: currentWorkbook.SheetNames
                    });
                } catch (error) {
                    postMessage({ type: 'ERROR', payload: error.message });
                }
                break;

            case 'PARSE_SHEET':
                try {
                    if (!currentWorkbook) throw new Error("No hay libro cargado.");
                    const sheetName = payload;
                    const worksheet = currentWorkbook.Sheets[sheetName];
                    if (!worksheet) throw new Error("Hoja " + sheetName + " no encontrada.");
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    postMessage({
                        type: 'SHEET_DATA_READY',
                        payload: { sheetName: sheetName, data: jsonData }
                    });
                } catch (error) {
                    postMessage({ type: 'ERROR', payload: error.message });
                }
                break;
            
            case 'CLEANUP':
                currentWorkbook = null;
                break;
        }
    };
`;

// --- 3. FUNCIONES CORE DEL VISOR ---

async function openFileViewer(fileId, fileName) {
    window.globalContext.fileId = fileId;

    // UI Elements
    const modal = document.getElementById('viewerModal');
    const loader = document.getElementById('viewerLoader');
    const title = document.getElementById('viewerTitle');
    const badgeContainer = document.getElementById('viewerBadges');

    // Title & Badges
    title.textContent = fileName;
    title.className = "text-sm font-bold text-white tracking-wide opacity-70";

    if (badgeContainer) {
        const type = window.globalContext.fileType || "GENERAL";
        const pName = window.globalContext.providerName || "DESCONOCIDO";
        const badgeColor = type === "LISTA_PRECIOS" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20";
        const badgeIcon = type === "LISTA_PRECIOS" ? "layers" : "folder";

        badgeContainer.innerHTML = `
           <span class="px-2 py-0.5 text-[10px] rounded-full border bg-slate-800 text-slate-300 border-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="building-2" class="w-3 h-3"></i> ${pName}
           </span>
           <span class="px-2 py-0.5 text-[10px] rounded-full border ${badgeColor} uppercase tracking-wider font-mono flex items-center gap-1">
                <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${type.replace('_', ' ')}
           </span>
        `;
    }
    if (window.lucide) window.lucide.createIcons();

    // Reset Containers
    const excelContainer = document.getElementById('excelContainer');
    const sheetTabs = document.getElementById('sheetTabs');
    const errContainer = document.getElementById('errorContainer');
    const pdfContainer = document.getElementById('pdfContainer');
    const imgContainer = document.getElementById('imageContainer');
    const imgEl = document.getElementById('viewerImage');

    if (viewerWorker) {
        viewerWorker.terminate();
        viewerWorker = null;
    }

    currentSheetData = [];
    if (excelContainer) {
        excelContainer.onscroll = null;
        excelContainer.innerHTML = '';
    }
    if (sheetTabs) sheetTabs.innerHTML = '';

    [excelContainer, sheetTabs, pdfContainer, imgContainer, errContainer].forEach(el => el && el.classList.add('hidden'));
    modal.classList.remove('hidden');
    loader.classList.remove('hidden');

    // Reset Tools
    mappingMode = false;
    columnMapping = {};
    const btnMap = document.getElementById('btnMappingMode');
    if (btnMap) {
        btnMap.classList.add('hidden');
        btnMap.classList.remove('bg-blue-600', 'text-white', 'border-blue-500', 'shadow-[0_0_15px_rgba(37,99,235,0.3)]');
        btnMap.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
    }

    offsetSelectionMode = false;
    currentOffset = null;
    const btnOffset = document.getElementById('btnOffsetMode');
    if (btnOffset) {
        btnOffset.classList.add('hidden');
        btnOffset.classList.remove('bg-amber-600', 'text-white', 'animate-pulse');
        btnOffset.classList.add('bg-slate-800', 'text-slate-300');
    }

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const downloadUrl = `${backendUrl}/api/files/download/${fileId}`;

        const isExcel = fileName.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = fileName.match(/\.pdf$/i);
        const isImg = fileName.match(/\.(jpg|jpeg|png)$/i);

        if (isExcel) {
            if (btnMap) btnMap.classList.remove('hidden');
            if (btnOffset) btnOffset.classList.remove('hidden');

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error("Error descargando archivo.");
            const arrayBuffer = await response.arrayBuffer();
            currentFileBuffer = arrayBuffer;

            // Worker Init (Fixed: CDN)
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            viewerWorker = new Worker(URL.createObjectURL(blob));

            const initWatchdog = setTimeout(() => {
                if (useWorker && !currentWorkbook) {
                    console.error("🚨 Worker INIT Timeout (7s).");
                    useWorker = false;
                    viewerWorker.terminate();
                    processLocally(workbook, "Hoja1");
                }
            }, 7000);

            // CORRECCION: NO TRANSFERIR BUFFER
            viewerWorker.postMessage({ type: 'INIT_FILE', payload: arrayBuffer });

            viewerWorker.onerror = (e) => {
                clearTimeout(initWatchdog);
                console.error("🚨 Worker Crash:", e);
                useWorker = false;
                e.preventDefault();
                viewerWorker.terminate();
                processLocally(workbook, currentSheetName);
            };

            viewerWorker.onmessage = (e) => {
                clearTimeout(initWatchdog);
                const { type, payload } = e.data;

                if (type === 'SHEETS_READY') {
                    const sheetNames = payload;
                    if (sheetNames.length === 0) throw new Error("Excel vacío.");
                    window.currentSheetList = sheetNames;
                    renderSheetTabs(sheetNames);
                    if (sheetNames.length > 1) sheetTabs.classList.remove('hidden');
                    excelContainer.classList.remove('hidden');
                    loadSheet(sheetNames[0]);
                    loader.classList.add('hidden');
                } else if (type === 'SHEET_DATA_READY') {
                    currentSheetData = payload.data;
                    renderVirtualTable(currentSheetData);
                } else if (type === 'ERROR') {
                    console.error("Worker Logical Error:", payload);
                    useWorker = false;
                    processLocally(workbook, currentSheetName);
                }
            };
        } else if (isPdf) {
            pdfContainer.src = downloadUrl;
            pdfContainer.classList.remove('hidden');
            loader.classList.add('hidden');
        } else if (isImg) {
            imgEl.src = downloadUrl;
            imgContainer.classList.remove('hidden');
            loader.classList.add('hidden');
        } else {
            throw new Error("Formato no soportado.");
        }

    } catch (error) {
        console.error(error);
        errContainer.textContent = error.message;
        errContainer.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function loadSheet(sheetName) {
    if (currentSheetName && currentSheetName !== sheetName) {
        saveSheetState(currentSheetName);
    }
    currentSheetName = sheetName;
    loadSheetState(sheetName);
    renderSheetTabs();

    const excelContainer = document.getElementById('excelContainer');
    excelContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-64 text-blue-400">
        <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <span class="text-xs font-mono animate-pulse">PROCESANDO...</span>
    </div>`;

    currentSheetData = null;

    if (typeof useWorker !== 'undefined' && useWorker && viewerWorker) {
        viewerWorker.postMessage({ type: 'PARSE_SHEET', payload: sheetName });
        setTimeout(() => {
            if (currentSheetData === null && useWorker && document.getElementById('excelContainer')?.innerHTML.includes('border-t-transparent')) {
                console.warn("Worker timeout. Intentando modo local...");
                processLocally(workbook, sheetName);
            }
        }, 5000);
    } else {
        setTimeout(() => { processLocally(workbook, sheetName); }, 50);
    }
}

const processLocally = (wb, sName) => {
    console.warn("⚠️ Fallback Local activado para: " + sName);
    const excelContainer = document.getElementById('excelContainer');
    if (excelContainer) excelContainer.innerHTML = '<div class="text-xs text-amber-500 p-4">Modo Local Activado...</div>';

    try {
        if (!workbook && wb) workbook = wb;
        if (!workbook && typeof XLSX !== 'undefined' && currentFileBuffer) {
            try { workbook = XLSX.read(currentFileBuffer); } catch (e) { console.error("Fallo lectura buffer:", e); }
        }
        if (!workbook) throw new Error("No se pudo leer el archivo Excel (Fallo total).");

        if ((!sName || sName === "") && workbook.SheetNames.length > 0) {
            sName = workbook.SheetNames[0];
            currentSheetName = sName;
        }

        const ws = workbook.Sheets[sName];
        if (!ws) throw new Error("Hoja '" + sName + "' no encontrada.");

        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
        currentSheetData = json;
        renderVirtualTable(json);
        const loader = document.getElementById('viewerLoader');
        if (loader) loader.classList.add('hidden');

    } catch (e) {
        console.error("Local Processing Error:", e);
        const errContainer = document.getElementById('errorContainer');
        if (errContainer) {
            errContainer.textContent = "Error Crítico: " + e.message;
            errContainer.classList.remove('hidden');
        }
    }
};

// --- MAPPING & NOMENCLATURE TOOLS ---

async function loadNomenclature() {
    try {
        const supabase = window.supabaseClient;
        if (!supabase) throw new Error("Supabase client not initialized");

        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .select('*')
            .order('termino', { ascending: true });

        if (error) throw error;
        nomenclatureCache = data;
        return data;
    } catch (e) {
        console.error("Error loading nomenclature:", e);
        if (nomenclatureCache.length === 0) {
            nomenclatureCache = [
                { id: 'temp1', termino: 'Código', descripcion_uso: 'SKU' },
                { id: 'temp2', termino: 'Descripción', descripcion_uso: 'Nombre' },
                { id: 'temp3', termino: 'Precio', descripcion_uso: 'Costo' }
            ];
        }
    }
}

async function addNomenclatureTerm(term, desc = "") {
    try {
        const supabase = window.supabaseClient;
        const { error } = await supabase
            .from('user_diccionario_nomenclatura')
            .insert([{ termino: term, descripcion_uso: desc }]);

        if (error) throw error;
        await loadNomenclature();
        return true;
    } catch (e) {
        console.error("Error adding term:", e);
        return false;
    }
}

async function updateNomenclatureTerm(id, newTerm, newDesc, newRules) {
    try {
        const updatePayload = { id: id, termino: newTerm };
        if (newDesc !== undefined) updatePayload.descripcion_uso = newDesc;
        if (newRules !== undefined) updatePayload.reglas_procesamiento = newRules;

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

        const response = await fetch(`${backendUrl}/api/files/dictionary/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error);

        // Cache Update
        const idx = nomenclatureCache.findIndex(t => t.id === id);
        if (idx !== -1) {
            nomenclatureCache[idx].termino = newTerm;
            if (newDesc !== undefined) nomenclatureCache[idx].descripcion_uso = newDesc;
            if (newRules !== undefined) nomenclatureCache[idx].reglas_procesamiento = newRules;
        }
        return true;
    } catch (e) {
        console.error("Error updating:", e);
        alert("Error: " + e.message);
        return false;
    }
}

async function toggleMappingMode() {
    mappingMode = !mappingMode;
    const btn = document.getElementById('btnMappingMode');
    if (!btn) return;

    if (mappingMode) {
        if (nomenclatureCache.length === 0) {
            btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>';
            await loadNomenclature();
            btn.innerHTML = '<i data-lucide="layers" class="w-3 h-3"></i> Mapear Columnas';
            if (window.lucide) window.lucide.createIcons();
        }
        // Hydrate Rules
        if (columnMapping && Object.keys(columnMapping).length > 0) {
            Object.keys(columnMapping).forEach(colIdx => {
                const termName = columnMapping[colIdx];
                const term = nomenclatureCache.find(t => t.termino === termName);
                if (term && term.reglas_procesamiento) processingRules[colIdx] = term.reglas_procesamiento;
            });
        }
        btn.classList.remove('bg-slate-800', 'border-slate-700');
        btn.classList.add('bg-blue-600', 'border-blue-500', 'shadow-[0_0_15px_rgba(37,99,235,0.3)]');
    } else {
        btn.classList.remove('bg-blue-600', 'border-blue-500', 'shadow-[0_0_15px_rgba(37,99,235,0.3)]');
        btn.classList.add('bg-slate-800', 'border-slate-700');
    }
    if (currentSheetData) renderVirtualTable(currentSheetData);
}

function openColumnMenu_v2(colIndex, buttonElement) {
    const existing = document.getElementById('colMenuDropdown');
    if (existing) {
        existing.remove();
        if (existing.dataset.colIndex === String(colIndex)) return;
    }

    const menu = document.createElement('div');
    menu.id = 'colMenuDropdown';
    menu.dataset.colIndex = colIndex;
    menu.className = 'fixed z-[150] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col min-w-[280px] max-h-[400px] overflow-hidden animate-in slide-in-from-top-2 duration-200';

    const rect = buttonElement.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = rect.left + 'px';

    const header = document.createElement('div');
    header.className = "px-4 py-2 bg-slate-950/50 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800";
    header.textContent = "Asignar Tipo de Dato";
    menu.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.className = "overflow-y-auto custom-scrollbar flex-1";
    menu.appendChild(scrollArea);

    nomenclatureCache.forEach(term => {
        const item = document.createElement('div');
        item.className = 'flex items-center border-l-2 border-transparent hover:bg-slate-800 transition-colors group relative cursor-pointer p-2';

        const content = document.createElement('div');
        content.className = 'flex-grow px-2 flex flex-col';
        content.innerHTML = `<span class="text-[11px] font-mono text-slate-300 font-bold">${term.termino}</span>
                             <span class="text-[9px] text-slate-500 truncate">${term.descripcion_uso || ''}</span>`;

        if (columnMapping[colIndex] === term.termino) {
            item.classList.add('bg-blue-900/10', 'border-blue-500');
            content.querySelector('span').classList.add('text-blue-400');
        }

        content.onclick = () => {
            columnMapping[colIndex] = term.termino;
            // Auto Trigger Rule
            if (term.reglas_procesamiento) {
                processingRules[colIndex] = term.reglas_procesamiento;
            } else {
                if (processingRules[colIndex]) delete processingRules[colIndex];
            }
            renderVirtualTable(currentSheetData);
            saveSheetState(currentSheetName);
            renderSheetTabs();
            menu.remove();
        };

        // Boton Editar
        const editBtn = document.createElement('button');
        editBtn.className = 'p-1.5 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all bg-slate-900/80 rounded z-10';
        editBtn.innerHTML = '<i data-lucide="pencil" class="w-3 h-3"></i>';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            renderEditMode(item, term);
        };

        item.appendChild(content);
        item.appendChild(editBtn);
        scrollArea.appendChild(item);
    });

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'w-full px-4 py-3 text-left border-t border-slate-800 text-[10px] text-slate-500 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2';
    ignoreBtn.innerHTML = '<i data-lucide="eye-off" class="w-3 h-3"></i> Ignorar esta columna';
    ignoreBtn.onclick = () => {
        columnMapping[colIndex] = 'Ignorar Columna';
        renderVirtualTable(currentSheetData);
        saveSheetState(currentSheetName);
        renderSheetTabs();
        menu.remove();
    };
    menu.appendChild(ignoreBtn);

    // Close on outside click
    const closeHandler = (e) => {
        if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 50);
    document.body.appendChild(menu);
    if (window.lucide) window.lucide.createIcons();
}

// HELPER: Select for Rules with Integrity Filters & ID Binding
function createTermSelect(currentId, placeholder, currentTermId) {
    const select = document.createElement('select');
    select.className = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-blue-500 outline-none w-full appearance-none';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.text = `- ${placeholder} -`;
    defaultOpt.disabled = true;
    if (!currentId) defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    let foundCurrent = false;

    nomenclatureCache.forEach(t => {
        // FILTER 1: No Auto-Reference
        if (t.id === currentTermId) return;

        // FILTER 2: Solo Hojas (No Composite Terms)
        if (t.reglas_procesamiento && Object.keys(t.reglas_procesamiento).length > 0) return;

        const opt = document.createElement('option');
        opt.value = t.id; // STORE ID (The Truth)
        opt.text = t.termino; // SHOW NAME (The UI)

        if (t.id === currentId) {
            opt.selected = true;
            foundCurrent = true;
        }
        select.appendChild(opt);
    });

    // Integrity Fallback: Rehydrate name if ID exists but is filtered/missing, OR if value was legacy text
    if (currentId && !foundCurrent) {
        // Try to find name in cache even if filtered
        const zombieTerm = nomenclatureCache.find(z => z.id === currentId);
        const displayName = zombieTerm ? zombieTerm.termino : (currentId.length > 20 ? "Referencia Rota" : currentId); // Simple check for UUID length vs legacy text

        const legacyOpt = document.createElement('option');
        legacyOpt.value = currentId;
        legacyOpt.text = `${displayName} (Inválido)`;
        legacyOpt.classList.add('text-amber-500');
        legacyOpt.selected = true;
        select.appendChild(legacyOpt);
    }

    return select;
}

// RESTORED FULL EDIT MODE WITH RULES (ID PERSISTENCE)
function renderEditMode(container, term) {
    container.className = 'p-3 bg-slate-900 border-l-2 border-blue-500 flex flex-col gap-3 transition-all rounded-r-lg shadow-inner';
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = "flex justify-between items-center mb-1";
    header.innerHTML = '<span class="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Edición Rápida</span>';
    container.appendChild(header);

    // Input: Name
    const group1 = document.createElement('div');
    group1.className = "space-y-1";
    group1.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold">Término</label>';
    const inputTerm = document.createElement('input');
    inputTerm.value = term.termino;
    inputTerm.className = 'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] text-white focus:border-blue-500 outline-none placeholder:text-slate-600 font-mono';
    group1.appendChild(inputTerm);
    container.appendChild(group1);

    // Input: Description
    const group2 = document.createElement('div');
    group2.className = "space-y-1";
    group2.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold">Descripción</label>';
    const inputDesc = document.createElement('input');
    inputDesc.value = term.descripcion_uso || '';
    inputDesc.placeholder = 'Contexto de uso...';
    inputDesc.className = 'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-400 focus:border-blue-500 outline-none placeholder:text-slate-600';
    group2.appendChild(inputDesc);
    container.appendChild(group2);

    // Input: Rules - Field Splitting Logic (Restored)
    const group3 = document.createElement('div');
    group3.className = "space-y-1.5 pt-2 border-t border-slate-800";
    group3.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-between"><span>Reglas de Procesamiento</span> <i data-lucide="split" class="w-3 h-3"></i></label>';

    // Rule Logic
    const ruleContainer = document.createElement('div');
    ruleContainer.className = "grid grid-cols-2 gap-2";
    const existingRule = (term.reglas_procesamiento && typeof term.reglas_procesamiento === 'object') ? term.reglas_procesamiento : { delimiter: " + ", fields: [] };

    const inputDelim = document.createElement('input');
    inputDelim.type = 'hidden'; // HIDDEN as requested
    inputDelim.value = existingRule.delimiter || " + ";

    // REPLACED INPUTS WITH SELECTS (ID BINDING)
    const val1 = (existingRule.fields && existingRule.fields[0]) ? existingRule.fields[0] : "";
    const field1 = createTermSelect(val1, "Campo 1", term.id);

    const val2 = (existingRule.fields && existingRule.fields[1]) ? existingRule.fields[1] : "";
    const field2 = createTermSelect(val2, "Campo 2", term.id);

    ruleContainer.appendChild(inputDelim);
    ruleContainer.appendChild(field1);
    ruleContainer.appendChild(field2);
    group3.appendChild(ruleContainer);
    container.appendChild(group3);

    // Botonera
    const btnRow = document.createElement('div');
    btnRow.className = 'flex justify-between items-end gap-2 mt-3 pt-2 border-t border-slate-800';

    // Delete Button (Restored)
    const btnDelete = document.createElement('button');
    btnDelete.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3 text-red-500"></i>';
    btnDelete.className = 'p-1.5 rounded hover:bg-red-900/30 transition-colors border border-transparent hover:border-red-900/50';
    btnDelete.onclick = async (e) => {
        e.stopPropagation();
        if (confirm("¿Eliminar término?")) {
            try {
                const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                await fetch(`${backendUrl}/api/files/dictionary/delete?id=${term.id}`, { method: 'DELETE' });
                // Remove from Cache & Refresh
                const idx = nomenclatureCache.findIndex(t => t.id === term.id);
                if (idx !== -1) nomenclatureCache.splice(idx, 1);
                const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
                const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
                if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
            } catch (error) { alert("Error eliminando."); }
        }
    };

    const rightActions = document.createElement('div');
    rightActions.className = "flex gap-2";

    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'Cancelar';
    btnCancel.className = 'text-[10px] text-slate-500 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 uppercase font-bold';
    btnCancel.onclick = (e) => {
        e.stopPropagation();
        const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
        const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
        if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
    };

    const btnSave = document.createElement('button');
    btnSave.innerHTML = '<i data-lucide="save" class="w-3 h-3 inline mr-1"></i> Guardar';
    btnSave.className = 'bg-blue-600 text-white px-4 py-1.5 rounded text-[10px] hover:bg-blue-500 uppercase font-bold';
    btnSave.onclick = async (e) => {
        e.stopPropagation();
        btnSave.innerText = '...';

        let parsedRules = null;
        if (inputDelim.value.trim()) {
            parsedRules = {
                type: 'split',
                delimiter: inputDelim.value,
                fields: [field1.value || "Campo 1", field2.value || "Campo 2"]
            };
        }

        await updateNomenclatureTerm(term.id, inputTerm.value, inputDesc.value, parsedRules);
        const colIdx = document.getElementById('colMenuDropdown').dataset.colIndex;
        const triggerBtn = document.querySelector(`#excelContainer th:nth-child(${parseInt(colIdx) + 1}) button`);
        if (triggerBtn) openColumnMenu_v2(colIdx, triggerBtn);
    };

    btnRow.appendChild(btnDelete);
    rightActions.appendChild(btnCancel);
    rightActions.appendChild(btnSave);
    btnRow.appendChild(rightActions);

    container.appendChild(group1);
    container.appendChild(group2);
    container.appendChild(group3);
    container.appendChild(btnRow);

    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ root: container }); inputTerm.focus(); }, 50);
}

// --- VIRTUAL SCROLLER & PROCESSING ---

function applyProcessingRules(originalData) {
    if (!originalData || originalData.length === 0) return [];
    if (Object.keys(processingRules).length === 0) return originalData;

    // Clone to avoid mutations if not needed, or mutate if displaying
    // For VirtualTable we usually display raw. But if simulation needs it?
    // User requested "Strict Extraction" for Preview, but "Rules" for Edit.
    // Let's keep logic available.
    return originalData;
}

function toggleProcessingRule(colIndex) {
    if (processingRules[colIndex]) {
        processingRules[colIndex].disabled = !processingRules[colIndex].disabled;
        renderVirtualTable(currentSheetData);
    }
}

function renderVirtualTable(originalData) {
    const data = originalData;
    const container = document.getElementById('excelContainer');

    if (!data || data.length === 0) {
        if (container) container.innerHTML = '<div class="text-slate-500 p-4">Hoja vacía</div>';
        return;
    }

    let maxCols = 0;
    const scanLimit = Math.min(data.length, 50);
    for (let i = 0; i < scanLimit; i++) {
        if (data[i] && data[i].length > maxCols) maxCols = data[i].length;
    }
    if (maxCols === 0) maxCols = 1;

    const ROW_HEIGHT = 35;
    const HEADER_HEIGHT = 40;
    const totalRows = data.length;
    const totalHeight = (totalRows * ROW_HEIGHT) + HEADER_HEIGHT;

    container.innerHTML = '';
    const scrollerContent = document.createElement('div');
    scrollerContent.style.height = `${totalHeight}px`;
    scrollerContent.style.position = 'relative';
    container.appendChild(scrollerContent);

    const table = document.createElement('table');
    table.className = 'w-full border-collapse text-[11px] font-mono absolute top-0 left-0';
    table.style.tableLayout = 'fixed';
    scrollerContent.appendChild(table);

    const thead = document.createElement('thead');
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // Header
    const headerRow = data[0] || [];
    let headerHtml = `<tr style="height: ${HEADER_HEIGHT}px">`;

    for (let j = 0; j < maxCols; j++) {
        let originalVal = headerRow[j] || (j === 0 ? '#' : `Col ${j + 1}`);
        let mappedType = columnMapping[j];

        // Logic for Rule Toggle Button in Header
        let toggleHtml = '';
        const hasRule = processingRules[j];
        if (mappingMode && hasRule) {
            toggleHtml = `
                 <button onclick="event.stopPropagation(); toggleProcessingRule(${j})" class="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${hasRule.disabled ? 'bg-slate-700 text-slate-400' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'} hover:opacity-80 transition-all border border-transparent hover:border-white/20">
                    ${hasRule.disabled ? 'OFF' : 'ON'}
                 </button>`;
        }

        let thContent = originalVal;
        let thClass = "bg-slate-800 text-blue-400 font-bold uppercase border border-slate-700 p-2 sticky top-0 z-20 text-left overflow-hidden text-ellipsis whitespace-nowrap";

        if (mappingMode) {
            const isMapped = !!mappedType;
            const btnClass = isMapped ? 'bg-blue-600/10 border-blue-500/50 text-blue-300' : 'bg-slate-800/50 text-slate-500 hover:text-blue-400';
            thClass = "bg-slate-950 p-1 sticky top-0 z-20";
            thContent = `<div class="flex items-center gap-1 h-full">
                <button onclick="openColumnMenu_v2(${j}, this)" class="flex-grow h-full text-left px-3 flex items-center justify-between border rounded transition-all ${btnClass}">
                    <span class="truncate font-bold text-[10px] uppercase">${mappedType || originalVal}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-50"></i>
                </button>
                ${toggleHtml}
            </div>`;
        } else {
            if (mappedType && mappedType !== 'Ignorar Columna') {
                thContent = `<span class="text-emerald-400">${mappedType}</span> <span class="text-slate-600 text-[9px] ml-1">(${originalVal})</span>`;
                thClass = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20";
            } else if (mappedType === 'Ignorar Columna') {
                thClass += " opacity-40 grayscale decoration-line-through";
            }
        }
        headerHtml += `<th class="${thClass}" style="height: ${HEADER_HEIGHT}px">${thContent}</th>`;
    }
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;

    // Body Renderer
    const updateVisibleRows = () => {
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;
        const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
        const endIndex = Math.min(startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + 5, totalRows);
        const offsetY = startIndex * ROW_HEIGHT;
        table.style.transform = `translateY(${offsetY}px)`;

        let rowsHtml = '';
        let startDataIndex = Math.max(1, startIndex);
        if (startDataIndex === 0) startDataIndex = 1;

        for (let i = startDataIndex; i < endIndex; i++) {
            const row = data[i] || [];
            rowsHtml += `<tr style="height: ${ROW_HEIGHT}px;" class="hover:bg-slate-800/50">`;
            for (let j = 0; j < maxCols; j++) {
                const cellVal = row[j] !== undefined ? row[j] : '';
                let cellClass = 'border border-slate-800 p-2 whitespace-nowrap text-slate-400 overflow-hidden text-ellipsis transition-colors duration-150';

                const minRow = currentOffset ? currentOffset.row : 0;
                const minCol = currentOffset ? currentOffset.col : 0;
                const isIgnored = (i < minRow) || (j < minCol);
                const isAnchor = (i === minRow && j === minCol);

                if (isIgnored) cellClass += " opacity-25 grayscale bg-slate-950/50";
                if (!offsetSelectionMode && isIgnored) cellClass += " pointer-events-none select-none";
                if (isAnchor) cellClass += " border-2 border-amber-500 font-bold bg-amber-900/20 text-amber-500";
                if (offsetSelectionMode) cellClass += " cursor-crosshair hover:bg-amber-500/30";

                rowsHtml += `<td onclick="handleOffsetClick(${i}, ${j})" class="${cellClass}">${cellVal}</td>`;
            }
            rowsHtml += '</tr>';
        }
        tbody.innerHTML = rowsHtml;
        if (window.lucide) window.lucide.createIcons();
    };

    container.onscroll = () => requestAnimationFrame(updateVisibleRows);
    updateVisibleRows();
}

// --- STATE MANAGEMENT ---

function saveSheetState(sheetName) {
    if (!sheetName) return;
    sheetConfigStore[sheetName] = { offset: currentOffset, mapping: columnMapping || {} };
}

function loadSheetState(sheetName) {
    currentOffset = null;
    columnMapping = {};
    offsetSelectionMode = false;
    const config = sheetConfigStore[sheetName];
    if (config) {
        currentOffset = config.offset;
        columnMapping = config.mapping || {};
    }
}

function renderSheetTabs(sheetNames) {
    if (sheetNames) window.currentSheetList = sheetNames;
    const list = window.currentSheetList || [];
    const container = document.getElementById('sheetTabs');
    if (!container) return;
    container.innerHTML = '';

    list.forEach((sheetName) => {
        const btn = document.createElement('button');
        const isActive = (sheetName === currentSheetName);
        let baseClass = "px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-lg transition-all border-b-2 flex items-center gap-2 ";
        if (isActive) baseClass += "bg-slate-800 text-white border-blue-500 shadow-md relative z-10 ";
        else baseClass += "bg-slate-900 border-transparent hover:bg-slate-800 opacity-60 hover:opacity-100 ";

        btn.innerHTML = `<span>${sheetName}</span>`;
        btn.className = baseClass;
        btn.onclick = () => { if (currentSheetName !== sheetName) loadSheet(sheetName); };
        container.appendChild(btn);
    });
}

function toggleOffsetMode() {
    offsetSelectionMode = !offsetSelectionMode;
    const btn = document.getElementById('btnOffsetMode');
    if (offsetSelectionMode) {
        if (mappingMode) toggleMappingMode();
        btn.classList.add('bg-amber-600', 'text-white', 'animate-pulse');
    } else {
        btn.classList.remove('bg-amber-600', 'text-white', 'animate-pulse');
    }
    if (currentSheetData) renderVirtualTable(currentSheetData);
}

function handleOffsetClick(i, j) {
    if (!offsetSelectionMode) return;
    currentOffset = { row: i, col: j };
    toggleOffsetMode();
    saveSheetState(currentSheetName);
    renderSheetTabs();
}

function toggleSimulationMode() {
    generatePreview();
}

function generatePreview() {
    if (!currentSheetData || currentSheetData.length === 0) return;

    // 1. Context Injection
    const pName = window.globalContext.providerName || "DESCONOCIDO";
    const fType = window.globalContext.fileType || "GENERAL";
    const modalTitle = document.getElementById('simModalTitle');

    // Inject if exists (Title + Badges in Header)
    if (modalTitle) {
        modalTitle.innerHTML = `
            <span class="text-slate-400 font-normal">Vista Previa de Extracción:</span> 
            <span class="text-white font-bold ml-2">${pName}</span>
            <span class="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-blue-900 text-blue-300 border border-blue-800 uppercase tracking-wider">${fType}</span>
        `;
    }

    // 2. Strict Offset Logic
    const startRow = currentOffset ? currentOffset.row : 0;
    // Slice raw data from offset downwards
    const rawSlice = currentSheetData.slice(startRow);

    // 3. Config Extraction (Only Mapped Columns)
    const renderingConfig = [];
    Object.keys(columnMapping).forEach(key => {
        const colIdx = parseInt(key);
        const label = columnMapping[key];
        if (label && label !== 'Ignorar Columna') {
            renderingConfig.push({ label: label, index: colIdx });
        }
    });

    if (renderingConfig.length === 0) {
        alert("Primero debes mapear al menos una columna.");
        return;
    }

    // 4. Strict Sanitization (The Filter)
    // A row is valid ONLY if it has at least one non-empty value in a MAPPED column.
    const sanitizedData = rawSlice.filter(row => {
        return renderingConfig.some(cfg => {
            const val = row[cfg.index];
            return val !== undefined && val !== null && String(val).trim() !== '';
        });
    });

    const container = document.getElementById('simulationTableContainer');
    if (!container) return;

    let html = "<table class='min-w-full text-xs text-slate-300 font-mono'><thead><tr class='bg-slate-950 sticky top-0'>";

    // Header with MY NAMES (The Truth)
    renderingConfig.forEach(cfg => {
        html += `<th class="p-2 border border-slate-700 text-left bg-blue-900/20 text-blue-300">${cfg.label}</th>`;
    });
    html += "</tr></thead><tbody>";

    // Body with SANITIZED DATA
    sanitizedData.forEach((row, i) => {
        if (i > 50) return; // Preview limit for rendering, but count is real
        html += "<tr class='hover:bg-slate-800/50 border-b border-slate-800'>";
        renderingConfig.forEach(cfg => {
            const cellVal = row[cfg.index] !== undefined ? row[cfg.index] : '';
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${cellVal}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody></table>";

    container.innerHTML = html;
    document.getElementById('simulationModal').classList.remove('hidden');

    // 5. Real Count Display
    document.getElementById('simMeta').innerHTML = `
        <span class="text-slate-400">Total Filas Útiles:</span> <span class="text-white font-bold">${sanitizedData.length}</span> 
        <span class="text-slate-600 mx-2">|</span> 
        <span class="text-slate-400">Columnas:</span> <span class="text-white font-bold">${renderingConfig.length}</span>
    `;
}

function closeSimulationModal() {
    document.getElementById('simulationModal').classList.add('hidden');
}

function closeViewerModal() {
    document.getElementById('viewerModal').classList.add('hidden');
}

// --- 4. EXPOSICIÓN GLOBAL (Bindings) ---
// IMPORTANTISIMO: Esto debe estar al final, fuera de cualquier función
window.openFileViewer = openFileViewer;
window.handleOffsetClick = handleOffsetClick;
window.toggleOffsetMode = toggleOffsetMode;
window.toggleMappingMode = toggleMappingMode;
window.openColumnMenu_v2 = openColumnMenu_v2;
window.closeViewerModal = closeViewerModal;
window.loadSheet = loadSheet;
window.generatePreview = generatePreview;
window.toggleSimulationMode = toggleSimulationMode;
window.closeSimulationModal = closeSimulationModal;
window.toggleProcessingRule = toggleProcessingRule;

console.log("✅ VIEWER ENGINE INITIALIZED & EXPOSED");