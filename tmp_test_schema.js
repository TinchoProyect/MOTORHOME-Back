require('dotenv').config();
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

async function test() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const dictionarySamples = Array.from({length: 255}, (_, i) => "ANANA EN RODAJAS CUMANA \x3 KG");

    const indexedDict = {};
    dictionarySamples.forEach((val, idx) => {
        indexedDict[idx] = val;
    });

    const systemInstruction = `Eres un motor semántico avanzado de Estandarización de Datos (Master Data Management).
El usuario te ha dado esta orden: "Extraer marca comercial"

A continuación, se provee el DICCIONARIO INDEXADO de valores crudos.
Tu trabajo es aplicar AGRUPACIÓN INTELIGENTE (Clustering). Identifica entidades maestro y agrupa las cadenas correspondientes usando ÚNICAMENTE SUS ÍNDICES NUMÉRICOS, NO REPITAS LOS STRINGS CRUDOS. 

Estructura de Salida OBLIGATORIA (Debe generar el formato conforme a SchemaType):
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
3. El arreglo dentro de cada maestro debe contener SOLO números enteros (los IDs del diccionario).`;

    const schema = {
        type: SchemaType.OBJECT,
        properties: {
            cluster: {
                type: SchemaType.ARRAY,
                description: "Lista de clústers generados.",
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        maestro: {
                            type: SchemaType.STRING,
                            description: "El valor de la entidad principal unificada (ej. CUMANA, ARCOR)."
                        },
                        indices: {
                            type: SchemaType.ARRAY,
                            description: "Lista de índices numéricos de las cadenas crudas que pertenecen a este maestro.",
                            items: {
                                type: SchemaType.INTEGER
                            }
                        }
                    },
                    required: ["maestro", "indices"]
                }
            }
        },
        required: ["cluster"]
    };

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
             temperature: 0.1, 
             responseMimeType: "application/json",
             responseSchema: schema,
             maxOutputTokens: 8192
        } 
    });

    try {
        const result = await model.generateContent(systemInstruction);
        const response = await result.response;
        console.log("RESPONSE TEXT:");
        console.log(response.text());
    } catch(e) {
        console.error("FAIL:", e);
    }
}
test();
