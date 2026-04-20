const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const targetStr = `                         filter: 'agTextColumnFilter',`;
const injection = `                         comparator: isPrice ? (valueA, valueB) => {
                             const parseAsNum = (v) => {
                                 if (!v) return -Infinity;
                                 let s = String(v).toLowerCase();
                                 if (s.includes('[vacio]')) return -Infinity;
                                 
                                 s = s.replace(/[^0-9.,-]/g, '');
                                 if (s.length > 3 && s.charAt(s.length - 3) === ',') {
                                     s = s.replace(/\\./g, ''); 
                                     s = s.replace(/,/g, '.');
                                 } else if (s.length > 3 && s.charAt(s.length - 3) === '.') {
                                     s = s.replace(/,/g, ''); 
                                 } else {
                                     s = s.replace(/,/g, '.');
                                 }
                                 
                                 const n = parseFloat(s);
                                 return isNaN(n) ? -Infinity : n;
                             };
                             return parseAsNum(valueA) - parseAsNum(valueB);
                         } : undefined,
                         filter: 'agTextColumnFilter',`;

if (html.includes(targetStr) && !html.includes('parseAsNum')) {
    html = html.replace(targetStr, injection);
    fs.writeFileSync('src/views/monitor_proveedores.html', html);
    console.log("Comparator inyectado exitosamente.");
} else {
    console.log("Ya estaba inyectado o no se encontró el ancla.");
}
