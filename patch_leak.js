const fs = require('fs');

let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

// Target 1: filterSimulationData (ALL field and specific field)
code = code.replace(
    /const val = cfg\.transform\(row\[cfg\.sourceIndex\], row\);\s*return normString\(val\)\.includes\(term\);/g,
    'let val = row._unifiedContext && cfg.unifiedKey && row._unifiedContext[cfg.unifiedKey] ? row._unifiedContext[cfg.unifiedKey].display : (row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null);\r\n                    if (val === null || val === undefined) val = "";\r\n                    return normString(val).includes(term);'
);

// Target 2: renderSimulationTable fallback
code = code.replace(
    /const rawVal = cfg\.sourceIndex >= 0 \? row\[cfg\.sourceIndex\] : null;\s*let finalVal = row\._unifiedContext && cfg\.unifiedKey && row\._unifiedContext\[cfg\.unifiedKey\] \? row\._unifiedContext\[cfg\.unifiedKey\]\.display : \(row\._richContext && row\._richContext\[cfg\.virtualColId\] \? row\._richContext\[cfg\.virtualColId\]\.display : null\);\s*if\(finalVal === null \|\| finalVal === undefined\) finalVal = cfg\.transform\(rawVal, row\);/,
    'let finalVal = row._unifiedContext && cfg.unifiedKey && row._unifiedContext[cfg.unifiedKey] ? row._unifiedContext[cfg.unifiedKey].display : (row._richContext && row._richContext[cfg.virtualColId] ? row._richContext[cfg.virtualColId].display : null);\r\n            if(finalVal === null || finalVal === undefined) finalVal = "";'
);

fs.writeFileSync('src/views/js/viewer_render.js', code);
console.log('RegExp patch applied.');
