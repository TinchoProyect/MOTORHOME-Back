require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkStats() {
    console.log("📊 AUDITORIA DE PROVEEDOR_LISTAS_RAW");

    // 1. Total records
    const { count: total } = await supabase.from('proveedor_listas_raw').select('*', { count: 'exact', head: true });
    console.log(`Total Records: ${total}`);

    // 2. Group by Status
    const { data: byStatus } = await supabase.from('proveedor_listas_raw').select('status_global');
    const statusCounts = {};
    byStatus.forEach(r => statusCounts[r.status_global] = (statusCounts[r.status_global] || 0) + 1);
    console.log("Status Counts:", statusCounts);

    // 3. Null Formats
    const { count: nullFormats } = await supabase.from('proveedor_listas_raw').select('*', { count: 'exact', head: true }).is('formato_guia_id', null);
    console.log(`Records with NULL format: ${nullFormats}`);

    // 4. Sample Garbage
    if (nullFormats > 0) {
        const { data: garbage } = await supabase
            .from('proveedor_listas_raw')
            .select('id, created_at, proveedor_id, status_global')
            .is('formato_guia_id', null)
            .limit(5);
        console.table(garbage);
    }
}

checkStats();
