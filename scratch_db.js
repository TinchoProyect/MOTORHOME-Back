const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDatabase() {
    try {
        console.log("Checking pagos_bancarios_raw...");
        const { data: pagos, error: errPagos } = await supabase
            .from('pagos_bancarios_raw')
            .select('*')
            .eq('monto_pago', 147450.34)
            .limit(1);
        
        if (errPagos) throw errPagos;
        console.log("Pago:", pagos);

        if (pagos && pagos.length > 0) {
            const proveedor_id = pagos[0].proveedor_id;
            console.log("Checking cuenta_corriente_proveedores for provider:", proveedor_id);
            const { data: cc, error: errCc } = await supabase
                .from('cuenta_corriente_proveedores')
                .select('*')
                .eq('proveedor_id', proveedor_id)
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (errCc) throw errCc;
            console.log("Cuenta Corriente recientes:", cc);
        }
    } catch(e) {
        console.error(e);
    }
}
checkDatabase();
