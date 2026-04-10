const fs = require('fs');

const origLines = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').split('\n');

const startIdx = 695; // function generatePreview() {
const endIdx = 1211; // } // END generatePreview

const orgArr = origLines.slice(startIdx, endIdx + 1);

const confStart = orgArr.findIndex(line => line.includes('const startRow = currentOffset ? currentOffset.row : 0;')) + 1;
const confEnd = orgArr.findIndex(line => line.includes('let allSanitizedData = [];'));
const configBuilderBlock = orgArr.slice(confStart, confEnd).join('\n');

const prefixBlock = orgArr.slice(0, confStart - 1).join('\n');

const newLogicCode = `        
        const masterColumnMapping = JSON.parse(JSON.stringify(window.columnMapping || {}));
        const masterVirtualColumns = JSON.parse(JSON.stringify(window.virtualColumns || []));
        const originalSheetName = window.currentSheetName;
        const masterDisplayConfigMap = new Map();
        
        let allSanitizedData = [];

        for (const sheetObj of sheetsToProcess) {
            const currentSheetIterationData = sheetObj.data;
            if (!currentSheetIterationData || currentSheetIterationData.length === 0) continue;

            if (window.sheetConfigStore && window.sheetConfigStore[sheetObj.name]) {
                const conf = window.sheetConfigStore[sheetObj.name];
                window.currentOffset = conf.offset || null;
                window.currentEndOffset = conf.endOffset || null;
                window.draftPipelines = conf.pipelines || {};
                window.virtualColumns = conf.virtualCols || [];
                window.columnMapping = conf.columnMapping || {};
            }

            const currentOffset = window.currentOffset;
            const nomenclatureCache = window.nomenclatureCache || [];
            const columnMapping = window.columnMapping || {};

            const startRow = window.currentOffset ? window.currentOffset.row : 0;
            const endIndex = window.currentEndOffset ? window.currentEndOffset.row : currentSheetIterationData.length;

${configBuilderBlock}

            // Pivot local rules to global master layout expectation
            displayConfig.forEach(cfg => {
                const termId = window.columnMapping[cfg.virtualColId] || cfg.label;
                let unifiedKey = cfg.isComputed ? \`COMP_\${cfg.label}\` : termId;
                
                if (cfg.hasSwitch === false && !cfg.isComputed && termId === cfg.label) unifiedKey = \`DYN_\${cfg.label}\`;
                
                if (!masterDisplayConfigMap.has(unifiedKey)) {
                    const cCfg = Object.assign({}, cfg);
                    cCfg.unifiedKey = unifiedKey;
                    masterDisplayConfigMap.set(unifiedKey, cCfg);
                }
            });

            const rawSlice = currentSheetIterationData.slice(startRow);

            let sanitizedData = rawSlice.filter((row, localIndex) => {
                const absoluteRow = startRow + localIndex;
                if (absoluteRow > endIndex) return false;
                return sourceConfig.some(cfg => {
                    const val = row[cfg.index];
                    return val !== undefined && val !== null && String(val).trim() !== '';
                });
            });

            sanitizedData = sanitizedData.filter(row => {
                Object.keys(columnMapping).forEach(vColId => {
                    const vCol = window.virtualColumns.find(v => v.id === vColId);
                    if (!vCol) return;
                    const dataIdx = vCol.dataIdx;
                    const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                    const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;
                    const rulesStack = pipelineData ? (Array.isArray(pipelineData) ? pipelineData : [pipelineData]) : [];
                    let cellValue = row[dataIdx];
                    let display = (cellValue !== null && cellValue !== undefined) ? String(cellValue) : '';
                    let clean = null;
                    if (window.viewerETL && typeof window.viewerETL.transformCell === 'function') {
                        const result = window.viewerETL.transformCell(cellValue, rulesStack, row);
                        display = result.display;
                        clean = result.clean;
                    }
                    if (!row._localRichContext) row._localRichContext = {};
                    row._localRichContext[vColId] = { clean: clean, display: display, raw: cellValue };
                });
                return true;
            });

            sanitizedData.forEach(row => {
                if (!row._richContext) row._richContext = {};
                row._sourceSheet = sheetObj.name;
                row._originalIndex = startRow + sanitizedData.indexOf(row);
                
                row._unifiedContext = {};
                Object.keys(window.columnMapping).forEach(vColId => {
                    const termId = window.columnMapping[vColId];
                    if (termId && termId !== 'Ignorar Columna' && row._localRichContext[vColId]) {
                        row._unifiedContext[termId] = row._localRichContext[vColId];
                    }
                });

                displayConfig.forEach(cfg => {
                    let finalVal = null;
                    let targetKey = null;

                    if (cfg.isComputed) {
                        targetKey = \`COMP_\${cfg.label}\`;
                        finalVal = cfg.transform(null, row);
                        if(finalVal !== null && finalVal !== undefined) row._unifiedContext[targetKey] = { display: finalVal, clean: finalVal, raw: finalVal };
                    } else if (cfg.hasSwitch === false && cfg.label !== columnMapping[cfg.virtualColId]) {
                        targetKey = \`DYN_\${cfg.label}\`;
                        const rawVal = cfg.sourceIndex >= 0 ? row[cfg.sourceIndex] : null;
                        finalVal = cfg.transform(rawVal, row);
                        if(finalVal !== null && finalVal !== undefined) row._unifiedContext[targetKey] = { display: finalVal, clean: finalVal, raw: finalVal };
                    }
                });

                let isEmptyRow = true;
                displayConfig.forEach(cfg => {
                    const termId = window.columnMapping[cfg.virtualColId] || cfg.label;
                    let uKey = cfg.isComputed ? \`COMP_\${cfg.label}\` : termId;
                    if (cfg.hasSwitch === false && !cfg.isComputed && termId === cfg.label) uKey = \`DYN_\${cfg.label}\`;
                    
                    const finalObj = row._unifiedContext[uKey];
                    const finalVal = finalObj ? finalObj.display : null;
                    if (finalVal !== null && finalVal !== undefined && String(finalVal).trim() !== '') {
                        isEmptyRow = false;
                    }
                    row._richContext[cfg.virtualColId] = row._localRichContext[cfg.virtualColId] || finalObj;
                });

                if (isEmptyRow) {
                     row._rejectedSim = true;
                     row._emptySilently = true;
                }
                
                delete row._localRichContext;
            });

            allSanitizedData = allSanitizedData.concat(sanitizedData);
        }

        if (window.sheetConfigStore && window.loadSheetState && originalSheetName) {
            window.loadSheetState(originalSheetName);
        } else {
            window.columnMapping = masterColumnMapping;
            window.virtualColumns = masterVirtualColumns;
        }

        window.currentDisplayConfig = Array.from(masterDisplayConfigMap.values());
        let sanitizedData = allSanitizedData;
`;

const dataEndIdx = orgArr.findIndex(line => line.includes('let sanitizedData = allSanitizedData;'));
const resFuncBlockStr = prefixBlock + '\n' + newLogicCode + '\n' + orgArr.slice(dataEndIdx + 1).join('\n');

const finalCode = origLines.slice(0, startIdx).join('\n') + '\n' + resFuncBlockStr + '\n' + origLines.slice(endIdx + 1).join('\n');

// Then patch renderSimulationTable which is OUTSIDE of generatePreview() !!
let tableFixed = finalCode.replace('let finalVal = row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null;', 'let finalVal = row._unifiedContext && cfg.unifiedKey && row._unifiedContext[cfg.unifiedKey] ? row._unifiedContext[cfg.unifiedKey].display : (row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null);');

fs.writeFileSync('src/views/js/viewer_render.js', tableFixed);

console.log('Success completely refactored via AST-like slice targeting');
