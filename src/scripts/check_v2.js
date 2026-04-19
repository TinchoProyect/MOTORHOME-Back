const fs = require('fs');
const text = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

console.log('Target Col HTML:', text.includes('id="fmtBulkTargetCol"'));
console.log('Unidad Select HTML:', text.includes('id="fmtBulkUnidadSelect"'));
console.log('onBulkTargetChange:', text.includes('window.onBulkTargetChange = function'));
console.log('vigia QA:', text.includes('Auditoría de Inyección UI'));
