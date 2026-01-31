const { GoogleGenerativeAI } = require("@google/generative-ai");
const xlsx = require('xlsx');
const fingerprintService = require('./fingerprintService');
const driveService = require('./driveService');
const supabase = require('../config/supabaseClient');

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos modelo Flash por velocidad/costo
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
  "suggested_mapping": {},
  "confidence_notes": "Observaciones sobre la detección"
}
`;

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
 * Orquestador Principal - CORREGIDO
 */
async function processFile(fileId, providerId, options = {}) {
    // [MODIFICACIÓN SOLICITADA] Forzar inicio en fila 1 (index 1) para ignorar Títulos en fila 0.
    // Aunque el frontend pida 0, obligamos a 1.
    let { headerIndex = 1 } = options;
    if (headerIndex < 1) headerIndex = 1;

    console.log(`[Extraction] Procesando archivo ${fileId} para proveedor ${providerId} (Fila Header Forzada: ${headerIndex})...`);

    try {
        const metadata = await driveService.getFileMetadata(fileId);
        const mimeType = metadata.mimeType;

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
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // [FIX] DETECTOR DE "TODO EN COLUMNA A" (Separador incorrecto)
            // Si detectamos que las filas tienen longitud 1 y contienen ; o , asumimos CSV mal parseado.
            if (rawRows.length > 0 && Array.isArray(rawRows[0]) && rawRows[0].length === 1) {
                const sample = String(rawRows[0][0]);
                if (sample.includes(';') || sample.includes(',')) {
                    const separator = sample.includes(';') ? ';' : ',';
                    console.log(`[Extraction] Detectado CSV comprimido en Col A. Re-separando con '${separator}'...`);
                    rawRows = rawRows.map(row => {
                        if (Array.isArray(row) && row.length === 1) {
                            return String(row[0]).split(separator).map(s => s.trim());
                        }
                        return row;
                    });
                }
            }

            // [SMART HEADER HUNTER]
            // Buscamos la primera fila que parezca un encabezado real (>= 2 columnas con texto).
            // Esto "amputa" títulos, subtítulos, fechas y basura superior automáticamente.
            let validHeaderIndex = -1;

            // Si el usuario forzó un índice alto (ej: 5), respetamos su decisión manual sobre la automática.
            // Pero si es el default (0 o 1), usamos la inteligencia.
            if (headerIndex <= 1) {
                validHeaderIndex = rawRows.findIndex(row => {
                    if (!Array.isArray(row)) return false;
                    // Contamos celdas no vacías
                    const filledCols = row.filter(c => String(c).trim().length > 0).length;
                    return filledCols >= 2; // Asumimos que una tabla útil tiene al menos 2 columnas
                });
            }

            if (validHeaderIndex > -1) {
                console.log(`[Extraction] Header Inteligente encontrado en Fila ${validHeaderIndex}. Amputando ${validHeaderIndex} filas superiores.`);
                headerIndex = validHeaderIndex;
            } else {
                // Fallback: Si no encontramos nada decente, aplicamos la regla "Amputar Fila 0" estricta
                if (headerIndex < 1) headerIndex = 1;
                console.log(`[Extraction] No se detectó estructura tabular clara. Aplicando Amputación Default (Index ${headerIndex}).`);
            }

            // Aplicar Corte
            if (rawRows.length > headerIndex) {
                rawRows = rawRows.slice(headerIndex);
            } else {
                return { success: false, error: "Archivo demasiado corto (contenido eliminado por filtros)." };
            }

            let emptyColCounter = 1;
            const headers = rawRows[0].map((h) => {
                const val = String(h || "").trim();
                return val.length > 0 ? val : `Column ${emptyColCounter++}`;
            });

            const headerHash = fingerprintService.generateHeaderHash(headers);
            let existingTemplate = await fingerprintService.matchFingerprint(headerHash, providerId);

            // BABOSSI FORCE MATCH
            if (!existingTemplate && providerId === '8929039a-407e-40dd-a399-98d17f647dc4') {
                const { data: forced } = await supabase
                    .from('proveedor_formatos_guia')
                    .select('*')
                    .eq('proveedor_id', providerId)
                    .eq('estado', 'ACTIVA')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (forced) existingTemplate = forced;
            }

            const sampleData = rawRows.slice(1, 6).map(rowArray => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = rowArray[index] || "";
                });
                return obj;
            });

            // ARREGLO: Declaramos la variable debugInfo para evitar el crash
            const debugInfo = {
                calculado_ahora: headerHash,
                guardado_db: existingTemplate ? (existingTemplate.fingerprint ? existingTemplate.fingerprint.header_hash : 'N/A') : 'NONE'
            };

            // FULL DATA EXTRACTION (Warehouse Stock)
            const fullData = rawRows.slice(1).map(rowArray => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = rowArray[index] || "";
                });
                return obj;
            });

            if (existingTemplate) {
                return {
                    success: true,
                    mode: 'MAPPED',
                    template_id: existingTemplate.id,
                    data: {
                        headers_detected: headers,
                        data_sample: sampleData,
                        full_data: fullData, // [CRITICAL FIX] Send everything
                        suggested_mapping: existingTemplate.reglas_mapeo,
                        confidence_notes: `Formato reconocido: ${existingTemplate.nombre_formato}`
                    },
                    suggested_hash: headerHash,
                    debug_fingerprint: debugInfo
                };
            }

            // MODO DISCOVERY: Red de seguridad
            let candidates = [];
            let safetyNetMapping = null;

            const { data: others } = await supabase
                .from('proveedor_formatos_guia')
                .select('id, nombre_formato, fingerprint, reglas_mapeo')
                .eq('proveedor_id', providerId)
                .eq('estado', 'ACTIVA')
                .limit(5);

            if (others && others.length > 0) {
                candidates = others;
                if (others.length === 1) safetyNetMapping = others[0];
            }

            return {
                success: true,
                mode: 'DISCOVERY',
                data: {
                    headers_detected: headers,
                    data_sample: sampleData,
                    full_data: fullData, // [CRITICAL FIX] Send everything
                    suggested_mapping: {},
                    confidence_notes: `Extracción directa (Offset: ${headerIndex})`
                },
                suggested_hash: headerHash,
                debug_fingerprint: debugInfo,
                safety_net: safetyNetMapping,
                candidates: candidates
            };
        }

        // Lógica para archivos no digitales (imágenes)
        const discoveryData = await discoverStructure(fileBuffer, mimeType);
        const headersImg = discoveryData.headers_detected;
        const hashImg = fingerprintService.generateHeaderHash(headersImg);
        const templateImg = await fingerprintService.matchFingerprint(hashImg, providerId);

        return {
            success: true,
            mode: templateImg ? 'MAPPED' : 'DISCOVERY',
            data: discoveryData,
            suggested_hash: hashImg
        };

    } catch (err) {
        console.error("[Extraction] Fatal Error:", err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    checkLegibility,
    processFile
};