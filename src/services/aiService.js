const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Google Generative AI con el modelo preferido
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const modelName = 'gemini-2.5-flash';

let isLLMHealthy = null;
let lastHealthCheck = 0;

const aiService = {
    /**
     * Revisa integridad del nodo LLM (Local/Cloud).
     */
    checkIntegrity: async () => {
        // Ejecuta ping real solo 1 vez cada hora si fue exitoso y evita ban HTTP 429
        const now = Date.now();
        
        // Si usamos Gemini via API
        if (genAI) {
            // Caché exitoso por 1 hora
            if (isLLMHealthy === true && (now - lastHealthCheck < 3600000)) return true;
            // Caché de penalización por 60 segs (permite que expire el ban 429 de Google sin resetearlo con el UI Polling)
            if (isLLMHealthy === false && (now - lastHealthCheck < 60000)) return false;
            
            try {
                // Ping ultra rápido (Metadata Endpoint) para validación real evitando quemar Inferencia
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
                if (!res.ok) {
                    const errObj = await res.json();
                    throw new Error(JSON.stringify(errObj));
                }
                
                isLLMHealthy = true;
                lastHealthCheck = now;
                return true;
            } catch (err) {
                console.error("[AI Service] ❌ Gemini Error (Check) ROOT OBJECT:");
                console.error(err);
                isLLMHealthy = false;
                // Dejar que vuelva a intentar el ping rapido si fallo antes
                return false;
            }
        }
        
        // Fallback a LLM puramente local (Ej. Ollama)
        try {
            const res = await fetch('http://localhost:11434/api/tags');
            return res.ok;
        } catch(err) {
            console.error("[AI Service] ❌ Ollama Local Error:", err.message);
            return false;
        }
    },

    /**
     * Construye un prompt complejo y ejecuta la prediccion AST
     */
    executeInference: async (userPrompt, samples, requireAst) => {
        const systemInstruction = requireAst ? `
Actúas como un 'Chofer ETL' incrustado en un pipeline de datos determinista. 
OBLIGATORIA: Debes devolver puramente una estructura JSON válida que defina el parseo AST (Abstract Syntax Tree) solicitado.
NO PUEDES RESPONDER CON TEXTO PLANO NI EXPLICACIONES FUERA DEL JSON. El JSON debe poseer la siguiente firma:
{
  "reglas": [
     {
        "nombre_regla": "Paso 1",
        "condicion": { "operador": "CONTAINS" | "REGEX_MATCH" | "EQUALS" | "IS_NUMERIC" | "IS_EMPTY" | "DEFAULT", "valor": "param" },
        "accion": { "tipo_accion": "REPLACE" | "EXTRACT" | "LOWERCASE" | "UPPERCASE" | "TRIM" | "DROP" | "SET_VALUE", "target": "opcional", "replacement": "opcional", "valor": "opcional", "is_regex": "BOOLEANO_OBLIGATORIO_SI_ES_REGEX" }
     }
  ],
  "explicacion_global": "breve descripcion"
}

Si te piden 'Extraer solo el numero', retornas un "accion": "EXTRACT", "valor": "\\\\d+", "is_regex": true.
Si te piden 'Quitar todo lo que diga X', retornas un "accion": "REPLACE", "target": "X", "replacement": "", "is_regex": false.
Si te piden 'Acelerar vacíos, poner 0,00', retornas "condicion": { "operador": "IS_EMPTY" }, "accion": { "tipo_accion": "SET_VALUE", "valor": "0,00" }.

¡ATENCIÓN! Si "target" o "valor" utilizan una Expresión Regular para buscar patrones, es ESTRICTAMENTE OBLIGATORIO que declares "is_regex": true dentro del objeto "accion". De lo contrario, el motor AST del frontend interpretará tu regex como un string literal y el sistema fallará.

PROHIBIDO generar expresiones regulares masivas o complejas. Si necesitas eliminar múltiples palabras distintas, debes generar MÚLTIPLES reglas individuales dentro del array 'reglas', utilizando exclusivamente acciones de tipo REPLACE exacto o DROP.

Si te ves forzado a usar Regex en alguna regla menor, es OBLIGATORIO utilizar el doble escape estricto para JSON (ejemplo: \\\\s, \\\\d). Un solo escape inválido corromperá el sistema.
` : "Actúas como un asistente de transformación de datos ETL. Responde solo con Expresiones Regulares o strings de formato.";

    const contextBlock = samples.length > 0 && typeof samples[0] === 'object' && samples[0] !== null 
        ? samples.slice(0, 7).map(s => JSON.stringify(s.contexto_fila || {})).join('\n') 
        : "No hay contexto horizontal disponible.";

    const pureSamples = samples.map((s, i) => {
        if (typeof s === 'object' && s !== null) {
            return `[${i}]: "${s.valor_objetivo}"`;
        }
        return `[${i}]: "${s}"`;
    }).join('\n');

    const fullPrompt = `${systemInstruction}

CONTEXTO GENERAL DE LAS FILAS (Variables relacionales de la tabla para entender semánticamente de qué hablan los datos):
${contextBlock}

TAREA DEL USUARIO: ${userPrompt}

VALORES EXTREMOS A TRANSFORMAR (Tu Regex / REPLACE debe encajar exacta y estrictamente sobre estos strings, asume que no puedes tocar otros campos):
${pureSamples}

Genera ÚNICAMENTE el código JSON AST solicitado para limpiar/extraer estos valores acorde al pedido.
`;

        console.log("==========================================");
        console.log("[AI Service - STEP 2] 🚀 Construyendo Payload (Backend -> LLM)");
        console.log("PAYLOAD COMPLETO:\n", fullPrompt);
        console.log("==========================================\n");

        if (genAI) {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0.1, responseMimeType: "application/json" } });
            
            console.log(`[AI Service - STEP 3] ⏱️ Temporizador INICIADO. Llamando a Google API...`);
            const startTime = Date.now();
            try {
                const result = await model.generateContent(fullPrompt);
                const response = await result.response;
                const endTime = Date.now();
                console.log(`[AI Service - STEP 3] ⏱️ Temporizador DETENIDO: ${endTime - startTime}ms`);
                
                const rawResponse = response.text();
                console.log("\n==========================================");
                console.log("[AI Service - STEP 4] 📦 Respuesta Cruda de Gemini:");
                console.log(rawResponse);
                console.log("==========================================\n");
                
                return rawResponse;
            } catch (err) {
                const endTime = Date.now();
                console.error(`[AI Service - STEP 3] ❌ Falla Crítica de Red hacia API de Google (Tardó ${endTime - startTime}ms):`);
                console.error(err);
                throw err;
            }
        } else {
            // Fallback a Ollama localhost
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama3',
                    prompt: fullPrompt,
                    stream: false,
                    options: { temperature: 0.1 }
                })
            });
            if (!res.ok) throw new Error("Local LLM request failed");
            const data = await res.json();
            return data.response;
        }
    },

    extractJSONFromInference: (text) => {
        const regex = /```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/i;
        const match = text.match(regex);
        if (match) {
            return match[1].trim(); 
        }
        
        // Backup robusto contra JSON puros (generados via responseMimeType que no usan markdown)
        text = text.trim();
        if (text.startsWith('{') && text.endsWith('}')) return text;
        if (text.startsWith('[') && text.endsWith(']')) return text;

        try {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            const firstBracket = text.indexOf('[');
            const lastBracket = text.lastIndexOf(']');
            
            // Evaluar cual contenedor asume la jerarquía principal
            const isObjectRoot = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
            
            let extracted = text;
            if (isObjectRoot && lastBrace >= firstBrace) {
                extracted = text.substring(firstBrace, lastBrace + 1);
            } else if (firstBracket !== -1 && lastBracket >= firstBracket) {
                extracted = text.substring(firstBracket, lastBracket + 1);
            } else if (isObjectRoot) {
                // Autorecuperación Severa: Falta cierre de objeto o vector por corte de API
                // Se quedó sin tokens o la API cortó en el aire
                extracted = text.substring(firstBrace);
                if (extracted.includes('"cluster":')) {
                    if (extracted.lastIndexOf(']') < extracted.lastIndexOf('[')) extracted += ']';
                    extracted += '}]}';
                }
            }
            
            // Limpieza de trailing commas (muy común devueltas por LLM)
            extracted = extracted.replace(/,\s*([}\]])/g, '$1');
            
            return extracted;
        } catch (err) {
            return text;
        }
    },

    /**
     * [FASE 3] Bucle de Auditoría
     * Envía las muestras que la regla devuelta falló en transformar.
     */
    executeRefinement: async (userPrompt, originalRule, residualSamples) => {
        if (!genAI) throw new Error("Google AI (Gemini) API Key no está configurada o es inválida.");

        const systemInstruction = `Eres un auditor experto de Pipelines ETL.
El usuario pidió esta regla: "${userPrompt}"
La IA generó el siguiente nodo (Regex/Acción):
${JSON.stringify(originalRule)}

Sin embargo, las siguientes cadenas DEBERÍAN haber mutado pero escaparon de tu filtro estricto (Residuos no matcheados):
${residualSamples.map((r,i) => `Residuo ${i+1}: "${r}"`).join('\n')}

Genera ESTRICTAMENTE el código JSON de UNA RULE (SIN ARRAY, SOLO UN OBJETO JSON) que ataque EXCLUSIVAMENTE a estos residuos ignorados usando EXTRACT o REPLACE. 
Formato requerido: 
{
    "nombre_regla": "Parche para residuos",
    "accion": "REPLACE | EXTRACT | DROP_ROW | TRIM",
    "valor": "Regex o String a limpiar"
}
Usa escape doble para JSON si emites Regex.`;

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.1, responseMimeType: "application/json" } });
        
        console.log(`[AI Service - Fase 3] ⏱️ Refinando Regla Delta...`);
        const result = await model.generateContent(systemInstruction);
        const response = await result.response;
        return response.text();
    },

    /**
     * [FASE 2] Descubrimiento de Entidades (Lista Blanca Profiling)
     * Envía un diccionario completo y pide a la IA extraer los válidos según el prompt.
     */
    executeEntityDiscovery: async (userPrompt, dictionarySamples) => {
        if (!genAI) throw new Error("Google AI (Gemini) API Key no está configurada o es inválida.");

        console.log(`[AI Service - Fase 2] ⏱️ Extrayendo Clusters Distribuidos (Total: ${dictionarySamples.length} uniques)...`);
        
        let CHUNK_SIZE = 20; // Reducido a 20 para evitar Truncation de JSON (JSON Unexpected end) en resoluciones voluminosas
        let chunks = [];
        for (let i = 0; i < dictionarySamples.length; i++) {
            let chunkIdx = Math.floor(i / CHUNK_SIZE);
            if (!chunks[chunkIdx]) chunks[chunkIdx] = {};
            chunks[chunkIdx][i] = dictionarySamples[i];
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 8192 } 
        });

        let mergedCluster = [];
        let discoveredMasters = new Set();

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunkDict = chunks[chunkIndex];
            const previousMastersList = Array.from(discoveredMasters).join('", "');

            const systemInstruction = `Eres un procesador analítico y extractor de texto implacable.
TU DIRECTIVA MAESTRA Y ABSOLUTA ES: "${userPrompt}"

DICCIONARIO INDEXADO PARCIAL (Chunk ${chunkIndex + 1}/${chunks.length}):
${JSON.stringify(chunkDict, null, 2)}

Aplica AGRUPACIÓN INTELIGENTE (Clustering) basándote EXCLUSIVA Y ESTRICTAMENTE en la orden del usuario.
Si el usuario pide extraer un número o aplicar matemática, el nombre de la llave DEBE SER EL RESULTADO NUMÉRICO.
ESTRICTAMENTE PROHIBIDO: NO agrupes por semántica A MENOS que la directiva lo pida. El valor maestro es simplemente el resultado crudo y literal.

${discoveredMasters.size > 0 ? `REGLA DE CONTEXTO ESTRICTA: En iteraciones anteriores ya has agrupado bajo estos valores: ["${previousMastersList}"]. DEBES REUTILIZAR exactamente la misma cadena si el resultado lógico es idéntico.` : ''}

Estructura de Salida OBLIGATORIA (UN OBJETO JSON PLANO SUPER MINIMALISTA):
{
  "Resultado Estricto (Ej: 6, ARCOR, Cja)": [0, 10],
  "Otro Resultado Distinto": [3, 4]
}
Tu objeto DEBE contener TODOS los índices numéricos de este diccionario parcial sin excepción. CERO VERBOSIDAD. NO añadas palabras como "cluster" o "indices".`;

            let success = false;
            let retries = 0;
            const maxRetries = 2;
            let text = '';

            while (!success && retries <= maxRetries) {
                try {
                    const startTime = performance.now();
                    const result = await model.generateContent(systemInstruction);
                    const runTime = performance.now() - startTime;
                    
                    const candidate = result.response.candidates && result.response.candidates[0];
                    const finishReason = candidate ? candidate.finishReason : 'UNKNOWN';

                    text = result.response.text();
                    let extractedText = module.exports.extractJSONFromInference(text);
                    
                    let parsed;
                    try {
                        parsed = JSON.parse(extractedText);
                    } catch (parseError) {
                        const fs = require('fs');
                        fs.appendFileSync('./logs_ai_dump.txt', `\n\n=== DIAGNOSTICO LIMIT ROOTO [CHUNK ${chunkIndex + 1}] ====
- TIEMPO DE RESPUESTA: ${runTime.toFixed(2)} ms
- FINISH_REASON DE GOOGLE: ${finishReason}
- RAW STRING (Extraido):
${extractedText}
- RAW STRING (Respuesta Completa Gemini):
${text}
- CRITERIO DEL CHUNK ${chunkIndex + 1} (Registro Crudo):
${JSON.stringify(chunkDict, null, 2)}
========================================================\n\n`);
                        throw new Error(`Excepción en JSON.parse. Revisa logs_ai_dump.txt. TRACE: Time=${runTime.toFixed(2)}ms, Reason=${finishReason}`);
                    }

                    // Adaptador: Convertir Schema Minimalista a Legacy Schema Interno
                    let parsedArray = [];
                    for (let pseudoKey in parsed) {
                         if (Array.isArray(parsed[pseudoKey])) {
                              parsedArray.push({ maestro: pseudoKey, indices: parsed[pseudoKey] });
                         }
                    }

                    if (parsedArray.length > 0) {
                        
                        // [AUDITORÍA DE INTEGRIDAD DE LLAVES]
                        // Verifica si el LLM ignoró crudos debido a LLM Laziness o Truncation Silente
                        let indicesRecuperados = 0;
                        for (let c of parsedArray) {
                             if (c.indices && Array.isArray(c.indices)) {
                                 indicesRecuperados += c.indices.length;
                             }
                        }
                        
                        const expectedIndices = Object.keys(chunkDict).length;
                        if (indicesRecuperados < expectedIndices) {
                             throw new Error(`LLM Laziness Drop: Empaquetó solo ${indicesRecuperados} de ${expectedIndices} crudos. Dictamen Inválido.`);
                        }

                        mergedCluster = mergedCluster.concat(parsedArray);
                        // Alimentar Memoria Global
                        for (let c of parsedArray) {
                            if (c.maestro) discoveredMasters.add(c.maestro);
                        }
                    } else {
                        throw new Error(`JSON Schema Inválido. Array dict de keys no encontrado.`);
                    }
                    success = true;
                } catch(e) {
                    retries++;
                    console.warn(`[AI Service] ADVERTENCIA: Falló parseo o Rate Limit en chunk ${chunkIndex + 1} del Hit-In-The-Loop. Intento: ${retries}/${maxRetries}. Razón:`, e.message);
                    
                    try {
                        const fs = require('fs');
                        fs.appendFileSync('./logs_ai_dump.txt', `\n--- INTENTO ${retries} CHUNK ${chunkIndex + 1} ---\nMSG: ${e.message}\nTEXT: ${text || 'NO_TEXT'}\n`);
                    } catch (fsErr) {}

                    if (retries > maxRetries) {
                        throw new Error(`El modelo falló consistentemente en el Chunk ${chunkIndex + 1} omitiendo agrupar un lote crítico de datos. Por seguridad, la operación se abortó para prevenir fugas de diccionario. Intenta nuevamente agrupando menos crudos o refina la directiva. (${e.message})`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 3000 * retries)); // Backoff delay (3s, 6s)
                }
            }
        }

        return {
            isPreParsed: true,
            cluster: mergedCluster,
            dictionaryRef: dictionarySamples
        };
    },

    executeLiteralTranslation: async (userPrompt, dictionarySamples) => {
        if (!genAI) throw new Error("Gemini API no inicializada");
        
        console.log(`[AI Service - Fase 2] ⏱️ Extrayendo Traducciones Literales (Total: ${dictionarySamples.length} uniques)...`);
        
        let CHUNK_SIZE = 20; // Reducido a 20 para prevenir Truncation de JSON en operaciones complejas
        let chunks = [];
        for (let i = 0; i < dictionarySamples.length; i++) {
            let chunkIdx = Math.floor(i / CHUNK_SIZE);
            if (!chunks[chunkIdx]) chunks[chunkIdx] = {};
            chunks[chunkIdx][i] = dictionarySamples[i];
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 8192 } 
        });

        let finalMap = {};

        // Inferencia Iterativa Estricta (Secuencial). Previene que el Rate Limiter de Gemini dropee chunks
        // masivos, garantizando 100% de cobertura del diccionario al iterar 1-por-1 y concatenar.
        for (let index = 0; index < chunks.length; index++) {
            const chunkDict = chunks[index];
            const systemInstruction = `Eres un procesador analítico y extractor de texto implacable operando en MODO DE TRADUCCIÓN LITERAL 1 A 1.
TU DIRECTIVA MAESTRA Y ABSOLUTA ES: "${userPrompt}"

DICCIONARIO INDEXADO PARCIAL (Chunk ${index + 1}/${chunks.length}):
${JSON.stringify(chunkDict, null, 2)}

Aplica TRADUCCIÓN O EXTRACCIÓN estricta registro por registro. NO AGRUPES. NO INVENTES CLÚSTERES.
Por cada índice en el diccionario parcial, debes generar una llave numérica y asignarle como valor EXACTAMENTE el string limpio, cortado o resultante de aplicar la orden del usuario.

Estructura de Salida OBLIGATORIA (Un objeto JSON plano de tipo Key-Value):
{
  "0": "String Limpio 1",
  "1": "String Limpio 2"
}
Tu objeto DEBE contener TODOS los índices numéricos de este diccionario parcial como llaves. Ninguna llave originaria puede faltar. NO INCLUYAS arrays, sólo devuelve el objeto llave-valor.`;

            let success = false;
            let retries = 0;
            const maxRetries = 2;

            while (!success && retries <= maxRetries) {
                try {
                    const result = await model.generateContent(systemInstruction);
                    let text = result.response.text();
                    let extractedText = module.exports.extractJSONFromInference(text);
                    
                    let parsedObj = JSON.parse(extractedText);
                    
                    // Mapear inmediatamente este chunk al mapa general de retornos
                    for (let key in parsedObj) {
                        const numKey = parseInt(key);
                        if (!isNaN(numKey) && dictionarySamples[numKey] !== undefined) {
                            finalMap[dictionarySamples[numKey]] = String(parsedObj[key]);
                        }
                    }
                    success = true;
                } catch(e) {
                    retries++;
                    console.warn(`[AI Service] ADVERTENCIA: Falló parseo o Rate Limit en chunk literal ${index + 1}. Intento: ${retries}/${maxRetries}. Razón:`, e.message);
                    if (retries > maxRetries) {
                        throw new Error(`Fallo Crítico al intentar limpiar el Chunk ${index + 1}. La generación fue abortada para prevenir un diccionario truncado.`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 3000 * retries));
                }
            }
        }
        


        return {
            translationMap: finalMap,
            dictionaryRef: dictionarySamples
        };
    }
};

module.exports = aiService;
