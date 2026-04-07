const aiService = require('./src/services/aiService');

const text1 = `{
  "cluster": {
    "CUMANA": [
      "ANANA EN RODAJAS CUMANA 6x3 KG",
      "ANANA EN TROZOS CUMANA 6x3 KG",
      "ANANA CUMANA 24 x 565g RODAJAS",
      "ANANA TROZOS CUMANA 12x800 G"
    ]
  }
}`;

const res = aiService.extractJSONFromInference(text1);
console.log("EXTRACTED:")
console.log(res);

let parsed;
try {
    parsed = JSON.parse(res);
    console.log("Parsed OK!");
} catch (e) {
    console.log("Parse Failed:", e);
}
