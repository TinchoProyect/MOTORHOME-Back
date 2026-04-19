const fs = require('fs');
let lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\\n');

let idx = lines.findIndex(l => l.includes('if (opRes.ok) opJson = await opRes.json();'));
if (idx !== -1) {
    if (!lines[idx+1].includes('window._rawLamdaData = opJson.data;')) {
        lines.splice(idx + 1, 0, '                window._rawLamdaData = opJson.data;');
        console.log("Injected window._rawLamdaData via splice");
    }
}

fs.writeFileSync('src/views/monitor_proveedores.html', lines.join('\\n'));
