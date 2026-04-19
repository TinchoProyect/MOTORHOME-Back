const fs = require('fs');

let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// 1. Remove "appearance-none" from all three bulk selects to restore the Native Browser Chevron!
html = html.replace(
    'id="fmtBulkTargetCol" onchange="window.onBulkTargetChange()" class="bg-slate-800 border fill-current border-slate-600 text-fuchsia-400 font-bold text-xs rounded-lg px-3 py-2.5 outline-none cursor-pointer hover:border-fuchsia-500 transition-colors uppercase tracking-widest appearance-none"',
    'id="fmtBulkTargetCol" onchange="window.onBulkTargetChange()" class="bg-slate-800 border fill-current border-slate-600 text-fuchsia-400 font-bold text-xs rounded-lg px-3 py-2.5 outline-none cursor-pointer hover:border-fuchsia-500 transition-colors uppercase tracking-widest cursor-pointer"'
);

html = html.replace(
    'id="fmtBulkRubroSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 appearance-none cursor-pointer group-[.is-unidad]:hidden block"',
    'id="fmtBulkRubroSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 cursor-pointer group-[.is-unidad]:hidden block"'
);

html = html.replace(
    'id="fmtBulkUnidadSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 appearance-none cursor-pointer group-[.is-unidad]:block hidden"',
    'id="fmtBulkUnidadSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 cursor-pointer group-[.is-unidad]:block hidden"'
);

// 2. Inject the auditoria Vigia somewhere that runs when DOM is ready or file is loaded.
// Search for "document.addEventListener('DOMContentLoaded', () => {" or similar inside our patch
const vigia = `
        // VIGIA EXIGIDO POR QA
        setTimeout(() => {
            const logFn = window.originalConsoleLog || console.log;
            const targetColEl = document.getElementById("fmtBulkTargetCol");
            logFn("Auditoría de Inyección UI - Opciones disponibles en TargetCol:", targetColEl ? targetColEl.options.length : 'ELEMENTO NO ENCONTRADO');
        }, 1000);
`;

html = html.replace('window.executeDynamicBulkUpdate = async function() {', vigia + '\n        window.executeDynamicBulkUpdate = async function() {');

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('UI CSS Fix applied successfully.');
