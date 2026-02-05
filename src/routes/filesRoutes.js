const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');

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

module.exports = router;
