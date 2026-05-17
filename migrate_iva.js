const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:p-Jnz4N8yac9rSW@db.wofttcnpipozwupmpuul.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false } // Supabase requires SSL but might need this depending on pg version
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  try {
    // 1. Add iva_aplicado to pedidos_b2b_items
    await client.query(`
      ALTER TABLE pedidos_b2b_items 
      ADD COLUMN IF NOT EXISTS iva_aplicado NUMERIC(5,2) DEFAULT 0;
    `);
    console.log('Added iva_aplicado to pedidos_b2b_items');

    // 2. Populate iva_aplicado for legacy records from tabla_maestra_operativa
    // We match by producto_codigo to codigo or sku in tabla_maestra_operativa
    const updateQuery = `
      UPDATE pedidos_b2b_items p
      SET iva_aplicado = COALESCE(
          (SELECT t.iva 
           FROM tabla_maestra_operativa t 
           WHERE t.codigo = p.producto_codigo OR t.sku = p.producto_codigo 
           LIMIT 1), 
          0
      )
      WHERE iva_aplicado IS NULL OR iva_aplicado = 0;
    `;
    const updateRes = await client.query(updateQuery);
    console.log('Updated legacy records:', updateRes.rowCount);

    // 3. Recreate vw_inventario_consolidado to include iva_aplicado
    // Wait, first we need to drop the existing view and recreate it
    // Let's get the definition of vw_inventario_consolidado first so we can modify it
    const viewDefRes = await client.query(`
      SELECT pg_get_viewdef('vw_inventario_consolidado', true) as view_def;
    `);
    
    console.log('Current View Def:');
    console.log(viewDefRes.rows[0].view_def);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
