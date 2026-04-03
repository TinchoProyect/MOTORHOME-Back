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
        "accion": { "tipo_accion": "REPLACE" | "EXTRACT" | "LOWERCASE" | "UPPERCASE" | "TRIM" | "DROP", "target": "opcional", "replacement": "opcional", "valor": "opcional" }
     }
  ],
  "explicacion_global": "breve descripcion"
}

Si te piden 'Extraer solo el numero', retornas un "accion": "EXTRACT", "valor": "\\\\d+".
Si te piden 'Quitar todo lo que diga X', retornas un "accion": "REPLACE", "target": "X", "replacement": "".

PROHIBIDO generar expresiones regulares masivas o complejas. Si necesitas eliminar múltiples palabras distintas, debes generar MÚLTIPLES reglas individuales dentro del array 'reglas', utilizando exclusivamente acciones de tipo REPLACE exacto o DROP.

Si te ves forzado a usar Regex en alguna regla menor, es OBLIGATORIO utilizar el doble escape estricto para JSON (ejemplo: \\\\s, \\\\d). Un solo escape inválido corromperá el sistema.
` : "Actúas como un asistente de transformación de datos ETL. Responde solo con Expresiones Regulares o strings de formato.";

        const fullPrompt = `${systemInstruction}

TAREA DEL USUARIO: ${userPrompt}

MUESTRAS DE LA COLUMNA A PROCESAR:
${samples.map((s, i) => `[${i}]: "${s}"`).join('\n')}

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

    /**
     * Limpia la respuesta del modelo, extirpando backticks de markdown (```json ... ```)
     */
    extractJSONFromInference: (rawText) => {
        if (!rawText) return "";
        try {
            // Busca la primera llave de apertura y la última de cierre
            const firstBrace = rawText.indexOf('{');
            const lastBrace = rawText.lastIndexOf('}');
            
            // Si encuentra un objeto JSON válido delimitado
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                return rawText.substring(firstBrace, lastBrace + 1);
            }
            
            // Si por alguna razón devolvió un array plano
            const firstBracket = rawText.indexOf('[');
            const lastBracket = rawText.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
                return rawText.substring(firstBracket, lastBracket + 1);
            }
            
            return rawText.trim();
        } catch (err) {
            console.error("String parser fail:", err);
            return rawText.trim();
        }
    }
};

module.exports = aiService;
