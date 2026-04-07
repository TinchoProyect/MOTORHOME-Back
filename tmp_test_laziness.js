require('dotenv').config({ path: 'C:\\Users\\Martin\\Documents\\sistema-gestion-proveedores-2\\.env' });
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testOutputLaziness() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Generar 255 items de prueba identicos para forzar al LLM a devolver 255 indices
    const dictionarySamples = Array.from({length: 255}, (_, i) => "ANANA EN RODAJAS CUMANA " + i + "x3 KG");

    const indexedDict = {};
    dictionarySamples.forEach((val, idx) => {
        indexedDict[idx] = val;
    });

    const systemInstruction = `Eres un motor semántico avanzado de Estandarización de Datos (Master Data Management).
El usuario te ha dado esta orden: "Extraer marca comercial"

A continuación, se provee el DICCIONARIO INDEXADO de valores crudos.
Tu trabajo es aplicar AGRUPACIÓN INTELIGENTE (Clustering). Identifica entidades maestro y agrupa las cadenas correspondientes usando ÚNICAMENTE SUS ÍNDICES NUMÉRICOS, NO REPITAS LOS STRINGS CRUDOS. 

Estructura de Salida OBLIGATORIA:
{
  "cluster": [
    { "maestro": "Valor Maestro 1", "indices": [0, 10, 15] },
    { "maestro": "Valor Maestro 2", "indices": [2, 5] }
  ]
}

Diccionario Crudo en Memoria:
${JSON.stringify(indexedDict, null, 2)}

INSTRUCCIONES FINALES:
1. Retorna ÚNICAMENTE los grupos que sean coherentes con el filtro.
2. Descarta la basura o valores que NO representen la entidad principal.
3. El arreglo dentro de cada maestro debe contener SOLO números enteros (los IDs del diccionario).
EXTREMADAMENTE IMPORTANTE: Es vital que devuelvas TODOS los elementos pertinentes. Si hay 200 elementos de CUMANA, DEBES devolver una lista con 200 índices numéricos. NO OMITAS NINGUNO.`;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
             temperature: 0.1, 
             responseMimeType: "application/json",
             maxOutputTokens: 8192
        } 
    });

    try {
        console.log("Generando...");
        const result = await model.generateContent(systemInstruction);
        const text = result.response.text();
        console.log("LONGITUD DEL TEXTO DEVUELTO:", text.length);
        
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        
        const isObjectRoot = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
        
        let extracted = text;
        if (isObjectRoot && lastBrace >= firstBrace) {
            extracted = text.substring(firstBrace, lastBrace + 1);
        } else if (firstBracket !== -1 && lastBracket >= firstBracket) {
            extracted = text.substring(firstBracket, lastBracket + 1);
        } else if (isObjectRoot) {
            extracted = text.substring(firstBrace);
            if (extracted.includes('"cluster":')) {
                if (extracted.lastIndexOf(']') < extracted.lastIndexOf('[')) extracted += ']';
                extracted += '}]}';
            }
        }
        
        extracted = extracted.replace(/,\s*([}\]])/g, '$1');
        
        const parsed = JSON.parse(extracted);
        if (parsed.cluster && parsed.cluster[0]) {
            console.log("CANTIDAD DE INDICES DEVUELTOS PARA CUMANA:", parsed.cluster[0].indices.length);
        }
        
    } catch(e) {
        console.error("FAIL:", e);
    }
}
testOutputLaziness();
