const fs = require('fs');
const files = [
  'c:/Users/Martin/Documents/sistema-gestion-proveedores-2/src/views/js/active_orders_ui.js',
  'c:/Users/Martin/Documents/sistema-gestion-proveedores-2/src/views/js/recepciones_history_ui.js'
];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/\\`/g, '`');
  content = content.replace(/\\\$/g, '$');
  fs.writeFileSync(f, content);
  console.log('Fixed', f);
});
