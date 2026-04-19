const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// Inject Vigia Mouse inside onCellContextMenu
const onCellContextMenuStr = 'onCellContextMenu: (event) => {';
const onCellContextMenuRepl = `onCellContextMenu: (event) => {
                        console.log("VIGÍA MOUSE: Clic derecho interceptado en celda. gridOptions.preventDefaultOnContextMenu es:", gridOptions.preventDefaultOnContextMenu);`;

if (!html.includes('VIGÍA MOUSE: Clic derecho interceptado')) {
    html = html.replace(onCellContextMenuStr, onCellContextMenuRepl);
}

// Inject Vigia Keyboard inside keydown listener
const keydownStr = "window.addEventListener('keydown', (e) => {";
const keydownRepl = `window.addEventListener('keydown', (event) => {
                console.log("VIGÍA TECLADO [CAPTURA]: Tecla detectada ->", event.key, "Alt:", event.altKey);
                const e = event;`;

if (!html.includes('VIGÍA TECLADO [CAPTURA]')) {
    html = html.replace(keydownStr, keydownRepl);
}

// Make sure gridOptions.preventDefaultOnContextMenu actually gets set to true BEFORE assigning it to agGrid
// The user noted: "Verifiquen que la propiedad preventDefaultOnContextMenu: true esté siendo efectivamente pasada e inicializada en la instancia final"
const initStr = "window.v4GridApi = agGrid.createGrid(gridContainer, gridOptions);";
const initRepl = `console.log("VIGÍA GRID INIT: preventDefaultOnContextMenu pre-init es:", gridOptions.preventDefaultOnContextMenu);
                window.v4GridApi = agGrid.createGrid(gridContainer, gridOptions);`;

if (!html.includes('VIGÍA GRID INIT')) {
    html = html.replace(initStr, initRepl);
}

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('Vigias injected.');
