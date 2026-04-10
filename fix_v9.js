const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// 1. Fixing Native Validation
const t1 = `                let isSupportCol = true; // Por defecto es de apoyo
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

const r1 = `                let isSupportCol = true; 
                
                // Native Binding Check
                if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(termId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(termId).toLowerCase())) {
                        isSupportCol = false;
                    }
                }

                // Pipeline strict override (If pipeline has a field, it supersedes native)
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        isSupportCol = true; // resets
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase())) {
                                isSupportCol = false;
                            }
                        }
                    }
                }
                
                // SAFETY: BLACKLIST ESPECIFICACIÓN ALWAYS
                if (String(termId).toLowerCase() === 'especificación' || String(termName).toLowerCase() === 'especificación') {
                    isSupportCol = true;
                }`;

if (code.includes(t1)) {
    code = code.replace(t1, r1);
    console.log("Replaced Strict validation + blacklisted 'especificación'");
} else {
    // maybe old regex string from my commit is different. Let's make a regex replacement
    console.log("Could not find strict validation block. Finding via regex.");
    const regex1 = /let isSupportCol = true; \/\/ Por defecto es de apoyo[\s\S]*?(?=\/\/ \[V4\/V5\] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT)/;
    code = code.replace(regex1, r1 + '\n\n                ');
}

// 2. Fix TblSheetIdx
const t2 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window.sheetsToProcess) tblSheetIdx = window.sheetsToProcess.findIndex(s => s.name === rowSheetName);`;

const r2 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;`;

if (code.includes(t2)) {
    code = code.replace(t2, r2);
    console.log("Replaced tblSheetIdx logic");
}

// 3. Inject window._simSheetNames
const t3 = `        window.currentSimData = sanitizedData;`;
const r3 = `        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);`;

if (code.includes(t3)) {
    code = code.replace(t3, r3);
    console.log("Injected window._simSheetNames");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
