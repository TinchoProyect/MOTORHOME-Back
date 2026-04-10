const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');
const lines = code.split('\n');

// The original table row loop should look like this:
//     html += "</tr></thead><tbody>";
// 
//     data.forEach((row) => {
//         const isRejected = row._rejectedSim;

// Let's find index of "html += "</tr></thead><tbody>";"
let startIdx = -1;
let occurrences = 0;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('html += "</tr></thead><tbody>";')) {
        occurrences++;
        if (occurrences === 1) startIdx = i; // The correct one
        if (occurrences === 2) {
            // Delete everything between startIdx and i (inclusive of startIdx + 1 up to i)
            lines.splice(startIdx + 1, i - startIdx);
            break;
        }
    }
}

fs.writeFileSync('src/views/js/viewer_render.js', lines.join('\n'));
console.log('Duplication cleanup successful.');
