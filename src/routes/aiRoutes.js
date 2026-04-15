const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Define API Endpoints para Chofer IA
router.get('/health', aiController.healthCheck);
router.post('/generate-etl-rule', aiController.generateRule);
router.post('/refine-rule', aiController.refineRule);
router.post('/discover-entities', aiController.discoverEntities);
router.post('/categorize-rubros', aiController.categorizeRubros);

module.exports = router;
