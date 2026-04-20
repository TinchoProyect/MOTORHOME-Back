const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'src', 'views', 'monitor_proveedores.html');
let content = fs.readFileSync(p, 'utf8');
content = content.replace(/taskAction\('Pedidos activos'\)/g, 'window.openActiveOrders()');
fs.writeFileSync(p, content);
console.log('Sidebar Button Patched');
