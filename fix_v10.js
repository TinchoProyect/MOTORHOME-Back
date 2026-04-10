const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t2 = /let tblSheetIdx = 0;\s+if \(window\.sheetsToProcess\) tblSheetIdx = window\.sheetsToProcess\.findIndex\(s => s\.name === rowSheetName\);/;
const r2 = `let tblSheetIdx = 0;
        if (window._simSheetNames) tblSheetIdx = window._simSheetNames.indexOf(rowSheetName);
        if (tblSheetIdx === -1) tblSheetIdx = 0;`;

if (t2.test(code)) {
    code = code.replace(t2, r2);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log('Regex replace successful for tblSheetIdx');
} else {
    console.log('Regex could not match tblSheetIdx logic.');
}
