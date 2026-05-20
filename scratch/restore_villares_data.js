const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  console.log('[RESTORATION] Starting restoration of lost Villares B2B order and reception...');

  // 1. Recreate pedidos_b2b_cabecera
  const b2bCab = {
    id: "9aaeb616-ba0c-4861-92d6-60b2042b06d3",
    proveedor_id: "5515e04d-248d-416c-8cb2-d36e006d549d",
    fecha_emision: "2026-05-11T15:53:26+00:00",
    estado: "Emitido", // So that it shows up in "Pedidos Activos"
    tipo_documento: "Orden de Pedido"
  };

  const { error: errB2bCab } = await supabase
    .from('pedidos_b2b_cabecera')
    .upsert(b2bCab);

  if (errB2bCab) {
    console.error('Error inserting B2B order cabecera:', errB2bCab);
    return;
  }
  console.log('✔ B2B Order Cabecera restored successfully.');

  // 2. Recreate pedidos_b2b_items
  const b2bItems = [
    {
      id: "afb35b90-2cbe-4e6d-a617-9a72791abbd1",
      pedido_id: "9aaeb616-ba0c-4861-92d6-60b2042b06d3",
      cantidad: 1,
      producto_codigo: "45903",
      valor_unitario_ref: 1573.08,
      producto_descripcion: "Harina de Avena",
      unidad_ref: "Kilogramo"
    },
    {
      id: "7e899bae-9fab-419a-b2b7-fc1b6dea7033",
      pedido_id: "9aaeb616-ba0c-4861-92d6-60b2042b06d3",
      cantidad: 1,
      producto_codigo: "44899",
      valor_unitario_ref: 7402.75,
      producto_descripcion: "Sésamo Negro",
      unidad_ref: "Kilogramo"
    },
    {
      id: "2f718411-0692-43da-aa6a-5507ab77ee14",
      pedido_id: "9aaeb616-ba0c-4861-92d6-60b2042b06d3",
      cantidad: 1,
      producto_codigo: "45125",
      valor_unitario_ref: 907.2,
      producto_descripcion: "Maíz Pisingallo",
      unidad_ref: "Kilogramo"
    }
  ];

  const { error: errB2bItems } = await supabase
    .from('pedidos_b2b_items')
    .upsert(b2bItems);

  if (errB2bItems) {
    console.error('Error inserting B2B order items:', errB2bItems);
    return;
  }
  console.log('✔ B2B Order Items restored successfully.');

  // 3. Recreate recepciones_fisicas_cabecera
  const recCab = {
    id: "a8c84bcc-cc6f-4751-ac4f-7de2672c77ef",
    pedido_id: "9aaeb616-ba0c-4861-92d6-60b2042b06d3",
    fecha_recepcion: "2026-05-11T15:53:26+00:00",
    numero_remito: "103000272619", // The remito number they looked for
    estado: "Recepción Completa",
    estado_conciliacion: "NO_CONCILIADA" // Ready to be matched / processed!
  };

  const { error: errRecCab } = await supabase
    .from('recepciones_fisicas_cabecera')
    .upsert(recCab);

  if (errRecCab) {
    console.error('Error inserting reception cabecera:', errRecCab);
    return;
  }
  console.log('✔ Reception Cabecera restored successfully.');

  // 4. Recreate recepciones_fisicas_items
  const recItems = [
    {
      id: "54b8939b-2c2e-46e9-bcba-ef5231f0d3dc",
      recepcion_id: "a8c84bcc-cc6f-4751-ac4f-7de2672c77ef",
      pedido_item_id: "afb35b90-2cbe-4e6d-a617-9a72791abbd1",
      cantidad_esperada: 1,
      cantidad_recibida: 1
    },
    {
      id: "b2f0d7c2-c322-468d-b298-69dbfa9ddecb",
      recepcion_id: "a8c84bcc-cc6f-4751-ac4f-7de2672c77ef",
      pedido_item_id: "7e899bae-9fab-419a-b2b7-fc1b6dea7033",
      cantidad_esperada: 1,
      cantidad_recibida: 1
    },
    {
      id: "a91e50f2-8e0a-498a-96bb-7ce4557fa9cb",
      recepcion_id: "a8c84bcc-cc6f-4751-ac4f-7de2672c77ef",
      pedido_item_id: "2f718411-0692-43da-aa6a-5507ab77ee14",
      cantidad_esperada: 1,
      cantidad_recibida: 1
    }
  ];

  const { error: errRecItems } = await supabase
    .from('recepciones_fisicas_items')
    .upsert(recItems);

  if (errRecItems) {
    console.error('Error inserting reception items:', errRecItems);
    return;
  }
  console.log('✔ Reception Items restored successfully.');
  console.log('[RESTORATION] All records reconstituted successfully! Order is visible and ready.');
}
run();
