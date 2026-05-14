const express = require('express');
const router = express.Router();
const ccController = require('../controllers/cuentaCorrienteController');

router.get('/global-deuda', ccController.getGlobalDeuda);
router.get('/proveedor/:providerId', ccController.getByProvider);
router.patch('/:id/omitir', ccController.toggleOmitir);
router.post('/efectivo', ccController.registrarPagoEfectivo);

module.exports = router;
