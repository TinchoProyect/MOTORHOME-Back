const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixStrandedPayment() {
    try {
        const hashId = '6d994684115c92fcf9d2c244c6893f1a';
        const { data: rawMov, error: errRaw } = await supabase
            .from('pagos_bancarios_raw')
            .select('*')
            .eq('hash_id', hashId)
            .single();

        if (errRaw) throw errRaw;

        console.log("Found raw movement:", rawMov);

        const { error: errCc } = await supabase
            .from('cuenta_corriente_proveedores')
            .insert({
                proveedor_id: rawMov.proveedor_id,
                fecha_movimiento: rawMov.fecha_pago,
                tipo_movimiento: 'PAGO',
                monto_credito: 0,
                monto_debito: rawMov.monto_pago,
                referencia_pago_id: hashId,
                observaciones: 'Asignación Manual Bancaria (Retroactiva). Ref: ' + (rawMov.descripcion_original || 'S/D').trim(),
                es_omitido: false
            });
        
        if (errCc) {
            console.error("Error inserting retroactively:", errCc);
        } else {
            console.log("Successfully fixed the stranded payment in cuenta_corriente_proveedores.");
        }
    } catch(e) {
        console.error(e);
    }
}
fixStrandedPayment();
