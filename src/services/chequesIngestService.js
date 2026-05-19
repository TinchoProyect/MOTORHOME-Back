const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const driveService = require('./driveService');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function generateHashId(cheque) {
    const raw = `${cheque.numero_cheque}_${cheque.cuit_librador}_${cheque.fecha_pago}_${cheque.importe}_${cheque.id_cheque_bancario}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

// Simple CSV Parser that handles semicolons and quotes
function parseCSVLine(text) {
    const re_valid = /^\s*(?:'[^'\\]*(?:\\[\s\S][^'\\]*)*'|"[^"\\]*(?:\\[\s\S][^"\\]*)*"|[^;'"\s\\]*(?:\s+[^;'"\s\\]+)*)\s*(?:;\s*(?:'[^'\\]*(?:\\[\s\S][^'\\]*)*'|"[^"\\]*(?:\\[\s\S][^"\\]*)*"|[^;'"\s\\]*(?:\s+[^;'"\s\\]+)*)\s*)*$/;
    const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\s\S][^'\\]*)*)'|"([^"\\]*(?:\\[\s\S][^"\\]*)*)"|([^;'"\s\\]*(?:\s+[^;'"\s\\]+)*))\s*(?:;|$)/g;

    if (!re_valid.test(text)) return null;

    let a = [];
    text.replace(re_value, function(m0, m1, m2, m3) {
        if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
        else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
        else if (m3 !== undefined) a.push(m3);
        return '';
    });
    // Handle empty last value
    if (/;\s*$/.test(text)) a.push('');
    return a;
}

function parseSpanishDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return null;
}

function parseNumeric(numStr) {
    if (!numStr || numStr.trim() === '') return 0;
    // Remove dots for thousands, replace comma with dot for decimals
    const cleanStr = numStr.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
}

async function processCSVBuffer(buffer) {
    const csvText = buffer.toString('utf8'); // Assuming UTF-8, might need ISO-8859-1 check
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // Asumimos que la primera línea es el header, pero el CSV de los bancos a veces tiene cabeceras complejas.
    // Para este caso, buscaremos la línea de cabeceras.
    let dataStarted = false;
    let chequesToInsert = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cols = parseCSVLine(line);
        if (!cols || cols.length < 5) continue;

        // Detect header
        if (!dataStarted && cols.some(c => c.toLowerCase().includes('nº de cheque'))) {
            dataStarted = true;
            continue;
        }

        if (dataStarted) {
            // Mapeo basado en el orden provisto en la instrucción
            // [Bloque 1] 0: Nº de cheque, 1: Cláusula, 2: Recibido de, 3: CUIT/CUIL/CDI, 4: Fecha de pago, 5: Fecha de emisión, 6: Importe, 7: Estado, 8: Banco emisor, 9: ID del cheque, 10: CMC7, 11: Motivo y descripción, 12: Emitido a, 13: CUIT/CUIL/CDI
            // ... Y el resto de bloques
            // Por simplicidad, tomaremos los primeros asumiendo el orden exacto del requerimiento.
            
            const cheque = {
                numero_cheque: cols[0] || '',
                clausula: cols[1] || '',
                recibido_de: cols[2] || '',
                // cols[3] es CUIT de recibido de
                fecha_pago: parseSpanishDate(cols[4]),
                fecha_emision: parseSpanishDate(cols[5]),
                importe: parseNumeric(cols[6]),
                estado_bancario: cols[7] || '',
                banco_emisor: cols[8] || '',
                id_cheque_bancario: cols[9] || '',
                cmc7: cols[10] || '',
                motivo_descripcion: cols[11] || '',
                librador_razon_social: cols[12] || '', // Emitido a
                librador_cuit: cols[13] || '', // CUIT
                // Beneficiario Actual (asumimos las columnas subsiguientes si el banco las envía, dejaremos vacío si no las hay para evitar crash)
                beneficiario_actual_razon_social: cols[19] || '',
                beneficiario_actual_cuit: cols[20] || '',
                
                cant_endosos: parseInt(cols[21]) || 0,
                cant_cesiones: parseInt(cols[22]) || 0,
                cant_avales: parseInt(cols[23]) || 0,
            };

            cheque.hash_id = generateHashId(cheque);
            if (cheque.fecha_pago) {
                const dateObj = new Date(cheque.fecha_pago);
                dateObj.setDate(dateObj.getDate() + 30);
                cheque.fecha_vencimiento_calculada = dateObj.toISOString().split('T')[0];
            }

            // TODO: JSONB para historiales si vienen en las columnas (requiere lógica de agrupación dinámica si son múltiples)

            if (cheque.numero_cheque) {
                chequesToInsert.push(cheque);
            }
        }
    }

    if (chequesToInsert.length === 0) {
        return { success: true, message: "No se encontraron cheques válidos en el CSV", inserted: 0 };
    }

    // Inserción idempotente
    const { data, error } = await supabase
        .from('cheques_cartera')
        .upsert(chequesToInsert, { onConflict: 'hash_id', ignoreDuplicates: true })
        .select();

    if (error) {
        console.error("[ChequesIngest] Error upserting:", error);
        throw error;
    }

    return { success: true, message: `Procesados ${chequesToInsert.length} cheques. Insertados nuevos: ${data ? data.length : 0}`, inserted: data ? data.length : 0 };
}

async function startDriveIngestion() {
    console.log("[ChequesIngest] Iniciando ingesta de Drive...");
    let folderId = process.env.DRIVE_CHEQUES_FOLDER_ID;
    
    if (!folderId) {
        const { data } = await supabase
            .from('configuracion_sistema')
            .select('valor')
            .eq('llave', 'drive_cheques_folder_id')
            .single();
        if (data && data.valor) {
            folderId = data.valor;
        }
    }

    if (!folderId) {
        throw new Error("DRIVE_CHEQUES_FOLDER_ID no configurado en entorno ni en base de datos. Haz clic en el ícono de Drive primero para provisionar la carpeta.");
    }

    const files = await driveService.listFiles(folderId, 'text/csv');
    if (!files || files.length === 0) {
        return { message: "No hay archivos CSV pendientes en Drive.", processed: 0 };
    }

    let processedCount = 0;
    for (const file of files) {
        console.log(`[ChequesIngest] Procesando archivo: ${file.name}`);
        const buffer = await driveService.downloadFileToBuffer(file.id);
        await processCSVBuffer(buffer);
        
        // Mover a procesados o eliminar.
        // Opcional: await driveService.moveFile(file.id, process.env.DRIVE_CHEQUES_PROCESADOS_FOLDER_ID);
        processedCount++;
    }

    return { message: `Proceso completado. Archivos ingeridos: ${processedCount}`, processed: processedCount };
}

module.exports = {
    startDriveIngestion,
    processCSVBuffer
};
