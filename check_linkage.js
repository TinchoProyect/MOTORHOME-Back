const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('recepciones_fisicas_items').select('*, pedidos_b2b_items(*, facturas_raw_items(*))').limit(5);
  if(error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
