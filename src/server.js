require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5656;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/files', require('./routes/filesRoutes'));
app.get('/api/dictionary', require('./controllers/filesController').getDictionaryTerms);
app.post('/api/dictionary', require('./controllers/filesController').createDictionaryTerm);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', project: 'Sistema Gestion Proveedores 2.0', mode: 'Architected' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Backend 2.0 corriendo en http://localhost:${PORT}`);
    console.log(`   - Modo: ${process.env.NODE_ENV || 'Development'}`);
});
