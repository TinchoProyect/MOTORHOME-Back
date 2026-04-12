const supabase = require('../config/supabaseClient');
const driveService = require('./driveService');

/**
 * INGEST SERVICE
 * Coordinador de Ingesta, Persistencia y Movimiento de Archivos.
 * Estrategia: "Dump Puro" (JSONB) + "Limpieza de Inbox" (Drive)
 */

async function processIngestion(fileId, providerId, dataSnapshot) {
    console.log(`[IngestService] 🟢 INICIANDO INGESTA para Archivo: ${fileId} | Proveedor: ${providerId}`);

    // Validar Snapshot (Array=Legacy, Object=MultiSheet)
    let isValid = false;
    if (Array.isArray(dataSnapshot) && dataSnapshot.length > 0) isValid = true;
    if (dataSnapshot && typeof dataSnapshot === 'object' && dataSnapshot.mode) isValid = true;

    if (!isValid) {
        throw new Error("El snapshot de datos está vacío o es inválido.");
    }
    console.log(`   -> Payload recibido. Tipo: ${Array.isArray(dataSnapshot) ? 'ARRAY (Legacy)' : 'OBJECT (MultiSheet)'}`);

    // 1. RECUPERAR/CREAR CABECERA (Listas Raw)
    // ---------------------------------------------------------
    let { data: rawRecord, error: rawError } = await supabase
        .from('proveedor_listas_raw')
        .select('id, status_global')
        .eq('archivo_id', fileId)
        .eq('proveedor_id', providerId)
        .maybeSingle();

    if (rawError) throw rawError;

    // Extraer metadata temporal
    const effectiveDateStr = dataSnapshot.effectiveDate || new Date().toISOString();

    if (!rawRecord) {
        // Si no existe (caso raro si vienen del visor, pero posible), lo creamos.
        console.log("   -> [INFO] Creando registro RAW on-the-fly...");
        const { data: newRaw, error: createError } = await supabase
            .from('proveedor_listas_raw')
            .insert({
                archivo_id: fileId,
                proveedor_id: providerId,
                status_global: 'CONFIRMED', // Set directo
                nombre_archivo: 'Archivo extraído manualmente',
                fecha_vigencia: effectiveDateStr,
                created_at: effectiveDateStr // Secreto para persistir TimeZone
            })
            .select()
            .single();

        if (createError) throw createError;
        rawRecord = newRaw;
    } else {
        // Actualizamos estado y metadata
        const { error: updateError } = await supabase
            .from('proveedor_listas_raw')
            .update({ 
                status_global: 'CONFIRMED',
                fecha_vigencia: effectiveDateStr,
                created_at: effectiveDateStr // Secreto para persistir TimeZone
            })
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
    // DETECCIÓN DE MODO MULTI-HOJA
    // El frontend puede enviar un array de objetos (Filas - Legacy) O un objeto con { mode: 'MULTI_SHEET_BLOB', sheets: [] }
    let payloadBuffer = [];

    // Check if dataSnapshot is the new protocol payload
    if (dataSnapshot && dataSnapshot.mode === 'MULTI_SHEET_BLOB' && Array.isArray(dataSnapshot.sheets)) {
        console.log(`   -> [Ingest] 🚀 MODO MULTI-HOJA DETECTADO. Hojas: ${dataSnapshot.sheets.length}`);

        dataSnapshot.sheets.forEach(sheet => {
            console.log(`      - Procesando Hoja: '${sheet.name}' (${sheet.data ? sheet.data.length : 0} filas en matriz)`);
            payloadBuffer.push({
                lista_raw_id: rawRecord.id,
                raw_data: sheet.data, // La matriz completa
                sheet_name: sheet.name || 'Hoja Desconocida'
            });
        });

    } else if (Array.isArray(dataSnapshot)) {
        // LEGACY MODE (1 Hoja = N Filas o 1 Hoja = 1 Matriz)
        // Si dataSnapshot es array de arrays -> Es 1 hoja matriz
        // Si dataSnapshot es array de objetos -> Es 1 hoja items sueltos

        // Vamos a asumir el comportamiento previo: insertar cada elemento del array.
        // PERO si estamos migrando a "1 Hoja = 1 Registro", idealmente el frontend "viejo" que manda filas
        // deberíamos agruparlo? 
        // No. El plan dice: "Zero Regresión". Si viene el formato viejo, lo guardamos como antes (muchos registros).
        // A MENOS QUE queramos unificar.

        // Plan Aprobado: "Si el payload no tiene mode, asume Legacy".
        console.log("   -> [Ingest] 🛡️ MODO COMPATIBILIDAD (Single Sheet).");

        payloadBuffer = dataSnapshot.map(row => ({
            lista_raw_id: rawRecord.id,
            raw_data: row,
            sheet_name: 'Hoja1' // Default legacy
        }));
    } else {
        throw new Error("Formato de Snapshot no reconocido.");
    }

    // C. Insertar (Batching si fuera necesario, pero supabase aguanta bastante)
    const { error: insertError } = await supabase
        .from('proveedor_items_extraidos')
        .insert(payloadBuffer);

    if (insertError) throw insertError;
    console.log(`   -> [DB] ${payloadBuffer.length} registros insertados en 'proveedor_items_extraidos'.`);


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
