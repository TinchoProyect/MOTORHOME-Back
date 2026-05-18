const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

const prompt = `ATENCIÓN CRÍTICA - MATEMÁTICA BAVOSI:
Esta factura aplica una Bonificación/Descuento general (usualmente 18.1%).
INSTRUCCIONES OBLIGATORIAS:
1. Utiliza un campo extra en la raíz del JSON llamado "_razonamiento_matematico" para detallar paso a paso tus cálculos antes de escribir los valores finales.
2. precio_unitario: Registra el valor final YA RESTANDO la bonificación.
3. subtotal: Multiplica la Cantidad * el Nuevo Precio Unitario.
4. importe_neto_gravado: Debe coincidir con la sumatoria de todos los subtotales con descuento.`;

async function run() {
  const { error } = await supabase.from('proveedores').update({ mapa_extraccion_ia: prompt }).eq('id', '8929039a-407e-40dd-a399-98d17f647dc4');
  console.log('Update error:', error);
}
run();
