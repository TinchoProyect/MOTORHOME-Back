require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runAudit() {
    const { data: rawLists } = await supabase.from('proveedor_listas_raw').select('*');
    const { data: operativa } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, archivo_origen_id');
    fs.writeFileSync('tmp_out.json', JSON.stringify({
        rawLists: rawLists?.map(r => ({id: r.id, file: r.nombre_archivo, status_global: r.status_global})),
        operativa_samples: operativa
    }, null, 2));
}
runAudit();
