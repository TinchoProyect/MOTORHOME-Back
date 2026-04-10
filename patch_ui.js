const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t1 = `id="simTableScrollArea" class="flex-1 w-full min-h-[300px] overflow-auto custom-scrollbar relative p-0 m-0 bg-slate-900"`;
const r1 = `id="simTableScrollArea" class="flex-1 w-full h-full overflow-auto overflow-x-auto overflow-y-auto custom-scrollbar relative p-0 m-0 bg-slate-900 border-t border-slate-800"`;

const t2 = `<div class="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 z-10 w-full">`;
const r2 = `<div class="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center shrink-0 w-full relative z-[150]">`;

if (code.includes(t1)) {
    code = code.replace(t1, r1);
} else { console.log('T1 not found'); }
if (code.includes(t2)) {
    code = code.replace(t2, r2);
} else { console.log('T2 not found'); }

// 3. Tonal Shift for visual distinction based on SheetName in row._sourceSheet
// We will look for: const isRejected = !validateRow(row, ruleConfig);
// And inject a check to see if the sheet changed, maintaining a background alternating color.
const t3 = `let html = "<table class='table-fixed text-xs font-mono w-full border-collapse bg-slate-900 text-slate-300'>";`;
const r3 = `let html = "<table class='table-fixed text-xs font-mono w-max min-w-full border-collapse bg-slate-900 text-slate-300'>";`;

if (code.includes(t3)) {
    code = code.replace(t3, r3);
}

// 4. Also toggle the background color for rows from different sheets
const t4 = `        let isRejected = false;
        if (ruleConfig && ruleConfig.rejectRules && ruleConfig.rejectRules.length > 0) {
            isRejected = !validateRow(row, ruleConfig);
        }`;
const r4 = `        let isRejected = false;
        if (ruleConfig && ruleConfig.rejectRules && ruleConfig.rejectRules.length > 0) {
            isRejected = !validateRow(row, ruleConfig);
        }
        
        let rowSheetName = row._sourceSheet || 'Principal';
        // Tonal grouping based strictly on sheet transitions, we'll hash the sheetName or just check if it's even index of sheets
        let tblSheetIdx = 0;
        if (window.sheetsToProcess) tblSheetIdx = window.sheetsToProcess.findIndex(s=>s.name === rowSheetName);
        let tonalBgClass = (tblSheetIdx % 2 !== 0) ? 'bg-slate-900/30 border-slate-800/60' : 'bg-slate-900/80 border-slate-700/60';
`;

const t5 = `        html += \`<tr class="border-b border-slate-800 hover:bg-slate-800/80 transition-colors \${isRejected ? 'opacity-50' : ''}">\`;`;
const r5 = `        html += \`<tr class="border-b hover:bg-slate-800/80 transition-colors \${tonalBgClass} \${isRejected ? 'opacity-50' : ''}">\`;`;

if (code.includes(t4)) code = code.replace(t4, r4);
if (code.includes(t5)) code = code.replace(t5, r5);

fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log('UI Toolbar and Table Styles Patched');
