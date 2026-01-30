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
    console.log(`   - Archivo: ${fileId} (${fileName})`);
    console.log(`   - Proveedor: ${providerId}`);

    if (!fileId || !providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (fileId, providerId)" });
    }

    try {
        // 1. Persistencia Inicial (Estado: ANALYZING)
        const { data: rawRecord, error: dbError } = await supabase
            .from('proveedor_listas_raw')
            .insert({
                proveedor_id: providerId,
                archivo_id: fileId,
                nombre_archivo: fileName || 'Unknown File',
                status_global: 'ANALYZING',
                modo_procesamiento: 'DISCOVERY' // Default inicial
            })
            .select()
            .single();

        if (dbError) {
            console.error("[FilesController] Error DB Insert:", dbError);
            throw new Error("Error iniciando registro en DB: " + dbError.message);
        }

        console.log(`   [DB] Registro creado ID: ${rawRecord.id}`);

        // 2. Llamada al Servicio de Extracción (Core Logic)
        // Nota: Esto puede tardar, el frontend debe manejar timeout o esto ser background job.
        // Por ahora, await directo (simple).
        const result = await extractionService.processFile(fileId, providerId, { headerIndex: parseInt(headerIndex) || 0 });

        // 3. Manejo de Resultados
        if (!result.success) {
            // Caso Error / Ilegible
            const newStatus = result.error === 'ILEGIBLE' ? 'ERROR_ILEGIBLE' : 'ERROR_SYSTEM';

            await supabase
                .from('proveedor_listas_raw')
                .update({ status_global: newStatus })
                .eq('id', rawRecord.id);

            return res.status(422).json({
                success: false,
                error: result.error,
                reason: result.reason
            });
        }

        // Caso Exito (Ya sea Discovery o MAPPED)
        const finalStatus = result.mode === 'MAPPED' ? 'CONFIRMED' : 'READY_TO_REVIEW';

        await supabase
            .from('proveedor_listas_raw')
            .update({
                status_global: finalStatus,
                modo_procesamiento: result.mode
                // TODO: Guardar fingerprint u otros metadatos si el service los retorna
            })
            .eq('id', rawRecord.id);

        console.log(`[FilesController] Proceso Finalizado. Modo: ${result.mode}`);

        return res.json({
            success: true,
            mode: result.mode,
            data: result.data,
            raw_id: rawRecord.id // Retornamos ID para que frontend pueda linkear
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

    try {
        // 1. Crear/Actualizar Template en "Memoria"
        // Generamos el fingerprint basado en los headers originales (esperados)
        const fingerprintService = require('../services/fingerprintService');
        const headerHash = fingerprintService.generateHeaderHash(headers);

        const fingerprint = {
            header_hash: headerHash,
            expected_headers: headers,
            file_extension: 'xlsx', // Asumimos excel por ahora en este flujo
            tolerance_mode: 'strict'
        };

        const { data: template, error: templateError } = await supabase
            .from('proveedor_formatos_guia')
            .insert({
                proveedor_id: providerId,
                nombre_formato: `Formato Auto-Generado ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                estado: 'ACTIVA',
                fingerprint: fingerprint,
                reglas_mapeo: mapping,
                archivo_origen_id: fileId
            })
            .select()
            .single();

        if (templateError) throw new Error("Error guardando template: " + templateError.message);
        console.log(`[FilesController] Template Guardado: ${template.id}`);

        // 2. Re-Procesar el archivo (Ahora usará el template automáticamente)
        const result = await extractionService.processFile(fileId, providerId);

        if (!result.success) {
            throw new Error("Error en re-procesamiento: " + result.error);
        }

        res.json({ success: true, message: "Mapeo guardado y archivo procesado.", result });

    } catch (error) {
        console.error("[FilesController] Error Confirming:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction
};
