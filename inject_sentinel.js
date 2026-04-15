const fs = require('fs');
let content = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');
if(!content.includes('network_sentinel.js')) {
    content = content.replace('<head>', '<head>\n    <script src="js/network_sentinel.js"></script>');
    fs.writeFileSync('src/views/monitor_proveedores.html', content);
    console.log('Injected sentinel');
}
