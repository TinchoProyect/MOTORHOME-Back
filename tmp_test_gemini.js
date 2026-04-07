require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function test() {
    // Note: the original code uses @google/generative-ai, wait let me check package.json to be sure.
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const dictionarySamples = [
        "ANANA EN RODAJAS CUMANA 6x3 KG",
        "ANANA EN TROZOS CUMANA 6x3 KG",
        "ANANA CUMANA 24 x 565g RODAJAS",
        "ANANA TROZOS CUMANA 12x800 G"
    ];

    const systemInstruction = `Eres un motor semántico avanzado de Estandarización de Datos (Master Data Management).
El usuario te ha dado esta orden: "Extraer marca comercial"

A continuación, se provee el DICCIONARIO COMPLETO de valores crudos.
Tu trabajo es aplicar AGRUPACIÓN INTELIGENTE (Clustering). Identifica entidades maestro y anida dentro los valores crudos provistos que correspondan. Usa tu conocimiento para limpiar variaciones. OBLIGATORIO acatar la estructura de JSON Object en la raíz.

Estructura de Salida OBLIGATORIA (Debe existir la clave "cluster"):
{
  "cluster": {
    "Valor Maestro 1": ["valor original A", "valor original B"],
    "Valor Maestro 2": ["valor original C"]
  }
}

Diccionario Crudo en Memoria:
${JSON.stringify(dictionarySamples)}

INSTRUCCIONES FINALES:
1. Retorna ÚNICAMENTE los grupos que sean coherentes con el filtro.
2. Descarta la basura o valores que NO representen la entidad.
3. Todo valor crudo anidado debe existir LITERALMENTE en el Diccionario.`;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
             temperature: 0.1, 
             responseMimeType: "application/json",
             maxOutputTokens: 8192
        } 
    });
    
    try {
        const result = await model.generateContent(systemInstruction);
        const response = await result.response;
        console.log("RESPONSE TEXT:");
        console.log(response.text());
    } catch(e) {
        console.error("ERROR", e);
    }
}
test();
