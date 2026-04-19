const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

html = html.replace("\\\\n", "\\n");

fs.writeFileSync('src/views/monitor_proveedores.html', html);
