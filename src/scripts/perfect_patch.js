const fs = require('fs');

let content = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

const regex = /filterParams:\s*\{\s*textFormatter:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*textMatcher:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*textCustomComparator:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}\s*\},(?=\s*onColumnResized:)/;

const newBlock = `filterParams: {
                            textFormatter: (r) => {
                                if (r == null) return null;
                                return String(r).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
                            },
                            textMatcher: (params) => {
                                const filterOption = params.filterOption || params.type;
                                
                                const cleanStr = (s) => {
                                    if (s == null) return "";
                                    return String(s).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
                                };
                                
                                const cellValue = cleanStr(params.value);
                                const filterText = cleanStr(params.filterText);
                                
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
                                
                                if (filterOption === 'equals') return cellValue === filterText;
                                if (filterOption === 'notEqual') return cellValue !== filterText;
                                if (filterOption === 'startsWith') return cellValue.startsWith(filterText);
                                if (filterOption === 'endsWith') return cellValue.endsWith(filterText);
                                
                                return false;
                            },
                            textCustomComparator: (filter, value, filterText) => {
                                // V2 Compatibilidad Inversa para agGrid
                                const filterOption = filter;
                                
                                const cleanStr = (s) => {
                                    if (s == null) return "";
                                    return String(s).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
                                };
                                
                                const cellValue = cleanStr(value);
                                const fText = cleanStr(filterText);
                                
                                if (!fText) return true;
                                if (!cellValue && !fText.includes('[vacio]')) return false;
                                
                                if (filterOption === 'contains') {
                                    const processedFText = fText.replace(/#/g, ' #');
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
                                    const processedFText = fText.replace(/#/g, ' #');
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
                                
                                if (filterOption === 'equals') return cellValue === fText;
                                if (filterOption === 'notEqual') return cellValue !== fText;
                                if (filterOption === 'startsWith') return cellValue.startsWith(fText);
                                if (filterOption === 'endsWith') return cellValue.endsWith(fText);
                                
                                return false;
                            }
                        },`;

// Verify syntax of the new block independently
try {
    const fnStr = "return {" + newBlock + "}";
    new Function(fnStr);
    console.log("Syntax is valid.");
} catch(e) {
    console.error("Syntax error in newBlock: ", e);
    process.exit(1);
}

const match = content.match(regex);
if (!match) {
    console.error("Regex did not match filterParams block.");
    process.exit(1);
}

const newContent = content.replace(regex, newBlock);
fs.writeFileSync('src/views/monitor_proveedores.html', newContent);
console.log("Patch applied correctly.");
