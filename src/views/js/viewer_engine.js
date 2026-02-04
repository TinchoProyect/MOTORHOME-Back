
/**
 * VIEWER ENGINE - Sistema de Gestión de Proveedores
 * Módulo de Visualización, Worker Excel y Herramientas de Mapeo
 * v2.6 (Regex Logic Restored + Computed Columns + Preview Fix)
 */

console.log("%c 🚀 VIEWER ENGINE: v2.6 - READY ", "background: #8b5cf6; color: #fff; font-weight: bold; padding: 4px;");

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

    // Reset Buttons visibility (Calc button added)
    const btnMap = document.getElementById('btnMappingMode');
    const btnOffset = document.getElementById('btnOffsetMode');
    const btnCalc = document.getElementById('btnCalcMode'); // New Button

    [btnMap, btnOffset, btnCalc].forEach(btn => {
        if (btn) {
            btn.classList.add('hidden');
            // Reset styles
            btn.classList.remove('bg-blue-600', 'bg-amber-600', 'bg-purple-600', 'text-white', 'border-blue-500', 'animate-pulse');
            btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
        }
    });

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

    offsetSelectionMode = false;
    currentOffset = null;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const downloadUrl = `${backendUrl}/api/files/download/${fileId}`;

        const isExcel = fileName.match(/\.(xlsx|xls|csv)$/i);
        const isPdf = fileName.match(/\.pdf$/i);
        const isImg = fileName.match(/\.(jpg|jpeg|png)$/i);

        if (isExcel) {
            if (btnMap) btnMap.classList.remove('hidden');
            if (btnOffset) btnOffset.classList.remove('hidden');
            if (btnCalc) btnCalc.classList.remove('hidden'); // Show calc button

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error("Error descargando archivo.");
            const arrayBuffer = await response.arrayBuffer();
            currentFileBuffer = arrayBuffer;

            // Worker Init
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

        // Actualizamos el Caché Local
        const idx = nomenclatureCache.findIndex(t => t.id === id);
        if (idx !== -1) {
            // Guardamos el nombre viejo para encontrar columnas afectadas
            const oldName = nomenclatureCache[idx].termino;

            nomenclatureCache[idx].termino = newTerm;
            if (newDesc !== undefined) nomenclatureCache[idx].descripcion_uso = newDesc;
            if (newRules !== undefined) nomenclatureCache[idx].reglas_procesamiento = newRules;

            // 🔥 HOT RELOAD FIX (Actualiza memoria del visor al guardar)
            Object.keys(columnMapping).forEach(colIdx => {
                if (columnMapping[colIdx] === oldName || columnMapping[colIdx] === newTerm) {
                    columnMapping[colIdx] = newTerm; // Sync nombre

                    const updatedRule = nomenclatureCache[idx].reglas_procesamiento;
                    if (updatedRule) {
                        processingRules[colIdx] = JSON.parse(JSON.stringify(updatedRule));
                    } else {
                        delete processingRules[colIdx];
                    }
                    console.log(`[Hot Reload] Regla actualizada en memoria para Col ${colIdx}`);
                }
            });
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

// HELPER: Select for Rules with Integrity Filters
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
        if (t.id === currentTermId) return; // No auto-reference
        if (t.reglas_procesamiento && Object.keys(t.reglas_procesamiento).length > 0) return; // Only leafs

        const opt = document.createElement('option');
        opt.value = t.id;
        opt.text = t.termino;

        if (t.id === currentId) {
            opt.selected = true;
            foundCurrent = true;
        }
        select.appendChild(opt);
    });

    if (currentId && !foundCurrent) {
        const zombieTerm = nomenclatureCache.find(z => z.id === currentId);
        const displayName = zombieTerm ? zombieTerm.termino : (currentId.length > 20 ? "Referencia Rota" : currentId);

        const legacyOpt = document.createElement('option');
        legacyOpt.value = currentId;
        legacyOpt.text = `${displayName} (Inválido)`;
        legacyOpt.classList.add('text-amber-500');
        legacyOpt.selected = true;
        select.appendChild(legacyOpt);
    }

    return select;
}

// RESTORED FULL EDIT MODE WITH RULES
function renderEditMode(container, term) {
    container.className = 'p-3 bg-slate-900 border-l-2 border-blue-500 flex flex-col gap-3 transition-all rounded-r-lg shadow-inner';
    container.innerHTML = '';

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

    // Rules
    const group3 = document.createElement('div');
    group3.className = "space-y-1.5 pt-2 border-t border-slate-800";
    group3.innerHTML = '<label class="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-between"><span>Reglas de Procesamiento</span> <i data-lucide="split" class="w-3 h-3"></i></label>';

    const ruleContainer = document.createElement('div');
    ruleContainer.className = "grid grid-cols-2 gap-2";
    const existingRule = (term.reglas_procesamiento && typeof term.reglas_procesamiento === 'object') ? term.reglas_procesamiento : { delimiter: " + ", fields: [] };

    const inputDelim = document.createElement('input');
    inputDelim.type = 'hidden';
    inputDelim.value = existingRule.delimiter || " + ";

    const val1 = (existingRule.fields && existingRule.fields[0]) ? existingRule.fields[0] : "";
    const field1 = createTermSelect(val1, "Campo 1", term.id);

    const val2 = (existingRule.fields && existingRule.fields[1]) ? existingRule.fields[1] : "";
    const field2 = createTermSelect(val2, "Campo 2", term.id);

    ruleContainer.appendChild(inputDelim);
    ruleContainer.appendChild(field1);
    ruleContainer.appendChild(field2);
    group3.appendChild(ruleContainer);
    container.appendChild(group3);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'flex justify-between items-end gap-2 mt-3 pt-2 border-t border-slate-800';

    const btnDelete = document.createElement('button');
    btnDelete.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3 text-red-500"></i>';
    btnDelete.className = 'p-1.5 rounded hover:bg-red-900/30 transition-colors border border-transparent hover:border-red-900/50';
    btnDelete.onclick = async (e) => {
        e.stopPropagation();
        if (confirm("¿Eliminar término?")) {
            try {
                const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
                await fetch(`${backendUrl}/api/files/dictionary/delete?id=${term.id}`, { method: 'DELETE' });
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

        let parsedRules = undefined;
        if (field1.value || field2.value) {
            parsedRules = {
                type: 'split',
                delimiter: inputDelim.value,
                fields: [field1.value, field2.value]
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

    const activeRules = Object.entries(processingRules).filter(([colIdx, rule]) => {
        return rule && !rule.disabled;
    });

    if (activeRules.length === 0) return originalData;

    const processedData = [];
    // 🔥 SET PARA DEDUPLICAR (Memoria de Elefante)
    const seenValues = new Set();

    for (let i = 0; i < originalData.length; i++) {
        let row = [...originalData[i]];
        let keepRow = true;

        for (const [colIdxStr, rule] of activeRules) {
            const colIdx = parseInt(colIdxStr);
            const cellVal = row[colIdx];
            const strVal = String(cellVal || "").trim();

            // --- A. SANITIZE LOGIC (REGEX FIX v2.6) ---
            if (rule.type === 'sanitize') {
                const fallback = rule.config?.replace_with || "0,00";
                let shouldReplace = false;

                if (!strVal || strVal === "" || strVal.toLowerCase() === "undefined" || strVal.toLowerCase() === "null") {
                    shouldReplace = true;
                }

                if (!shouldReplace && rule.config?.match_regex) {
                    try {
                        let p = rule.config.match_regex;
                        if (p.startsWith('/')) p = p.slice(1);
                        if (p.endsWith('/')) p = p.slice(0, -1);
                        p = p.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6 (DOBLE ESCAPE RESTAURADO)
                        if (new RegExp(p, 'i').test(strVal)) {
                            shouldReplace = true;
                        }
                    } catch (e) { console.warn("Sanitize Regex Error:", e); }
                }

                if (shouldReplace) {
                    row[colIdx] = fallback;
                } else {
                    // Si es un número válido pero tiene punto, lo pasamos a coma
                    if (strVal && strVal.includes('.')) {
                        row[colIdx] = strVal.replace(/\./g, ',');
                    }
                }
            }

            // --- B. FILTER LOGIC (REGEX FIX v2.6) ---
            if (rule.type === 'filter' || rule.type === 'row_filter') {
                if (rule.config?.exclude_empty && strVal === "") {
                    keepRow = false;
                    break;
                }
                if (rule.config?.exclude_regex) {
                    try {
                        let p = rule.config.exclude_regex;
                        if (p.startsWith('/')) p = p.slice(1);
                        if (p.endsWith('/')) p = p.slice(0, -1);
                        p = p.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6 (DOBLE ESCAPE RESTAURADO)
                        if (new RegExp(p, 'i').test(strVal)) {
                            keepRow = false;
                            break;
                        }
                    } catch (e) { }
                }
                // LOGICA DE DEDUPLICACION
                if (rule.config?.unique) {
                    const uniqueKey = strVal.toUpperCase();
                    if (seenValues.has(uniqueKey)) {
                        keepRow = false;
                        break;
                    } else {
                        seenValues.add(uniqueKey);
                    }
                }
            }

            // --- C. TRANSFORM LOGIC (REGEX FIX v2.6) ---
            if (keepRow && (rule.type === 'split' || rule.type === 'regex_split')) {
                let pDesc = strVal;
                let pPres = "";

                if (rule.type === 'regex_split') {
                    try {
                        let patternStr = rule.pattern;
                        if (patternStr) {
                            patternStr = patternStr.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6 (DOBLE ESCAPE RESTAURADO)

                            if (patternStr.startsWith('/')) patternStr = patternStr.slice(1);
                            if (patternStr.endsWith('/i')) patternStr = patternStr.slice(0, -2);
                            else if (patternStr.endsWith('/')) patternStr = patternStr.slice(0, -1);

                            const regex = new RegExp(patternStr, 'i');
                            const match = strVal.match(regex);
                            if (match) {
                                const fullMatch = match[0];
                                pPres = fullMatch.trim();
                                pDesc = strVal.replace(fullMatch, "").trim();
                            }
                        }
                    } catch (e) {
                        console.warn("Regex Error:", e);
                    }
                } else if (rule.type === 'split' && rule.delimiter) {
                    const parts = strVal.split(rule.delimiter);
                    if (parts.length > 0) pDesc = parts[0].trim();
                    if (parts.length > 1) pPres = parts[1].trim();
                }

                if (pPres) {
                    row[colIdx] = `📦 ${pDesc}  |  🏷️ ${pPres}`;
                }
            }

            // --- D. FORMAT LOGIC (v2.3) ---
            if (keepRow && rule.type === 'format_number') {
                let num = parseFloat(String(cellVal).replace(/[^0-9.-]/g, ''));
                if (!isNaN(num)) {
                    row[colIdx] = new Intl.NumberFormat('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                        useGrouping: true
                    }).format(num);
                }
            }
        }

        if (keepRow) {
            processedData.push(row);
        }
    }

    return processedData;
}

function toggleProcessingRule(colIndex) {
    if (processingRules[colIndex]) {
        processingRules[colIndex].disabled = !processingRules[colIndex].disabled;
        renderVirtualTable(currentSheetData);
    }
}

function renderVirtualTable(originalData) {
    // 🔥 MODO MUERTITO: Tabla principal estática (RAW)
    const data = originalData;

    // 🔥 STATE EXPOSURE FOR SATELLITE MODULES (v2.5)
    window.viewerState = { mapping: columnMapping, data: currentSheetData };

    const container = document.getElementById('excelContainer');

    if (!data || data.length === 0) {
        if (container) container.innerHTML = '<div class="text-slate-500 p-4">Hoja vacía o todos los datos fueron filtrados.</div>';
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

        let toggleHtml = '';
        const hasRule = processingRules[j];
        if (mappingMode && hasRule) {
            const isOff = hasRule.disabled;
            toggleHtml = `
                 <button onclick="event.stopPropagation(); toggleProcessingRule(${j})" class="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${isOff ? 'bg-slate-700 text-slate-400' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'} hover:opacity-80 transition-all border border-transparent hover:border-white/20">
                    ${isOff ? 'OFF' : 'ON'}
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

    // Body
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

function toggleSimulationRule(colIndex) {
    if (processingRules[colIndex]) {
        const current = processingRules[colIndex].isSimActive !== undefined ? processingRules[colIndex].isSimActive : true;
        processingRules[colIndex].isSimActive = !current;
        generatePreview();
    }
}

function closeSimulationModal() {
    document.getElementById('simulationModal').classList.add('hidden');
}

function closeViewerModal() {
    document.getElementById('viewerModal').classList.add('hidden');
}

// --- NEW PREVIEW ENGINE ---
let currentSimData = [];
let currentDisplayConfig = [];

function generatePreview() {
    try {
        if (!currentSheetData || currentSheetData.length === 0) return;

        const pName = window.globalContext.providerName || "DESCONOCIDO";
        const fType = window.globalContext.fileType || "GENERAL";
        const modalTitle = document.getElementById('simModalTitle');

        if (modalTitle) {
            modalTitle.innerHTML = `
                <span class="text-slate-400 font-normal">Vista Previa de Extracción:</span> 
                <span class="text-white font-bold ml-2">${pName}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-blue-900 text-blue-300 border border-blue-800 uppercase tracking-wider">${fType}</span>
            `;
        }

        const startRow = currentOffset ? currentOffset.row : 0;
        const rawSlice = currentSheetData.slice(startRow);

        const displayConfig = [];
        const sourceConfig = [];

        Object.keys(columnMapping).forEach(key => {
            const colIdx = parseInt(key);
            const termId = columnMapping[key];

            if (termId && termId !== 'Ignorar Columna') {
                sourceConfig.push({ index: colIdx });

                const termObj = nomenclatureCache.find(t => t.id === termId);
                const termName = termObj ? termObj.termino : termId;

                const rule = processingRules[colIdx];
                const isSimActive = rule ? (rule.isSimActive !== undefined ? rule.isSimActive : true) : false;

                if (rule && isSimActive && rule.type === 'split') {
                    rule.fields.forEach((fieldId, subIdx) => {
                        const fieldObj = nomenclatureCache.find(t => t.id === fieldId);
                        const fieldName = fieldObj ? fieldObj.termino : fieldId;

                        displayConfig.push({
                            label: fieldName,
                            isVirtual: true,
                            sourceIndex: colIdx,
                            transform: (val) => {
                                if (!val) return '';
                                const valStr = String(val);
                                const parts = valStr.split(rule.delimiter);
                                return parts[subIdx] ? parts[subIdx].trim() : '';
                            },
                            hasSwitch: subIdx === 0,
                            switchState: true,
                            switchColIdx: colIdx
                        });
                    });
                }
                else if (rule && isSimActive && rule.type === 'regex_split') {
                    // 🔥 HEADERS DINÁMICOS
                    const targets = [];
                    if (rule.fields && rule.fields.length > 0) {
                        rule.fields.forEach(fid => {
                            const t = nomenclatureCache.find(x => x.id === fid);
                            targets.push(t ? t.termino : "Campo Dinámico");
                        });
                    }
                    if (targets.length === 0 && rule.target_labels) {
                        targets.push(...rule.target_labels);
                    }

                    let patternStr = rule.pattern;
                    if (patternStr) {
                        patternStr = patternStr.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6 (Double backslash restored)
                        if (patternStr.startsWith('/')) patternStr = patternStr.slice(1);
                        if (patternStr.endsWith('/i')) patternStr = patternStr.slice(0, -2);
                        else if (patternStr.endsWith('/')) patternStr = patternStr.slice(0, -1);

                        const regex = new RegExp(patternStr, 'i');

                        targets.forEach((label, subIdx) => {
                            displayConfig.push({
                                label: label,
                                isVirtual: true,
                                sourceIndex: colIdx,
                                transform: (val) => {
                                    if (!val) return '';
                                    const valStr = String(val).trim();
                                    const match = valStr.match(regex);
                                    if (match) {
                                        const fullMatch = match[0];
                                        const presentation = fullMatch.trim();
                                        const description = valStr.replace(fullMatch, "").trim();
                                        return subIdx === 0 ? description : presentation;
                                    } else {
                                        return subIdx === 0 ? valStr : "";
                                    }
                                },
                                hasSwitch: subIdx === 0,
                                switchState: true,
                                switchColIdx: colIdx
                            });
                        });
                    }
                }
                // --- D. SANITIZE PREVIEW LOGIC (REGEX FIX v2.6) ---
                else if (rule && isSimActive && rule.type === 'sanitize') {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => {
                            const strVal = String(val || "").trim();
                            const fallback = rule.config?.replace_with || "0,00";
                            if (strVal === "" || strVal.toLowerCase() === "undefined" || strVal.toLowerCase() === "null") return fallback;
                            if (rule.config?.match_regex) {
                                try {
                                    let p = rule.config.match_regex;
                                    if (p.startsWith('/')) p = p.slice(1);
                                    if (p.endsWith('/')) p = p.slice(0, -1);
                                    p = p.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6
                                    if (new RegExp(p, 'i').test(strVal)) return fallback;
                                } catch (e) { }
                            }
                            // Si tiene punto, visualmente mostralo con coma
                            return val && String(val).includes('.') ? String(val).replace(/\./g, ',') : val;
                        },
                        hasSwitch: true,
                        switchState: rule.isSimActive !== false,
                        switchColIdx: colIdx
                    });
                }
                // --- E. FORMAT NUMBER LOGIC ---
                else if (rule && isSimActive && rule.type === 'format_number') {
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => {
                            const strVal = String(val);
                            let num = parseFloat(strVal);
                            if (isNaN(num)) {
                                num = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
                            }
                            if (!isNaN(num)) {
                                return new Intl.NumberFormat('es-AR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true
                                }).format(num);
                            }
                            return val;
                        },
                        hasSwitch: true,
                        switchState: rule.isSimActive !== false,
                        switchColIdx: colIdx
                    });
                }
                else {
                    // Default / Identity
                    displayConfig.push({
                        label: termName,
                        isVirtual: false,
                        sourceIndex: colIdx,
                        transform: (val) => val,
                        hasSwitch: !!rule,
                        switchState: rule ? (rule.isSimActive !== false) : false,
                        switchColIdx: colIdx
                    });
                }
            }
        });

        // --- F. COMPUTED COLUMNS LOGIC (v2.5) ---
        if (window.computedColumns && window.computedColumns.length > 0) {
            window.computedColumns.forEach(comp => {
                displayConfig.push({
                    label: comp.name,
                    isVirtual: true,
                    // Note: We use a wrapper to access the full ROW
                    transform: (val, row) => {
                        try {
                            const parseVal = (v) => {
                                if (!v) return 0;
                                let s = String(v).trim();
                                if (!isNaN(s)) return parseFloat(s);
                                // Limpieza agresiva de moneda
                                s = s.replace(/[^0-9,.-]/g, '');
                                if (s.includes(',') && s.includes('.')) {
                                    s = s.replace(/\./g, '').replace(',', '.');
                                } else if (s.includes(',')) {
                                    s = s.replace(',', '.');
                                }
                                return parseFloat(s) || 0;
                            };

                            const valA = parseVal(row[comp.sourceA]); // Precio
                            const valB = parseVal(row[comp.sourceB]); // Descuento

                            // Lógica: Precio * (1 - Descuento)
                            const result = valA * (1 - valB);

                            return new Intl.NumberFormat('es-AR', {
                                minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true
                            }).format(result);

                        } catch (e) { return "ERR"; }
                    },
                    hasSwitch: true,
                    switchState: true,
                    switchColIdx: -1
                });
            });
        }

        if (displayConfig.length === 0) {
            alert("Primero debes mapear al menos una columna.");
            return;
        }

        let sanitizedData = rawSlice.filter(row => {
            return sourceConfig.some(cfg => {
                const val = row[cfg.index];
                return val !== undefined && val !== null && String(val).trim() !== '';
            });
        });

        // 🔥 FILTRADO REAL + ANTI-DUPLICADOS (REGEX FIX v2.6)
        const seenValues = new Set();

        sanitizedData = sanitizedData.filter(row => {
            let keepRow = true;
            Object.keys(columnMapping).forEach(key => {
                const colIdx = parseInt(key);
                const rule = processingRules[colIdx];

                if (rule && (rule.type === 'filter' || rule.type === 'row_filter') && rule.isSimActive !== false) {
                    const cellValue = row[colIdx];
                    if (rule.config?.exclude_empty) {
                        if (!cellValue || String(cellValue).trim() === '') keepRow = false;
                    }
                    if (keepRow && rule.config?.exclude_regex) {
                        try {
                            let p = rule.config.exclude_regex;
                            if (p.startsWith('/')) p = p.slice(1);
                            if (p.endsWith('/')) p = p.slice(0, -1);
                            p = p.replace(/\\\\/g, '\\'); // 🔥 FIX v2.6
                            if (new RegExp(p, 'i').test(String(cellValue))) keepRow = false;
                        } catch (e) { console.error("Filter Regex Error", e); }
                    }
                    if (keepRow && rule.config?.unique) {
                        const uniqueKey = String(cellValue || "").toUpperCase().trim();
                        if (seenValues.has(uniqueKey)) {
                            keepRow = false;
                        } else {
                            seenValues.add(uniqueKey);
                        }
                    }
                }
            });
            return keepRow;
        });

        currentSimData = sanitizedData;
        currentDisplayConfig = displayConfig;

        const container = document.getElementById('simulationTableContainer');
        if (!container) return;

        let optionsHtml = '<option value="ALL">Todos los Campos</option>';
        displayConfig.forEach((cfg, idx) => {
            optionsHtml += `<option value="${idx}">${cfg.label}</option>`;
        });

        const toolbar = `
            <div class="flex items-center gap-3 mb-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
                <div class="relative flex-grow">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"></i>
                    <input type="text" id="simSearchInput" placeholder="Filtrar datos..." oninput="filterSimulationData()" 
                        class="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
                </div>
                <select id="simSearchField" onchange="filterSimulationData()" class="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 max-w-[150px]">
                    ${optionsHtml}
                </select>
                <div class="text-[10px] text-slate-500 font-mono px-2 border-l border-slate-700">
                    <span id="simFilteredCount">${sanitizedData.length}</span> / ${sanitizedData.length}
                </div>
            </div>
            <div id="simTableScrollArea" class="overflow-auto max-h-[60vh]">
            </div>
        `;

        container.innerHTML = toolbar;
        renderSimulationTable(sanitizedData);

        document.getElementById('simulationModal').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons({ root: container });

        document.getElementById('simMeta').innerHTML = `
            <span class="text-slate-400">Total Filas Útiles:</span> <span class="text-white font-bold">${sanitizedData.length}</span> 
            <span class="text-slate-600 mx-2">|</span> 
            <span class="text-slate-400">Columnas:</span> <span class="text-white font-bold">${displayConfig.length}</span>
        `;

    } catch (error) {
        console.error("Critical Preview Error:", error);
        alert("Error en Previsualizador: " + error.message);
    }
}

function filterSimulationData() {
    const rawQuery = document.getElementById('simSearchInput').value.toLowerCase().trim();
    const fieldIdx = document.getElementById('simSearchField').value;
    const countEl = document.getElementById('simFilteredCount');

    if (!rawQuery) {
        renderSimulationTable(currentSimData);
        if (countEl) countEl.innerText = currentSimData.length;
        return;
    }

    const terms = rawQuery.split(/\s+/).filter(t => t.length > 0);

    const filtered = currentSimData.filter(row => {
        return terms.every(term => {
            if (fieldIdx === "ALL") {
                return currentDisplayConfig.some(cfg => {
                    const val = cfg.transform(row[cfg.sourceIndex], row); // 🔥 PASS ROW (v2.5)
                    return String(val).toLowerCase().includes(term);
                });
            } else {
                const cfg = currentDisplayConfig[parseInt(fieldIdx)];
                if (!cfg) return false;
                const val = cfg.transform(row[cfg.sourceIndex], row); // 🔥 PASS ROW (v2.5)
                return String(val).toLowerCase().includes(term);
            }
        });
    });

    renderSimulationTable(filtered);
    if (countEl) countEl.innerText = filtered.length;
}

function renderSimulationTable(data) {
    const scrollArea = document.getElementById('simTableScrollArea');
    if (!scrollArea) return;

    let html = "<table class='min-w-full text-xs text-slate-300 font-mono'><thead><tr class='bg-slate-950 sticky top-0'>";

    currentDisplayConfig.forEach(cfg => {
        let content = cfg.label;
        if (cfg.hasSwitch) {
            const checked = cfg.switchState ? 'checked' : '';
            content = `
                <div class="flex items-center gap-2 justify-between">
                    <span>${cfg.label}</span>
                    <label class="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" onclick="toggleSimulationRule(${cfg.switchColIdx})" ${checked} class="sr-only peer">
                        <div class="w-7 h-3.5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-500 hover:bg-slate-600"></div>
                    </label>
                </div>
            `;
        }
        let thClass = "p-2 border border-slate-700 text-left align-middle ";
        thClass += cfg.isVirtual ? "bg-emerald-900/10 text-emerald-300 border-emerald-500/20" : "bg-blue-900/20 text-blue-300";
        html += `<th class="${thClass}">${content}</th>`;
    });
    html += "</tr></thead><tbody>";

    data.forEach((row) => {
        html += "<tr class='hover:bg-slate-800/50 border-b border-slate-800'>";
        currentDisplayConfig.forEach(cfg => {
            const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
            const finalVal = cfg.transform(rawVal, row); // 🔥 PASS ROW (v2.5)
            html += `<td class="p-2 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${finalVal}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody></table>";
    scrollArea.innerHTML = html;
}

// --- 4. EXPOSICIÓN GLOBAL (Bindings) ---
// --- 4. EXPOSICIÓN GLOBAL (Bindings) ---
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
window.toggleSimulationRule = toggleSimulationRule;
window.filterSimulationData = filterSimulationData;

// [PHASE 4] Snapshot Export for Ingestion
// --- PUBLIC API FOR MODULES ---
window.getViewerSnapshot = function () {
    return (typeof currentSheetData !== 'undefined') ? currentSheetData : null;
};

console.log("✅ VIEWER ENGINE INITIALIZED & EXPOSED");