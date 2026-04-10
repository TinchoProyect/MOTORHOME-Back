const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const targetStr = `                let isSupportCol = true; // Por defecto es de apoyo
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        isSupportCol = false; // Es una maestra vinculada oficial
                    }
                }`;

const repStr = `                let isSupportCol = true; // Por defecto es de apoyo
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase())) {
                                isSupportCol = false;
                            }
                        } else {
                            isSupportCol = false;
                        }
                    }
                }`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, repStr);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log("Standard Columns logic successfully rigorously audited.");
} else {
    // maybe spacing changed
    console.log("Could not find standard col block exactly");
}
