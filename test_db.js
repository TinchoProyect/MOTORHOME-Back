require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    const { data: facturas } = await supabase.from('facturas_raw').select('*').limit(1);
    console.log("FACTURAS:", Object.keys(facturas[0]));
    
    const { data: rec } = await supabase.from('recepciones_fisicas_cabecera').select('*').limit(1);
    console.log("RECEPCIONES CABECERA:", Object.keys(rec[0]));
    
    const { data: recI } = await supabase.from('recepciones_fisicas_items').select('*').limit(1);
    console.log("RECEPCIONES ITEMS:", Object.keys(recI[0]));
}
check();
