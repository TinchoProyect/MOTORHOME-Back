const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').replace(/\r\n/g, '\n');

// ==== FIX 1: STICKY TH HEADERS ====
const targetHeader = `let thClass = \`p-2 border border-slate-700 text-left align-top relative group \${hideClass} \`;`;
const replHeader = `let thClass = \`p-2 border border-slate-700 text-left align-top relative group \${hideClass} sticky top-0 z-[100] bg-slate-900 \`;`;

if (code.includes(targetHeader)) {
    code = code.replace(targetHeader, replHeader);
    console.log("Fixed Sticky TH Headers!");
} else {
    // maybe it has other contents?
    const tH2 = `        let thClass = \`p-2 border border-slate-700 text-left align-top relative group \${hideClass} \`;\n        thClass += cfg.isVirtual ? "bg-emerald-900/10 text-emerald-300 border-emerald-500/20" : "bg-blue-900/20 text-blue-300";`;
    const rH2 = `        let thClass = \`p-2 border border-slate-700 text-left align-top relative group \${hideClass} sticky top-0 z-[100] \`;\n        thClass += cfg.isVirtual ? "bg-[rgb(8,17,26)] text-emerald-300 border-emerald-500/20" : "bg-[rgb(8,17,26)] text-blue-300";`;
    if (code.includes(tH2)) {
        code = code.replace(tH2, rH2);
        console.log("Fixed Sticky TH Headers (Method 2)!");
    } else {
        console.log("Could not find thClass logic.");
    }
}


// ==== FIX 2: DRAG AND DROP PERSISTENCE ====
const targetSwap = \`                    window._simSwapSheets = function(dragIdx, dropIdx) {
                        const arr = window._rawValidSheetsCache;
                        const item = arr.splice(dragIdx, 1)[0];
                        arr.splice(dropIdx, 0, item);
                        const c = document.getElementById('sheets_dnd_container');
                        if (c) c.innerHTML = window._simRenderSheetsHtml();
                        if (window.lucide) window.lucide.createIcons();
                    };

                    window._simRenderSheetsHtml = function() {
                        return window._rawValidSheetsCache.map((s, idx) => \\\`
                            <div draggable="true" ondragstart="event.dataTransfer.setData('text/plain', \\\${idx}); event.currentTarget.classList.add('opacity-50');" ondragend="event.currentTarget.classList.remove('opacity-50');" ondragover="event.preventDefault();" ondrop="event.preventDefault(); window._simSwapSheets(parseInt(event.dataTransfer.getData('text/plain')), \\\${idx});" class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-grab active:cursor-grabbing mb-2">
                                <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-600"></i>
                                <input type="checkbox" id="chk_sim_sheet_\\\${idx}" value="\\\${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" \\\${s.name === currentSheetName ? 'checked' : ''}>\`;

const replSwap = \`                    window._simSwapSheets = function(dragIdx, dropIdx) {
                        // PRESERVACION DE ESTADO ANTES DEL SWAP (QA FIX)
                        window._rawValidSheetsCache.forEach((s, idx) => {
                            const chk = document.getElementById('chk_sim_sheet_' + idx);
                            if (chk) s._wasChecked = chk.checked;
                            const rad = document.querySelector('input[name="sim_cacique"]:checked');
                            if (rad && rad.value === s.name) window._simCaciqueSheetName = s.name;
                        });

                        const arr = window._rawValidSheetsCache;
                        const item = arr.splice(dragIdx, 1)[0];
                        arr.splice(dropIdx, 0, item);
                        const c = document.getElementById('sheets_dnd_container');
                        if (c) c.innerHTML = window._simRenderSheetsHtml();
                        if (window.lucide) window.lucide.createIcons();
                    };

                    window._simRenderSheetsHtml = function() {
                        return window._rawValidSheetsCache.map((s, idx) => {
                            let isChecked = s.hasOwnProperty('_wasChecked') ? s._wasChecked : (s.name === currentSheetName || idx === 0);
                            let caciqueCheck = window._simCaciqueSheetName === s.name;
                            return \\\`
                            <div draggable="true" ondragstart="event.dataTransfer.setData('text/plain', \\\${idx}); event.currentTarget.classList.add('opacity-50');" ondragend="event.currentTarget.classList.remove('opacity-50');" ondragover="event.preventDefault();" ondrop="event.preventDefault(); window._simSwapSheets(parseInt(event.dataTransfer.getData('text/plain')), \\\${idx});" class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-grab active:cursor-grabbing mb-2">
                                <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-600"></i>
                                <input type="checkbox" id="chk_sim_sheet_\\\${idx}" value="\\\${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" \\\${isChecked ? 'checked' : ''}>\`;

if (code.includes(targetSwap)) {
    code = code.replace(targetSwap, replSwap);
    console.log("Fixed Drag and drop persistence");
} else {
    console.log("Could not find Target Swap block.");
}

// ==== FIX CACIQUE RADIO PERSISTENCE ====
const targetCacique = \`<input type="radio" name="sim_cacique" value="\\\${s.name}" class="w-3 h-3 text-amber-500 bg-slate-900 border-slate-700" \\\${s.name === currentSheetName ? 'checked' : ''}>\`;
const replCacique = \`<input type="radio" name="sim_cacique" value="\\\${s.name}" class="w-3 h-3 text-amber-500 bg-slate-900 border-slate-700" \\\${caciqueCheck || (s.name === currentSheetName) ? 'checked' : ''}>\`;
if (code.includes(targetCacique)) {
    code = code.replace(targetCacique, replCacique);
    console.log("Fixed Cacique Radio persistence");
} else {
    // Only attempt string replacement if it exists
}

// ==== FIX 3: HOJA ORIGEN VISIBILITY ====
// Need to add border color based on the tonal logic to make the left edge visible!
const targetLeftBar = \`        const sheetBadge = \\\`
            <div class="h-full w-full \\\${badgeClass} opacity-50 relative group cursor-help">
                <div class="absolute inset-0 border-l border-r border-white/5 pointer-events-none"></div>
            </div>
        \\\`;
        html += \\\`<td class="p-0 border-r border-slate-800 \\\${tonalBgClass} sticky left-0 z-10 w-[30px] max-w-[30px] overflow-hidden p-0" title="\\\${row._sourceSheet || 'Principal'}">\\\${sheetBadge}</td>\\\`;\`;

const replLeftBar = \`        
        // Solid vertical block for Hoja Origen instead of transparent background
        let borderColorClass = (tblSheetIdx % 2 !== 0) ? 'border-l-[12px] border-l-fuchsia-600 text-fuchsia-400 bg-slate-950' : 'border-l-[12px] border-l-blue-600 text-blue-400 bg-slate-900';
        
        const sheetBadge = \\\`
            <div class="h-full w-full \\\${borderColorClass} flex items-center justify-center relative group cursor-help transition-all">
                <i data-lucide="layers" class="w-3 h-3 opacity-60"></i>
            </div>
        \\\`;
        html += \\\`<td class="p-0 border-r border-slate-800 \\\${tonalBgClass} sticky left-0 z-10 w-[30px] max-w-[30px] overflow-hidden" title="\\\${row._sourceSheet || 'Principal'}">\\\${sheetBadge}</td>\\\`;\`;
if (code.includes(targetLeftBar)) {
    code = code.replace(targetLeftBar, replLeftBar);
    console.log("Fixed Left Origin Color Indicator!");
} else {
    console.log("Could not find Left Bar logic.");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
