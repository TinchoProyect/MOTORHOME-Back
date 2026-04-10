const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const targetStr = `                // 2. Verificación Dinámica (Pipeline)
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        isSupportCol = true; // Reset strict
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase())) {
                                isSupportCol = false;
                            }
                        }
                    }
                }
                const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;`;

const replaceStr = `                // 2. Verificación Dinámica (Pipeline)
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        isSupportCol = true; // Reset strict
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase())) {
                                isSupportCol = false;
                            }
                        }
                    }
                }

                // [V4/V5] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT
                const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log("Restored savedPipeline");
} else {
    // try a broader replacement if the space differs
    const backupTarget = `                }
                const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;`;
    if (code.includes(backupTarget)) {
        const backupReplace = `                }
                const savedPipeline = window.draftPipelines && window.draftPipelines[vColId] ? window.draftPipelines[vColId].rules : null;
                const pipelineData = (window.activeEtlState && window.activeEtlState.isOpen && window.activeEtlState.colIndex === vColId) ? window.activeEtlState.pipeline : savedPipeline;`;
        code = code.replace(backupTarget, backupReplace);
        fs.writeFileSync('src/views/js/viewer_render.js', code);
        console.log("Restored savedPipeline via fallback");
    } else {
        console.log("Target String not found.");
    }
}
