const express = require('express');
const router = express.Router();
const masterTableController = require('../controllers/masterTableController');

// Listar todos los campos del diccionario maestro
router.get('/dictionary', masterTableController.getMasterFields);

// Crear campo nuevo (Validación estricta interna)
router.post('/dictionary', masterTableController.createMasterField);

// Actualizar nombre/tipo
router.put('/dictionary/:id', masterTableController.updateMasterField);

// Apagar/Encender lógicamente ("Zero-Drop")
router.patch('/dictionary/:id/toggle', masterTableController.toggleMasterFieldStatus);

module.exports = router;
