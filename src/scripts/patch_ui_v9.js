const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

html = html.replace("\\\\n                    headerCheckboxSelectionFilteredOnly: true,", "\\n                    headerCheckboxSelectionFilteredOnly: true,");

fs.writeFileSync('src/views/monitor_proveedores.html', html);
console.log('Fixed \\\\n formatting');
