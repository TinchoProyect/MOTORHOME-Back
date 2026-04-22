const express = require('express');
const router = express.Router();
const arcaService = require('../services/arcaService');

router.get('/padron/:cuit', async (req, res) => {
    try {
        const cuitStr = req.params.cuit.replace(/[^0-9]/g, '');
        if (cuitStr.length !== 11) {
            return res.status(400).json({ success: false, error: 'Formato de CUIT inválido. Debe tener 11 dígitos.' });
        }
        
        const numericCuit = parseInt(cuitStr);
        const result = await arcaService.getProveedorData(numericCuit);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('[Route Error] /api/arca/padron/:cuit ->', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor procesando la solicitud a ARCA.' });
    }
});

module.exports = router;
