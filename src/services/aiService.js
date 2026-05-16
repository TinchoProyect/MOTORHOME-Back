const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

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
        let chunkMappings = [];
        for (let i = 0; i < dictionarySamples.length; i++) {
            let chunkIdx = Math.floor(i / CHUNK_SIZE);
            if (!chunks[chunkIdx]) {
                 chunks[chunkIdx] = {};
                 chunkMappings[chunkIdx] = {};
            }
            let localIdx = Object.keys(chunks[chunkIdx]).length;
            chunks[chunkIdx][localIdx] = dictionarySamples[i];
            chunkMappings[chunkIdx][localIdx] = i;
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
                        const path = require('path');
                        const dumpPath = path.join(__dirname, '../../data/logs_ai_dump.txt');
                        fs.appendFileSync(dumpPath, `\n\n=== DIAGNOSTICO LIMIT ROOTO [CHUNK ${chunkIndex + 1}] ====
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
                              let globalIndices = [];
                              for (let localIdx of parsed[pseudoKey]) {
                                   if (chunkMappings[chunkIndex][localIdx] !== undefined) {
                                       globalIndices.push(chunkMappings[chunkIndex][localIdx]);
                                   }
                              }
                              parsedArray.push({ maestro: pseudoKey, indices: globalIndices });
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
        let chunkMappings = [];
        for (let i = 0; i < dictionarySamples.length; i++) {
            let chunkIdx = Math.floor(i / CHUNK_SIZE);
            if (!chunks[chunkIdx]) {
                 chunks[chunkIdx] = {};
                 chunkMappings[chunkIdx] = {};
            }
            let localIdx = Object.keys(chunks[chunkIdx]).length;
            chunks[chunkIdx][localIdx] = dictionarySamples[i];
            chunkMappings[chunkIdx][localIdx] = i;
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
                        const localNumKey = parseInt(key);
                        if (!isNaN(localNumKey) && chunkMappings[index][localNumKey] !== undefined) {
                            const globalNumKey = chunkMappings[index][localNumKey];
                            if (dictionarySamples[globalNumKey] !== undefined) {
                                finalMap[dictionarySamples[globalNumKey]] = String(parsedObj[key]);
                            }
                        }
                    }
                    success = true;
                } catch(e) {
                    retries++;
                    console.warn(`[AI Service] ADVERTENCIA: Falló parseo o Rate Limit en chunk literal ${index + 1}. Intento: ${retries}/${maxRetries}. Razón:`, e.message);
                    if (retries > maxRetries) {
                        console.error(`[AI Service] ERROR CRÍTICO: Fallo permanente en el Chunk ${index + 1}. Se saltará para no abortar el lote masivo.`);
                        // Fallback de contingencia: si el chunk falla, devolver el string crudo intacto
                        for (let localK in chunkDict) {
                            const localNumK = parseInt(localK);
                            if (!isNaN(localNumK) && chunkMappings[index][localNumK] !== undefined) {
                                const globalNumK = chunkMappings[index][localNumK];
                                if (dictionarySamples[globalNumK] !== undefined) {
                                    finalMap[dictionarySamples[globalNumK]] = String(dictionarySamples[globalNumK]);
                                }
                            }
                        }
                        break; // Salir del while y continuar con el siguiente chunk
                    }
                    await new Promise(resolve => setTimeout(resolve, 3000 * retries));
                }
            }
        }
        
        return {
            translationMap: finalMap,
            dictionaryRef: dictionarySamples
        };
    },

    executeCategorization: async (dictionarySamples, contextRubros) => {
        if (!genAI) throw new Error("Gemini API no inicializada");
        
        console.log(`[AI Service - Fase Caza-Rubros] ⏱️ Categorizando (Total: ${dictionarySamples.length} uniques) contra ${contextRubros.length} rubros base...`);
        
        let CHUNK_SIZE = 25; 
        let chunks = [];
        let chunkMappings = [];
        for (let i = 0; i < dictionarySamples.length; i++) {
            let chunkIdx = Math.floor(i / CHUNK_SIZE);
            if (!chunks[chunkIdx]) {
                 chunks[chunkIdx] = {};
                 chunkMappings[chunkIdx] = {};
            }
            let localIdx = Object.keys(chunks[chunkIdx]).length;
            chunks[chunkIdx][localIdx] = dictionarySamples[i];
            chunkMappings[chunkIdx][localIdx] = i;
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 8192 } 
        });

        let finalMap = {};
        
        // Estructurar el contexto de rubros para el prompt
        const rubrosString = contextRubros.map(r => `[${r.nombre_rubro}]: ${r.descripcion_narrativa}`).join('\n');

        for (let index = 0; index < chunks.length; index++) {
            const chunkDict = chunks[index];
            const systemInstruction = `Eres un categorizador determinista de datos maestros.
Se te proporciona una lista finita y estricta de rubros con sus descripciones ("EL CUADERNO MAESTRO").

[CUADERNO MAESTRO DE RUBROS ACTIVOS]
${rubrosString}

DIRECTIVAS ABSOLUTAS:
1. Debes leer cada ítem del diccionario y asignarlo ÚNICAMENTE a un rubro del Cuaderno Maestro, basándote en la narrativa descriptiva.
2. LIMITACIONES: NO TIENES AUTORIZACIÓN PARA INVENTAR UN RUBRO NUEVO NI DEFORMAR SU ESCRITURA. Usa exactamente el "[Nombre_Rubro]" especificado.
3. EXCEPCIÓN DE INCERTIDUMBRE CRÍTICA: Si el artículo es indescifrable, incomprensible, o carece de contexto suficiente para determinar un rubro lógico, DEBES clasificarlo bajo la etiqueta exacta "[Desconocido / Requiere Revisión Humana]". ¡No alucines rubros forzados!
4. EXCEPCIÓN DE NUEVO RUBRO VÁLIDO: Si y sólo si entiendes perfectamente qué es el artículo pero no encaja lógicamente en NINGUNO de los rubros existentes, devolverás EXACTAMENTE: "[NUEVO_RUBRO_PROPUESTO]: (Tu sugerencia corta de 1 a 3 palabras)".
5. ARGUMENTACIÓN: Por cada ítem, debes proporcionar una breve justificación (1-2 líneas) de por qué elegiste ese rubro.

DICCIONARIO A EVALUAR (Chunk ${index + 1}/${chunks.length}):
${JSON.stringify(chunkDict, null, 2)}

Estructura de Salida OBLIGATORIA (Un objeto JSON estructurado cuyas llaves sean exactamente los índices numéricos pasados, y el valor un sub-objeto con "rubro" y "argumentacion_ia"):
{
  "0": { "rubro": "CONDIMENTOS", "argumentacion_ia": "El artículo es orégano, listado explícitamente en el cuaderno maestro bajo Condimentos." },
  "1": { "rubro": "[NUEVO_RUBRO_PROPUESTO]: Limpieza", "argumentacion_ia": "Es un desinfectante de pisos, no existe rubro idóneo en el cuaderno actual." },
  "2": { "rubro": "[Desconocido / Requiere Revisión Humana]", "argumentacion_ia": "El artículo 'XYZ-90' no aporta información léxica suficiente para deducir su naturaleza." }
}
Tu objeto DEBE contener TODOS los índices numéricos pasados en el DICCIONARIO A EVALUAR como llaves. Ninguna puede faltar.`;

            let success = false;
            let retries = 0;
            const maxRetries = 2;

            while (!success && retries <= maxRetries) {
                try {
                    const result = await model.generateContent(systemInstruction);
                    let text = result.response.text();
                    let extractedText = module.exports.extractJSONFromInference(text);
                    
                    let parsedObj = JSON.parse(extractedText);
                    for (let key in parsedObj) {
                        const localNumKey = parseInt(key);
                        if (!isNaN(localNumKey) && chunkMappings[index][localNumKey] !== undefined) {
                            const globalNumKey = chunkMappings[index][localNumKey];
                            if (dictionarySamples[globalNumKey] !== undefined) {
                                let obj = parsedObj[key];
                                if (typeof obj === 'string') {
                                    finalMap[dictionarySamples[globalNumKey]] = obj;
                                } else if (obj && obj.rubro) {
                                    let valString = obj.rubro;
                                    if (obj.argumentacion_ia) {
                                        valString += `|ARGUMENTO|${obj.argumentacion_ia}`;
                                    } else if (obj.narrativa) {
                                        valString += `|ARGUMENTO|${obj.narrativa}`;
                                    } else {
                                        valString += `|ARGUMENTO|No se especificó argumentación para este cruce.`;
                                    }
                                    finalMap[dictionarySamples[globalNumKey]] = valString;
                                }
                            }
                        }
                    }
                    success = true;
                } catch(e) {
                    retries++;
                    console.warn(`[AI Service] Rate Limit en Caza-Rubros chunk ${index + 1}. Intento: ${retries}/${maxRetries}.`);
                    if (retries > maxRetries) throw new Error(`Fallo en categorizar el Chunk ${index + 1}. Abortando para mantener consistencia.`);
                    await new Promise(resolve => setTimeout(resolve, 3000 * retries));
                }
            }
        }
        
        return {
            translationMap: finalMap,
            dictionaryRef: dictionarySamples
        };
    },

    executeInvoiceExtraction: async (base64Data, mimeType, mapaExtraccion = null, cuitProveedor = null) => {
        if (!genAI) throw new Error("Gemini API no inicializada");

        console.log(`[AI Service - Facturas] ⏱️ Ejecutando Motor Chofer en documento...`);

        // Validamos si es base64Data directo o un dataUrl
        if (base64Data.startsWith('data:')) {
            base64Data = base64Data.split(',')[1];
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 8192 } 
        });

        let systemInstruction = `Eres un auditor fiscal de altísima precisión ("Chofer") especializado en facturación electrónica de Argentina (AFIP).
Se te provee un comprobante fiscal. Tu tarea es extraer la metadata y totales, y devolver estrictamente un objeto JSON plano.

${mapaExtraccion ? `[INSTRUCCIONES DE EXTRACCIÓN ESPECÍFICAS PARA ESTE PROVEEDOR (¡PRIORIDAD MÁXIMA!)]\n${mapaExtraccion}\n` : ''}
${cuitProveedor ? `[ANCLA DE IDENTIDAD] El CUIT del proveedor (Emisor de la factura) que estamos procesando es: ${cuitProveedor}. Asegúrate de extraer este CUIT como "cuit_emisor" si está en el documento, evitando confundirlo con el CUIT del receptor.\n` : ''}
REGLAS DE EXTRACCIÓN:
1. "cuit_emisor": El CUIT del emisor (solo números o formato XX-XXXXXXXX-X).
2. "tipo_comprobante": Factura A, Factura B, Factura C, Nota de Crédito A, etc.
3. "punto_venta": Solo el número entero (ej: 3).
4. "numero_comprobante": Solo el número entero (ej: 14502).
5. "fecha_emision": En formato YYYY-MM-DD.
6. "cae": El código de autorización electrónico.
7. "fecha_vto_cae": Fecha de vencimiento del CAE (YYYY-MM-DD).

REGLAS PARA GRILLA DE ARTÍCULOS (NUEVO REQUISITO OBLIGATORIO):
Identifica la tabla o matriz donde se listan los artículos/productos facturados.
Extrae una lista de objetos JSON bajo la clave "articulos", cada uno con:
- "codigo": Código interno del producto (si no tiene, devuelve string vacío "").
- "descripcion": El nombre o descripción literal del artículo.
- "cantidad": Valor numérico flotante. Si no hay, asume 1.
- "factor_conversion": Equivalencia de kilos/unidades por bulto deducido de la descripción (Ej. "x5", "25 kg" => 5, 25). Si no existe discrepancia matemática o mención explícita, el valor por defecto debe ser 1.
- "precio_unitario": El importe unitario (precio por kilo o por bulto) como número flotante.
- "subtotal": El importe total de esa línea (debe cerrar lógicamente como cantidad * factor_conversion * precio_unitario), como flotante.

REGLAS NUMÉRICAS PARA TOTALES (OBLIGATORIO):
Extrae los importes numéricos. Si no existen, devuelve 0. Deben ser floats válidos.
- "importe_neto_gravado": El importe neto o subtotal sin impuestos.
- "importe_iva_21": El monto correspondiente al IVA 21%.
- "importe_iva_105": El monto correspondiente al IVA 10.5%.
- "importe_iva_27": El monto correspondiente al IVA 27%.
- "percepciones_iibb": Sumatoria de percepciones de Ingresos Brutos.
- "percepciones_iva": Sumatoria de percepciones de IVA.
- "conceptos_no_gravados": Importe no gravado o exento.
- "descuento_global_aplicado": El valor monetario de cualquier descuento global impreso en la factura. Si no hay, 0.0.
- "bonificacion_porcentaje": Si la factura presenta un descuento expresado en porcentaje (ej: 18.10%), extrae el número float (18.10). Si no hay, 0.0.
- "importe_total": El total exacto facturado.

ESTRUCTURA JSON REQUERIDA:
{
  "cuit_emisor": "...",
  "tipo_comprobante": "...",
  "punto_venta": 0,
  "numero_comprobante": 0,
  "fecha_emision": "YYYY-MM-DD",
  "cae": "...",
  "fecha_vto_cae": "YYYY-MM-DD",
  "importe_neto_gravado": 0.0,
  "importe_iva_21": 0.0,
  "importe_iva_105": 0.0,
  "importe_iva_27": 0.0,
  "percepciones_iibb": 0.0,
  "percepciones_iva": 0.0,
  "conceptos_no_gravados": 0.0,
  "descuento_global_aplicado": 0.0,
  "bonificacion_porcentaje": 0.0,
  "importe_total": 0.0,
  "articulos": [
    {
      "codigo": "...",
      "descripcion": "...",
      "cantidad": 0.0,
      "factor_conversion": 1.0,
      "precio_unitario": 0.0,
      "subtotal": 0.0
    }
  ]
}`;

        const prompt = [
            systemInstruction,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "application/pdf"
                }
            }
        ];

        try {
            const startTime = performance.now();
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`[AI Service - Facturas] ⏱️ Extracción Completada en ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
            
            const extractedText = module.exports.extractJSONFromInference(text);
            return JSON.parse(extractedText);
        } catch (e) {
            console.error("[AI Service - Facturas] ❌ Error en Inferencia:", e);
            throw new Error("Fallo en la inferencia del Chofer IA: " + e.message);
        }
    },

    executePriceListOCRIndex: async (base64Data, mimeType) => {
        if (!genAI) throw new Error("Gemini API no inicializada");

        console.log(`[AI Service - OCR] ⏱️ Ejecutando Fase 1: Extracción de Índice (Sectores)...`);

        if (base64Data.startsWith('data:')) {
            base64Data = base64Data.split(',')[1];
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } 
        });

        let systemInstruction = `Eres un extractor de estructura de documentos ("Chofer OCR Indexador").
Se te provee una imagen de una lista de precios. Tu ÚNICA tarea es identificar los bloques, categorías o secciones principales de la lista (por ejemplo: "PASAS", "NUECES", "ALMENDRAS", etc.) y estimar la cantidad de renglones que tiene cada sección.

DIRECTIVAS ANTI-PEREZA (INNEGOCIABLES):
1. Tienes ESTRICTAMENTE PROHIBIDO detenerte o abortar la lectura de forma prematura. Debes escanear visualmente TODA la imagen o documento, desde el margen superior hasta el margen inferior final.
2. Debes extraer ABSOLUTAMENTE TODOS los bloques/secciones presentes. Si hay 20 sectores, debes listar los 20. La omisión por pereza o truncamiento será severamente penalizada.
3. NO EXTRAIGAS LOS PRODUCTOS INDIVIDUALES. Solo extrae los títulos de categoría/sección.

ESTRUCTURA JSON REQUERIDA (DEVUELVE ESTRICTAMENTE UN BLOQUE DE CÓDIGO MARKDOWN CON EL JSON, SIN EXPLICACIONES ADICIONALES):
\`\`\`json
{
  "secciones": [
    {
      "nombre": "PASAS",
      "filas_estimadas": 15
    },
    {
      "nombre": "NUECES CHANDLER",
      "filas_estimadas": 8
    }
  ]
}
\`\`\``;

        const prompt = [
            systemInstruction,
            { inlineData: { data: base64Data, mimeType: mimeType || "image/jpeg" } }
        ];

        try {
            const startTime = performance.now();
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`[AI Service - OCR Index] ⏱️ Completado en ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
            console.log(`[AI Service - OCR Index] Texto Crudo:\n`, text);
            
            let extractedText = module.exports.extractJSONFromInference(text);
            if (!extractedText) extractedText = text.trim(); // Fallback si no hay markdown block
            
            try {
                return JSON.parse(extractedText);
            } catch (err) {
                console.warn("[AI Service - OCR Index] Error de parseo inicial, intentando reparar JSON truncado...");
                let repaired = extractedText.replace(/```json/i, '').replace(/```/i, '').trim();
                
                try { return JSON.parse(repaired + "]}"); } catch(e1) {}
                try { return JSON.parse(repaired + "}]}"); } catch(e2) {}
                
                throw new Error("El modelo retornó un JSON truncado irreparable: " + err.message);
            }
        } catch (e) {
            console.error("[AI Service - OCR Index] ❌ Error en Inferencia:", e);
            throw new Error("Fallo en la inferencia OCR Index: " + e.message);
        }
    },

    executePriceListOCRSection: async (base64Data, mimeType, targetSection, customSchema = null, filasEstimadas = 0) => {
        if (!genAI) throw new Error("Gemini API no inicializada");

        console.log(`[AI Service - OCR] ⏱️ Ejecutando Fase 2: Extracción de Sección [${targetSection}]...`);

        if (base64Data.startsWith('data:')) {
            base64Data = base64Data.split(',')[1];
        }

        // Configuración de Mapeo Dinámico e Inyección de Esquema (Schema-Injection)
        let productSchemaProperties = {};
        let priceMappingInstructions = `   - "precio_kilo": El precio unitario por cada kilo o unidad mínima (Float limpio, sin símbolos).\n   - "precio_unitario": El precio final total de la presentación o bulto cerrado (Float limpio, sin símbolos).\n   IMPORTANTE: Si la lista muestra dos columnas de precios, deduce lógicamente cuál es el precio por kilo y cuál es el precio final del bulto. Si solo hay un precio, asígnalo a precio_unitario y deja precio_kilo nulo.`;

        if (customSchema && customSchema.columns && Array.isArray(customSchema.columns)) {
            const aiColumns = customSchema.columns.filter(c => !c.is_calculated);
            priceMappingInstructions = aiColumns.map(c => `   - "${c.field}": (Float limpio, sin símbolos).`).join('\n');
            aiColumns.forEach(c => {
                productSchemaProperties[c.field] = { type: SchemaType.NUMBER, nullable: true, description: `(Float limpio, sin símbolos) ${c.field}` };
            });
        } else {
            productSchemaProperties['precio_kilo'] = { type: SchemaType.NUMBER, nullable: true, description: "Precio por kilo" };
            productSchemaProperties['precio_unitario'] = { type: SchemaType.NUMBER, nullable: true, description: "Precio final" };
        }

        const responseSchema = {
            type: SchemaType.OBJECT,
            properties: {
                productos: {
                    type: SchemaType.ARRAY,
                    description: "Lista de productos extraídos",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            sector: { type: SchemaType.STRING, description: `Debe ser SIEMPRE "${targetSection}"` },
                            codigo: { type: SchemaType.STRING, nullable: true, description: "Código interno o SKU" },
                            descripcion: { type: SchemaType.STRING, description: "Nombre o descripción del artículo" },
                            presentacion: { type: SchemaType.STRING, nullable: true, description: "Detalle de peso, empaque o caja" },
                            ...productSchemaProperties
                        },
                        required: ["sector", "descripcion"]
                    }
                }
            },
            required: ["productos"]
        };

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-pro", 
            generationConfig: { 
                temperature: 0.1, 
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            } 
        });

        let systemInstruction = `Eres un extractor de datos de altísima precisión ("Chofer OCR Quirúrgico").
Se te provee una imagen de una lista de precios de un proveedor.
Tu tarea es ubicar visualmente el bloque correspondiente a la sección o categoría "${targetSection}" y tabular ÚNICAMENTE los productos que pertenecen a esa sección.

REGLAS ESTRICTAS DE EXTRACCIÓN (INNEGOCIABLES):
1. ENFOQUE QUIRÚRGICO: Ignora todos los productos de otras secciones. Concéntrate exclusivamente en extraer TODOS los renglones debajo del título "${targetSection}" hasta llegar al siguiente título de sección.
2. LÍMITE DE CORTE ESTRICTO (¡MUY IMPORTANTE!): Detén la extracción inmediatamente apenas encuentres el próximo título de sección, categoría o un bloque visualmente distinto. NO invadas ni transcribas renglones que pertenezcan a los sectores que siguen a "${targetSection}". Tienes terminantemente prohibido arrastrar productos de otras categorías.
3. DIRECTIVA ANTI-PEREZA (INNEGOCIABLE): Tienes ESTRICTAMENTE PROHIBIDO truncar o abortar la transcripción de forma prematura MIENTRAS estés dentro de la sección "${targetSection}". Debes recorrer visualmente el bloque renglón por renglón hasta el final del mismo.
4. EXTRACCIÓN TOTAL (ANTI-OMISIÓN): Extrae TODOS los renglones del bloque, tengan o no tengan precio. No omitas ningún artículo.
5. DETERMINISMO NUMÉRICO (ANTI-ALUCINACIÓN): Si un artículo NO posee un precio explícito impreso en la imagen, TIENES ESTRICTAMENTE PROHIBIDO inventarlo, inferirlo o deducirlo. Debes devolver OBLIGATORIAMENTE el valor null en los campos de precio. ¡Nunca inventes un dato numérico!
6. FIDELIDAD NUMÉRICA (FORMATO ARGENTINO): Los precios pueden tener formato argentino (ej. "37.500,00" o "37.500").
   - Si ves "37.500", significa treinta y siete mil quinientos. DEBES transformarlo al flotante: 37500.0.
   - NO asumas que el punto es decimal si lógicamente es un separador de miles.
7. MAPEADO DE COLUMNAS: Ajusta las columnas visuales a las siguientes claves:
   - "sector": Debes forzar que el valor de esta clave sea SIEMPRE "${targetSection}" para todos los productos de esta extracción.
   - "codigo": Código interno o SKU (si no hay, string vacío "").
   - "descripcion": El nombre o descripción del artículo.
   - "presentacion": Todo detalle de peso, empaque o caja (ej: "10 KG"). Búscalo en columnas anexas como 'PESO'.
8. CONCIENCIA DE FIN DE LIENZO (ANTI-AGOTAMIENTO): Mantén el rigor de evaluación sin importar la ubicación del bloque en la imagen. Si el bloque está al final del documento, NO relajes las reglas. Extrae estrictamente la realidad visual y aplica null si no hay precio.
${priceMappingInstructions}`;

        if (customSchema && customSchema.prompt) {
            systemInstruction += `\n\nDIRECTIVAS EXCLUSIVAS DEL PROVEEDOR (PRIORIDAD MÁXIMA):\n${customSchema.prompt}\n`;
        }

        const maxFilas = parseInt(filasEstimadas, 10);
        if (!isNaN(maxFilas) && maxFilas > 0) {
            systemInstruction += `\n\n8. BARRERA DE CONTENCIÓN VINCULANTE (INNEGOCIABLE): El Selector de Bloques ha determinado que la sección "${targetSection}" posee un TOPE MÁXIMO de ${maxFilas} renglones. Extrae hasta ${maxFilas} productos y luego detente. Tienes ESTRICTAMENTE PROHIBIDO devolver más de ${maxFilas} productos.\n`;
        }

        const prompt = [
            systemInstruction,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "image/jpeg"
                }
            }
        ];

        try {
            const startTime = performance.now();
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`[AI Service - OCR] ⏱️ Extracción Completada en ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
            
            const extractedText = module.exports.extractJSONFromInference(text);
            try {
                return JSON.parse(extractedText);
            } catch (err) {
                console.warn("[AI Service - OCR] Error de parseo inicial, intentando reparar JSON truncado...");
                let repaired = extractedText.trim();
                
                // Remover coma suelta al final si existe
                repaired = repaired.replace(/,\s*$/, '');
                
                try { return JSON.parse(repaired + "]}"); } catch(e1) {}
                try { return JSON.parse(repaired + "}]}"); } catch(e2) {}
                try { return JSON.parse(repaired + '\"}]}'); } catch(e3) {}
                
                // Si fallaron los cierres simples, descartamos el último objeto incompleto
                const lastValidBrace = repaired.lastIndexOf('}');
                if (lastValidBrace !== -1) {
                    repaired = repaired.substring(0, lastValidBrace + 1);
                    try { return JSON.parse(repaired + "]}"); } catch(e4) {}
                }
                
                console.error("[AI Service - OCR] JSON Crudo Irrecuperable:\n", extractedText);
                throw new Error("El modelo retornó un JSON truncado que no pudo ser reparado automáticamente.");
            }
        } catch (e) {
            console.error("[AI Service - OCR] ❌ Error en Inferencia:", e);
            throw new Error("Fallo en la inferencia OCR: " + e.message);
        }
    }
};

module.exports = aiService;
