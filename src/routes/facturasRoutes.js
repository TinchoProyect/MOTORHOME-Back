const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');

// Extracción mediante IA (Chofer)
router.post('/extract', facturasController.extractInvoice);

// Proxy para el Visor PDF (Bypass CSP)
router.get('/pdf/:fileId', facturasController.getPdfProxy);

// Guardar validación HITL
router.put('/:id', facturasController.saveHITL);

module.exports = router;
