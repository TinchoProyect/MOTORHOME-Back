const fs = require('fs');

const code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');
const lines = code.split('\n');

// Issue 1 Update
const newStrictBinding = `                // [NUEVO MODELO STRICT VINCULATION V8.2]
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
                
                // 3. Blacklist Explícito
                if (String(termId).toLowerCase() === 'especificación' || String(termName).toLowerCase().includes('especificaci')) {
                    isSupportCol = true;
                }`;

let foundBindingAt = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// [NUEVO MODELO STRICT VINCULATION V8]')) {
        foundBindingAt = i;
        break;
    }
}

if (foundBindingAt !== -1) {
    // Delete 11 lines
    lines.splice(foundBindingAt, 11, newStrictBinding);
    console.log("Replaced binding!");
}


const newCacheExport = `        const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;
        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);
        window.currentDisplayConfig = displayConfig;`;

let foundCacheAt = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;')) {
        foundCacheAt = i;
        break;
    }
}

if (foundCacheAt !== -1) {
    lines.splice(foundCacheAt, 3, newCacheExport);
    console.log("Exported global sheet names array!");
}


const newTonalClass = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';`;

let foundTonalAt = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : "hover:bg-slate-800/50";')) {
        // Tonal class wasn't implemented right here in the clean file, so I need to replace it down to the td.
        foundTonalAt = i;
        break;
    }
}

if (foundTonalAt !== -1) {
    // Let's replace the whole block from 1357 to 1362
    const replaceTonal = `        ${newTonalClass}
        const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : \`\${tonalBgClass} hover:bg-slate-800/50\`;
        
        html += \`<tr class='transition-colors border-b border-slate-800 \${rowClass}' \${isRejected ? \`title="\${rowTitle}"\` : ''}>\`;

        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] \${badgeClass} uppercase font-bold tracking-wider truncate block w-full text-center" title="\${row._sourceSheet || 'Principal'}">
                \${row._sourceSheet || 'Principal'}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 \${tonalBgClass} sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;
`;

    lines.splice(foundTonalAt, 10, replaceTonal);
    console.log("Injected tonality logic");
}

fs.writeFileSync('src/views/js/viewer_render.js', lines.join('\n'));
