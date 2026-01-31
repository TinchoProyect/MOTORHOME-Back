require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function forceDelete() {
    console.log("💣 FORCE DELETE: Limpiando TODO registro RAW sin formato...");

    // Eliminamos donde formato_guia_id IS NULL
    const { error, count, data } = await supabase
        .from('proveedor_listas_raw')
        .delete({ count: 'exact' })
        .is('formato_guia_id', null);

    if (error) {
        console.error("❌ Error borrando:", error);
    } else {
        console.log(`✅ Eliminados ${count} registros huérfanos (NULL format).`);
    }

    // Opcional: Borrar tambien los que tienen status ERROR
    const { count: countErr } = await supabase
        .from('proveedor_listas_raw')
        .delete({ count: 'exact' })
        .in('status_global', ['ERROR_ILEGIBLE', 'ERROR_SYSTEM']);

    console.log(`✅ Eliminados ${countErr} registros ERROR.`);
}

forceDelete();
