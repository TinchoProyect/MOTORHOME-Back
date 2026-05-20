const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Importamos el motor de reglas de facturación del backend
const { applyBillingRule } = require('../src/services/billingRules');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function run() {
  console.log('[SANEAMIENTO] Iniciando saneamiento de la factura Nº 272619 de Villares...');
  
  // 1. Obtener la factura de la base de datos
  const { data: invs, error: fetchErr } = await supabase
    .from('facturas_raw')
    .select('*')
    .eq('numero_comprobante', 272619);

  if (fetchErr) {
    console.error('[SANEAMIENTO] Error al buscar la factura:', fetchErr);
    process.exit(1);
  }

  if (!invs || invs.length === 0) {
    console.error('[SANEAMIENTO] No se encontró la factura Nº 272619.');
    process.exit(1);
  }

  const factura = invs[0];
  console.log('[SANEAMIENTO] Factura recuperada exitosamente.');
  console.log('  - Proveedor ID:', factura.proveedor_id);
  console.log('  - CUIT Emisor:', factura.cuit_emisor);
  console.log('  - Neto Gravado original:', factura.importe_neto_gravado);
  console.log('  - Checksum anterior:', factura.datos_extraidos.checksum_valido);

  // 2. Aplicar el motor de reglas (applyBillingRule) para Billares/Villares
  // Como ya agregamos la regla para el UUID '5515e04d-248d-416c-8cb2-d36e006d549d',
  // applyBillingRule resolverá y ejecutará la regla específica de forma determinista.
  console.log('[SANEAMIENTO] Aplicando nueva regla de facturación de Billares...');
  
  // Clonamos los datos extraídos para no mutar el original antes de procesar
  const datosClonados = JSON.parse(JSON.stringify(factura.datos_extraidos));
  
  // applyBillingRule requiere: providerId, providerCuit, extractedJson
  const datosSaneados = applyBillingRule(factura.proveedor_id, factura.cuit_emisor, datosClonados);

  console.log('[SANEAMIENTO] Recálculo completado con la nueva regla:');
  console.log('  - Nuevo Checksum Válido:', datosSaneados.checksum_valido);
  console.log('  - Nueva Sumatoria de Subtotales:', datosSaneados.checksum_sumatoria);
  console.log('  - Nueva Diferencia de Checksum:', datosSaneados.checksum_diferencia);
  console.log('  - Artículos Recalculados:', JSON.stringify(datosSaneados.articulos, null, 2));

  // 3. Actualizar la base de datos (facturas_raw)
  // Actualizamos tanto la columna 'articulos' como la columna 'datos_extraidos' con los datos saneados.
  console.log('[SANEAMIENTO] Escribiendo cambios en Supabase...');
  
  const { data: updateData, error: updateErr } = await supabase
    .from('facturas_raw')
    .update({
      articulos: datosSaneados.articulos,
      datos_extraidos: datosSaneados
    })
    .eq('id', factura.id)
    .select();

  if (updateErr) {
    console.error('[SANEAMIENTO] Error crítico al actualizar Supabase:', updateErr);
    process.exit(1);
  }

  console.log('[SANEAMIENTO] ¡Saneamiento completado con éxito absoluto!');
  console.log('  - Registro actualizado:', updateData[0].id);
  console.log('  - Checksum Final en DB:', updateData[0].datos_extraidos.checksum_valido);
  console.log('  - Sumatoria final:', updateData[0].datos_extraidos.checksum_sumatoria);
}

run().catch(err => {
  console.error('[SANEAMIENTO] Error general en el proceso:', err);
  process.exit(1);
});
