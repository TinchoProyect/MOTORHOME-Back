const fs = require('fs');
let js = fs.readFileSync('src/controllers/masterTableController.js', 'utf8');

const doubleDec = "                const outRow = { ...row };";

const firstIdx = js.indexOf(doubleDec);
if (firstIdx !== -1) {
    const secondIdx = js.indexOf(doubleDec, firstIdx + 1);
    if (secondIdx !== -1) {
        js = js.substring(0, secondIdx) + js.substring(secondIdx + doubleDec.length);
        fs.writeFileSync('src/controllers/masterTableController.js', js);
        console.log("Fixed duplicate outRow declaration.");
    } else {
        console.log("No duplicate outRow found.");
    }
}
