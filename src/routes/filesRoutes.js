const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');

// GET /api/files/list?folderId=...
router.get('/list', filesController.listFiles);

// POST /api/files/extraction/process
// Body: { fileId, providerId, fileName }
router.post('/extraction/process', filesController.processExtraction);

// POST /api/files/extraction/confirm
// Body: { fileId, providerId, mapping, headers }
router.post('/extraction/confirm', filesController.confirmExtraction);

module.exports = router;
