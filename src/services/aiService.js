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
        "accion": { "tipo_accion": "REPLACE" | "EXTRACT" | "LOWERCASE" | "UPPERCASE" | "TRIM" | "DROP", "target": "opcional", "replacement": "opcional", "valor": "opcional", "is_regex": "BOOLEANO_OBLIGATORIO_SI_ES_REGEX" }
     }
  ],
  "explicacion_global": "breve descripcion"
}

Si te piden 'Extraer solo el numero', retornas un "accion": "EXTRACT", "valor": "\\\\d+", "is_regex": true.
Si te piden 'Quitar todo lo que diga X', retornas un "accion": "REPLACE", "target": "X", "replacement": "", "is_regex": false.

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
            
            if (isObjectRoot && lastBrace >= firstBrace) {
                return text.substring(firstBrace, lastBrace + 1);
            } else if (firstBracket !== -1 && lastBracket >= firstBracket) {
                return text.substring(firstBracket, lastBracket + 1);
            }
            return text;
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

        const systemInstruction = `Eres un motor semántico avanzado de Estandarización de Datos (Master Data Management).
El usuario te ha dado esta orden: "${userPrompt}"

A continuación, se provee el DICCIONARIO COMPLETO de valores crudos.
Tu trabajo es aplicar AGRUPACIÓN INTELIGENTE (Clustering). Identifica entidades maestro y anida dentro los valores crudos provistos que correspondan. Usa tu conocimiento para limpiar variaciones. OBLIGATORIO acatar la estructura de JSON Object en la raíz.

Diccionario Crudo en Memoria:
${JSON.stringify(dictionarySamples)}

INSTRUCCIONES FINALES:
1. Retorna ÚNICAMENTE los grupos que sean coherentes con el filtro.
2. Descarta la basura o valores que NO representen la entidad.
3. Todo valor crudo anidado debe existir LITERALMENTE en el Diccionario.`;

        // Utilizando responseSchema estandar para forzar el Type Object strict.
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { 
                 temperature: 0.1, 
                 responseMimeType: "application/json",
                 maxOutputTokens: 8192
            } 
        });
        
        console.log(`[AI Service - Fase 2] ⏱️ Extrayendo Clusters de Semilla (${dictionarySamples.length} uniques)...`);
        const result = await model.generateContent(systemInstruction);
        const response = await result.response;
        return response.text();
    }
};

module.exports = aiService;
