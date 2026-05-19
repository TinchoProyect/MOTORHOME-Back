const express = require('express');
const router = express.Router();
const chequesController = require('../controllers/chequesController');

router.get('/disponibles', chequesController.getDisponibles);
router.get('/todos', chequesController.getTodos);
router.get('/config', chequesController.getConfig);
router.post('/ingestar', chequesController.ingestarDrive);
router.patch('/:id/endosar', chequesController.endosar);
router.patch('/:id/acreditar', chequesController.acreditar);
router.patch('/:id/rechazar', chequesController.rechazar);

module.exports = router;
