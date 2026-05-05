const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');

// Extracción mediante IA (Chofer)
router.post('/extract', facturasController.extractInvoice);

// Proxy para el Visor PDF (Bypass CSP)
router.get('/pdf/:fileId', facturasController.getPdfProxy);

// Guardar validación HITL
router.put('/:id', facturasController.saveHITL);

// Obtener facturas procesadas de un proveedor
router.get('/provider/:providerId', facturasController.getByProvider);

// Obtener detalle de factura
router.get('/:id', facturasController.getById);

// Matchmaking (Conciliación contra Pedido)
router.post('/:id/match', facturasController.matchFactura);

module.exports = router;
