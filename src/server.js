require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5655;

// Middleware
app.use(cors());
app.use(express.json());

// DEBUG MIDDLEWARE
app.use((req, res, next) => {
    console.log(`[SERVER] Request received: ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/files', require('./routes/filesRoutes'));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', project: 'Sistema Gestion Proveedores 2.0', mode: 'Architected' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Backend 2.0 corriendo en http://localhost:${PORT}`);
    console.log(`   - Modo: ${process.env.NODE_ENV || 'Development'}`);
});
