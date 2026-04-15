const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add Caza-Rubros Button
const quickChipsPattern = /(<div class=\"flex flex-wrap gap-1\" id=\"vaiQuickChips\">\s*)([\s\S]*?)(<\/div>)/;
const cazaRubrosBtn = `<button data-intent="Fusión Semántica Asistida" data-route="caza-rubros" data-placeholder="[Automático] Extraerá la Llave Maestra e importará el valor oficial..." class="vai-quick-btn text-[9px] bg-slate-800/80 hover:bg-orange-600/40 text-slate-400 hover:text-orange-200 px-2 py-0.5 rounded transition-colors border border-slate-700/50 hover:border-orange-500/50 font-mono">Caza-Rubros</button>\n                    `;

content = content.replace(quickChipsPattern, (match, p1, p2, p3) => {
    if (p2.includes('Caza-Rubros')) return match; // Already exists
    return p1 + p2 + cazaRubrosBtn + p3;
});

// 2. Add color bindings for caza-rubros
const hColorReplace = "const hColor = b.dataset.route === 'cluster' ? 'bg-purple-600' : (b.dataset.route === 'literal' ? 'bg-teal-600' : (b.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));";
const bColorReplace = "const bColor = b.dataset.route === 'cluster' ? 'border-purple-500' : (b.dataset.route === 'literal' ? 'border-teal-500' : (b.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));";

const hColorHoverReplace = "const hoverColorClass = btn.dataset.route === 'cluster' ? 'bg-purple-600' : (btn.dataset.route === 'literal' ? 'bg-teal-600' : (btn.dataset.route === 'caza-rubros' ? 'bg-orange-600' : 'bg-indigo-600'));";
const bColorHoverReplace = "const borderColorClass = btn.dataset.route === 'cluster' ? 'border-purple-500' : (btn.dataset.route === 'literal' ? 'border-teal-500' : (btn.dataset.route === 'caza-rubros' ? 'border-orange-500' : 'border-indigo-500'));";

content = content.replace(/const hoverColorClass = [^;]+;/g, hColorHoverReplace);
content = content.replace(/const borderColorClass = [^;]+;/g, bColorHoverReplace);
content = content.replace(/const hColor = [^;]+;/g, hColorReplace);
content = content.replace(/const bColor = [^;]+;/g, bColorReplace);


fs.writeFileSync(file, content, 'utf8');
console.log('Caza-rubros re-injected gracefully');
