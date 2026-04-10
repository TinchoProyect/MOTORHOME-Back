const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').replace(/\r\n/g, '\n');

// Nos saltamos la verificación estricta de cacique aquí y aplicamos directo al constructor de renderización:
// 1. OBTENER CONFIGURACIONES DE CACIQUE PARA EL DISPLAY CONFIG
const targetDisplayInit = `
        const displayConfig = [];
        const sourceConfig = [];

        window.virtualColumns.forEach(vCol => {
            const vColId = vCol.id;
            const termId = columnMapping[vColId];`;

const replDisplayInit = `
        const displayConfig = [];
        const sourceConfig = [];

        // Resolucion Maestro (Cacique)
        let masterVirtualCols = window.virtualColumns;
        let masterColumnMap = columnMapping;
        let masterPipelines = window.draftPipelines;
        
        if (typeof caciqueName !== 'undefined' && caciqueName && window.sheetConfigStore && window.sheetConfigStore[caciqueName]) {
             if (window.sheetConfigStore[caciqueName].virtualCols && window.sheetConfigStore[caciqueName].virtualCols.length > 0) {
                 masterVirtualCols = window.sheetConfigStore[caciqueName].virtualCols;
                 masterColumnMap = window.sheetConfigStore[caciqueName].columnMapping || {};
                 masterPipelines = window.sheetConfigStore[caciqueName].pipelines || {};
             }
        }

        masterVirtualCols.forEach(vCol => {
            const vColId = vCol.id;
            const termId = masterColumnMap[vColId];`;

if(code.includes(targetDisplayInit)){
    code = code.replace(targetDisplayInit, replDisplayInit);
    console.log("Cacique Display Config Patched");
} else {
    console.log("Failed Cacique display patch");
}

// 2. PARCHEAR LECTURAS GLOBALES A master* EN EL CICLO DE CONSTRUCCION DE CABECERAS
// Reemplazar window.draftPipelines por masterPipelines
// PERO CON CUIDADO. Solo en el bloque antes del for (sheetsToProcess)
const displayGenBlockEndIndex = code.indexOf('for (const sheetObj of sheetsToProcess) {');
if (displayGenBlockEndIndex > -1) {
    let displayGenBlock = code.substring(0, displayGenBlockEndIndex);
    let afterBlock = code.substring(displayGenBlockEndIndex);
    
    // Replace window.draftPipelines -> masterPipelines in displayGenBlock
    displayGenBlock = displayGenBlock.replace(/window\.draftPipelines/g, 'masterPipelines');
    
    // Inject termId into displayConfig pushing phase
    displayGenBlock = displayGenBlock.replace(/(displayConfig\.push\(\{[^}]*)virtualColId: vColId/g, '$1virtualColId: vColId, termId: termId');
    // Ensure terminal ids for dynamic targets are pushed as well. Wait, split logic sets specific targets. Let's just use a general replace for termId.
    
    code = displayGenBlock + afterBlock;
    console.log("Master globals mapped for Display Config");
}


// 3. AISLAR EL CONTEXTO LOCAL DE CADA HOJA DURANTE EL ETL
const targetFilterLogic = `
            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                Object.keys(columnMapping).forEach(vColId => {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    if (!vCol) return;
                    const dataIdx = vCol.dataIdx;

                    const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                    const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                    const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];`;

const replFilterLogic = `
            // Contexto individual de hoja para evitar 'Pipeline Amnesia'
            let localColumnMap = columnMapping;
            let localVirtualCols = window.virtualColumns;
            let localPipelines = window.draftPipelines;
            
            // Si la hoja tiene su propia configuración (Mapeada alguna vez), úsala. 
            // Si no, recae en Cacique (masterColumnMap)
            if (window.sheetConfigStore && window.sheetConfigStore[sheetObj.name]) {
                if (window.sheetConfigStore[sheetObj.name].virtualCols && window.sheetConfigStore[sheetObj.name].virtualCols.length > 0) {
                    localVirtualCols = window.sheetConfigStore[sheetObj.name].virtualCols;
                    localColumnMap = window.sheetConfigStore[sheetObj.name].columnMapping || {};
                    localPipelines = window.sheetConfigStore[sheetObj.name].pipelines || {};
                } else {
                    // Fallback to Cacique for completely blank mapped sheets that were added casually
                    if (typeof masterVirtualCols !== 'undefined') {
                        localVirtualCols = masterVirtualCols;
                        localColumnMap = masterColumnMap;
                        localPipelines = masterPipelines;
                    }
                }
            } else if (typeof masterVirtualCols !== 'undefined') {
                localVirtualCols = masterVirtualCols;
                localColumnMap = masterColumnMap;
                localPipelines = masterPipelines;
            }

            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                Object.keys(localColumnMap).forEach(vColId => {
                    const vCol = localVirtualCols.find(v => v.id === vColId);
                    if (!vCol) return;
                    const dataIdx = vCol.dataIdx;

                    // NOTA V8.3: No interpolamos activeEtlState local si estamos en Batch processing de multi-hoja, a menos que coincida estrictamente.
                    const savedPipeline = localPipelines && localPipelines[vColId] ? localPipelines[vColId].rules : null;
                    const isFocusSheet = (window.currentSheetName === sheetObj.name);
                    const pipelineData = (isFocusSheet && window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                    const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];`;

if(code.includes(targetFilterLogic)){
    code = code.replace(targetFilterLogic, replFilterLogic);
    console.log("Local Context applied to row filter");
} else {
    console.log("Failed Local Context filter logic patch");
}


// 4. ALMACENAR Y RESOLVER EL VALOR VIA TERMID (Traducción Maestro <-> Base)
const targetDictAssign = `                    if (!row._richContext) row._richContext = {};
                    row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };

                    let localReject = rejected;`;

const replDictAssign = `                    if (!row._richContext) row._richContext = {};
                    row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };

                    // INDEXACION MULTI-HOJA VIA TERMINAL/DICCIONARIO
                    const baseTermId = localColumnMap[vColId];
                    if (baseTermId && baseTermId !== 'Ignorar Columna') {
                        if (!row._richContextByTerm) row._richContextByTerm = {};
                        // Usamos terminología resolutiva si hay un cambio de nombre en dict, o id base.
                        let resolutiveTerm = baseTermId;
                        if (localPipelines && localPipelines[vColId] && localPipelines[vColId].masterField && localPipelines[vColId].masterField.id) {
                            resolutiveTerm = localPipelines[vColId].masterField.id;
                        }
                        
                        // Normalizamos ids para asegurar ruteo
                        const safeKey = String(resolutiveTerm).toLowerCase().trim();
                        // Guardamos múltiples referencias si es necesario para matchear luego
                        row._richContextByTerm[safeKey] = { clean: clean, display: display, raw: cellValue, sourceId: vColId };
                        row._richContextByTerm[baseTermId] = { clean: clean, display: display, raw: cellValue, sourceId: vColId };
                    }

                    let localReject = rejected;`;

let testTargetDictAssig = code.includes(targetDictAssign) ? targetDictAssign : `                    if (!row._richContext) row._richContext = {};
                    row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };

                    let localReject = rejected;`;

// A veces el let dictTermId viene antes o despues. The exact block in viewer_render.js is:
const realTargetAssig = `
                    if (!row._richContext) row._richContext = {};
                    row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };

                    let localReject = rejected;`;

if(code.indexOf('row._richContext[vColId] = { clean: clean, display: display, raw: cellValue };') > -1){
    code = code.replace(realTargetAssig, replDictAssign);
    console.log("Dictionary index mapped for row iteration");
}


// 5. EXTRAYENDO VALOR DEL RENDERING VIA TERM O FALLBACK AL SOURCE ID
const targetExtract = `                displayConfig.forEach(cfg => {
                     let finalVal = null;
                     if (cfg.isComputed) {
                         finalVal = cfg.transform(null, row);
                     } else {
                         const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
                         finalVal = row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null;
                         if(finalVal === null || finalVal === undefined) finalVal = cfg.transform(rawVal, row);
                     }`;

const replExtract = `                displayConfig.forEach(cfg => {
                     let finalVal = null;
                     if (cfg.isComputed) {
                         // Computadas se evaluan via su transform genérico (esto se ajustaría, pero usualmente fallbackea si no halla datos del virtualColId global, requiere mejora luego)
                         finalVal = cfg.transform(null, row);
                     } else {
                         const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
                         
                         // EXTRACT VIA CROSS-REFERENCE TERM TRANSLATOR
                         let resolvedByRuteo = false;
                         if (cfg.termId && row._richContextByTerm) {
                             const searchTermExact = String(cfg.termId).trim();
                             const searchTermLower = searchTermExact.toLowerCase();
                             if (row._richContextByTerm[searchTermLower]) {
                                 finalVal = row._richContextByTerm[searchTermLower].display;
                                 resolvedByRuteo = true;
                             } else if (row._richContextByTerm[searchTermExact]) {
                                 finalVal = row._richContextByTerm[searchTermExact].display;
                                 resolvedByRuteo = true;
                             }
                         }

                         // FALLBACK A MATRICIALIDAD VIRTUAL (Misma hoja y estructura que Cacique)
                         if (!resolvedByRuteo) {
                             finalVal = row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null;
                             if(finalVal === null || finalVal === undefined) {
                                 finalVal = cfg.transform(rawVal, row);
                             }
                         }
                     }`;

if(code.includes(targetExtract)){
    code = code.replace(targetExtract, replExtract);
    console.log("Extraction Unification Pipeline done");
} else {
    // maybe indent varies slightly
    const indTest = targetExtract.replace(/ {16}/g, '                 ').replace(/ {21}/g, '                     ');
    if (code.includes(indTest)) {
         code = code.replace(indTest, replExtract);
         console.log("Extraction Unification Pipeline done (INDENT TYPE 2)");
    } else {
         console.log("Failed Extract Unification Logic");
    }
}


fs.writeFileSync('src/views/js/viewer_render.js', code);
