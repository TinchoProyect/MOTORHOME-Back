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

            // --- LOGICA DE FINGERPRINT (RESCUE MISSION) ---
            // MOVED UP: Calculate hash on REAL headers only (before adding extras)
            const headerHash = fingerprintService.generateHeaderHash(headers);
            let existingTemplate = await fingerprintService.matchFingerprint(headerHash, providerId);

            // [REMOVED] Padding Loop 3 columns - CAUSING HASH INSTABILITY

            // BABOSSI FORCE (ID Welding)
            if (!existingTemplate && providerId === '8929039a-407e-40dd-a399-98d17f647dc4') {
                console.warn("[Extraction] 🔨 BABOSSI DETECTED - FORCING SEARCH FOR LAST ACTIVE TEMPLATE");
                const { data: forced } = await supabase
                    .from('proveedor_formatos_guia')
                    .select('*')
                    .eq('proveedor_id', providerId)
                    .eq('estado', 'ACTIVA')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (forced) {
                    console.log(`[Extraction] 🔨 FORCE MATCH SUCCESS! Using Template: ${forced.id}`);
                    existingTemplate = forced;
                }
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

            // ... (rest of function uses headerHash and existingTemplate)

            // --- DECISION FINAL DE MODO (Fixed Logic) ---
            if (existingTemplate) {
                console.log(`[Extraction] MATCH FOUND (Strict or Forced)! Using Template: ${existingTemplate.id}`);

                // Update debug object to reflect the forced/found template logic
                debugObj.guardado_db = existingTemplate.fingerprint.header_hash;

                return {
                    success: true,
                    mode: 'MAPPED',
                    template_id: existingTemplate.id,
                    data: {
                        headers_detected: headers,
                        data_sample: sampleData,
                        suggested_mapping: existingTemplate.reglas_mapeo,
                        confidence_notes: `Formato reconocido automáticamente: ${existingTemplate.nombre_formato} ${existingTemplate.id === 'FORCED' ? '(Forzado)' : ''}`
                    },
                    suggested_hash: headerHash,
                    debug_fingerprint: debugObj
                };
            }

            // --- Cierre de Red de Seguridad (Solo si no hubo match) ---
            console.log("[Extraction] No match found. Searching candidates for user suggestion...");
            const { data: others } = await supabase
                .from('proveedor_formatos_guia')
                .select('id, nombre_formato, fingerprint, reglas_mapeo')
                .eq('proveedor_id', providerId)
                .eq('estado', 'ACTIVA')
                .limit(5);

            if (others && others.length > 0) {
                console.log(`[Extraction] Found ${others.length} candidates.`);
                candidates = others;
                if (others.length === 1) safetyNetMapping = others[0];
            }

            // Return DISCOVERY
            return {
                success: true,
                mode: 'DISCOVERY',
                data: {
                    headers_detected: headers,
                    data_sample: sampleData,
                    suggested_mapping: {},
                    confidence_notes: `Extracción directa (Offset: ${headerIndex})`
                },
                suggested_hash: headerHash,
                debug_fingerprint: debugObj,
                safety_net: safetyNetMapping, // Single best guess
                candidates: candidates        // List for UI
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
