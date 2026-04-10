const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// ==== 1. FIX ISSUE 1 (Strict Binding) ====
const t1 = `                // [NUEVO MODELO STRICT VINCULATION V8]
                // El usuario ha determinado que "Mapeada en Primera Instancia" (Nomenclature) NO ES SUFICIENTE.
                // Para que una columna NO SEA "Basura Visual" en el Simulador, DEBE tener un vínculo de sangre explícito
                // en el motor ETL a un Campo Maestro del Diccionario Global (Vinculada).
                let isSupportCol = true; // Por defecto es de apoyo
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        isSupportCol = false; // Es una maestra vinculada oficial
                    }
                }`;

const r1 = `                // [NUEVO MODELO STRICT VINCULATION V8.2]
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
                }
                
                // 3. Blacklist Explícito por Corrupción Histórica DB
                if (String(termId).toLowerCase() === 'especificación' || String(termName).toLowerCase().includes('especificaci')) {
                    isSupportCol = true;
                }`;

if (code.includes(t1)) {
    code = code.replace(t1, r1);
    console.log("Issue 1 Fixed");
} else {
    console.log("Could not find Target 1");
}

// ==== 2. FIX ISSUE 2 (Cache Array) ====
const t2 = `        const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;
        window.currentSimData = sanitizedData;
        window.currentDisplayConfig = displayConfig;`;

const r2 = `        const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;
        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);
        window.currentDisplayConfig = displayConfig;`;

if (code.includes(t2)) {
    code = code.replace(t2, r2);
    console.log("Issue 2 Cache Fixed");
} else {
    console.log("Could not find Target 2 Cache");
}

// ==== 3. FIX ISSUE 2 (TblSheetIdx & Row render) ====
const t3 = `        let rowTitle = row._emptySilently ? "Fila 100% vacía tras extracción" : "Fila descartada matemáticamente";
        if (row._rejectedByCode) rowTitle = "Fila descartada: Carencia de Identidad (Código Vacío)";
        
        const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : "hover:bg-slate-800/50";
        
        html += \`<tr class='transition-colors border-b border-slate-800 \${rowClass}' \${isRejected ? \`title="\${rowTitle}"\` : ''}>\`;

        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] bg-blue-900/30 text-blue-400 border border-blue-500/30 uppercase font-bold tracking-wider truncate block w-full text-center" title="\${row._sourceSheet || 'Principal'}">
                \${row._sourceSheet || 'Principal'}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 bg-slate-900/80 sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;`;

const r3 = `        let rowTitle = row._emptySilently ? "Fila 100% vacía tras extracción" : "Fila descartada matemáticamente";
        if (row._rejectedByCode) rowTitle = "Fila descartada: Carencia de Identidad (Código Vacío)";
        
        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;
        
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';
        
        const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : \`\${tonalBgClass} hover:bg-slate-800/50\`;
        
        html += \`<tr class='transition-colors border-b border-slate-800 \${rowClass}' \${isRejected ? \`title="\${rowTitle}"\` : ''}>\`;

        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] \${badgeClass} uppercase font-bold tracking-wider truncate block w-full text-center" title="\${row._sourceSheet || 'Principal'}">
                \${row._sourceSheet || 'Principal'}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 \${tonalBgClass} sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;`;

if (code.includes(t3)) {
    code = code.replace(t3, r3);
    console.log("Issue 2 Render Fixed");
} else {
    console.log("Could not find Target 3 Render");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
