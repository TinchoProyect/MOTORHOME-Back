const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');

// Extracción mediante IA (Chofer)
router.post('/extract', facturasController.extractInvoice);

// Proxy para el Visor PDF (Bypass CSP)
router.get('/pdf/:fileId', facturasController.getPdfProxy);

// Guardar validación HITL
router.put('/:id', facturasController.saveHITL);

// Eliminar / Deshacer extracción
router.delete('/:id', facturasController.deleteFactura);

// Obtener facturas procesadas de un proveedor
router.get('/provider/:providerId', facturasController.getByProvider);

// Obtener detalle de factura
router.get('/:id', facturasController.getById);

// Matchmaking (Conciliación contra Pedido)
router.post('/:id/match', facturasController.matchFactura);

// Matchmaking Múltiple (Conciliación N:1)
router.post('/match-multi', facturasController.matchFacturasMulti);

// Confirmar Match (Etapa 4 - Cuenta Corriente)
router.post('/:id/confirmar', facturasController.confirmarMatch);

// Confirmar Match Múltiple (Etapa 4 - Cuenta Corriente N:1)
router.post('/confirmar-multi', facturasController.confirmarMatchMulti);

// Revertir Match (Rollback)
router.post('/:id/deshacer-conciliacion', facturasController.deshacerConciliacion);

module.exports = router;
