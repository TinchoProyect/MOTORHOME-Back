const fs = require('fs');
let data = fs.readFileSync('src/views/js/inventory_ui.js', 'utf8');
data = data.replace(/\\`/g, '`');
data = data.replace(/\\\$/g, '$');
fs.writeFileSync('src/views/js/inventory_ui.js', data);
console.log('Fixed syntax errors.');
