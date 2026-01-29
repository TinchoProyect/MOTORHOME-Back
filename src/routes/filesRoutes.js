const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');

// GET /api/files/list?folderId=...
router.get('/list', filesController.listFiles);

module.exports = router;
