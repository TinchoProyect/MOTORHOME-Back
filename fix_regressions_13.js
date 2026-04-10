const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// FIX 1: CHROMATIC INDEX (simSheetNames undefined)
const chromaticTarget = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;`;

const chromaticRepl = `        let rowSheetName = row._sourceSheet || 'Principal';
        let tblSheetIdx = 0;
        if (window._simValidSheetsForPreview) {
             const names = window._simValidSheetsForPreview.map(s => s.name);
             tblSheetIdx = names.indexOf(rowSheetName);
        }
        if (tblSheetIdx === -1) tblSheetIdx = 0;`;

if (code.includes(chromaticTarget)) {
    code = code.replace(chromaticTarget, chromaticRepl);
    console.log("Chromatic SheetNames Target Replaced.");
} else {
    console.log("Failed to find Chromatic Target.");
}

// FIX 2: DRAG AND DROP ABORT (Event Target misfire on Sticky Headers DOM)
const dragStartTarget = `window.ViewerUI.handleDragStart = function(e, index) {
    if (e.target.tagName !== 'TH') return;
    window.ViewerUI.draggedSimColIndex = index;
    // Efecto de movimiento
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        e.target.classList.add('opacity-40');
    }, 10);
};`;

const dragStartRepl = `window.ViewerUI.handleDragStart = function(e, index) {
    const th = e.target.closest('th');
    if (!th) return;
    window.ViewerUI.draggedSimColIndex = index;
    // Efecto de movimiento
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', index.toString()); } catch(ex){} // Firefox fix
    setTimeout(() => {
        th.classList.add('opacity-40');
    }, 10);
};`;

if (code.includes(dragStartTarget)) {
    code = code.replace(dragStartTarget, dragStartRepl);
    console.log("DragStart Target Replaced.");
} else {
    console.log("Failed to find DragStart Target.");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
