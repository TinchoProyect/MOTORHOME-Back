const fs = require('fs');
const lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes('fmtBulkActionBar'));
console.log(lines.slice(Math.max(0, idx - 5), Math.min(lines.length, idx + 40)).join('\n'));
