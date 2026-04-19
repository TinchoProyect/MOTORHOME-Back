const fs = require('fs');

let lines = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8').split('\n');

const logicBlock = `
                                if (!filterText) return true;
                                if (!cellValue && !filterText.includes('[vacio]')) return false;
                                
                                if (filterOption === 'contains') {
                                    const processedFText = filterText.replace(/#/g, ' #');
                                    const rawTokens = processedFText.split(/\\s+/).filter(t => t.length > 0);
                                    for (const rawToken of rawTokens) {
                                        if (rawToken === '#') continue;
                                        
                                        const isNeg = rawToken.startsWith('#');
                                        let effectiveToken = rawToken;
                                        if (isNeg) effectiveToken = effectiveToken.substring(1);
                                        effectiveToken = effectiveToken.replace(/#/g, '');
                                        if (effectiveToken.length === 0) continue;
                                        
                                        if (effectiveToken === '[vacio]') {
                                            if (isNeg) {
                                                if (cellValue === "") return false;
                                            } else {
                                                if (cellValue !== "") return false;
                                            }
                                        } else {
                                            if (isNeg) {
                                                if (cellValue.includes(effectiveToken)) return false;
                                            } else {
                                                if (!cellValue.includes(effectiveToken)) return false;
                                            }
                                        }
                                    }
                                    return true;
                                }
                                
                                if (filterOption === 'notContains') {
                                    const processedFText = filterText.replace(/#/g, ' #');
                                    const rawTokens = processedFText.split(/\\s+/).filter(t => t.length > 0);
                                    let match = true;
                                    for (const rawToken of rawTokens) {
                                        if (rawToken === '#') continue;
                                        
                                        const isNeg = rawToken.startsWith('#');
                                        let effectiveToken = rawToken;
                                        if (isNeg) effectiveToken = effectiveToken.substring(1);
                                        effectiveToken = effectiveToken.replace(/#/g, '');
                                        if (effectiveToken.length === 0) continue;
                                        
                                        if (effectiveToken === '[vacio]') {
                                            if (isNeg) {
                                                if (cellValue === "") { match = false; break; }
                                            } else {
                                                if (cellValue !== "") { match = false; break; }
                                            }
                                        } else {
                                            if (isNeg) {
                                                if (cellValue.includes(effectiveToken)) { match = false; break; }
                                            } else {
                                                if (!cellValue.includes(effectiveToken)) { match = false; break; }
                                            }
                                        }
                                    }
                                    return !match;
                                }
`;

function replaceBlock(startIndex, startStr, endStr, replacement) {
    let s = -1, e = -1;
    for(let i=startIndex; i<lines.length; i++) {
        if(s === -1 && lines[i].includes(startStr)) s = i;
        if(s !== -1 && lines[i].includes(endStr)) { e = i; break; }
    }
    if (s !== -1 && e !== -1) {
        lines.splice(s, e - s + 1, replacement);
        return true;
    }
    return false;
}

replaceBlock(1600, 'if (!filterText) return true;', 'return !match;', logicBlock.trimEnd());

const logicBlock2 = logicBlock.replace(/filterText/g, 'fText');
replaceBlock(1650, 'if (!fText) return true;', 'return !match;', logicBlock2.trimEnd());

fs.writeFileSync('src/views/monitor_proveedores.html', lines.join('\n'));
console.log('patched successfully');
