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

// ==========================================
// V5: CRUD DE CATEGORÍAS (Solapas Dinámicas)
// ==========================================
router.get('/categories', masterTableController.getCategories);
router.post('/categories', masterTableController.createCategory);
router.put('/categories/:id', masterTableController.updateCategory);
router.delete('/categories/:id', masterTableController.deleteCategory);

module.exports = router;
