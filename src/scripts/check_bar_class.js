const fs = require('fs');
const lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes('fmtBulkActionBar'));
console.log(lines.slice(idx, idx+1)[0]);
