const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

const logic = `                    if (this.selectedRoute === 'caza-rubros') {
                        this.promptEl.value = "[Automático] Fusión Semántica Activa. El sistema evaluará el diccionario y agrupará orígenes utilizando conocimiento general guiado por el contexto de la regla.";
                        this.promptEl.disabled = true;
                    } else {
                        this.promptEl.value = '';
                        this.promptEl.disabled = false;
                        if(btn.dataset.placeholder) {
                            this.promptEl.placeholder = btn.dataset.placeholder;
                        }
                    }`;

content = content.replace(/if\s*\(btn\.dataset\.placeholder\)\s*\{\s*this\.promptEl\.placeholder\s*=\s*btn\.dataset\.placeholder;\s*\}/g, logic);

// Also reset the prompt correctly when deselecting:
const deselectLogic = `btn.classList.add('bg-slate-800/80', 'text-slate-400', 'border-slate-700/50');
                    this.promptEl.placeholder = "Ej: Condiciona la extracción aislando los prefijos...";
                    this.promptEl.value = '';
                    this.promptEl.disabled = false;`;
content = content.replace(/btn\.classList\.add\('bg-slate-800\/80', 'text-slate-400', 'border-slate-700\/50'\);\s*this\.promptEl\.placeholder = "Ej: Condiciona la extracción aislando los prefijos\.\.\.";/g, deselectLogic);


fs.writeFileSync(file, content, 'utf8');
console.log('Caza-rubros click logic injected');
