const fs = require('fs');

let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const flawlessUI = `                    <!-- Target Context -->
                    <div class="flex items-center gap-2 pl-2">
                        <select id="fmtBulkTargetCol" onchange="window.onBulkTargetChange()" class="bg-slate-800 border fill-current border-slate-600 text-fuchsia-400 font-bold text-xs rounded-lg px-3 py-2.5 outline-none cursor-pointer hover:border-fuchsia-500 transition-colors uppercase tracking-widest" style="appearance: auto !important; -webkit-appearance: auto !important; -moz-appearance: auto !important;">
                            <option value="rubro">🎯 Rubro</option>
                            <option value="unidad">🎯 Unidad</option>
                        </select>
                        <div class="w-px h-6 bg-slate-700 mx-1"></div>
                    </div>
                    
                    <!-- Values -->
                    <div class="flex items-center gap-3">
                        <select id="fmtBulkRubroSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 cursor-pointer" style="appearance: auto !important; -webkit-appearance: auto !important; -moz-appearance: auto !important; display: block;">
                            <option value="">Cargando Rubros...</option>
                        </select>
                        <select id="fmtBulkUnidadSelect" class="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-4 py-2.5 outline-none focus:border-purple-500 shadow-inner w-56 cursor-pointer" style="appearance: auto !important; -webkit-appearance: auto !important; -moz-appearance: auto !important; display: none;">
                            <option value="">Cargando Unidades...</option>
                        </select>
                    </div>
                    
                    <div class="pl-2">
                        <button onclick="window.executeDynamicBulkUpdate()" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-purple-900/40 flex items-center gap-2">
                            <i data-lucide="zap" class="w-4 h-4"></i> Aplicar
                        </button>
                    </div>`;

// Replace the UI block.
// Let's find exactly the lines to replace by scanning for <!-- Target Context --> until </button> \n </div>
const lines = html.split(/\\r?\\n/);
let startIdx = lines.findIndex(l => l.includes('<!-- Target Context -->'));
let endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('Aplicar') && lines[i+1] && lines[i+1].includes('</button>'));

if (startIdx !== -1 && endIdx !== -1) {
    const range = (endIdx + 3) - startIdx;
    lines.splice(startIdx, range, flawlessUI);
} else {
    // try finding the old UI if target context doesn't exist
    let s2 = lines.findIndex(l => l.includes('id="fmtBulkTargetCol"'));
    if (s2 !== -1) {
        startIdx = s2 - 2;
        endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('Aplicar') && lines[i+1] && lines[i+1].includes('</button>'));
        const range = (endIdx + 3) - startIdx;
        lines.splice(startIdx, range, flawlessUI);
    }
}

html = lines.join('\\n');

// Javascript update
const logicUpdate = `        window.onBulkTargetChange = function() {
            const target = document.getElementById('fmtBulkTargetCol').value;
            if (target === 'unidad') {
                document.getElementById('fmtBulkRubroSelect').style.display = 'none';
                document.getElementById('fmtBulkUnidadSelect').style.display = 'block';
                window.populateUnidadDropdown();
            } else {
                document.getElementById('fmtBulkRubroSelect').style.display = 'block';
                document.getElementById('fmtBulkUnidadSelect').style.display = 'none';
            }
        };`;

// replace the old onBulkTargetChange block
const oldLogicStart = html.indexOf('window.onBulkTargetChange = function() {');
if (oldLogicStart !== -1) {
    const oldLogicEnd = html.indexOf('};', oldLogicStart) + 2;
    html = html.substring(0, oldLogicStart) + logicUpdate + html.substring(oldLogicEnd);
}

// Add the Vigía
const vigia = `        // VIGIA EXIGIDO POR QA
        setTimeout(() => {
            const logFn = window.originalConsoleLog || console.log;
            const targetColEl = document.getElementById("fmtBulkTargetCol");
            logFn("Auditoría de Inyección UI - Opciones disponibles en TargetCol:", targetColEl ? targetColEl.options.length : 'ELEMENTO NO ENCONTRADO');
        }, 1000);`;

// Let's ensure vigia isn't doubled
if (!html.includes('Auditoría de Inyección UI')) {
    html = html.replace('window.populateUnidadDropdown = function() {', vigia + '\\n\\n        window.populateUnidadDropdown = function() {');
}

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('Bulletproof UI Fix Applied');
