const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.rpc('get_view_def', { view_name: 'vw_inventario_consolidado' });
  if (error && error.code === 'PGRST202') {
     console.log('RPC not found, trying raw SQL via postgres connection or similar...');
  }
  
  // Since we don't have pg driver installed, let's look at the view's data
  const { data: vwData, error: vwErr } = await supabase.from('vw_inventario_consolidado').select('*').limit(1);
  console.log('Columns:', Object.keys(vwData[0] || {}));
}
run();
