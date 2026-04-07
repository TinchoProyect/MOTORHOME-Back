const fs = require('fs');
let code = fs.readFileSync('C:\\Users\\Martin\\Documents\\sistema-gestion-proveedores-2\\tmp_test_schema.js', 'utf8');
code = code.replace(/const dictionarySamples = \[.*?\];/, 'const dictionarySamples = Array.from({length: 255}, (_, i) => "ANANA EN RODAJAS CUMANA "+i+"x3 KG");');
fs.writeFileSync('C:\\Users\\Martin\\Documents\\sistema-gestion-proveedores-2\\tmp_test_schema.js', code);
