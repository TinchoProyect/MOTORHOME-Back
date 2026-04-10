const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// ==== 1. FIX ISSUE 1 (Strict Binding) ====
const rgx1 = /\/\/ \[NUEVO MODELO STRICT VINCULATION V8\][\s\S]*?\/\/ \[V4\/V5\] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT/;

const repl1 = `// [NUEVO MODELO STRICT VINCULATION V8.2]
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
                
                // 3. Blacklist Explícito "especificación"
                if (String(termId).toLowerCase() === 'especificación' || String(termName).toLowerCase().includes('especificaci')) {
                    isSupportCol = true;
                }

                // [V4/V5] PIPELINE HANDLING WITH LIVE WORKSHOP CONTEXT`;

if (rgx1.test(code)) {
    code = code.replace(rgx1, repl1);
    console.log("Issue 1 Fixed");
} else {
    console.log("Could not find Issue 1");
}

// ==== 2. FIX ISSUE 2 (Cache Array) ====
const rgx2 = /const validRowsCount = sanitizedData\.filter\(r => !r\._rejectedSim\)\.length;\s*window\.currentSimData = sanitizedData;\s*window\.currentDisplayConfig = displayConfig;/;

const repl2 = `const validRowsCount = sanitizedData.filter(r => !r._rejectedSim).length;
        window.currentSimData = sanitizedData;
        window._simSheetNames = sheetsToProcess.map(s => s.name);
        window.currentDisplayConfig = displayConfig;`;

if (rgx2.test(code)) {
    code = code.replace(rgx2, repl2);
    console.log("Cache Array Fixed");
} else {
    console.log("Could not find Cache Array");
}

// ==== 3. FIX ISSUE 2 (TblSheetIdx) ====
const rgx3 = /let rowSheetName = row\._sourceSheet \|\| 'Principal';\s*let tblSheetIdx = 0;\s*if \(window\.sheetsToProcess\) tblSheetIdx = window\.sheetsToProcess\.findIndex\(s => s\.name === rowSheetName\);\s*let tonalBgClass = \(tblSheetIdx % 2 !== 0\) \? 'bg-slate-900\/40 border-slate-700\/50' : 'bg-slate-900\/80 border-slate-800';\s*let badgeClass = \(tblSheetIdx % 2 !== 0\) \? 'bg-fuchsia-900\/30 text-fuchsia-400 border-fuchsia-500\/30' : 'bg-blue-900\/30 text-blue-400 border-blue-500\/30';\s*const rowClass = isRejected \? "hover:bg-red-900\/30 bg-red-950\/20" : "hover:bg-slate-800\/50";\s*html \+= `<tr class='transition-colors border-b border-slate-800 \$\{rowClass\}' \$\{isRejected \? `title="\$\{rowTitle\}"` : ''}>`;\s*const sheetBadge = `\s*<span class="px-1\.5 py-0\.5 rounded text-\[9px\] bg-blue-900\/30 text-blue-400 border border-blue-500\/30 uppercase font-bold tracking-wider truncate block w-full text-center" title="\$\{row\._sourceSheet \|\| 'Principal'\}">\s*\$\{row\._sourceSheet \|\| 'Principal'\}\s*<\/span>\s*`;\s*html \+= `<td class="p-2 border-r border-slate-800 bg-slate-900\/80 sticky left-0 z-10 w-\[140px\] max-w-\[140px\] overflow-hidden">\$\{sheetBadge\}<\/td>`;/;

const repl3 = `let rowSheetName = row._sourceSheet || 'Principal';
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

if (rgx3.test(code)) {
    code = code.replace(rgx3, repl3);
    console.log("TblSheetIdx Fixed");
} else {
    console.log("Could not find TblSheetIdx");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
