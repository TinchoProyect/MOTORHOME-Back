/**
 * Viewer ETL AST Parser
 * El Intérprete estático e inmutable de reglas condicionales de la IA (Cero rce/eval)
 */

class ViewerEtlAstParser {
    constructor() {
        this.regexCache = new Map();
    }

    /**
     * Busca o compila una regex desde caché local
     */
    _getCompiledRegex(strPattern, flags = 'i') {
        const key = `${strPattern}_${flags}`;
        if (!this.regexCache.has(key)) {
            try {
                this.regexCache.set(key, new RegExp(strPattern, flags));
            } catch (err) {
                console.error("AST Regex Compilación Fallida:", strPattern);
                return null;
            }
        }
        return this.regexCache.get(key);
    }

    /**
     * Aplica el AST sobre un string (celda individual)
     * Forma del JSON rule.logica [ { condicion: {}, accion: {} }, ... ]
     */
    executeAST(val, astObj) {
        if (!astObj || !Array.isArray(astObj.logica)) return { result: val, handled: false };
        let strVal = String(val);

        const logVigia = typeof window !== 'undefined' && window._vigiaETLLogged && window._vigiaETLLogged <= 20;

        for (const branch of astObj.logica) {
            if (!branch.condicion || !branch.accion) continue;

            const isMatch = this._evaluateCondition(strVal, branch.condicion);
            
            if (logVigia) {
                console.log(`[VIGÍA AST] 🔎 Evaluando Condición ${branch.condicion.operador} contra "${strVal}". Match?:`, isMatch);
            }

            if (isMatch) {
                // Return immediate applying this action
                const actRes = this._applyAction(strVal, branch.accion, branch.condicion);
                if (logVigia) {
                    console.log(`[VIGÍA AST] 🚀 Aplicando Acción ${branch.accion.tipo_accion} -> Result:`, actRes);
                }
                return actRes;
            }
        }
        
        if (logVigia) {
            console.log(`[VIGÍA AST] ⚠️ Ninguna rama logica hizo Match. Devolviendo string original.`);
        }
        return { result: strVal, handled: false };
    }

    _evaluateCondition(val, cond) {
        if (!cond || !cond.operador) return false;
        
        switch (cond.operador) {
            case "DEFAULT":
            case "ALL":
                return true;
                
            case "CONTAINS":
                return val.includes(String(cond.valor || ""));
                
            case "REGEX_MATCH":
            case "MATCH":
                const reMatch = this._getCompiledRegex(cond.valor || "");
                if (!reMatch) return false;
                return reMatch.test(val);
                
            case "EQUALS":
            case "EXACT":
                return val.trim() === String(cond.valor || "").trim();
                
            case "IN_LIST":
                if (Array.isArray(cond.valor)) {
                    return cond.valor.includes(val.trim());
                }
                return false;
                
            case "IN_DICT_KEYS":
                if (cond.valor && typeof cond.valor === 'object') {
                    const localKeyLower = String(val).trim().toLowerCase();
                    return Object.keys(cond.valor).some(k => String(k).trim().toLowerCase() === localKeyLower);
                }
                return false;
                
            case "IS_NUMERIC":
                return !isNaN(parseFloat(val)) && isFinite(val);
                
            case "IS_EMPTY":
                return val.trim() === "";

            default:
                return false;
        }
    }

    _applyAction(val, action, condicion = null) {
        if (!action || !action.tipo_accion) return { result: val, handled: true, rejected: false };
        
        switch (action.tipo_accion) {
            case "RETURN_NULL":
            case "DROP":
                return { result: "", handled: true, rejected: true };
                
            case "PASS":
            case "BLANK":
                return { result: "", handled: true, rejected: false }; // FIX: Prevents passthrough data leaks in unmapped rules
                
            case "SET_VALUE":
                return { result: action.valor !== undefined ? String(action.valor) : "", handled: true, rejected: false };
                
            case "REPLACE":
                if (!action.target) return { result: val, handled: true, rejected: false };
                if (action.is_regex) {
                    const reRep = this._getCompiledRegex(action.target, "g");
                    if (!reRep) return { result: val, handled: true };
                    return { result: val.replace(reRep, action.replacement || ""), handled: true, rejected: false };
                } else {
                    return { result: val.split(action.target).join(action.replacement || ""), handled: true, rejected: false };
                }
                
            case "EXTRACT":
                if (!action.valor) return { result: val, handled: true };
                const reExt = this._getCompiledRegex(action.valor);
                if (!reExt) return { result: val, handled: true };
                const m = val.match(reExt);
                return { result: m && m[0] ? m[0] : "", handled: true, rejected: !m };
                
            case "DICTIONARY_REPLACE": {
                // [HERD IMMUNITY QA] Resiliencia contra purgas DOM. Si accion.valor no existe, usamos condicion.valor.
                const dictObj = (action.valor && typeof action.valor === 'object') ? action.valor : (condicion && condicion.valor && typeof condicion.valor === 'object' ? condicion.valor : null);
                if (!dictObj) return { result: "", handled: true, rejected: false };
                
                const keyToCheck = val.trim();
                const keyLower = keyToCheck.toLowerCase();
                const dictKeys = Object.keys(dictObj);
                
                let matchedVal = null;
                for (let i = 0; i < dictKeys.length; i++) {
                    if (String(dictKeys[i]).trim().toLowerCase() === keyLower) {
                        matchedVal = dictObj[dictKeys[i]];
                        break;
                    }
                }
                
                const matched = (matchedVal !== null);
                
                const logVigInt = typeof window !== 'undefined' && window._vigiaETLLogged && window._vigiaETLLogged <= 20;
                if (logVigInt) {
                    console.log(`[VIGÍA AST INT] DICTIONARY_REPLACE key: "${keyToCheck}". En Diccionario?: ${matched}`);
                    if (!matched) console.log(`[VIGÍA AST INT] Diccionario Real:`, dictObj);
                }

                if (matched) {
                    return { result: matchedVal, handled: true, rejected: false };
                }
                
                // [FIX ESTRUCTURAL] Si no hace match, DEBE retornar handled: false
                // Para que evalúe la condición DEFAULT (que asigna "" = valor huérfano explícito)
                return { result: val, handled: false, rejected: false };
            }
                
            case "LOWERCASE":
                return { result: val.toLowerCase(), handled: true, rejected: false };
                
            case "UPPERCASE":
                return { result: val.toUpperCase(), handled: true, rejected: false };
                
            case "TRIM":
                return { result: val.trim(), handled: true, rejected: false };

            default:
                return { result: val, handled: true, rejected: false };
        }
    }
}

export default new ViewerEtlAstParser();
