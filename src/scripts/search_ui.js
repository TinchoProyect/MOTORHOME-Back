const fs = require('fs');
const html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');
const lines = html.split(/\\r?\\n/);
const flexRow = lines.findIndex((l) => l.includes('id="finalMasterTableModal"'));
console.log(lines.slice(flexRow, flexRow + 40).join('\\n'));
