require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function syncDB() {
    console.log("Fetching distinct extracted IDs...");
    
    // Fetch all records, we just need unique origin ids.
    const { data: operativa } = await supabase.from('tabla_maestra_operativa').select('archivo_origen_id');
    
    const uniqueIds = [...new Set(operativa.map(r => r.archivo_origen_id))].filter(id => id);
    console.log(`Found ${uniqueIds.length} extracted files in master table.`);
    
    let updated = 0;
    for (const id of uniqueIds) {
         const { data, error } = await supabase.from('proveedor_listas_raw')
             .update({ status_global: 'EXTRAIDO' })
             .eq('id', id)
             .eq('status_global', 'CONFIRMED');
             
         if (!error) {
             console.log(`Patched ID ${id} -> EXTRAIDO`);
             updated++;
         } else {
             console.error(`Error patching ${id}:`, error);
         }
    }
    
    console.log(`Successfully synced ${updated} historic records.`);
}
syncDB();
