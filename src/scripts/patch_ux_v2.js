const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// 1. Ensure preventDefaultOnContextMenu is true so AG Grid doesn't pop the browser native menu on right click!
if (!html.includes('preventDefaultOnContextMenu: true')) {
    html = html.replace('onCellContextMenu: (event) => {', 'preventDefaultOnContextMenu: true,\n                    onCellContextMenu: (event) => {');
}

// 2. Change shortcut keydown from document to window with CAPTURE phase to beat AG-Grid propagation stopping
html = html.replace("document.addEventListener('keydown', (e) => {", "window.addEventListener('keydown', (e) => {");

// Locate the end of the keydown listener to set true for capture.
// Because it's a bit tricky, I'll just replace the whole keydown block.
const oldKeydown = `document.addEventListener('keydown', (e) => {
                // ALT + V
                if (e.altKey && (e.key === 'v' || e.key === 'V')) {
                    e.preventDefault();
                    if (window.lamdaLastColId) {
                        window.applyFilterVacio(window.lamdaLastColId);
                    } else if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            });`;

// In case the user ran the previous replace where I changed document to window already:
const oldKeydownFallback = `window.addEventListener('keydown', (e) => {
                // ALT + V
                if (e.altKey && (e.key === 'v' || e.key === 'V')) {
                    e.preventDefault();
                    if (window.lamdaLastColId) {
                        window.applyFilterVacio(window.lamdaLastColId);
                    } else if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            });`;

const newKeydown = `window.addEventListener('keydown', (e) => {
                // ALT + V or ALT + B
                if (e.altKey && (e.key === 'v' || e.key === 'V' || e.key === 'b' || e.key === 'B')) {
                    e.preventDefault();
                    if (window.lamdaLastColId) {
                        window.applyFilterVacio(window.lamdaLastColId);
                    } else if (window.v4GridApi) {
                        const cols = window.v4GridApi.getAllDisplayedColumns();
                        if (cols && cols.length > 0) window.applyFilterVacio(cols[0].getColId());
                    }
                }
            }, true); // VITAL: Capture phase for AG Grid bypass`;

if (html.includes(oldKeydown)) {
    html = html.replace(oldKeydown, newKeydown);
} else if (html.includes(oldKeydownFallback)) {
    html = html.replace(oldKeydownFallback, newKeydown);
}

// 3. Make sure 'click' to close the menu works reliably via Window Capture to avoid internal stoppropagations.
html = html.replace("document.addEventListener('click', () => {\n            window.hideLamdaContextMenu();\n        });", 
                    "window.addEventListener('click', () => {\n            window.hideLamdaContextMenu();\n        }, true);");

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('Fix deployed.');
