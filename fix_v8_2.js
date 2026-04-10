const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// ==== 1. FIX ISSUE 1: STRICT VINCULATION ====
const targetStr1 = `                // [NUEVO MODELO STRICT VINCULATION V8]
                // El usuario ha determinado que "Mapeada en Primera Instancia" (Nomenclature) NO ES SUFICIENTE.
                // Para que una columna NO SEA "Basura Visual" en el Simulador, DEBE tener un vínculo de sangre explícito
                // en el motor ETL a un Campo Maestro del Diccionario Global (Vinculada).
                let isSupportCol = true; // Por defecto es de apoyo
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

const replaceStr1 = `                // [NUEVO MODELO STRICT VINCULATION V8.2]
                let isSupportCol = true; 
                
                // 1. Verificación Nativa (Mapeo Directo sin Pipeline)
                if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    if (window.masterDictionary.some(m => String(m.id).toLowerCase() === String(termId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(termId).toLowerCase())) {
                        isSupportCol = false;
                    }
                }

                // 2. Verificación Dinámica (Pipeline)
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
                }`;

if (code.includes(targetStr1)) {
    code = code.replace(targetStr1, replaceStr1);
    console.log("Issue 1: Strict Vinculation Logic applied.");
} else {
    console.log("Issue 1: Target logic not found.");
}

// ==== 2. FIX ISSUE 2: SHEET CONTEXT & TONALITY ====
const targetStr2 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window.sheetsToProcess) tblSheetIdx = window.sheetsToProcess.findIndex(s => s.name === rowSheetName);
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';`;

const replaceStr2 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';`;

if (code.includes(targetStr2)) {
    code = code.replace(targetStr2, replaceStr2);
    console.log("Issue 2: Tonality visual logic applied locally.");
} else {
    console.log("Issue 2: Tonality logic string not found.");
}

// Global exposure of sheet names to fix Issue 2 array
const targetStr3 = `        window.currentSimData = sanitizedData;`;
const replaceStr3 = `        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);`;

if (code.includes(targetStr3) && !code.includes('window._simSheetNames = sheetsToProcess.map')) {
    code = code.replace(targetStr3, replaceStr3);
    console.log("Issue 2: Cache exposed globally.");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
