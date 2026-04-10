const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const tStart = code.substring(code.indexOf('window.ViewerUI.handleDragStart = function(e, index) {'), code.indexOf('window.ViewerUI.handleDragLeave = function(e) {'));
const tEnd = code.substring(code.indexOf('window.ViewerUI.handleDragLeave = function(e) {'), code.indexOf('window.ViewerUI.handleDrop = function(e, dropColIndex) {'));

const tDrop = code.substring(code.indexOf('return false;\n};'), code.indexOf('if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === \\\'function\\\') {') + 95);

// Let's use a smarter replace block! 
const dragBlockTarget = code.substring(code.indexOf('window.ViewerUI.handleDragStart = function(e, index) {'), code.indexOf('window.ViewerUI.handleDragEnd = function(e) {') + 300);

const splitRule = code.substring(code.indexOf('window.ViewerUI.handleDragStart = function(e, index) {'), code.indexOf('window.ViewerUI.handleDrop = '));

const handleDropToDragEnd = code.substring(code.indexOf('window.ViewerUI.handleDrop = function(e, dropColIndex) {'), code.indexOf('window.ViewerUI.handleDragEnd = function(e) {') + 300);

const dragStartBlockOriginal = \`window.ViewerUI.handleDragStart = function(e, index) {
    const th = e.target.closest('th');
    if (!th) return;
    window.ViewerUI.draggedSimColIndex = index;
    // Efecto de movimiento
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', index.toString()); } catch(ex){} // Firefox fix
    setTimeout(() => {
        th.classList.add('opacity-40');
    }, 10);
};

window.ViewerUI.handleDragOver = function(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    return false;
};

window.ViewerUI.handleDragEnter = function(e) {
    e.preventDefault();
    let th = e.target.closest('th');
    if (th) {
        th.classList.add('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};

window.ViewerUI.handleDragLeave = function(e) {
    let th = e.target.closest('th');
    if (th) {
        th.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};\`;

const dragStartBlockRepl = \`window.ViewerUI.handleDragStart = function(e, index) {
    const th = e.target.closest('th');
    if (!th) return;
    window.ViewerUI.draggedSimColIndex = index;
    
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', index.toString()); } catch(ex){} 
    
    setTimeout(() => {
        // [FIX V8.9] Aislar elemento arrastrado del motor de eventos del puntero
        th.classList.add('opacity-40', 'pointer-events-none', 'z-50');
    }, 10);
};

window.ViewerUI.handleDragOver = function(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    return false;
};

window.ViewerUI.handleDragEnter = function(e) {
    e.preventDefault();
    let th = e.target.closest('th');
    if (!th) return;
    
    // [FIX V8.9] Filtro de Bubbling: Usamos un contador para evitar falsos positivos con elementos hijos (iconos, textos, etc)
    th._dragCounter = (th._dragCounter || 0) + 1;
    if (th._dragCounter === 1) {
         th.classList.add('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};

window.ViewerUI.handleDragLeave = function(e) {
    let th = e.target.closest('th');
    if (!th) return;
    
    th._dragCounter = (th._dragCounter || 0) - 1;
    if (th._dragCounter <= 0) {
        th._dragCounter = 0;
        th.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    }
};\`;


const dragEndTargetOriginal = \`window.ViewerUI.handleDragEnd = function(e) {
    if (e.target.tagName === 'TH') {
        e.target.classList.remove('opacity-40');
    }
    window.ViewerUI.draggedSimColIndex = null;
    
    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {\`;

const dragEndTargetRepl = \`window.ViewerUI.handleDragEnd = function(e) {
    const th = e.target.closest('th');
    if (th) {
        th.classList.remove('opacity-40', 'pointer-events-none', 'z-50');
    }
    window.ViewerUI.draggedSimColIndex = null;
    
    // Purga general de resabios visuales en toda la cabecera
    document.querySelectorAll('th').forEach(t => {
         t._dragCounter = 0;
         t.classList.remove('border-emerald-400', 'border-l-[4px]', 'bg-gradient-to-r', 'from-emerald-900/60', 'to-transparent');
    });

    if (window.viewerRuleWorkshop && typeof window.viewerRuleWorkshop.syncVisuals === 'function') {\`;


if (code.includes(dragStartBlockOriginal)) {
    code = code.replace(dragStartBlockOriginal, dragStartBlockRepl);
    console.log("DragStart Events Patched.");
} else {
    console.log("DragStart Events NOT FOUND");
}

if (code.includes(dragEndTargetOriginal)) {
    code = code.replace(dragEndTargetOriginal, dragEndTargetRepl);
    console.log("DragEnd Events Patched.");
} else {
    console.log("DragEnd Events NOT FOUND");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
