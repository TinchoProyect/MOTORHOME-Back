const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const cuentaCorrienteController = {
    getByProvider: async (req, res) => {
        const { providerId } = req.params;
        try {
            // 1. Obtener movimientos
            const { data: movimientos, error } = await supabase
                .from('cuenta_corriente_proveedores')
                .select(`
                    *,
                    facturas_raw!referencia_factura_id (
                        tipo_comprobante, punto_venta, numero_comprobante
                    )
                `)
                .eq('proveedor_id', providerId)
                .order('fecha_movimiento', { ascending: false });

            if (error) throw error;

            // 2. Obtener saldo (al vuelo), ignorando los movimientos omitidos
            const saldoTotal = movimientos.reduce((acc, mov) => {
                if (mov.es_omitido) return acc;
                return acc + (mov.monto_credito - mov.monto_debito);
            }, 0);

            // 3. Obtener recepciones históricas conciliadas
            const { data: recepciones, error: recErr } = await supabase
                .from('recepciones_fisicas_cabecera')
                .select(`
                    id, fecha_recepcion, numero_remito, estado_conciliacion, estado, notas,
                    pedidos_b2b_cabecera!inner ( id, codigo, proveedor_id )
                `)
                .eq('pedidos_b2b_cabecera.proveedor_id', providerId)
                .order('fecha_recepcion', { ascending: false });

            if (recErr) console.warn("Error fetching recepciones:", recErr);
            
            res.json({ success: true, movimientos, saldoTotal, recepciones: recepciones || [] });
        } catch (error) {
            console.error("Error getByProvider CC:", error);
            res.status(500).json({ error: error.message });
        }
    },

    toggleOmitir: async (req, res) => {
        const { id } = req.params;
        const { es_omitido } = req.body;
        
        try {
            const { data, error } = await supabase
                .from('cuenta_corriente_proveedores')
                .update({ es_omitido: !!es_omitido })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            console.error("Error toggleOmitir CC:", error);
            res.status(500).json({ error: error.message });
        }
    },

    registrarPagoEfectivo: async (req, res) => {
        const { proveedor_id, fecha_pago, monto_pago, observaciones } = req.body;
        
        try {
            if (!proveedor_id || !fecha_pago || monto_pago === undefined) {
                throw new Error("Faltan datos obligatorios para registrar el pago en efectivo.");
            }

            // Inyectamos en la tabla cruda. El trigger se encarga de impactar en la cuenta corriente.
            const { data, error } = await supabase
                .from('pagos_efectivo_raw')
                .insert([{
                    proveedor_id,
                    fecha_pago,
                    monto_pago: parseFloat(monto_pago),
                    observaciones
                }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            console.error("Error registrarPagoEfectivo:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = cuentaCorrienteController;
