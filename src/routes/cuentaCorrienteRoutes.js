const express = require('express');
const router = express.Router();
const ccController = require('../controllers/cuentaCorrienteController');

router.get('/proveedor/:providerId', ccController.getByProvider);

module.exports = router;
