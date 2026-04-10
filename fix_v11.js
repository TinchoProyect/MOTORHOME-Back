const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// ==== 1. FIX ISSUE 1 ==== (Strict Binding & ESPECIFICACION BLACKLIST)
const target1 = `                // [NUEVO MODELO STRICT VINCULATION V8]
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

const repl1 = `                let isSupportCol = true; 
                
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
                }
                
                // 3. Blacklist Explicito para "Especificacion" si llego camuflada en el Master Dic
                if (String(termName).toLowerCase().includes('especificaci')) {
                    isSupportCol = true;
                }`;

if (code.includes(target1)) {
    code = code.replace(target1, repl1);
    console.log('Issue 1 Fix Applied');
}

// ==== 2. FIX ISSUE 2 Array Cache ====
const target2 = `        window.currentSimData = sanitizedData;

        const container = document.getElementById('simulationTableContainer');`;

const repl2 = `        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);

        const container = document.getElementById('simulationTableContainer');`;

if (code.includes(target2)) {
    code = code.replace(target2, repl2);
    console.log('Issue 2 Cache Applied');
}

// ==== 3. FIX ISSUE 2 tblSheetIdx ====
const target3 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window.sheetsToProcess) tblSheetIdx = window.sheetsToProcess.findIndex(s => s.name === rowSheetName);
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';`;

const repl3 = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';`;

if (code.includes(target3)) {
    code = code.replace(target3, repl3);
    console.log('Issue 2 Lookup Applied');
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
