const supabase = require('../config/supabaseClient');
const driveService = require('./driveService');

/**
 * INGEST SERVICE
 * Coordinador de Ingesta, Persistencia y Movimiento de Archivos.
 * Estrategia: "Dump Puro" (JSONB) + "Limpieza de Inbox" (Drive)
 */

async function processIngestion(fileId, providerId, dataSnapshot) {
    console.log(`[IngestService] 🟢 INICIANDO INGESTA para Archivo: ${fileId} | Proveedor: ${providerId}`);

    // Validar Snapshot
    if (!Array.isArray(dataSnapshot) || dataSnapshot.length === 0) {
        throw new Error("El snapshot de datos está vacío o es inválido.");
    }
    console.log(`   -> Filas recibidas para persistencia: ${dataSnapshot.length}`);

    // 1. RECUPERAR/CREAR CABECERA (Listas Raw)
    // ---------------------------------------------------------
    let { data: rawRecord, error: rawError } = await supabase
        .from('proveedor_listas_raw')
        .select('id, status_global')
        .eq('archivo_id', fileId)
        .eq('proveedor_id', providerId)
        .maybeSingle();

    if (rawError) throw rawError;

    if (!rawRecord) {
        // Si no existe (caso raro si vienen del visor, pero posible), lo creamos.
        console.log("   -> [INFO] Creando registro RAW on-the-fly...");
        const { data: newRaw, error: createError } = await supabase
            .from('proveedor_listas_raw')
            .insert({
                archivo_id: fileId,
                proveedor_id: providerId,
                status_global: 'CONFIRMED', // Set directo
                nombre_archivo: 'Archivo Ingestado Manualmente'
            })
            .select()
            .single();

        if (createError) throw createError;
        rawRecord = newRaw;
    } else {
        // Actualizamos estado
        const { error: updateError } = await supabase
            .from('proveedor_listas_raw')
            .update({ status_global: 'CONFIRMED' })
            .eq('id', rawRecord.id);

        if (updateError) throw updateError;
        console.log(`   -> [DB] Cabecera RAW ${rawRecord.id} marcada como CONFIRMED.`);
    }

    // 2. PERSISTENCIA DE DATOS (Items Extraídos)
    // ---------------------------------------------------------

    // A. Limpieza Preventiva (Evitar duplicados si confirman 2 veces)
    const { error: deleteError } = await supabase
        .from('proveedor_items_extraidos')
        .delete()
        .eq('lista_raw_id', rawRecord.id);

    if (deleteError) throw deleteError;

    // B. Preparar Bulk Insert (Mapeo a JSONB Puro)
    // El snapshot viene del frontend con claves legibles ("CÓDIGO", "PRECIO", "Calculada").
    // Lo guardamos tal cual en 'raw_data'.
    const payloadBuffer = dataSnapshot.map(row => ({
        lista_raw_id: rawRecord.id,
        raw_data: row
        // Las columnas sku_detectado, etc., se dejan en NULL intencionalmente.
    }));

    // C. Insertar (Batching si fuera necesario, pero supabase aguanta bastante)
    const { error: insertError } = await supabase
        .from('proveedor_items_extraidos')
        .insert(payloadBuffer);

    if (insertError) throw insertError;
    console.log(`   -> [DB] ${payloadBuffer.length} items insertados correctamente en 'raw_data'.`);


    // 3. LOGÍSTICA DE ARCHIVOS (Drive)
    // ---------------------------------------------------------
    let moveResult = { moved: false, reason: "Init" };
    try {
        // A. Obtener Config del Proveedor
        const { data: provider, error: provError } = await supabase
            .from('proveedores')
            .select('drive_folder_id, drive_folder_extracted_id')
            .eq('id', providerId)
            .single();

        if (provError) throw new Error("No se pudo leer config del proveedor: " + provError.message);

        let targetFolderId = null;

        // B. Estrategia de Resolución de Carpeta
        // Prioridad 1: Carpeta explícita en DB
        if (provider.drive_folder_extracted_id) {
            targetFolderId = provider.drive_folder_extracted_id;
            console.log(`   -> [Drive] Usando carpeta 'Extracted' configurada: ${targetFolderId}`);
        } else if (provider.drive_folder_id) {
            // Prioridad 2: Buscar subcarpeta "Listas Extraídas" dentro del Root
            console.log(`   -> [Drive] Buscando 'Listas Extraídas' dinámicamente en Root: ${provider.drive_folder_id}`);
            const files = await driveService.listFiles(provider.drive_folder_id, 'application/vnd.google-apps.folder');

            // Buscamos exact match o similar
            const candidate = files.find(f => f.name.toLowerCase().includes('extra') || f.name.toLowerCase().includes('procesad'));

            if (candidate) {
                targetFolderId = candidate.id;
                console.log(`   -> [Drive] Carpeta encontrada: ${candidate.name} (${candidate.id})`);
            } else {
                console.warn("   -> [Drive] ⚠️ No se encontró carpeta de destino adecuada. Se omite movimiento.");
            }
        }

        // C. Ejecutar Movimiento
        if (targetFolderId) {
            await driveService.moveFile(fileId, targetFolderId);
            moveResult = { moved: true, destination: targetFolderId };
            console.log("   -> [Drive] 🚚 Archivo MOVIDO exitosamente.");
        } else {
            moveResult = { moved: false, reason: "No Target Folder" };
        }

    } catch (driveError) {
        console.error("   -> [Drive] ❌ Error moviendo archivo (No Bloqueante):", driveError.message);
        moveResult = { moved: false, reason: driveError.message };
    }

    return {
        success: true,
        items_count: payloadBuffer.length,
        drive_status: moveResult
    };
}

module.exports = {
    processIngestion
};
