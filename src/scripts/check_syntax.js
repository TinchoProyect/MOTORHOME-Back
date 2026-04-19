const fs = require('fs');
const acorn = require('acorn');

const html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// A very dumb but working script extractor:
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
let i = 0;
while ((match = scriptRegex.exec(html)) !== null) {
    try {
        acorn.parse(match[1], { ecmaVersion: 2020 });
        console.log(`Script ${i} is valid`);
    } catch (e) {
        console.log(`Script ${i} is INVALID`);
        console.log(e);
        process.exit(1);
    }
    i++;
}
console.log('All script tags hold valid JS');
