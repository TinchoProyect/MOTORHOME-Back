const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data, error } = await supabase.from('vw_inventario_consolidado').select('*').limit(1);
  console.log('Columns:', data && data.length ? Object.keys(data[0]) : error);
}
run();
