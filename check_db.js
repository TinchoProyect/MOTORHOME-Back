const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('vw_inventario_consolidado').select('*').limit(1);
  console.log('view:', data);

  const { data: d2, error: e2 } = await supabase.from('recepciones_fisicas_items').select('*, pedidos_b2b_items(*, facturas_raw(*))').limit(1);
  console.log('recepciones_fisicas_items:', JSON.stringify(d2, null, 2), e2);
}
run();
