const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// 1. Inyectar _purgedByCodeCount al inicio de generatePreview
const targetInit = `        let allSanitizedData = [];

        // ---------------- ETL SANDBOX ARCHITECTURE ----------------`;
const replInit = `        let allSanitizedData = [];
        window._purgedByCodeCount = 0; // Reset purge tracking

        // ---------------- ETL SANDBOX ARCHITECTURE ----------------`;

if (code.includes(targetInit)) {
    code = code.replace(targetInit, replInit);
    console.log("Target Init Replaced.");
}

// 2. Modificar el filter para detectar y purgar
const targetFilterObj = `                // RESOLUCION LOCAL A MATRIZ GLOBAL (TermId based)
                let isEmptyRow = true;
                localConfig.forEach(cfg => {
                     let resVal = null;
                     if (cfg.isComputed) resVal = cfg.transform(null, row);
                     else resVal = cfg.transform(row[cfg.sourceIndex], row);
                     
                     if (resVal !== undefined && resVal !== null && String(resVal).trim() !== "") {
                         isEmptyRow = false;
                     }
                     row._unifiedOutput[cfg.termId] = resVal;
                });
                
                if (isEmptyRow) keepRow = false;

                return keepRow;`;

const replFilterObj = `                // RESOLUCION LOCAL A MATRIZ GLOBAL (TermId based)
                let isEmptyRow = true;
                let hasCodeCol = false;
                let codeValueStr = "";

                localConfig.forEach(cfg => {
                     let resVal = null;
                     if (cfg.isComputed) resVal = cfg.transform(null, row);
                     else resVal = cfg.transform(row[cfg.sourceIndex], row);
                     
                     if (resVal !== undefined && resVal !== null && String(resVal).trim() !== "") {
                         isEmptyRow = false;
                     }
                     row._unifiedOutput[cfg.termId] = resVal;
                     
                     // Detectar si la iteración corresponde a un campo "código" primario (Regla Innegociable de Integridad)
                     const tIdLower = String(cfg.termId).toLowerCase();
                     if (tIdLower === 'codigo' || tIdLower.includes('art_codigo') || tIdLower === 'ean') {
                          hasCodeCol = true;
                          codeValueStr = String(resVal || "").trim();
                     }
                });
                
                // Filtro de Exclusión Absoluta (Data Cleansing Nivel Físico)
                if (hasCodeCol && codeValueStr === "") {
                     window._purgedByCodeCount = (window._purgedByCodeCount || 0) + 1;
                     return false; // Purgar objeto del array nativo
                }

                if (isEmptyRow) keepRow = false;

                return keepRow;`;

if (code.includes(targetFilterObj)) {
    code = code.replace(targetFilterObj, replFilterObj);
    console.log("Target Filter Replaced.");
}

// 3. Modificar UI validRowsCount para reflejar purga
const targetUIObj = `        let validRowsCount = sanitizedData ? sanitizedData.filter(r => !r._rejectedSim).length : 0;
        let totalRowsCount = sanitizedData ? sanitizedData.length : 0;

        const simMetaEl = document.getElementById('simMeta');
        if (simMetaEl) {
            simMetaEl.innerHTML = \`
                <span class="text-slate-400">Filas Válidas:</span> <span class="text-emerald-400 font-bold">\${validRowsCount}</span> 
                <span class="text-red-400 font-bold ml-2">(Filas Descartadas: \${totalRowsCount - validRowsCount})</span>
            \`;
        }`;

const replUIObj = `        let validRowsCount = sanitizedData ? sanitizedData.filter(r => !r._rejectedSim).length : 0;
        let originalRowsRenderCount = sanitizedData ? sanitizedData.length : 0;
        let totalRowsCount = originalRowsRenderCount + (window._purgedByCodeCount || 0);

        const simMetaEl = document.getElementById('simMeta');
        if (simMetaEl) {
            simMetaEl.innerHTML = \`
                <span class="text-slate-400">Filas Válidas:</span> <span class="text-emerald-400 font-bold">\${validRowsCount}</span> 
                <span class="text-red-400 font-bold ml-2">(Filas Descartadas: \${(totalRowsCount - validRowsCount)})</span>
            \`;
        }`;

if (code.includes(targetUIObj)) {
    code = code.replace(targetUIObj, replUIObj);
    console.log("Target UI Obj Replaced.");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
