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

// Borrado Físico (Descartar Registros Basura)
router.delete('/dictionary/:id', masterTableController.deleteMasterField);

// ==========================================
// V5: CRUD DE CATEGORÍAS (Solapas Dinámicas)
// ==========================================
router.get('/categories', masterTableController.getCategories);
router.post('/categories', masterTableController.createCategory);
router.put('/categories/:id', masterTableController.updateCategory);
router.delete('/categories/:id', masterTableController.deleteCategory);

// ==========================================
// V6: EXTRACCIÓN OPERATIVA (Fase 5)
// ==========================================
router.post('/extract', masterTableController.extractToMasterTable);
router.delete('/revert/:archivoId', masterTableController.revertExtraction);
router.get('/operativa', masterTableController.getOperativaRecords);

module.exports = router;
