require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectGuide() {
    console.log("🔍 INSPECCION DE PROVEEDOR_FORMATOS_GUIA");
    console.log(`DB: ${process.env.SUPABASE_URL}`);

    const { data, error } = await supabase
        .from('proveedor_formatos_guia')
        .select('*');

    if (error) {
        console.error("Error reading DB:", error.message);
        return;
    }

    if (data.length === 0) {
        console.log("⚠️ TABLA VACIA. No hay formatos.");
        return;
    }

    console.log(`Found ${data.length} records.`);

    const formatted = data.map(r => ({
        ID: r.id,
        PROVEEDOR: r.proveedor_id,
        HASH_GUARDADO: r.fingerprint ? r.fingerprint.header_hash : 'NULL',
        MAPEO_KEYS: r.reglas_mapeo ? Object.keys(r.reglas_mapeo).join(', ') : 'NONE',
        CREATED: r.created_at
    }));

    console.table(formatted);

    // Dump raw fingerprint for the first one
    console.log("\n🧪 RAW FINGERPRINT OBJECT (First Record):");
    console.dir(data[0].fingerprint, { depth: null });
}

inspectGuide();
