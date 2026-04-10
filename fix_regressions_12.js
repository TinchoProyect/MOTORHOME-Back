const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const scanStart = code.indexOf('        sheetsToScan.forEach(sheetObj => {');
const scanEnd = code.indexOf('        // ---------------- FIN SCHEMA UNION ----------------');

if (scanStart !== -1 && scanEnd !== -1) {
    const newScanner = `        sheetsToScan.forEach(sheetObj => {
             const sName = sheetObj.name;
             let sVirtualCols = window.virtualColumns || [];
             let sColumnMap = (typeof columnMapping !== 'undefined') ? columnMapping : {};
             let sPipelines = window.draftPipelines || {};
             let sComputedCols = window.computedColumns || []; // Fantasmas!
             
             // Prioridad 1: Configuración en Caché Fuerte (sheetConfigStore)
             if (window.sheetConfigStore && window.sheetConfigStore[sName]) {
                 if (window.sheetConfigStore[sName].virtualCols && window.sheetConfigStore[sName].virtualCols.length > 0) {
                     sVirtualCols = window.sheetConfigStore[sName].virtualCols;
                     sColumnMap = window.sheetConfigStore[sName].columnMapping || {};
                     sPipelines = window.sheetConfigStore[sName].pipelines || {};
                     sComputedCols = window.sheetConfigStore[sName].computedCols || window.sheetConfigStore[sName].computedColumns || [];
                 }
             }

             // Ayudante Unificador para ingresar Keys Válidas
             const registerToUnion = (dictId, rawColObj) => {
                 const idSafeKey = String(dictId).toLowerCase().trim();
                 
                 // [NUEVO] PURGA SANITARIA DETERMINISTA: Si no existe en el Master Dictionary, ES INVALIDA! 
                 // (Previene fugas de columnas auxiliares de "Origen 1" o Split Transitorio)
                 const validDictEntry = window.masterDictionary ? window.masterDictionary.find(d => d.id === dictId || String(d.id).toLowerCase().trim() === idSafeKey) : null;
                 if (!validDictEntry) return;

                 if (!seenUnionTermIds.has(idSafeKey)) {
                      seenUnionTermIds.add(idSafeKey);
                      
                      const syntheticVColId = 'unionVCol_' + syntheticColIdCounter++;
                      masterVirtualCols.push({ id: syntheticVColId, dataIdx: rawColObj.dataIdx, originalId: rawColObj.id, sourceSheet: sName, label: validDictEntry.nombre_campo });
                      masterColumnMap[syntheticVColId] = validDictEntry.id;
                      if (sPipelines && sPipelines[rawColObj.id]) {
                          masterPipelines[syntheticVColId] = JSON.parse(JSON.stringify(sPipelines[rawColObj.id]));
                      }
                 }
             };

             // Escaneo de Columnas Únicas
             sVirtualCols.forEach(vCol => {
                 let localDictTermId = sColumnMap[vCol.id];
                 if (!localDictTermId || localDictTermId === 'Ignorar Columna') return;
                 
                 let resolutiveTermId = localDictTermId;
                 if (sPipelines && sPipelines[vCol.id] && sPipelines[vCol.id].masterField && sPipelines[vCol.id].masterField.id) {
                      resolutiveTermId = sPipelines[vCol.id].masterField.id;
                 }
                 
                 registerToUnion(resolutiveTermId, vCol);
             });
             
             // Escaneo de Columnas Fantasmas (Cálculos Post-Mapeo)
             if (sComputedCols && Array.isArray(sComputedCols)) {
                 sComputedCols.forEach(cCol => {
                      let calcId = cCol.masterField?.id || cCol.id;
                      registerToUnion(calcId, cCol);
                 });
             }
        });
`;

    code = code.substring(0, scanStart) + newScanner + code.substring(scanEnd);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log("PrePass Scanner Patched.");
} else {
    console.log("Could not locate scan block.");
}
