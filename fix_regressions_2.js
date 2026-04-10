const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').replace(/\r\n/g, '\n');

// ==== 3. FIX NOMENCLATURE TO STRICT MASTER ====
const targetHeaderLogic = `                let termName = termId;
                const termObj = nomenclatureCache.find(t => t.id === termId);
                if (termObj) {
                    termName = termObj.termino;
                } else if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    const masterObj = window.masterDictionary.find(m => m.id === termId);
                    if (masterObj) {
                        termName = masterObj.nombre_campo;
                    }
                }`;

const replHeaderLogic = `                let termName = termId;
                
                // [FIX V8.3] SIEMPRE USAR NOMBRE DEL DICCIONARIO MAESTRO SI EXISTE
                if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                    const masterObj = window.masterDictionary.find(m => String(m.id).toLowerCase() === String(termId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(termId).toLowerCase());
                    if (masterObj) {
                        termName = masterObj.nombre_campo;
                    } else {
                        // Fallback a terminology solo si no es maestra nativa
                        const termObj = nomenclatureCache.find(t => t.id === termId);
                        if (termObj) {
                            termName = termObj.termino;
                        }
                    }
                }
                
                // [FIX V8.3] SOBREESCRITURA DINAMICA SI EL PIPELINE DEFINE OTRA MAESTRA
                if (window.draftPipelines && window.draftPipelines[vColId]) {
                    const pipe = window.draftPipelines[vColId];
                    if (pipe && pipe.masterField && pipe.masterField.id) {
                        const mId = pipe.masterField.id;
                        if (window.masterDictionary && Array.isArray(window.masterDictionary)) {
                            const masterHit = window.masterDictionary.find(m => String(m.id).toLowerCase() === String(mId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(mId).toLowerCase());
                            if (masterHit) {
                                termName = masterHit.nombre_campo;
                            }
                        }
                    }
                }`;

if (code.includes(targetHeaderLogic)) {
    code = code.replace(targetHeaderLogic, replHeaderLogic);
    console.log("Fixed Nomenclature Priority");
} else {
    console.log("Could not find Nomenclature block");
}

// ==== 4. MINIFY HOJA ORIGEN ====
const thOld = `html += "<th class='p-2 text-left font-bold border-r border-slate-700 bg-slate-900 sticky top-0 left-0 z-[110]' style='width: 140px; min-width: 140px; max-width: 140px;'><div class='font-bold flex items-center gap-1.5 px-2 py-1 text-[10px] text-blue-300'><i data-lucide='layers' class='w-3 h-3 text-blue-400'></i> Hoja Origen</div></th>";`;

const thNew = `html += "<th class='p-0 text-center font-bold border-r border-slate-700 bg-slate-900 sticky top-0 left-0 z-[110]' style='width: 30px; min-width: 30px; max-width: 30px;' title='Hoja de Origen'><div class='flex items-center justify-center w-full h-full text-blue-300 opacity-60'><i data-lucide='layers' class='w-3 h-3'></i></div></th>";`;

if (code.includes(thOld)) {
    code = code.replace(thOld, thNew);
    console.log("Fixed TH size");
} else {
    console.log("Could not find TH old");
}


const tdOld = `        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] \${badgeClass} uppercase font-bold tracking-wider truncate block w-full text-center" title="\${row._sourceSheet || 'Principal'}">
                \${row._sourceSheet || 'Principal'}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 \${tonalBgClass} sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;`;

const tdNew = `        const sheetBadge = \`
            <div class="h-full w-full \${badgeClass} opacity-50 relative group cursor-help">
                <div class="absolute inset-0 border-l border-r border-white/5 pointer-events-none"></div>
            </div>
        \`;
        html += \`<td class="p-0 border-r border-slate-800 \${tonalBgClass} sticky left-0 z-10 w-[30px] max-w-[30px] overflow-hidden p-0" title="\${row._sourceSheet || 'Principal'}">\${sheetBadge}</td>\`;`;

if (code.includes(tdOld)) {
    code = code.replace(tdOld, tdNew);
    console.log("Fixed TD size");
} else {
    console.log("Could not find TD old");
}


// FIX HOJA ORIGEN COMPATIBILITY ON EXPORT
// Let's ensure currentDisplayConfig sorting respects Cacique order (Optional, but UI already places headers properly)

fs.writeFileSync('src/views/js/viewer_render.js', code);
