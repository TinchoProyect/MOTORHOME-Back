const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

router.post('/generar', async (req, res) => {
    try {
        const { proveedor_id, tipo_documento, items } = req.body;
        if (!proveedor_id || !items || items.length === 0) {
            return res.status(400).json({ error: "Faltan datos requeridos." });
        }

        // Insert Cabecera
        const { data: headerData, error: headerErr } = await supabase
            .from('pedidos_b2b_cabecera')
            .insert([{ proveedor_id, tipo_documento, estado: 'Emitido' }])
            .select()
            .single();

        if (headerErr) throw headerErr;

        const pedido_id = headerData.id;

        // Insert Items
        const itemsPayload = items.map(i => ({
            pedido_id,
            producto_codigo: i.producto_codigo,
            producto_descripcion: i.producto_descripcion,
            cantidad: i.cantidad,
            valor_unitario_ref: i.valor_unitario_ref,
            unidad_ref: i.unidad_ref
        }));

        const { error: itemsErr } = await supabase
            .from('pedidos_b2b_items')
            .insert(itemsPayload);

        if (itemsErr) throw itemsErr;

        return res.json({ success: true, pedido_id });
    } catch(e) {
        console.error("Error al generar pedido B2B:", e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
