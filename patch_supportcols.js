const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// Target 1: split
const t1 = `                                isVirtual: true,
                                isSupportCol: false, // Split targets son siempre resultado principal`;
const r1 = `                                isVirtual: true,
                                isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.id).toLowerCase() === String(fieldId).toLowerCase() || String(m.nombre_campo).toLowerCase() === String(fieldName).toLowerCase()) : false,`;

if(code.includes(t1)) code = code.replace(t1, r1); else console.log("t1 missing");

// Target 2: regex split
const t2 = `                                isVirtual: true,
                                isSupportCol: false, // Split dinamico siempre visible`;
const r2 = `                                isVirtual: true,
                                isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.nombre_campo).toLowerCase() === String(label).toLowerCase()) : false,`;

if(code.includes(t2)) code = code.replace(t2, r2); else console.log("t2 missing");

// Target 3: computed
const t3 = `                    isVirtual: true,
                    isComputed: true, // Custom flag
                    isSupportCol: false, // Las calculadas son siempre maestras`;
const r3 = `                    isVirtual: true,
                    isComputed: true, 
                    isSupportCol: window.masterDictionary && Array.isArray(window.masterDictionary) ? !window.masterDictionary.some(m => String(m.nombre_campo).toLowerCase() === String(calcConfig.masterField?.nombre_campo || 'Calculada').toLowerCase()) : false,`;

if (code.includes(t3)) code = code.replace(t3, r3); else console.log("t3 missing");

fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log('Support columns enforcement patched');
