const driveService = require('../services/driveService');
const extractionService = require('../services/extractionService');
const supabase = require('../config/supabaseClient');
// AGREGADO: Importamos el servicio de huellas digitales
const fingerprintService = require('../services/fingerprintService');
const ingestService = require('../services/ingestService');

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
                    // Map de etiquetas legibles
                    const labelMap = {
                        "sku": "CÓDIGO (SKU)",
                        "descripcion": "DESCRIPCIÓN",
                        "precio": "PRECIO",
                        "unidad": "UNIDAD"
                    };

                    // 3. Construcción Híbrida
                    let allHeadersSet = new Set();

                    const dynamicRows = processedItems.map(item => {
                        const raw = item.raw_data || {};
                        const newRow = {};

                        // A. Primero las columnas clave normalizadas (Priority)
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

        let isAlreadyManaged = false;

        if (rawRecord && rawRecord.formato_guia_id) {
            isAlreadyManaged = true;
            result.mode = 'MAPPED'; // Forzamos el modo para coherencia
            result.template_id = rawRecord.formato_guia_id;
            console.log(`[FilesController] CLEAN ID MATCH: ID de Formato encontrado en DB (${rawRecord.formato_guia_id}). Abriendo Modal.`);
        } else if (result.mode === 'MAPPED') {
            isAlreadyManaged = true;
        }

        return res.json({
            success: true,
            mode: result.mode,
            already_managed: isAlreadyManaged,
            template_id: result.template_id,
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
// =============================================================================
// CONFIRM EXTRACTION MAPPING (Refactored Phase 4)
// =============================================================================
async function confirmExtraction(req, res) {
    const { fileId, providerId, dataSnapshot } = req.body;

    // [PHASE 4] MODULAR INGESTION STRATEGY
    // We delegated all logic to 'ingestService'. 
    // filesController now acts as a pure router/validator.

    console.log(`[FilesController] CONFIRM INGESTION REQUEST for ${fileId}`);

    if (!fileId || !providerId || !dataSnapshot) {
        return res.status(400).json({ error: "Faltan parámetros (fileId, providerId, dataSnapshot)" });
    }

    try {
        // Delegate to Service
        const result = await ingestService.processIngestion(fileId, providerId, dataSnapshot);

        res.json({
            success: true,
            message: "Ingesta completada exitosamente.",
            details: result
        });

    } catch (error) {
        console.error("[FilesController] Error en Ingesta:", error);
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

async function updateDictionaryTerm(req, res) {
    const { id, termino, descripcion_uso, reglas_procesamiento } = req.body;
    console.log(`[FilesController] UPDATE Term Request: ID=${id}, Term=${termino}`);

    if (!id || !termino) {
        return res.status(400).json({ error: "Faltan datos requeridos (id, termino)" });
    }

    try {
        const updatePayload = {
            termino: termino.trim().toUpperCase()
        };
        if (descripcion_uso !== undefined) {
            updatePayload.descripcion_uso = descripcion_uso ? descripcion_uso.trim() : null;
        }

        // [FIX] Persistent Rules Support (Merge Strategy)
        // If rules are provided, we MUST merge with existing to avoid losing SQL-injected props (pattern, targets)
        if (reglas_procesamiento !== undefined) {
            // 1. Fetch Existing Record
            const { data: existing, error: fetchError } = await supabase
                .from('user_diccionario_nomenclatura')
                .select('reglas_procesamiento')
                .eq('id', id)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError; // Ignore not found if creating new? No, this is update.

            let mergedRules = reglas_procesamiento;
            if (existing && existing.reglas_procesamiento) {
                console.log(`[FilesController] Merging Rules for ${id}...`);
                // MERGE: Existing has priority for "protected" keys if we wanted, 
                // BUT usually we want new UI values (like delimiter) to override, 
                // while keeping existing "hidden" keys (pattern, logic).

                // Strategy: Spread Existing, then Spread New. 
                // This means New overrides shared keys (good for delimiter update), 
                // but keeps keys New doesn't have (good for pattern persistence).
                mergedRules = { ...existing.reglas_procesamiento, ...reglas_procesamiento };

                // Specific Protection: If new rules is just { type: 'split' } but existing was { type: 'regex_split' }, 
                // we might have a conflict if the UI blindly forces 'split'.
                // The UI logic in viewer_engine currently forces 'split' if delimiter is present.
                // IF we want to protect 'regex_split' from UI downgrade:
                if (existing.reglas_procesamiento.type === 'regex_split' && reglas_procesamiento.type === 'split') {
                    console.warn(`[FilesController] 🛡️ Protected Regex Rule from UI Downgrade.`);
                    mergedRules.type = 'regex_split'; // Keep regex type
                    // Keep pattern (already kept by spread)
                    // Keep target_labels (already kept by spread)
                }
            }

            updatePayload.reglas_procesamiento = mergedRules;
        }

        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .update(updatePayload)
            .eq('id', id)
            .select();

        if (error) throw error;

        // Validar si realmente se actualizó algo
        if (!data || data.length === 0) {
            console.warn(`[FilesController] ⚠️ Update exitoso pero SIN DATOS retornados para ID ${id}. Verificar existencia.`);
        } else {
            console.log(`[FilesController] ✅ Term updated successfully: ${termino}`);
        }

        res.json({ success: true, data });

    } catch (error) {
        console.error("Error updating term:", error);
        res.status(500).json({ error: "Error actualizando término: " + error.message });
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
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({
            error: error.message || "File download error",
            details: error.toString()
        });
    }
}

// =============================================================================
// DELETE DICTIONARY TERM
// =============================================================================
async function deleteDictionaryTerm(req, res) {
    const { id } = req.params;
    console.log(`[FilesController] Requesting DELETE for Term ID: ${id}`);

    if (!id) return res.status(400).json({ error: "Missing Term ID" });

    try {
        const { error } = await supabase
            .from('user_diccionario_nomenclatura')
            .delete()
            .eq('id', id);

        if (error) throw error;

        console.log(`[FilesController] ✅ Term ID ${id} deleted successfully.`);
        res.json({ success: true, message: "Término eliminado" });

    } catch (error) {
        console.error("Error deleting term:", error);
        res.status(500).json({ error: "Error eliminando término: " + error.message });
    }
}

// =============================================================================
// PROVISION VENDOR FOLDERS (INFRASTRUCTURE)
// =============================================================================
async function provisionVendorFolders(req, res) {
    const { vendorName } = req.body;
    const parentId = process.env.DRIVE_FOLDER_ID; // Root "Madre"

    if (!vendorName) return res.status(400).json({ error: "Missing vendorName" });
    if (!parentId) {
        console.error("❌ CRITICAL: DRIVE_FOLDER_ID not set in .env");
        return res.status(500).json({ error: "Server Misconfiguration: Missing DRIVE_FOLDER_ID" });
    }

    try {
        console.log(`[Provisioning] Starting infrastructure for: "${vendorName}"`);

        // 1. Create Root Folder: "PROV_[NAME]"
        // Sanitize name for Folder
        const safeName = vendorName.trim().toUpperCase().replace(/[^A-Z0-9 ÁÉÍÓÚÑ]/g, '').substring(0, 40);
        const rootFolderName = `PROV_${safeName}`;

        const rootFolder = await driveService.createFolder(rootFolderName, parentId);
        console.log(`   - Root Created: ${rootFolder.id}`);

        // 2. Create Subfolders (Parallel)
        const [pricesFolder, extractedFolder] = await Promise.all([
            driveService.createFolder('Listas de Precios', rootFolder.id),
            driveService.createFolder('Listas Extraídas', rootFolder.id)
        ]);
        console.log(`   - Subfolders Created. Prices: ${pricesFolder.id}, Extracted: ${extractedFolder.id}`);

        res.json({
            success: true,
            data: {
                rootId: rootFolder.id,
                pricesId: pricesFolder.id,
                extractedId: extractedFolder.id,
                rootLink: rootFolder.webViewLink
            }
        });

    } catch (error) {
        console.error("[Provisioning] Error:", error);
        res.status(500).json({ error: "Provisioning Failed: " + error.message });
    }
}

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction,
    getDictionaryTerms,
    createDictionaryTerm,
    updateDictionaryTerm,
    deleteDictionaryTerm,
    downloadFile,
    provisionVendorFolders // Exported
};