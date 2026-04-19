const fs = require('fs');
let content = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const targetStr = "if (effectiveToken === '[vacio]') {";
const replacementStr = `if (effectiveToken === '[vacio]') {
                                            console.log('🛡️ [VIGÍA DE FILTRO - VACIO] Token Detonado. Negativo?: ' + isNeg + ' | Celda estaba vacia?: ' + (cellValue === ""));`;

content = content.replaceAll(targetStr, replacementStr);
fs.writeFileSync('src/views/monitor_proveedores.html', content);
console.log('Vigia Injected Successfully');
