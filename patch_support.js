const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t1 = /isSupportCol: false,\s*\/\/ Split targets son/g;
if (t1.test(code)) {
    code = code.replace(/isSupportCol: false,\s*\/\/ Split targets son/g, "isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.id).toLowerCase() === String(fieldId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(fieldName).toLowerCase()) : false, // Split targets son");
}

const t2 = /isSupportCol: false,\s*\/\/ Split dinamico/g;
if (t2.test(code)){
    code = code.replace(/isSupportCol: false,\s*\/\/ Split dinamico/g, "isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.nombre_campo).toLowerCase() === String(label).toLowerCase()) : false, // Split dinamico");
}

const t3 = /isSupportCol: false,\s*\/\/ Las calculadas son siempre/g;
if (t3.test(code)){
    code = code.replace(/isSupportCol: false,\s*\/\/ Las calculadas son siempre/g, "isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.nombre_campo).toLowerCase() === String(calcConfig.masterField?.nombre_campo || 'Calculada').toLowerCase()) : false, // Las calculadas son siempre");
}

fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log('Regex patch complete for Support Cols');
