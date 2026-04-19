const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const anchor1 = 'let opJson = { data: [] };\\n                if (opRes.ok) opJson = await opRes.json();';
if (html.includes(anchor1)) {
    html = html.replace(anchor1, anchor1 + '\\n                window._rawLamdaData = opJson.data;');
    console.log("Injected window._rawLamdaData");
}

const anchor2 = 'const globalNodes = window.v4GridApi.getModel().getRootNode().allLeafChildren;';
if (html.includes(anchor2)) {
    const replacement = `const globalNodes = window._rawLamdaData || [];`;
    html = html.replace(anchor2, replacement);
    console.log("Replaced globalNodes extraction");
}

const anchor3 = 'if (node.data && node.data.datos_maestros) {';
if (html.includes(anchor3)) {
    const r3 = 'if (node && node.datos_maestros) {';
    html = html.replace(anchor3, r3);
    console.log("Replaced node.data 1");
}

const anchor4 = 'let dm = node.data.datos_maestros;';
if (html.includes(anchor4)) {
    const r4 = 'let dm = node.datos_maestros;';
    html = html.replace(anchor4, r4);
    console.log("Replaced node.data 2");
}

const anchor5 = "if (String(key).toLowerCase() === 'unidad') {";
if (html.includes(anchor5)) {
    const r5 = "if (String(key).trim().toLowerCase() === 'unidad') {";
    html = html.replace(anchor5, r5);
    console.log("Included trim in key check");
}

fs.writeFileSync('src/views/monitor_proveedores.html', html);
