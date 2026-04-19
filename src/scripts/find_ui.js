const fs = require('fs');
const lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('id="fmtBulkActionBar"'));
if (start !== -1) {
    const end = lines.findIndex((l, i) => i > start && l.includes('</div>') && lines[i+1] && lines[i+1].includes('</div>') && lines[i+2] && lines[i+2].includes('</div>'));
    console.log(start, end);
    console.log(lines.slice(start, start + 30).join('\n'));
}
