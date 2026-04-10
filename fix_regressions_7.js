const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// 1. FIX PERSISTENCE IN MODAL
const targetModal = `                const allSheets = window.exportAllSheets ? await window.exportAllSheets() : [];
                window._rawValidSheetsCache = allSheets.filter(s => s.data && s.data.length > 0);`;

const replModal = `                const allSheets = window.exportAllSheets ? await window.exportAllSheets() : [];
                const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
                
                // [FIX V8.5] RESTAURAR ORDEN Y ESTADOS PREVIOS (Persistencia de Sesión)
                if (window._rawValidSheetsCache && window._rawValidSheetsCache.length > 0) {
                     let merged = [];
                     window._rawValidSheetsCache.forEach(cachedSheet => {
                         let fresh = validSheets.find(s => s.name === cachedSheet.name);
                         if (fresh) {
                             if (cachedSheet.hasOwnProperty('_cachedCheck')) fresh._cachedCheck = cachedSheet._cachedCheck;
                             merged.push(fresh);
                         }
                     });
                     validSheets.forEach(fresh => {
                         if (!merged.find(m => m.name === fresh.name)) merged.push(fresh);
                     });
                     window._rawValidSheetsCache = merged;
                } else {
                     window._rawValidSheetsCache = validSheets;
                }`;

if (code.includes(targetModal)) {
    code = code.replace(targetModal, replModal);
    console.log("Modal Persistence patched.");
} else {
    console.log("WARNING: Modal persistence missing.");
}


// 2. SCHEMA UNION (Múltiples Hojas Inclusivas)
const targetSchema = `        // Resolucion Maestro (Cacique)
        let masterVirtualCols = window.virtualColumns;
        let masterColumnMap = columnMapping;
        let masterPipelines = window.draftPipelines;
        
        if (typeof caciqueName !== 'undefined' && caciqueName && window.sheetConfigStore && window.sheetConfigStore[caciqueName]) {
             if (window.sheetConfigStore[caciqueName].virtualCols && window.sheetConfigStore[caciqueName].virtualCols.length > 0) {
                 masterVirtualCols = window.sheetConfigStore[caciqueName].virtualCols;
                 masterColumnMap = window.sheetConfigStore[caciqueName].columnMapping || {};
                 masterPipelines = window.sheetConfigStore[caciqueName].pipelines || {};
             }
        }`;

const replSchema = `        // ---------------- SCHEMA UNION (Unión de Esquemas Inclusiva) ----------------
        let masterVirtualCols = [];
        let masterColumnMap = {};
        let masterPipelines = {};
        let seenUnionTermIds = new Set();
        let syntheticColIdCounter = 1;

        // Armamos un arreglo con TODAS las hojas a escanear (Prioridad de Orden: Cacique Primero)
        let sheetsToScan = [];
        const isMultiSheetSession = (sheetsToProcess && sheetsToProcess.length > 0);
        
        if (isMultiSheetSession) {
            if (typeof caciqueName !== 'undefined' && caciqueName) {
                const caciqueObj = sheetsToProcess.find(s => s.name === caciqueName);
                if (caciqueObj) sheetsToScan.push(caciqueObj);
            }
            sheetsToProcess.forEach(s => {
                if (s.name !== caciqueName) sheetsToScan.push(s);
            });
        } else {
            sheetsToScan.push({ name: window.currentSheetName || 'ActiveSheet' });
        }

        sheetsToScan.forEach(sheetObj => {
             const sName = sheetObj.name;
             let sVirtualCols = window.virtualColumns || [];
             let sColumnMap = (typeof columnMapping !== 'undefined') ? columnMapping : {};
             let sPipelines = window.draftPipelines || {};
             
             // Prioridad 1: Configuración en Caché Fuerte (sheetConfigStore)
             if (window.sheetConfigStore && window.sheetConfigStore[sName]) {
                 if (window.sheetConfigStore[sName].virtualCols && window.sheetConfigStore[sName].virtualCols.length > 0) {
                     sVirtualCols = window.sheetConfigStore[sName].virtualCols;
                     sColumnMap = window.sheetConfigStore[sName].columnMapping || {};
                     sPipelines = window.sheetConfigStore[sName].pipelines || {};
                 }
             }

             // Escaneo de Columnas Únicas
             sVirtualCols.forEach(vCol => {
                 let localDictTermId = sColumnMap[vCol.id];
                 if (!localDictTermId || localDictTermId === 'Ignorar Columna') return;
                 
                 // Resolutive check if dynamic pipeline rewrites the term
                 let resolutiveTermId = localDictTermId;
                 if (sPipelines && sPipelines[vCol.id] && sPipelines[vCol.id].masterField && sPipelines[vCol.id].masterField.id) {
                      resolutiveTermId = sPipelines[vCol.id].masterField.id;
                 }
                 
                 const idSafeKey = String(resolutiveTermId).toLowerCase().trim();

                 // Si la Master Column no está agregada todavía a la Matriz Universal...
                 if (!seenUnionTermIds.has(idSafeKey)) {
                      seenUnionTermIds.add(idSafeKey);
                      
                      const syntheticVColId = 'unionVCol_' + syntheticColIdCounter++;
                      masterVirtualCols.push({ id: syntheticVColId, dataIdx: vCol.dataIdx, originalId: vCol.id, sourceSheet: sName });
                      masterColumnMap[syntheticVColId] = localDictTermId;
                      if (sPipelines && sPipelines[vCol.id]) {
                          masterPipelines[syntheticVColId] = JSON.parse(JSON.stringify(sPipelines[vCol.id]));
                      }
                 }
             });
        });
        // ---------------- FIN SCHEMA UNION ----------------`;

if (code.includes(targetSchema)) {
    code = code.replace(targetSchema, replSchema);
    console.log("Schema Union patched.");
} else {
    // try slightly relaxed whitespace
    const indTest = targetSchema.replace(/            /g, '             ');
    if (code.includes(indTest)) {
         code = code.replace(indTest, replSchema);
         console.log("Schema Union patched (INDENT TYPE 2).");
    } else {
         console.log("WARNING: Schema Union missing");
    }
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log("Finished patching viewer_render.js");
