const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t = `        const rowClass = isRejected ? "hover:bg-red-900/30 bg-red-950/20" : "hover:bg-slate-800/50";
        
        html += \`<tr class='transition-colors border-b border-slate-800 \${rowClass}' \${isRejected ? \`title="\${rowTitle}"\` : ''}>\`;

        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] bg-blue-900/30 text-blue-400 border border-blue-500/30 uppercase font-bold tracking-wider truncate block w-full text-center" title="\${row._sourceSheet || 'Principal'}">
                \${row._sourceSheet || 'Principal'}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 bg-slate-900/80 sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;`;

const r = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window.sheetsToProcess) tblSheetIdx = window.sheetsToProcess.findIndex(s => s.name === rowSheetName);
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/40 border-slate-700/50' : 'bg-slate-900/80 border-slate-800';
        let badgeClass = (tblSheetIdx % 2 !== 0) ? 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30';
        
        const rowClass = isRejected ? "opacity-30 hover:bg-red-900/30 bg-red-950/20" : \`\${tonalBgClass} hover:bg-slate-800/50\`;
        
        html += \`<tr class='transition-colors border-b border-slate-800 \${rowClass}' \${isRejected ? \`title="\${rowTitle}"\` : ''}>\`;

        const sheetBadge = \`
            <span class="px-1.5 py-0.5 rounded text-[9px] \${badgeClass} border uppercase font-bold tracking-wider truncate block w-full text-center" title="\${rowSheetName}">
                \${rowSheetName}
            </span>
        \`;
        html += \`<td class="p-2 border-r border-slate-800 \${tonalBgClass} sticky left-0 z-10 w-[140px] max-w-[140px] overflow-hidden">\${sheetBadge}</td>\`;`;

if (code.includes(t)) {
    code = code.replace(t, r);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log('Row UI updated.');
} else {
    console.log('Target not found for row UI.');
}
