require('dotenv').config();
const ai = require('./src/services/aiService');
const testArray = [];
for(let i = 0; i < 60; i++) testArray.push('ANANA CUMANA ' + i + ' x 565g RODAJAS');
const prompt = 'Decimales: Si el número requiere decimales, unifícalo usando obligatoriamente la COMA (ej: "2,5"). Extraer el bulto';
ai.executeEntityDiscovery(prompt, testArray).then(res => console.log("SUCCESS:", res)).catch(err => console.error("ERROR FINAL:", err));
