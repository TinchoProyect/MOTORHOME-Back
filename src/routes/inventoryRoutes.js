const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// GET: Obtener stock consolidado
router.get('/stock', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vw_inventario_consolidado')
            .select('*')
            .order('sku', { ascending: true });

        if (error) throw error;
        
        res.json({ success: true, data });
    } catch (err) {
        console.error('[INVENTORY] Error al listar stock:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
