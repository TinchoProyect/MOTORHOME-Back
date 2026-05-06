const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Obtener todas las configuraciones globales
router.get('/', configController.getConfig);

// Actualizar una configuración global
router.patch('/', configController.updateConfig);

// Provisionar carpeta de bancos global
router.post('/provision-bancos-folder', configController.provisionBancosFolder);

module.exports = router;
