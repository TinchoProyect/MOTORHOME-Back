const fs = require('fs');

let content = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// The rewrite targets ONLY the loop in generatePreview()
const loopTargetStart = '        for (const sheetObj of sheetsToProcess) {';
const loopTargetEnd = '        let sanitizedData = allSanitizedData;';

const indexStart = content.indexOf(loopTargetStart);
const indexEnd = content.indexOf(loopTargetEnd, indexStart) + loopTargetEnd.length;

if (indexStart === -1 || indexEnd === -1) {
    console.error("Could not find targets");
    process.exit(1);
}

// We also need to extract master state before the loop starts.
const injectionStart = content.lastIndexOf('const startIndex = window.currentOffset ? window.currentOffset.row : 0;', indexStart);

const newLogic = `
        const masterColumnMapping = JSON.parse(JSON.stringify(window.columnMapping || {}));
        const masterVirtualColumns = JSON.parse(JSON.stringify(window.virtualColumns || []));
        const originalSheetName = window.currentSheetName;
        
        let allSanitizedData = [];

        for (const sheetObj of sheetsToProcess) {
            const currentSheetIterationData = sheetObj.data;
            if (!currentSheetIterationData || currentSheetIterationData.length === 0) continue;

            // [NUEVO AISLAMIENTO] - Forzar Estado de Hoja Local
            if (window.sheetConfigStore && window.sheetConfigStore[sheetObj.name]) {
                const conf = window.sheetConfigStore[sheetObj.name];
                window.currentOffset = conf.offset || null;
                window.currentEndOffset = conf.endOffset || null;
                window.draftPipelines = conf.pipelines || {};
                window.virtualColumns = conf.virtualCols || [];
                window.columnMapping = conf.columnMapping || {};
            }

            const startIndex = window.currentOffset ? window.currentOffset.row : 0;
            const endIndex = window.currentEndOffset ? window.currentEndOffset.row : currentSheetIterationData.length;

            const localDisplayConfig = [];
            const localSourceConfig = [];

            // RECONSTRUIR CONFIGURACION LOCAL PARA ESTA HOJA
            window.virtualColumns.forEach(vCol => {
                const vColId = vCol.id;
                const termId = window.columnMapping[vColId];
                if (!termId || termId === 'Ignorar Columna') return;
                const dataIdx = vCol.dataIdx;
                if (termId) localSourceConfig.push({ index: dataIdx });
            });

            const rawSlice = currentSheetIterationData.slice(startIndex);

            let sanitizedData = rawSlice.filter((row, localIndex) => {
                const absoluteRow = startIndex + localIndex;
                if (absoluteRow > endIndex) return false;
                
                return localSourceConfig.some(cfg => {
                    const val = row[cfg.index];
                    return val !== undefined && val !== null && String(val).trim() !== '';
                });
            });

            sanitizedData = sanitizedData.filter(row => {
                let keepRow = true;
                Object.keys(window.columnMapping).forEach(vColId => {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    if (!vCol) return;
                    const dataIdx = vCol.dataIdx;

                    const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                    const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                    const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];

                    let cellValue = row[dataIdx];
                    let display = (cellValue !== null && cellValue !== undefined) ? String(cellValue) : "";
                    let clean = null;
                    let rejected = false;

                    if (window.viewerETL && typeof window.viewerETL.transformCell === 'function') {
                        const result = window.viewerETL.transformCell(cellValue, rulesStack, row);
                        display = result.display;
                        clean = result.clean;
                        rejected = result.rejected;
                    }
                    
                    if (!row._localRichContext) row._localRichContext = {};
                    row._localRichContext[vColId] = { clean: clean, display: display, raw: cellValue };
                });
                return true;
            });

            // [NUEVO] TRASLACION PIVOTE - Map Local _richContext -> Master _richContext expected by Unified Table
            sanitizedData.forEach(row => {
                if (!row._richContext) row._richContext = {};
                
                // Mapear Columnas Normales a la expectativa de la hoja maestra
                Object.keys(masterColumnMapping).forEach(masterColId => {
                    const expectedTermId = masterColumnMapping[masterColId];
                    if (expectedTermId === 'Ignorar Columna') return;

                    // En la hoja Mapeadora local, cual Columna virtual tiene este Termino?
                    const localColId = Object.keys(window.columnMapping).find(k => window.columnMapping[k] === expectedTermId);
                    
                    if (localColId && row._localRichContext[localColId]) {
                        row._richContext[masterColId] = row._localRichContext[localColId];
                    } else {
                        row._richContext[masterColId] = { clean: "", display: "", raw: "" };
                    }
                });

                // Limpieza Local Vacios
                let isEmptyRow = true;
                Object.keys(masterColumnMapping).forEach(masterColId => {
                    const expectedTermId = masterColumnMapping[masterColId];
                    if (expectedTermId === 'Ignorar Columna') return;
                    
                    const valObj = row._richContext[masterColId];
                    if (valObj && valObj.display !== null && valObj.display !== undefined && String(valObj.display).trim() !== "") {
                        isEmptyRow = false;
                    }
                });

                if (isEmptyRow) {
                     row._rejectedSim = true;
                     row._emptySilently = true;
                }

                row._sourceSheet = sheetObj.name;
                row._originalIndex = startIndex + sanitizedData.indexOf(row);
                delete row._localRichContext; // Clean up
            });

            allSanitizedData = allSanitizedData.concat(sanitizedData);
        }

        // [COMPLETAR] Restaurar estado Global a la hoja original.
        if (window.sheetConfigStore && window.loadSheetState && originalSheetName) {
            window.loadSheetState(originalSheetName);
        }

        let sanitizedData = allSanitizedData;
`;

const rewritten = content.substring(0, injectionStart) + newLogic + content.substring(indexEnd);
fs.writeFileSync('src/views/js/viewer_render.js', rewritten);
console.log('Successfully patched viewer_render.js generatePreview()');
