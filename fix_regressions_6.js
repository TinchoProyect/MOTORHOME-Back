const fs = require('fs');
let lines = fs.readFileSync('src/views/js/viewer_render.js', 'utf8').split('\n');

for (let i = 0; i < 843; i++) {
    if (lines[i].includes('masterPipelines')) {
        lines[i] = lines[i].replace(/masterPipelines/g, 'window.draftPipelines');
    }
}

if (lines[842].includes('let window.draftPipelines = window.draftPipelines;')) {
    lines[842] = lines[842].replace('let window.draftPipelines = window.draftPipelines;', 'let masterPipelines = window.draftPipelines;');
} else if (lines[842].includes('let masterPipelines = masterPipelines;')) {
    lines[842] = lines[842].replace('let masterPipelines = masterPipelines;', 'let masterPipelines = window.draftPipelines;');
}

fs.writeFileSync('src/views/js/viewer_render.js', lines.join('\n'));
console.log("Restaurado window.draftPipelines correctamente");
