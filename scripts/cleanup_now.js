require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanup() {
    console.log("🔥 WAR ROOM: LIMPIEZA DEFINITIVA DE BASURA...");

    // 1. Eliminar Listas RAW creadas hoy que esten en ANALYZING/PENDING y sean NULL format (Garbage)
    const { error, count } = await supabase
        .from('proveedor_listas_raw')
        .delete({ count: 'exact' })
        .is('formato_guia_id', null)
        .in('status_global', ['ANALYZING', 'PENDING', 'ERROR_SYSTEM']);
    //.gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // BORRAR TODO LO VIEJO TAMBIEN

    if (error) console.error("Error cleaning:", error);
    else console.log(`🗑️ Eliminados ${count} registros basura.`);
}

cleanup();
