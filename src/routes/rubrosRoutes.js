const express = require('express');
const router = express.Router();
const rubrosController = require('../controllers/rubrosController');

// Define API Endpoints para Gestor Fundacional de Rubros
router.get('/', rubrosController.getRubros);
router.post('/', rubrosController.createRubro);
router.put('/:id', rubrosController.updateRubro);
router.delete('/:id', rubrosController.deleteRubro);

module.exports = router;
