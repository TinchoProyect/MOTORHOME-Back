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
                if (existingRecord.status_global === 'CONFIRMED') {
                    console.log(`   - Recuperando datos procesados de DB...`);

                    const { data: processedItems } = await supabase
                        .from('proveedor_listas_procesadas')
                        .select('*')
                        .eq('raw_id', existingRecord.id)
                        .limit(50); // Muestra inicial para performance

                    if (processedItems && processedItems.length > 0) {
                        const detectedKeys = Object.keys(processedItems[0]);

                        return res.json({
                            success: true,
                            mode: 'MAPPED',
                            already_managed: true, // FLAG CLAVE
                            data: {
                                headers_detected: detectedKeys,
                                data_sample: processedItems,
                                suggested_mapping: existingRecord.proveedor_formatos_guia.reglas_mapeo,
                                confidence_notes: "⚡ RECUPERADO DE MEMORIA (Confirmado)"
                            },
                            raw_id: existingRecord.id,
                            debug_fingerprint: existingRecord.proveedor_formatos_guia.fingerprint,
                            safety_net: null
                        });
                    }
                }

                // CASO 2: Archivo Mapeado pero NO Confirmado -> Devolvemos el Mapping solamenente (Bypass)
                console.log(`   - Formato recuperado: ${existingRecord.proveedor_formatos_guia.nombre_formato}`);

                return res.json({
                    success: true,
                    mode: 'MAPPED',
                    data: {
                        headers_detected: [], // No leemos el archivo
                        data_sample: [],      // No leemos el archivo
                        suggested_mapping: existingRecord.proveedor_formatos_guia.reglas_mapeo,
                        confidence_notes: "⚡ RECUPERADO POR ID (Extracción Omitida)"
                    },
                    raw_id: existingRecord.id,
                    debug_fingerprint: existingRecord.proveedor_formatos_guia.fingerprint,
                    safety_net: null
                });
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

        return res.json({
            success: true,
            mode: result.mode,
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

        // CORREGIDO: Retornamos 'template' en lugar del 'result' inexistente
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

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction,
    getDictionaryTerms,
    createDictionaryTerm
};