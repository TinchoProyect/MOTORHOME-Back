const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

router.post('/generar', async (req, res) => {
    try {
        const { proveedor_id, tipo_documento, items, fecha_recepcion_estimada } = req.body;
        if (!proveedor_id || !items || items.length === 0) {
            return res.status(400).json({ error: "Faltan datos requeridos." });
        }

        // Insert Cabecera
        const { data: headerData, error: headerErr } = await supabase
            .from('pedidos_b2b_cabecera')
            .insert([{ 
                proveedor_id, 
                tipo_documento, 
                estado: 'Emitido',
                fecha_recepcion_estimada: fecha_recepcion_estimada || null 
            }])
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

// GET /api/b2b/pedidos/count
router.get('/pedidos/count', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pedidos_b2b_cabecera')
            .select('proveedor_id, fecha_recepcion_estimada');

        if (error) throw error;
        
        let uniqueGroups = new Set();
        if (data) {
            data.forEach(x => {
                uniqueGroups.add(`${x.proveedor_id}_${x.fecha_recepcion_estimada}`);
            });
        }
        
        return res.json({ success: true, count: uniqueGroups.size });
    } catch(e) {
        console.error("Error al obtener conteo de entregas B2B:", e);
        return res.status(500).json({ error: e.message });
    }
});

// GET /api/b2b/pedidos
router.get('/pedidos', async (req, res) => {
    try {
        // Obtenemos cabecera + items anidados + nombre del proveedor
        const { data, error } = await supabase
            .from('pedidos_b2b_cabecera')
            .select(`
                id,
                created_at,
                proveedor_id,
                tipo_documento,
                estado,
                fecha_recepcion_estimada,
                proveedores:proveedor_id ( nombre ),
                pedidos_b2b_items (
                    id,
                    producto_codigo,
                    producto_descripcion,
                    cantidad,
                    valor_unitario_ref,
                    unidad_ref
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        return res.json({ success: true, pedidos: data || [] });
    } catch(e) {
        console.error("Error al obtener pedidos activos B2B:", e);
        return res.status(500).json({ error: e.message });
    }
});

// DELETE /api/b2b/pedidos/purga
router.post('/pedidos/purga', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "No se enviaron IDs válidos para purgar." });
        }

        // El borrado en cabecera purga los items en cascada (Foreign Key ON DELETE CASCADE configurada en la BD)
        const { error } = await supabase
            .from('pedidos_b2b_cabecera')
            .delete()
            .in('id', ids);

        if (error) throw error;

        return res.json({ success: true, message: `Se marginaron ${ids.length} registros exitosamente.` });
    } catch(e) {
        console.error("Error al purgar pedidos B2B:", e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
