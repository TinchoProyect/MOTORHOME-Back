const express = require('express');
const router = express.Router();
const flujosController = require('../controllers/flujosController');

// Listar flujos operativos (Procesados Landing)
router.get('/:proveedorId', flujosController.listarPorProveedor);

// Descargar Snapshot completo para Universal Viewer
router.get('/detalle/:idFlujo', flujosController.obtenerDetalle);

// Controladores de Integridad de Dependencias (Bifurcación / Unlink)
router.get('/linked-status/:idFlujo', flujosController.checkLinkedStatus);
router.post('/unlink-history/:idFlujo', flujosController.unlinkHistory);
router.post('/fork-local/:idFlujo', flujosController.forkLocal);

// Crear o Actualizar un Flujo (Botón "Guardar Flujo")
router.post('/', flujosController.upsertFlujo);

// Renombrar Flujo (Dashboard Operativo)
router.patch('/:idFlujo/nombre', flujosController.renombrar);

// Borrado lógico (Dashboard Administrativo)
router.delete('/:idFlujo', flujosController.eliminar);

module.exports = router;
