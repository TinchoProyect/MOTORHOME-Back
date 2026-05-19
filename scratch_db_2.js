const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkBavosi() {
    try {
        const { data: pagos, error: errPagos } = await supabase
            .from('pagos_bancarios_raw')
            .select('*')
            .eq('monto_pago', 109942.16)
            .limit(1);
        
        console.log("Pago Bavosi:", pagos);

        if (pagos && pagos.length > 0) {
            const proveedor_id = pagos[0].proveedor_id;
            console.log("Checking cuenta corriente for Bavosi:", proveedor_id);
            const { data: cc, error: errCc } = await supabase
                .from('cuenta_corriente_proveedores')
                .select('*')
                .eq('proveedor_id', proveedor_id)
                .order('created_at', { ascending: false })
                .limit(5);
            
            console.log("Cuenta Corriente Bavosi:", cc);
        }
    } catch(e) {
        console.error(e);
    }
}
checkBavosi();
