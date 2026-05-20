const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  // 1. Search for any invoice matching '272619' anywhere
  const { data: allInvoices, error: errAllInv } = await supabase
    .from('facturas_raw')
    .select('*, proveedores(nombre)')
    .eq('proveedor_id', '5515e04d-248d-416c-8cb2-d36e006d549d');
  console.log('--- VILLARES INVOICES ---');
  console.log(JSON.stringify(allInvoices, null, 2), errAllInv);

  // 2. Search for any B2B order for Villares (5515e04d-248d-416c-8cb2-d36e006d549d)
  const villaresId = '5515e04d-248d-416c-8cb2-d36e006d549d';
  const { data: orders, error: errOrders } = await supabase
    .from('pedidos_b2b_cabecera')
    .select('*')
    .eq('proveedor_id', villaresId);
  console.log('\n--- VILLARES B2B ORDERS ---');
  console.log(orders, errOrders);

  if (orders && orders.length > 0) {
    // 3. Search for physical receptions for these orders
    const { data: receptions, error: errRecs } = await supabase
      .from('recepciones_fisicas_cabecera')
      .select('*')
      .in('pedido_id', orders.map(o => o.id));
    console.log('\n--- VILLARES PHYSICAL RECEPTIONS ---');
    console.log(receptions, errRecs);
  }
}
run();


