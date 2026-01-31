const driveService = require('../services/driveService');
const extractionService = require('../services/extractionService');
const supabase = require('../config/supabaseClient');

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
    console.log(`   - DB Connection: ${process.env.SUPABASE_URL}`); // USER REQUEST: DB VERIFICATION
    console.log(`   - Archivo: ${fileId} (${fileName})`);
    console.log(`   - Proveedor: ${providerId}`);

    if (!fileId || !providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (fileId, providerId)" });
    }

    try {
        // WAR ROOM MODE: STOP INSERTS
        // Prohibido crear registros RAW hasta que el archivo haya sido procesado con éxito.

        // 1. Llamada al Servicio de Extracción (Core Logic)
        console.log("   [Controller] Calling Extraction Service...");
        const result = await extractionService.processFile(fileId, providerId, { headerIndex: parseInt(headerIndex) || 0 });

        // EXPLICIT HASH LOG (User Request)
        if (result.debug_fingerprint) {
            const { calculado_ahora, guardado_db } = result.debug_fingerprint;
            if (calculado_ahora !== guardado_db) {
                console.log("\n❌ [HASH MISMATCH DETECTED]");
                console.log(`   🔸 CALCULADO: ${calculado_ahora}`);
                console.log(`   🔸 EN DB:     ${guardado_db}`);
                console.log("   -------------------------------------------------");
            }
        }

        // 2. Manejo de Errores
        if (!result.success) {
            console.error("[Controller] Extraction Failed:", result.error);
            return res.status(422).json({
                success: false,
                error: result.error || "Error en extracción",
                reason: result.reason || "Falló el servicio de extracción"
            });
        }

        // 3. PERSISTENCIA DE ÉXITO (INSERT ONLY ON SUCCESS)
        // Caso Exito (Ya sea Discovery o MAPPED)
        // 3. PERSISTENCIA DE ÉXITO (SMART UPDATE)
        // Caso Exito (Ya sea Discovery o MAPPED)
        const finalStatus = result.mode === 'MAPPED' ? 'CONFIRMED' : 'READY_TO_REVIEW';

        // Check if raw record exists for this file
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
                    formato_guia_id: result.template_id || null, // Link template if found
                    last_updated: new Date()
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

        console.log(`[FilesController] Proceso Finalizado. Modo: ${result.mode}. Record ID: ${rawRecord.id}`);

        return res.json({
            success: true,
            mode: result.mode,
            data: result.data,
            raw_id: rawRecord.id, // Retornamos ID para que frontend pueda linkear
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

    // Merge headerIndex
    if (headerIndex !== undefined) mapping.headerIndex = parseInt(headerIndex);

    console.log(`   - Mapping:`, mapping);

    // SMART UPSERT: Evitar duplicados si ya existe un formato activo para este mismo hash
    // 1. Buscar si ya existe este fingerprint activo para este proveedor
    const { data: existingTemplate } = await supabase
        .from('proveedor_formatos_guia')
        .select('id')
        .eq('proveedor_id', providerId)
        .eq('estado', 'ACTIVA')
        .filter('fingerprint->>header_hash', 'eq', headerHash)
        .limit(1)
        .maybeSingle();

    if (existingTemplate) {
        console.log(`[FilesController] Actualizando Template existente: ${existingTemplate.id}`);
        const { data: updated, error: upError } = await supabase
            .from('proveedor_formatos_guia')
            .update({
                reglas_mapeo: mapping,
                nombre_formato: `Formato Actualizado ${new Date().toLocaleDateString()}`,
                // No tocamos fingerprint porque el hash es el mismo
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
                nombre_formato: `Formato Auto-Generado ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                estado: 'ACTIVA',
                fingerprint: fingerprint,
                reglas_mapeo: mapping,
            })
            .select()
    }

    res.json({ success: true, message: "Mapeo guardado y archivo procesado.", result });

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
        // Normalizar a mayúsculas
        const termUpper = termino.trim().toUpperCase();

        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .insert({ termino: termUpper, descripcion_uso: descripcion })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                // Si ya existe, lo devolvemos
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
