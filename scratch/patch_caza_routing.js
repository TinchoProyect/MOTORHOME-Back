const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("const forceClusterMode = this.selectedRoute === 'cluster';", "const forceClusterMode = this.selectedRoute === 'cluster' || this.selectedRoute === 'caza-rubros';");

fs.writeFileSync(file, content, 'utf8');
console.log('Caza-rubros cluster routing logic injected');
