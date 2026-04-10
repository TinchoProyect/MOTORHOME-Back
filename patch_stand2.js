const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t = /let isSupportCol = true; \/\/ Por defecto es de apoyo\s+if \(window\.draftPipelines && window\.draftPipelines\[vColId\]\) {\s+const pipe = window\.draftPipelines\[vColId\];\s+if \(pipe && pipe\.masterField && pipe\.masterField\.id\) {\s+isSupportCol = false; \/\/ Es una maestra vinculada oficial\s+}\s+}/g;

const r = `let isSupportCol = true; // Por defecto es de apoyo
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

if (t.test(code)) {
    code = code.replace(t, r);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log('Regex replace successful for standard columns');
} else {
    console.log('Regex could not match standard column logic.');
}
