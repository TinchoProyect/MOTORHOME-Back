const express = require('express');
const router = express.Router();
const bancosController = require('../controllers/bancosController');

// Listar archivos de la carpeta de bancos
router.get('/list-files', bancosController.listarExtractos);

// Ingesta de archivo Excel de Bancos (Etapa 4)
router.post('/ingestar/:fileId', bancosController.ingestarExtracto);

// Listar movimientos (con filtro opcional de archivo)
router.get('/movimientos', bancosController.getMovimientos);

// Vincular/Ignorar un movimiento
router.patch('/movimientos/:hashId/vincular', bancosController.vincularMovimiento);

module.exports = router;
