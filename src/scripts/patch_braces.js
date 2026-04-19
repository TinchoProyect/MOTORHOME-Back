const fs = require('fs');
let lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');

for(let i=0; i<lines.length; i++) {
    if (lines[i].includes("if (filterOption === 'equals')")) {
        // Checking the lines above it to see if we have consecutive brace lines.
        let l1 = lines[i-1] ? lines[i-1].trim() : '';
        let l2 = lines[i-2] ? lines[i-2].trim() : '';
        let l3 = lines[i-3] ? lines[i-3].trim() : '';
        
        if (l1 === '' && l2 === '}' && l3 === '}') {
            console.log('Found double brace at line ' + (i-2));
            lines.splice(i-2, 1);
        } else if (l1 === '}' && l2 === '}') {
            console.log('Found double brace at line ' + (i-1));
            lines.splice(i-1, 1);
        }
    }
}

fs.writeFileSync('src/views/monitor_proveedores.html', lines.join('\n'));
console.log('Patch complete.');
