const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Define API Endpoints para Chofer IA
router.get('/health', aiController.healthCheck);
router.post('/generate-etl-rule', aiController.generateRule);
router.post('/refine-rule', aiController.refineRule);
router.post('/discover-entities', aiController.discoverEntities);
router.post('/categorize-rubros', aiController.categorizeRubros);

// Librería de Prompts Contextual (Chofer IA History)
router.get('/prompts/:masterFieldId', aiController.getPromptLibrary);
router.post('/prompts', aiController.savePromptToLibrary);
router.put('/prompts', aiController.editPromptInLibrary);
router.delete('/prompts', aiController.deletePromptFromLibrary);
// Endpoint para Ingesta OCR de Listas de Precios
router.post('/ocr-prices', aiController.executeOcrPrices);

module.exports = router;
