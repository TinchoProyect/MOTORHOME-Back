const express = require('express');
const router = express.Router();
const mappingRuleController = require('../controllers/mappingRuleController');

// Obtener todas las reglas disponibles
router.get('/rules', mappingRuleController.getRules);

// Guardar un pipeline de mapeo (Transaccional)
router.post('/save', mappingRuleController.saveMapping);

// Crear una regla personalizada
router.post('/custom', mappingRuleController.createCustomRule);

// Obtener un pipeline de mapeo para un formato
router.get('/:providerId/:sheetName', mappingRuleController.getMapping);

module.exports = router;
