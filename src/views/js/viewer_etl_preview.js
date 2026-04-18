/**
 * VIEWER ETL PREVIEW (V4)
 * Phase 4: Client-Side Transformation Simulator
 */

// CORE ALGORITHM: Apply pipeline sequentially
import astParser from "./viewer_etl_ast_parser.js";

export function transformCell(rawValue, pipeline, contextRow = null) {
    if (rawValue === undefined || rawValue === null) rawValue = "";
    let currentValue = String(rawValue).trim();
    let isRejected = false;

    // [V5] Rich Object Support
    let cleanValue = null; // Stores pure mathematical float if evaluated

    // Iteramos el pipeline respetando ERICTAMENTE el orden definido por el usuario (UX).
    for (const rule of pipeline) {
        if (rule.disabled) continue;
        if (isRejected) break;

        const isCustomReplace = rule.tipo_regex && rule.tipo_regex.startsWith('CUSTOM_REPLACE:');

        if (rule.tipo === 'ast_conditional') {
            // Evaluador JSON AST (Zero RCE)
            const astData = rule.ast || rule; 
            const execution = astParser.executeAST(currentValue, astData);
            if (execution.handled) {
                currentValue = execution.result;
                if (execution.rejected) isRejected = true;
                continue;
            }
        } 
        else if (rule.tipo === 'combine_numeric') {
            // Evaluador de Fusionado Numérico (Context-Aware & Frequency-Aware)
            const tgtColId = rule.target_col_id;
            const srcColId = rule.source_col_id;
            
            let skipTransform = false;

            // FASE DE ESCANEO PRE-COMPUTADA (CACHÉ)
            if (srcColId && window.currentSheetData && window.currentSheetData.length > 1) {
                if (!window._freqCache) window._freqCache = {};
                
                const ruleIdx = pipeline.indexOf(rule);
                const partialPipeline = ruleIdx >= 0 ? pipeline.slice(0, ruleIdx) : [];
                // Un hash que garantiza invalidación ante cambios de pipeline o de volumen de datos
                const cacheKeyStr = "combine_freq_" + srcColId + "_" + window.currentSheetData.length + "_" + JSON.stringify(partialPipeline);
                
                if (!window._freqCache[cacheKeyStr]) {
                    console.log(`[ETL PREVIEW] ⚡ Construyendo Mapa de Frecuencias global para columna: ${srcColId}...`);
                    window._freqCache[cacheKeyStr] = {};
                    
                    // Helper iterativo local para resolver el crudo de la columna
                    const resolveRaw = (r, tId) => {
                        let physicalIdx = tId;
                        if (window.computedColumns) {
                            const comp = window.computedColumns.find(c => c.id === tId);
                            if (comp && comp.operands && comp.operands.length > 0) return resolveRaw(r, comp.operands[0]); 
                        }
                        if (typeof physicalIdx === 'string' && window.virtualColumns) {
                            const vCol = window.virtualColumns.find(c => String(c.id) === String(physicalIdx));
                            if (vCol && vCol.dataIdx !== undefined) physicalIdx = vCol.dataIdx;
                        }
                        if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) physicalIdx = parseInt(physicalIdx.replace('col_', ''), 10);
                        if (typeof physicalIdx !== 'number' || isNaN(physicalIdx) || physicalIdx < 0) return "";
                        return String(r[physicalIdx] || "");
                    };

                    const rawRows = window.currentSheetData.slice(1);
                    for (let r of rawRows) {
                        let baseRaw = resolveRaw(r, srcColId);
                        if (!baseRaw.trim()) continue;
                        
                        let outVal = baseRaw;
                        if (partialPipeline.length > 0) {
                            const tr = transformCell(baseRaw, partialPipeline, r);
                            if (tr.rejected) continue;
                            outVal = String(tr.display || tr.result || "");
                        }
                        
                        if (outVal !== "") {
                            window._freqCache[cacheKeyStr][outVal] = (window._freqCache[cacheKeyStr][outVal] || 0) + 1;
                        }
                    }
                }
                
                // CONDICIONAL: Verificar duplicados
                const ocurrences = window._freqCache[cacheKeyStr][currentValue] || 0;
                if (ocurrences <= 1) {
                    skipTransform = true; // Código Base ÚNICO: Bypass de la regla.
                }
            }

            // GUARDIA ARQUITECTÓNICA & DIAGNÓSTICO: Prevenir mutación de celdas vacías
            if (currentValue.trim() === "") {
                if (!skipTransform) {
                    console.warn(`[ETL DIAGNOSTIC] 🛡️ Regla 'combine_numeric' abortada. La celda estaba vacía (Posible remanente de limpieza previa).`);
                }
                skipTransform = true;
            }

            if (!skipTransform && tgtColId !== undefined && contextRow) {
                const beforeEnrich = currentValue;

                let targetRawVal = "";
                if (window.virtualColumns) {
                    const vCol = window.virtualColumns.find(c => String(c.id) === String(tgtColId));
                    if (vCol) targetRawVal = contextRow[vCol.dataIdx];
                    else targetRawVal = contextRow[tgtColId];
                } else {
                    targetRawVal = contextRow[tgtColId];
                }
                
                const numbersOnly = String(targetRawVal || "").replace(/[^0-9]/g, '');
                currentValue = currentValue + (numbersOnly ? "-" + numbersOnly : "");
                
                console.log(`[ETL DIAGNOSTIC] Trazabilidad 'combine_numeric' | Ingreso: '${beforeEnrich}' -> Salida: '${currentValue}'`);
            }
        }
        else if (rule.tipo === 'combine_hash') {
            // Evaluador de Hash de Texto (Context-Aware & Frequency-Aware)
            const tgtColId = rule.target_col_id;
            const srcColId = rule.source_col_id;
            
            let skipTransform = false;

            // FASE DE ESCANEO PRE-COMPUTADA (CACHÉ)
            if (srcColId && window.currentSheetData && window.currentSheetData.length > 1) {
                if (!window._freqCache) window._freqCache = {};
                
                const ruleIdx = pipeline.indexOf(rule);
                const partialPipeline = ruleIdx >= 0 ? pipeline.slice(0, ruleIdx) : [];
                const cacheKeyStr = "combine_freq_" + srcColId + "_" + window.currentSheetData.length + "_" + JSON.stringify(partialPipeline);
                
                if (!window._freqCache[cacheKeyStr]) {
                    console.log(`[ETL PREVIEW] ⚡ Construyendo Mapa de Frecuencias global para columna (Hash): ${srcColId}...`);
                    window._freqCache[cacheKeyStr] = {};
                    
                    const resolveRaw = (r, tId) => {
                        let physicalIdx = tId;
                        if (window.computedColumns) {
                            const comp = window.computedColumns.find(c => c.id === tId);
                            if (comp && comp.operands && comp.operands.length > 0) return resolveRaw(r, comp.operands[0]); 
                        }
                        if (typeof physicalIdx === 'string' && window.virtualColumns) {
                            const vCol = window.virtualColumns.find(c => String(c.id) === String(physicalIdx));
                            if (vCol && vCol.dataIdx !== undefined) physicalIdx = vCol.dataIdx;
                        }
                        if (typeof physicalIdx === 'string' && physicalIdx.startsWith('col_')) physicalIdx = parseInt(physicalIdx.replace('col_', ''), 10);
                        if (typeof physicalIdx !== 'number' || isNaN(physicalIdx) || physicalIdx < 0) return "";
                        return String(r[physicalIdx] || "");
                    };

                    const rawRows = window.currentSheetData.slice(1);
                    for (let r of rawRows) {
                        let baseRaw = resolveRaw(r, srcColId);
                        if (!baseRaw.trim()) continue;
                        
                        let outVal = baseRaw;
                        if (partialPipeline.length > 0) {
                            const tr = transformCell(baseRaw, partialPipeline, r);
                            if (tr.rejected) continue;
                            outVal = String(tr.display || tr.result || "");
                        }
                        
                        if (outVal !== "") {
                            window._freqCache[cacheKeyStr][outVal] = (window._freqCache[cacheKeyStr][outVal] || 0) + 1;
                        }
                    }
                }
                
                const ocurrences = window._freqCache[cacheKeyStr][currentValue] || 0;
                if (ocurrences <= 1) {
                    skipTransform = true; // Código Base ÚNICO: Bypass de la regla.
                }
            }

            // GUARDIA ARQUITECTÓNICA & DIAGNÓSTICO: Prevenir mutación de celdas vacías
            if (currentValue.trim() === "") {
                if (!skipTransform) {
                    console.warn(`[ETL DIAGNOSTIC] 🛡️ Regla 'combine_hash' abortada. La celda estaba vacía (Posible remanente de limpieza previa).`);
                }
                skipTransform = true;
            }

            if (!skipTransform && tgtColId !== undefined && contextRow) {
                const beforeEnrich = currentValue;
                let targetRawVal = "";
                if (window.virtualColumns) {
                    const vCol = window.virtualColumns.find(c => String(c.id) === String(tgtColId));
                    if (vCol) targetRawVal = contextRow[vCol.dataIdx];
                    else targetRawVal = contextRow[tgtColId];
                } else {
                    targetRawVal = contextRow[tgtColId];
                }
                
                // Algoritmo DJB2 Hash para convertir texto a un numero determinista pseudo-unico
                const rawStr = String(targetRawVal || "").trim().toLowerCase();
                let hash = 5381;
                for (let i = 0; i < rawStr.length; i++) {
                    hash = ((hash << 5) + hash) + rawStr.charCodeAt(i);
                }
                const suffix = Math.abs(hash); // Tomar valor absoluto preventivo
                currentValue = currentValue + "-" + suffix;
                
                console.log(`[ETL DIAGNOSTIC] Trazabilidad 'combine_hash' | Ingreso: '${beforeEnrich}' -> Salida: '${currentValue}'`);
            }
        }
        else if (rule.tipo === 'math_discount') {
            // Paso A: Abortar celdas vacías
            if (currentValue === "") continue;

            const originalVal = currentValue;
            
            // Paso B: Sanitización Monetaria Regional
            // 1. Eliminar símbolos ($, USD, letras, espacios)
            let numericString = currentValue.replace(/[$\sA-Za-z]/g, '');
            // 2. Eliminar cualquier cosa que no sea dígito, coma, punto o signo menos
            numericString = numericString.replace(/[^\d.,\-]/g, '');
            
            // 3. Resolución de decimales (Coma vs Punto)
            const lastComma = numericString.lastIndexOf(',');
            const lastDot = numericString.lastIndexOf('.');
            
            if (lastComma > lastDot && lastComma !== -1) {
                // Coma es decimal (E.g. 1.234,50 -> 1234.50)
                numericString = numericString.replace(/\./g, '');
                numericString = numericString.replace(',', '.');
            } else if (lastDot > lastComma && lastDot !== -1) {
                // Punto es decimal (E.g. 1,234.50 -> 1234.50)
                numericString = numericString.replace(/,/g, '');
            } else {
                // Solo hay un tipo de separador o ninguno
                if (numericString.includes(',')) {
                    const parts = numericString.split(',');
                    // Convención: Si solo hay una coma y le siguen 3 dígitos exactos al final, es separador de miles. Sino decimal.
                    if (parts.length === 2 && parts[1].length === 3) {
                        numericString = numericString.replace(',', ''); // Miles
                    } else {
                        numericString = numericString.replace(/,/g, '.'); // Decimal
                    }
                }
            }

            const floatVal = parseFloat(numericString);

            // Paso C: Exclusión de Texto (Evitar NaN)
            if (!isNaN(floatVal)) {
                // Paso D: Cálculo y Formateo
                const pct = parseFloat(rule.percentage) || 0;
                const discounted = floatVal * (1 - (pct / 100));
                currentValue = discounted.toFixed(2);
                cleanValue = discounted;
                
                console.log(`[ETL DIAGNOSTIC] Trazabilidad 'math_discount' | Ingreso: '${originalVal}' -> Detectado: ${floatVal} -> Salida: '${currentValue}' (-${pct}%)`);
            } else {
                console.warn(`[ETL DIAGNOSTIC] 'math_discount' abortado por valor no numérico: '${originalVal}'`);
            }
        }
        const isCustomRowOverride = rule.tipo_regex && rule.tipo_regex.startsWith('CUSTOM_OVERRIDE_ROW:');
        const isCustomSkuOverride = rule.tipo_regex && rule.tipo_regex.startsWith('CUSTOM_OVERRIDE_SKU:');

        if (isCustomSkuOverride) {
            const payload = rule.tipo_regex.replace('CUSTOM_OVERRIDE_SKU:', '');
            const separatorIdx = payload.indexOf('|||');
            const targetSku = separatorIdx >= 0 ? payload.substring(0, separatorIdx) : payload;
            const replaceStr = separatorIdx >= 0 ? payload.substring(separatorIdx + 3) : '';

            if (contextRow) {
                // [REQ QA] Resolver dinámicamente el SKU físico de la fila activa
                let codeDataIdx = -1;
                
                const isMasterIdentifier = (masterId, masterName) => {
                    if (!window.masterDictionary) return false;
                    const mObj = window.masterDictionary.find(m => String(m.id) === String(masterId));
                    if (mObj && mObj.es_identificador === true) return true;
                    if (mObj && mObj.nombre_campo) masterName = mObj.nombre_campo;
                    if (!masterName) return false;
                    const lowerName = masterName.toLowerCase().trim();
                    return lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku';
                };

                if (window.draftPipelines) {
                    for (let cId in window.draftPipelines) {
                        const pipe = window.draftPipelines[cId];
                        if (pipe && pipe.masterField && isMasterIdentifier(pipe.masterField.id, pipe.masterField.nombre_campo)) {
                            if (window.virtualColumns && typeof cId === 'string') {
                                const vCol = window.virtualColumns.find(c => String(c.id) === String(cId));
                                if (vCol && vCol.dataIdx !== undefined) codeDataIdx = vCol.dataIdx;
                            }
                            if (codeDataIdx === -1 && typeof cId === 'string' && cId.startsWith('col_')) {
                                codeDataIdx = parseInt(cId.replace('col_', ''), 10);
                            }
                            break;
                        }
                    }
                }
                
                if (codeDataIdx === -1 && window.columnMapping) {
                    for (let cId in window.columnMapping) {
                        const mappedVal = window.columnMapping[cId];
                        let isId = false;
                        if (isMasterIdentifier(mappedVal, mappedVal)) {
                            isId = true;
                        } else if (window.nomenclatureCache) {
                            const term = window.nomenclatureCache.find(t => String(t.termino).toLowerCase().trim() === String(mappedVal).toLowerCase().trim());
                            if (term && (term.termino.toLowerCase().trim() === 'código' || term.termino.toLowerCase().trim() === 'codigo' || term.termino.toLowerCase().trim() === 'sku')) {
                                isId = true;
                            }
                        }
                        if (!isId) {
                            const lowerName = String(mappedVal).toLowerCase().trim();
                            if (lowerName === 'código' || lowerName === 'codigo' || lowerName === 'sku') {
                                isId = true;
                            }
                        }
                        if (isId) {
                            if (window.virtualColumns && typeof cId === 'string') {
                                const vCol = window.virtualColumns.find(c => String(c.id) === String(cId));
                                if (vCol && vCol.dataIdx !== undefined) codeDataIdx = vCol.dataIdx;
                            }
                            if (codeDataIdx === -1 && typeof cId === 'string' && cId.startsWith('col_')) {
                                codeDataIdx = parseInt(cId.replace('col_', ''), 10);
                            }
                            break;
                        }
                    }
                }
                
                const currentSku = codeDataIdx >= 0 && contextRow[codeDataIdx] !== undefined ? String(contextRow[codeDataIdx]).trim() : "";
                
                if (currentSku === targetSku) {
                    currentValue = replaceStr === '|||SPLIT|||' ? '' : replaceStr;
                    console.log(`[ETL PREVIEW] ⚡ Override por SKU aplicado [SKU:${targetSku}] -> Salida: '${currentValue}'`);
                }
            }
        }
        else if (isCustomRowOverride) {
            const payload = rule.tipo_regex.replace('CUSTOM_OVERRIDE_ROW:', '');
            const parts = payload.split('|||');
            const targetRowUid = parseInt(parts[0], 10);
            const replaceStr = parts[1] !== undefined ? parts[1] : '';
            
            // Evaluador hiper-restringido: Si la celda pertenece físicamente a la fila objetivo, aplicamos
            if (contextRow && contextRow._rowUid === targetRowUid) {
                currentValue = replaceStr === '|||SPLIT|||' ? '' : replaceStr;
                console.log(`[ETL PREVIEW] ⚡ Override Local aplicado en Fila [UID:${targetRowUid}] -> Salida: '${currentValue}'`);
            }
        }
        else if (isCustomReplace) {
            try {
                const payload = rule.tipo_regex.replace('CUSTOM_REPLACE:', '');
                const parts = payload.split('|||');
                const searchStr = parts[0] || '';
                let replaceStr = parts[1] || '';
                let matched = false;

                if (searchStr.startsWith('/') && searchStr.lastIndexOf('/') > 0) {
                    const flags = searchStr.slice(searchStr.lastIndexOf('/') + 1);
                    const pattern = searchStr.slice(1, searchStr.lastIndexOf('/'));
                    const regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
                    if (regex.test(currentValue)) {
                        matched = true;
                        currentValue = currentValue.replace(regex, replaceStr);
                    }
                } else {
                    const cv = String(currentValue).trim();
                    const sv = String(searchStr).trim();

                    // Coincidencia exacta estricta (Prioridad si el usuario busca reemplazar el valor entero de la celda)
                    if (cv === sv) {
                        matched = true;
                        currentValue = replaceStr === '|||SPLIT|||' ? '' : replaceStr;
                    }
                    // Búsqueda substring (Peligroso si es "4" y la celda es "W4 40kg", pero mantenido para compatibilidad)
                    else if (sv !== "" && cv.includes(sv)) {
                        matched = true;
                        if (replaceStr === '|||SPLIT|||') {
                            // Si es split borrar todo? Mejor un literal replace all
                            currentValue = cv.split(sv).join('');
                        } else {
                            currentValue = cv.split(sv).join(replaceStr);
                        }
                    }
                }

                if (matched) {
                    if (window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1') {
                        console.log(`[VIGIA AUDITOR ETL] MATCH REGLA LOCAL EN PIPELINE | Buscar: '${searchStr}', Reemplazar: '${replaceStr}' | Resultante: '${currentValue}'`);
                    }
                    // IMPORTANTE: Ya NO abortamos el pipeline con "break". Dejamos que siga procesando otras reglas posteriores si las hay.
                }
            } catch (e) {
                console.warn(`[ETL] Error procesando regla custom ${rule.nombre_regla}:`, e);
            }
            currentValue = currentValue.trim();
        } else {
            // Reglas Nativas
            if (rule.tipo_regex === 'SANITIZER_NUMERIC') {
                currentValue = currentValue.replace(/[^0-9.,-]/g, '');
            }
            else if (rule.tipo_regex === 'SANITIZER_NUMERIC_AND_DASH') {
                currentValue = currentValue.replace(/[^0-9\-]/g, '');
            }
            else if (rule.tipo_regex === 'SANITIZER_NUMERIC_PIPE') {
                if (/[^0-9|/]/.test(currentValue)) {
                    currentValue = "";
                    isRejected = true;
                }
            }
            else if (rule.tipo_regex === 'FILTER_EMPTY') {
                if (currentValue.trim() === "") isRejected = true;
            }
            else if (rule.tipo_regex === 'CLEAR_ZERO_VALUES') {
                const tv = currentValue.trim();
                if (tv === '0' || tv === '0,00' || tv === '0.00' || tv === '$0,00' || tv === '$ 0,00' || tv === '0,0') {
                    currentValue = "";
                }
            }
            else if (rule.tipo_regex === 'TRANSFORM_UPPERCASE') {
                currentValue = currentValue.toUpperCase();
            }
            else if (rule.tipo_regex === 'VALIDATE_NUMERIC') {
                // Rechaza completamente si hay caracteres no numéricos
                if (!/^\d+$/.test(currentValue)) {
                    currentValue = "";
                    isRejected = true;
                }
            }
            else if (rule.tipo_regex === 'VALIDATE_NUMERIC_STRICT') {
                // [NUEVA REGLA] Condicional de exclusión estricta para IDs/Códigos puros
                // Si la celda contiene cualquier carácter que no sea un dígito numérico (letras, símbolos, espacios, puntuación), se descarta.
                if (!/^\d+$/.test(currentValue)) {
                    currentValue = "";
                    isRejected = true;
                    // También aseguramos purgar el cleanValue heredado si hubo intentos de cast previos
                    cleanValue = null;
                }
            }
            else if (rule.tipo_regex === 'EXTRACT_DESCRIPTION_PACKAGE') {
                const packageRegex = /\s+(\d+\s*x\s*\d+|x\s*\d+|por\s+\d+).*$/i;
                currentValue = currentValue.replace(packageRegex, '');
            }
            else if (rule.tipo_regex === 'EXTRACT_PACKAGE_UNITS') {
                const explicitMatch = currentValue.match(/(\d+)\s*[xX]\s*\d+/);
                if (explicitMatch) {
                    currentValue = explicitMatch[1];
                } else {
                    const implicitMatch = currentValue.match(/(?:\s|^)(?:[xX]|por)\s*\d+/i);
                    if (implicitMatch) {
                        currentValue = "1";
                    } else {
                        currentValue = "1";
                    }
                }
            }
            else if (rule.tipo_regex === 'EXTRACT_UNIT_SIZE') {
                const unitMatch = currentValue.match(/(?:x|X|por)\s*(\d+(?:[.,]\d+)?)/i);
                if (unitMatch) {
                    currentValue = unitMatch[1];
                } else {
                    currentValue = "";
                }
            }
            else if (rule.tipo_regex === 'EXTRACT_WEIGHT_UNIT') {
                const weightMatch = currentValue.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k|grs?|gramos?|g)\b/i);
                if (weightMatch) {
                    let unit = weightMatch[2].toLowerCase();
                    
                    if (['gr', 'grs', 'gramo', 'gramos', 'g'].includes(unit)) {
                        currentValue = 'GRAMOS';
                    } else if (['kilo', 'kilos', 'k', 'kg'].includes(unit)) {
                        currentValue = 'KILOGRAMOS';
                    } else {
                        currentValue = "";
                    }
                } else {
                    currentValue = "";
                }
            }
            else if (rule.tipo_regex === 'FORMAT_DECIMAL_DISCOUNT') {
                if (!currentValue || currentValue === "") {
                    currentValue = "0,00";
                    cleanValue = 0.0;
                } else {
                    // Ensure float parsing before converting back to comma string
                    const normalized = currentValue.replace(/,/g, '.');
                    cleanValue = parseFloat(normalized);
                    if (isNaN(cleanValue)) cleanValue = 0.0;

                    currentValue = currentValue.replace(/\./g, ',');
                }
            }
            else if (rule.tipo_regex === 'SANITIZE_DECIMAL_FILL') {
                if (!currentValue || currentValue.trim() === "") {
                    currentValue = "0,00";
                    cleanValue = 0.0;
                } else {
                    currentValue = currentValue.replace(/\./g, ',');
                    const parseable = currentValue.replace(/,/g, '.');
                    cleanValue = parseFloat(parseable);
                    if (isNaN(cleanValue)) cleanValue = 0.0;
                }
            }
            else if (rule.tipo_regex === 'FORMAT_PRICE_AR') {
                if (currentValue && currentValue !== "") {
                    // Remove everything except digits, dots, and commas
                    let cleanStr = currentValue.replace(/[^\d.,-]/g, '');

                    if (cleanStr !== "") {
                        // Find the last dot or comma
                        const lastDot = cleanStr.lastIndexOf('.');
                        const lastComma = cleanStr.lastIndexOf(',');
                        let floatVal = 0;

                        if (lastDot === -1 && lastComma === -1) {
                            floatVal = parseFloat(cleanStr);
                        } else if (lastDot > lastComma) {
                            // Dot is the decimal separator. Remove all commas.
                            const withoutThousandSeps = cleanStr.replace(/,/g, '');
                            floatVal = parseFloat(withoutThousandSeps);
                        } else {
                            // Comma is the decimal separator. Remove all dots, replace last comma with dot.
                            const withoutThousandSeps = cleanStr.replace(/\./g, '');
                            const standardStr = withoutThousandSeps.replace(',', '.');
                            floatVal = parseFloat(standardStr);
                        }

                        if (!isNaN(floatVal)) {
                            cleanValue = floatVal; // [V5] Trap the actual math value
                            currentValue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(floatVal);
                        } else {
                            currentValue = "";
                            cleanValue = null;
                        }
                    }
                }
            }
            else {
                // Regla Regex Dinámica
                try {
                    let patternStr = rule.tipo_regex;
                    let isGlobal = true;
                    if (patternStr.startsWith('/')) {
                        const lastSlash = patternStr.lastIndexOf('/');
                        const flags = patternStr.slice(lastSlash + 1);
                        patternStr = patternStr.slice(1, lastSlash);
                        isGlobal = flags.includes('g');
                    }

                    const regex = new RegExp(patternStr, isGlobal ? 'g' : '');
                    // Por defecto removemos las coincidencias (limpieza)
                    currentValue = currentValue.replace(regex, '');
                } catch (e) {
                    console.warn(`[ETL] Regex Invalido en regla ${rule.nombre_regla}:`, e);
                }
            }
            currentValue = currentValue.trim();
        }
    } // Cierra el For del pipeline secuencial

    // Default cleanValue fallback: Try parse if not explicitly set by rules
    if (cleanValue === null && currentValue !== "" && !isNaN(currentValue.replace(/,/g, '.'))) {
        cleanValue = parseFloat(currentValue.replace(/,/g, '.'));
    }

    // [BUG-FIX: Null/Empty Persistence]
    // `wasTransformed` es un flag determinista que señala que el pipeline
    // se ejecutó activamente sobre el valor crudo, aunque el resultado sea "".
    // Cuando este flag es `true`, el string vacío es un valor de destino LEGÍTIMO
    // y el merger NO DEBE hacer fallback al valor original.
    const wasTransformed = pipeline && pipeline.length > 0 && !isRejected;

    return {
        result: currentValue,        // [Legacy compatibility] Target string representation
        display: currentValue,       // [V5] explicit display
        clean: cleanValue,           // [V5] Mathematical reality
        rejected: isRejected,
        wasTransformed: wasTransformed // [BUG-FIX] Anti-fallback deterministic signal
    };
}

// SIMULATE CHANGES IN DOM
export function previewColumn(colIndex, pipeline, skipMath = false) {
    const tableContainer = document.getElementById('excelContainer');
    if (!tableContainer) return;

    if (!skipMath) {
        // 1. Math Calculation on the REAL DATA (Ignoring virtual DOM limits)
        let countTotal = 0;
        let countRejected = 0;

        // Attempt to read from global Viewer State
        const realData = (window.viewerState && window.viewerState.data) ? window.viewerState.data : null;
        
        // [HOTFIX] Traducir Proxy vColId -> dataIdx para el arreglo 2D físico
        let dataIdx = colIndex;
        if (typeof colIndex === 'string') {
            if (window.virtualColumns && window.virtualColumns.length > 0) {
                const vCol = window.virtualColumns.find(v => v.id === colIndex);
                dataIdx = vCol ? vCol.dataIdx : parseInt(colIndex.replace('col_', ''), 10);
            } else {
                dataIdx = parseInt(colIndex.replace('col_', ''), 10);
            }
        }
        if (isNaN(dataIdx)) dataIdx = 0;

        if (realData && realData.length > 1) { // >1 to have rows beyond header
            countTotal = realData.length - 1; // exclude header
            for (let i = 1; i < realData.length; i++) {
                const rawVal = (realData[i][dataIdx] !== undefined && realData[i][dataIdx] !== null) ? String(realData[i][dataIdx]) : "";
                const { rejected } = transformCell(rawVal, pipeline, realData[i]);
                if (rejected) countRejected++;
            }
        } else {
            // Fallback for some reason, though should never hit in active table
            console.warn("[ETL PREVIEW] Warning: window.viewerState.data is missing, stats might be inaccurate.");
        }

        const countBadge = document.getElementById('vrwRuleCount');
        if (countBadge) {
            countBadge.textContent = `${pipeline.length} reglas`;
        }

        const infoPanel = document.getElementById('vrwCurrentMappingInfo');
        if (infoPanel) {
            let statsContainer = document.getElementById('vrwStatsContainer');
            const statsHtml = `
                <div id="vrwStatsContainer" class="mt-2 text-[10px] bg-slate-950 p-2 rounded border border-slate-800 flex justify-between text-slate-400 font-mono">
                    <span>Totales: <strong class="text-white">${countTotal}</strong></span>
                    <span>Válidas: <strong class="text-emerald-400">${countTotal - countRejected}</strong></span>
                    <span>Descartadas: <strong class="text-red-400">${countRejected}</strong></span>
                </div>
            `;

            if (statsContainer) {
                statsContainer.outerHTML = statsHtml;
            } else {
                infoPanel.insertAdjacentHTML('beforeend', statsHtml);
            }
        }
    }

    // 2. Trigger Native Repaint (Header + Body + Z-[60])
    if (window.renderVirtualTable && window.viewerState && window.viewerState.data) {
        window.renderVirtualTable(window.viewerState.data);
    } else {
        tableContainer.dispatchEvent(new Event('scroll'));
    }
}

// COMMIT VISUALS TO HEADER
export function commitColumnMapping(vColId, masterField, pipeline) {
    const th = document.getElementById(`th-${vColId}`);
    if (th) {
        th.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-300 cursor-pointer hover:bg-emerald-900/30 px-1 py-0.5 rounded transition-colors" onclick="if(window.viewerRuleWorkshop) window.viewerRuleWorkshop.open(null, '${vColId}', '${masterField.nombre_campo}')">
                <i data-lucide="link-2" class="w-3 h-3"></i>
                <span class="truncate" title="${masterField.nombre_campo}">${masterField.nombre_campo}</span>
                <div class="bg-emerald-800 text-emerald-200 text-[9px] px-1.5 rounded-full ml-auto">${pipeline.length}r</div>
            </div>
            ${th.querySelector('.resizer-handle') ? th.querySelector('.resizer-handle').outerHTML : ''}
        `;
        // [V4] Set correct classes
        th.className = "bg-slate-900 border-b-2 border-emerald-500/50 text-slate-300 font-bold uppercase border border-slate-800 p-2 sticky top-0 z-20 relative";
        if (window.lucide) window.lucide.createIcons();
    }
}

window.viewerETL = {
    transformCell,
    previewColumn,
    commitColumnMapping
};
