const driveService = require('../services/driveService');
const extractionService = require('../services/extractionService');
const supabase = require('../config/supabaseClient');
// AGREGADO: Importamos el servicio de huellas digitales
const fingerprintService = require('../services/fingerprintService');

const DEFAULT_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// =============================================================================
// LIST FILES
// =============================================================================
async function listFiles(req, res) {
    try {
        const folderId = req.query.folderId || DEFAULT_FOLDER_ID;
        if (!folderId) {
            return res.status(400).json({ error: "Falta Folder ID (Verificar .env o query param)" });
        }

        console.log(`[FilesController] Listando archivos de: ${folderId} (Type: ${req.query.type || 'all'})`);

        let mimeType = null;
        if (req.query.type === 'folders') {
            mimeType = 'application/vnd.google-apps.folder';
        }

        const files = await driveService.listFiles(folderId, mimeType);

        res.json({
            success: true,
            count: files.length,
            files: files
        });

    } catch (error) {
        console.error("[FilesController] Error Detail:", error);
        res.status(500).json({ error: "Error al listar archivos de Drive: " + error.message });
    }
}

// =============================================================================
// PROCESS EXTRACTION (New Endpoint)
// =============================================================================
async function processExtraction(req, res) {
    const { fileId, providerId, fileName, headerIndex } = req.body;

    console.log(`[FilesController] INICIO PROCESO DE EXTRACCION (Index: ${headerIndex})`);
    console.log(`   - DB Connection: ${process.env.SUPABASE_URL}`);
    console.log(`   - Archivo: ${fileId} (${fileName})`);
    console.log(`   - Proveedor: ${providerId}`);

    if (!fileId || !providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (fileId, providerId)" });
    }

    try {
        const { force } = req.body;

        // [OPTIMIZACION BYPASS] - Solo si no se fuerza la re-extracción
        if (!force) {
            // Verificar si este archivo YA fue procesado y tiene formato asignado.
            const { data: existingRecord } = await supabase
                .from('proveedor_listas_raw')
                .select(`
                    id,
                    formato_guia_id,
                    status_global,
                    proveedor_formatos_guia (
                        id,
                        reglas_mapeo,
                        nombre_formato,
                        fingerprint
                    )
                `)
                .eq('archivo_id', fileId)
                .eq('proveedor_id', providerId)
                .not('formato_guia_id', 'is', null)
                .maybeSingle();

            if (existingRecord && existingRecord.proveedor_formatos_guia) {
                console.log(`[FilesController] ⚡ BYPASS: Archivo IDENTIFICADO por ID (${fileId}). Status: ${existingRecord.status_global}`);

                // CASO 1: Archivo CONFIRMADO -> Devolvemos datos procesados (Memoria de Gestión)
                // [IMPUESTOS DE IDENTIDAD] Si está CONFIRMADO por ID, ignoramos diferencias de hash.
                // CASO 1: Archivo CONFIRMADO
                if (existingRecord.status_global === 'CONFIRMED') {
                    console.log(`📦 Recuperando BODEGA (Híbrido) -> ID: ${existingRecord.id}`);

                    // [FIX] Sincronización Estricta con Schema DB
                    const { data: processedItems, error: dbError } = await supabase
                        .from('proveedor_items_extraidos')
                        .select('*')
                        .eq('lista_raw_id', existingRecord.id)
                        .order('id', { ascending: true });

                    if (dbError) throw new Error("Error recuperando bodega: " + dbError.message);

                    // [STRICT MODE] Si la bodega está vacía, reportamos ERROR DE INTEGRIDAD.
                    // El usuario (o un admin) debe decidir si re-procesar, no el sistema.
                    if (!processedItems || processedItems.length === 0) {
                        console.error(`⚠️ ERROR INTEGRIDAD: Bodega vacía para ID ${existingRecord.id} (Status: CONFIRMED).`);
                        return res.status(500).json({
                            error: "Inconsistencia de Datos: El archivo figura como 'Confirmado' pero no tiene items guardados.",
                            details: "Requiere intervención manual o re-confirmación explícita."
                        });
                    }

                    console.log(`   -> Filas recuperadas: ${processedItems.length}. Normalizando...`);

                    // 2. Preparar Mapeo Inverso basado en nombres reales
                    const mapping = existingRecord.proveedor_formatos_guia.reglas_mapeo || {};
                    const invertedMap = {};

                    // Map de etiquetas legibles
                    const labelMap = {
                        "sku": "CÓDIGO (SKU)",
                        "descripcion": "DESCRIPCIÓN",
                        "precio": "PRECIO",
                        "unidad": "UNIDAD"
                    };

                    Object.entries(mapping).forEach(([logicalKey, originalHeader]) => {
                        if (originalHeader) invertedMap[originalHeader] = labelMap[logicalKey] || logicalKey.toUpperCase();
                    });

                    // 3. Construcción Híbrida
                    let allHeadersSet = new Set();

                    const dynamicRows = processedItems.map(item => {
                        const raw = item.raw_data || {};
                        const newRow = {};

                        // A. Primero las columnas clave normalizadas (Priority)
                        // NOTA: Ajustado nombres de columna según esquema real (sku, descripcion, precio, unidad)
                        if (item.sku) newRow["CÓDIGO (SKU)"] = item.sku;
                        if (item.descripcion) newRow["DESCRIPCIÓN"] = item.descripcion;
                        if (item.precio) newRow["PRECIO"] = item.precio;
                        if (item.unidad) newRow["UNIDAD"] = item.unidad;

                        allHeadersSet.add("CÓDIGO (SKU)");
                        allHeadersSet.add("DESCRIPCIÓN");
                        allHeadersSet.add("PRECIO");
                        if (item.unidad_medida_detectada) allHeadersSet.add("UNIDAD");

                        // B. Rellenamos con el resto del raw_data (sin pisar las clave)
                        Object.keys(raw).forEach(key => {
                            // Si esta columna original YA fue mapeada a una clave (ej: "Col A" -> SKU), la ignoramos aquí porque ya pusimos la versión normalizada
                            // Si NO fue mapeada, la agregamos tal cual
                            const isMapped = Object.values(mapping).includes(key);
                            if (!isMapped) {
                                newRow[key] = raw[key];
                                allHeadersSet.add(key);
                            }
                        });
                        return newRow;
                    });

                    // 4. Ordenar Encabezados
                    const priorityHeaders = ["CÓDIGO (SKU)", "DESCRIPCIÓN", "PRECIO", "UNIDAD"];
                    const otherHeaders = Array.from(allHeadersSet).filter(h => !priorityHeaders.includes(h));
                    const finalHeaders = [...priorityHeaders, ...otherHeaders];

                    console.log('🏁 FLAG ALREADY_MANAGED ENVIADO: true (Bodega Híbrida)');
                    return res.json({
                        success: true,
                        mode: 'MAPPED',
                        already_managed: true,
                        data: {
                            headers_detected: finalHeaders,
                            data_sample: dynamicRows,
                            suggested_mapping: {},
                            confidence_notes: "⚡ DATOS CERTIFICADOS + EXTENDIDOS"
                        },
                        raw_id: existingRecord.id,
                        debug_fingerprint: existingRecord.proveedor_formatos_guia.fingerprint,
                        safety_net: null
                    });
                }
                // CASO 2: Archivo Mapeado pero NO Confirmado.
                // IMPORTANTE: Antes devolvíamos arrays vacíos y rompíamos el front.
                // AHORA: Dejamos que siga de largo hacia extractionService.
                // El servicio extraerá los datos reales y usará el template existente para sugerir el mapeo.
                console.log(`   - Formato existe (${existingRecord.proveedor_formatos_guia.nombre_formato}) pero NO está CONFIRMADO. Procediendo a extracción real para mostrar datos.`);
            }
        }

        console.log("   [Controller] Calling Extraction Service...");
        const result = await extractionService.processFile(fileId, providerId, { headerIndex: parseInt(headerIndex) || 0 });

        if (result.debug_fingerprint) {
            const { calculado_ahora, guardado_db } = result.debug_fingerprint;
            if (calculado_ahora !== guardado_db) {
                console.log("\n❌ [HASH MISMATCH DETECTED]");
                console.log(`   🔸 CALCULADO: ${calculado_ahora}`);
                console.log(`   🔸 EN DB:     ${guardado_db}`);
                console.log("   -------------------------------------------------");
            }
        }

        if (!result.success) {
            console.error("[Controller] Extraction Failed:", result.error);

            return res.status(422).json({
                success: false,
                error: result.error || "Error en extracción",
                reason: result.reason || "Falló el servicio de extracción"
            });
        }

        const finalStatus = result.mode === 'MAPPED' ? 'CONFIRMED' : 'READY_TO_REVIEW';

        const { data: existingRaw } = await supabase
            .from('proveedor_listas_raw')
            .select('id')
            .eq('archivo_id', fileId)
            .maybeSingle();

        let rawRecord;
        if (existingRaw) {
            console.log(`[FilesController] Actualizando registro RAW existente: ${existingRaw.id}`);
            const { data: updated, error: updateError } = await supabase
                .from('proveedor_listas_raw')
                .update({
                    status_global: finalStatus,
                    modo_procesamiento: result.mode,
                    formato_guia_id: result.template_id || null
                    // SOLUCIONADO: Se eliminó 'last_updated' para evitar el error PGRST204
                })
                .eq('id', existingRaw.id)
                .select()
                .single();

            if (updateError) throw updateError;
            rawRecord = updated;
        } else {
            console.log(`[FilesController] Creando NUEVO registro RAW.`);
            const { data: inserted, error: insertError } = await supabase
                .from('proveedor_listas_raw')
                .insert({
                    proveedor_id: providerId,
                    archivo_id: fileId,
                    nombre_archivo: fileName || 'Unknown File',
                    status_global: finalStatus,
                    modo_procesamiento: result.mode,
                    formato_guia_id: result.template_id || null
                })
                .select()
                .single();

            if (insertError) throw insertError;
            rawRecord = inserted;
        }

        // [MODIFICACIÓN FINAL] Lógica de Huella por ID de Base de Datos.
        // Si el archivo (rawRecord) tiene un formato_guia_id asignado, es porque YA FUE FORMATEADO.
        // Esa es la huella. No importa lo que diga el extractor.
        let isAlreadyManaged = false;

        if (rawRecord && rawRecord.formato_guia_id) {
            isAlreadyManaged = true;
            result.mode = 'MAPPED'; // Forzamos el modo para coherencia
            result.template_id = rawRecord.formato_guia_id;
            console.log(`[FilesController] CLEAN ID MATCH: ID de Formato encontrado en DB (${rawRecord.formato_guia_id}). Abriendo Modal.`);
        } else if (result.mode === 'MAPPED') {
            // Fallback: Si el extractor lo encontró por hash pero la DB aun no lo tenía linkeado (raro, pero posible en transiciíon)
            isAlreadyManaged = true;
        }

        return res.json({
            success: true,
            mode: result.mode,
            already_managed: isAlreadyManaged, // Flag vital para el modal
            template_id: result.template_id, // Para que el modal sepa qué formato es
            data: result.data,
            raw_id: rawRecord.id,
            debug_fingerprint: result.debug_fingerprint,
            safety_net: result.safety_net
        });

    } catch (error) {
        console.error("[FilesController] Fatal Error en Process:", error);
        res.status(500).json({ error: "Error critico en proceso de extraccion: " + error.message });
    }
}

// =============================================================================
// CONFIRM EXTRACTION MAPPING
// =============================================================================
async function confirmExtraction(req, res) {
    const { fileId, providerId, mapping, headers, headerIndex } = req.body;

    console.log(`[FilesController] CONFIRM MAPPING for ${fileId}`);

    try {
        const headerHash = fingerprintService.generateHeaderHash(headers);
        const fingerprint = {
            header_hash: headerHash,
            file_extension: "xlsx",
            expected_headers: headers
        };

        if (headerIndex !== undefined) mapping.headerIndex = parseInt(headerIndex);

        const { data: existingTemplate } = await supabase
            .from('proveedor_formatos_guia')
            .select('id')
            .eq('proveedor_id', providerId)
            .eq('estado', 'ACTIVA')
            .filter('fingerprint->>header_hash', 'eq', headerHash)
            .maybeSingle();

        let template;

        if (existingTemplate) {
            console.log(`[FilesController] Actualizando Template existente: ${existingTemplate.id}`);
            const { data: updated, error: upError } = await supabase
                .from('proveedor_formatos_guia')
                .update({
                    reglas_mapeo: mapping,
                    nombre_formato: `Formato Actualizado ${new Date().toLocaleDateString()}`,
                })
                .eq('id', existingTemplate.id)
                .select()
                .single();

            if (upError) throw upError;
            template = updated;
        } else {
            console.log(`[FilesController] Creando NUEVO Template.`);
            const { data: inserted, error: insError } = await supabase
                .from('proveedor_formatos_guia')
                .insert({
                    proveedor_id: providerId,
                    nombre_formato: `Formato Auto-Generado ${new Date().toLocaleDateString()}`,
                    estado: 'ACTIVA',
                    fingerprint: fingerprint,
                    reglas_mapeo: mapping,
                    archivo_origen_id: fileId
                })
                .select()
                .single();

            if (insError) throw insError;
            template = inserted;
        }

        // [FIX CRITICO] Actualizar el estado del archivo RAW a CONFIRMED
        // Esto activa la "Memoria de Gestión" para la próxima vez.
        console.log(`[FilesController] Actualizando status_global='CONFIRMED' para archivo: ${fileId}`);
        const { error: rawUpdateError } = await supabase
            .from('proveedor_listas_raw')
            .update({
                status_global: 'CONFIRMED',
                formato_guia_id: template.id
            })
            .eq('archivo_id', fileId)
            .eq('proveedor_id', providerId);

        if (rawUpdateError) {
            console.error("Error updating raw status:", rawUpdateError);
        }

        // [FIX FINAL] POBLAR LA TABLA DE ITEMS
        // Sin esto, el modal no se activa porque busca items > 0.
        try {
            // 1. Obtener ID RAW
            const { data: rawRecord } = await supabase
                .from('proveedor_listas_raw')
                .select('id')
                .eq('archivo_id', fileId)
                .eq('proveedor_id', providerId)
                .single();

            if (rawRecord) {
                // 2. Extraer datos FULL
                console.log("   [Confirm] Extrayendo datos para persistencia...");
                const extractionResult = await extractionService.processFile(fileId, providerId, { headerIndex: mapping.headerIndex || 0 });

                if (extractionResult.success) {
                    // [FIX CRITICO] Usar FULL DATA si existe, sino fallback a sample (por seguridad)
                    const rows = extractionResult.data.full_data || extractionResult.data.data_sample || [];
                    console.log(`   [Confirm] Datos a procesar para bodega: ${rows.length} filas.`);

                    // 3. Mapeo ESPEJO (Sin Detección)
                    const itemsToInsert = rows.map(row => {
                        // [AMPUTACION] No clasificamos nada. Solo guardamos el JSON crudo.
                        return {
                            lista_raw_id: rawRecord.id,
                            raw_data: row,
                            // Dejamos las columnas _detectado en NULL (o default)
                            sku_detectado: null,
                            descripcion_detectada: null,
                            precio_detectado: null,
                            unidad_medida_detectada: null
                        };
                    });

                    console.log(`   [Mirror] Preparados ${itemsToInsert.length} items (Raw Mode).`);

                    console.log(`   [Filter] Filas válidas: ${itemsToInsert.length} (de ${rows.length} originales)`);

                    // 4. Limpieza previa por si es re-confirmación
                    await supabase.from('proveedor_items_extraidos').delete().eq('lista_raw_id', rawRecord.id);

                    // 5. Inserción
                    if (itemsToInsert.length > 0) {
                        const { error: insertError } = await supabase
                            .from('proveedor_items_extraidos')
                            .insert(itemsToInsert);

                        if (insertError) console.error("Error inserting items:", insertError);
                        else console.log(`   [Confirm] ${itemsToInsert.length} items guardados correctamente.`);
                    } else {
                        console.warn("⚠️ Todas las filas fueron filtradas (posible archivo vacío).");
                    }
                }
            }
        } catch (e) {
            console.error("Error populando items:", e);
        }

        res.json({ success: true, message: "Mapeo guardado y archivo procesado.", template });

    } catch (error) {
        console.error("[FilesController] Error Confirming:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// DICTIONARY API
// =============================================================================
async function getDictionaryTerms(req, res) {
    try {
        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .select('*')
            .order('termino', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error("Error fetching dictionary:", error);
        res.status(500).json({ error: error.message });
    }
}

async function createDictionaryTerm(req, res) {
    const { termino, descripcion } = req.body;
    try {
        const termUpper = termino.trim().toUpperCase();
        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .insert({ termino: termUpper, descripcion_uso: descripcion })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                const { data: existing } = await supabase
                    .from('user_diccionario_nomenclatura')
                    .select('*')
                    .eq('termino', termUpper)
                    .single();
                return res.json(existing);
            }
            throw error;
        }
        res.json(data);
    } catch (error) {
        console.error("Error creating term:", error);
        res.status(500).json({ error: error.message });
    }
}

// =============================================================================
// DOWNLOAD FILE STREAM (Viewer)
// =============================================================================
async function downloadFile(req, res) {
    const { fileId } = req.params;
    console.log(`[FilesController] Streaming file for viewer: ${fileId}`);

    if (!fileId) return res.status(400).send("Missing fileId");

    try {
        const metadata = await driveService.getFileMetadata(fileId);

        // Headers para descarga/visualización
        res.setHeader('Content-Type', metadata.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${metadata.name}"`);

        // Pipe directo del stream de Drive a la respuesta
        const stream = await driveService.getFileStream(fileId);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error("[Stream Error]", err);
            if (!res.headersSent) res.status(500).send("Stream Error");
        });

    } catch (error) {
        console.error("[Download Error]", error);
        // Expose real error to client for debugging
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({
            error: error.message || "File download error",
            details: error.toString()
        });
    }
}

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction,
    getDictionaryTerms,
    createDictionaryTerm,
    downloadFile
};