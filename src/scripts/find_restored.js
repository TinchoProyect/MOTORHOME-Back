const fs = require('fs');
const lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');
const s = lines.findIndex(l => l.includes('id="fmtBulkActionBar"'));
if (s!==-1) {
    const e = lines.findIndex((l, i) => i > s && l.includes('</button>'));
    console.log("start:", s, "end:", e);
} else {
    console.log("not found");
}

const jsS = lines.findIndex(l => l.includes('window.executeBulkRubroUpdate = async function() {'));
if (jsS!==-1) {
    const jsE = lines.findIndex((l, i) => i > jsS && l.includes('// EXTRACCIÓN OPERATIVA (FASE 5)'));
    console.log("js start:", jsS, "js end:", jsE);
}
