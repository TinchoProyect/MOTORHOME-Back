const { GoogleGenerativeAI } = require("@google/generative-ai");
const xlsx = require('xlsx');
const fingerprintService = require('./fingerprintService');
const driveService = require('./driveService');
const supabase = require('../config/supabaseClient');

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos modelo Flash por velocidad/costo, Vision Pro para casos difíciles
const modelVision = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * PROMPT: Diagnóstico de Legibilidad
 */
const LEGIBILITY_PROMPT = `
Eres un Auditor de Calidad Documental. Tu única misión es evaluar si un documento es técnicamente legible para extracción de datos (OCR).
Analiza la imagen provista buscando:
1. BORROSIDAD (Blur): ¿El texto es nítido?
2. ILUMINACIÓN: ¿Hay sombras fuertes o reflejos?
3. RESOLUCIÓN: ¿Se pueden distinguir letras pequeñas?
Responde ESTRICTAMENTE en este formato JSON:
{
  "status": "ACCEPT" | "REJECT",
  "reason": "Explica brevemente si rechazas. Si aceptas, pon null."
}`;

/**
 * PROMPT: Modo Arqueólogo (Descubrimiento)
 */
const DISCOVERY_PROMPT = `
Eres un Arquitecto de Datos experto. Analiza la estructura visual de este documento.
Identifica TODAS las columnas visibles en la tabla principal (no omitas ninguna).
Extrae una MUESTRA REAL de las primeras 3-5 filas de datos.

Salida JSON esperada:
{
  "headers_detected": ["Lista COMPLETA de encabezados tal cual se ven"],
  "data_sample": [
    {"col1": "valor real fila 1", "col2": "valor real fila 1", ...},
    {"col1": "valor real fila 2", "col2": "valor real fila 2", ...}
  ],
  "suggested_mapping": {
    "sku": "Nombre columna para SKU/Código (null si no existe)",
    "descripcion": "Nombre columna para Descripción/Producto",
    "precio": "Nombre columna para Precio/Unitario (null si no existe)"
  },
  "confidence_notes": "Observaciones sobre la detección (ej: 'Moneda parece ser USD')"
}
`;

/**
 * Convierte ArrayBuffer a Buffer de Node
 */
function toBuffer(arrayBuffer) {
    return Buffer.from(arrayBuffer);
}

async function checkLegibility(imageBuffer, mimeType = "image/jpeg") {
    try {
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: mimeType
            },
        };

        const result = await modelVision.generateContent([LEGIBILITY_PROMPT, imagePart]);
        const responseText = result.response.text();

        // Limpieza básica de JSON
        const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonStr);

        if (analysis.status === 'REJECT') {
            return { valid: false, reason: analysis.reason };
        }
        return { valid: true };

    } catch (error) {
        console.error("[ExtractionService] Error en Check Legibility:", error);
        return { valid: false, reason: "AI_SERVICE_ERROR: " + error.message };
    }
}

/**
 * MODO ARQUEÓLOGO: Descubre estructura en archivo desconocido
 */
async function discoverStructure(imageBuffer, mimeType = "image/jpeg") {
    console.log("[Extraction] Iniciando Modo Arqueólogo...");
    try {
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: mimeType
            },
        };

        const result = await modelVision.generateContent([DISCOVERY_PROMPT, imagePart]);
        const responseText = result.response.text();
        const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("[Extraction] Error en Discovery:", error);
        throw new Error("Discovery Failed: " + error.message);
    }
}

/**
 * Orquestador Principal
 */
async function processFile(fileId, providerId, options = {}) {
    const { headerIndex = 0 } = options;
    console.log(`[Extraction] Procesando archivo ${fileId} para proveedor ${providerId} (Header Row: ${headerIndex})...`);

    try {
        const metadata = await driveService.getFileMetadata(fileId);
        const mimeType = metadata.mimeType;
        console.log(`[Extraction] Metadatos: ${metadata.name} (${mimeType})`);

        const arrayBuffer = await driveService.getFileContent(fileId);
        const fileBuffer = toBuffer(arrayBuffer);

        let isDigital = mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv');

        if (!isDigital) {
            const legibility = await checkLegibility(fileBuffer, mimeType);
            if (!legibility.valid) {
                return { success: false, error: "ILEGIBLE", reason: legibility.reason };
            }
        }

        if (isDigital) {
            console.log("[Extraction] Parsing Real Excel/CSV...");
            const workbook = xlsx.read(fileBuffer, { type: 'buffer', codepage: 65001 }); // Force UTF-8 if possible
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Leemos como Array de Arrays para detectar headers
            let rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

            if (!rawRows || rawRows.length === 0) {
                return { success: false, error: "Archivo vacío o ilegible" };
            }

            // --- LOGICA DE OFFSET (EXCAVACION) ---
            // Si headerIndex es > 0, descartamos filas iniciales
            if (headerIndex > 0 && rawRows.length > headerIndex) {
                rawRows = rawRows.slice(headerIndex);
            }

            // Headers = Nueva Fila 0 (Preservamos vacíos y agregamos extras)
            let emptyColCounter = 1;
            const headers = rawRows[0].map((h) => {
                const val = String(h || "").trim();
                return val.length > 0 ? val : `Column ${emptyColCounter++}`;
            });

            // Agregamos 3 columnas extra al final para permitir mapeo extendido
            for (let i = 0; i < 3; i++) {
                headers.push(`Column ${emptyColCounter++}`);
            }

            // Sample = Filas 1-5 (Relativas al nuevo header)
            const sampleData = rawRows.slice(1, 6).map(rowArray => {
                let obj = {};
                headers.forEach((header, index) => {
                    // Mapeamos por índice
                    // IMPORTANTE: rowArray es un array posicional, header[index] corresponde a rowArray[index]
                    obj[header] = rowArray[index] || "";
                });
                return obj;
            });

            console.log(`[Extraction] Parsed ${headers.length} columns. Sample Rows: ${sampleData.length}`);

            return {
                success: true,
                mode: 'DISCOVERY',
                data: {
                    headers_detected: headers,
                    data_sample: sampleData,
                    suggested_mapping: {},
                    confidence_notes: `Extracción directa (Offset: ${headerIndex})`
                },
                suggested_hash: fingerprintService.generateHeaderHash(headers)
            };
        }

        const discoveryData = await discoverStructure(fileBuffer, mimeType);

        const headers = discoveryData.headers_detected;
        const headerHash = fingerprintService.generateHeaderHash(headers);
        const existingTemplate = await fingerprintService.matchFingerprint(headerHash, providerId);

        if (existingTemplate) {
            return { success: true, mode: 'MAPPED', data: discoveryData };
        } else {
            return { success: true, mode: 'DISCOVERY', data: discoveryData, suggested_hash: headerHash };
        }

    } catch (err) {
        console.error("[Extraction] Fatal Error:", err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    checkLegibility,
    processFile
};
