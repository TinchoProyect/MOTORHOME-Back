const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');
const multer = require('multer');

// Memory storage for Drive streaming (avoids local disk I/O)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// POST /api/files/upload (Direct Drive Upload)
router.post('/upload', upload.single('file'), filesController.uploadDirectFile);

// GET /api/files/list?folderId=...
router.get('/list', filesController.listFiles);

// GET /api/files/download/:fileId (Viewer)
router.get('/download/:fileId', filesController.downloadFile);

// POST /api/files/extract
console.log("[FilesRoutes] Registering /extract. Handler type:", typeof filesController.processExtraction);
router.post('/extract', filesController.processExtraction);

// POST /api/files/confirm
router.post('/confirm', filesController.confirmExtraction);

// GET /api/files/dictionary
router.get('/dictionary', filesController.getDictionaryTerms);

// POST /api/files/dictionary
router.post('/dictionary', filesController.createDictionaryTerm);

// POST /api/files/dictionary/update (Admin)
router.post('/dictionary/update', filesController.updateDictionaryTerm);

// DELETE /api/files/dictionary/:id (Admin)
router.delete('/dictionary/:id', filesController.deleteDictionaryTerm);

// POST /api/files/drive/provision-vendor
router.post('/drive/provision-vendor', filesController.provisionVendorFolders);

// [PHASE 5] Processed Files
router.get('/processed-list', filesController.listProcessedFiles);
router.get('/processed-content/:rawListId', filesController.getProcessedFileContent);
router.patch('/processed/:id/flujo', filesController.assignFlujoToFile);

// [PHASE 5] Rollback / Delete
router.post('/rollback', filesController.rollbackFiles);

// [PERSISTENCE] Save Simulation Config (Template)
router.post('/save-template', filesController.saveTemplateConfig);

// [PERSISTENCE] Get Simulation Config (Template)
router.get('/get-template', filesController.getTemplateConfig);

// [PERSISTENCE] Delete Simulation Config (Reset)
router.delete('/template', filesController.deleteTemplateConfig);

module.exports = router;