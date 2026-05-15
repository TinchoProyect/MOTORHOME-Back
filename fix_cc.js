require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fix() {
    const proveedor_id = '69544027-2936-4df6-b728-cbd171bb1594';
    const factura_id = '53085780-6fd1-42b1-b35c-cf9aaaa0e21e';
    const diferencia = 1254.00;

    const { data: factura } = await supabase.from('facturas_raw').select('numero_comprobante').eq('id', factura_id).single();
    const numero_comprobante = factura ? factura.numero_comprobante : 'DESCONOCIDO';

    const { error: errAjuste } = await supabase
        .from('cuenta_corriente_proveedores')
        .insert([{
            proveedor_id: proveedor_id,
            tipo_movimiento: 'NOTA_DEBITO_INTERNA',
            monto_credito: 0,
            monto_debito: diferencia,
            referencia_factura_id: factura_id,
            observaciones: `Ajuste a favor por desvíos en conciliación de Factura ${numero_comprobante} (Recupero Manual)`
        }]);
    
    if (errAjuste) {
        console.error("Error inserting:", errAjuste);
    } else {
        console.log("Successfully inserted NOTA_DEBITO_INTERNA for Quercus with amount", diferencia);
    }
}
fix();
