require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5655;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// DEBUG MIDDLEWARE
app.use((req, res, next) => {
    console.log(`[SERVER] Request received: ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/files', require('./routes/filesRoutes'));
app.use('/api/master-table', require('./routes/masterTableRoutes'));
app.use('/api/mapping', require('./routes/mappingRuleRoutes'));
app.use('/api/flujos', require('./routes/flujosRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/rubros', require('./routes/rubrosRoutes'));
app.use('/api/b2b', require('./routes/b2bRoutes'));
app.use('/api/pdf-templates', require('./routes/pdfTemplateRoutes'));
app.use('/api/arca', require('./routes/arcaRoutes'));
app.use('/api/recepcion', require('./routes/recepcionRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/facturas', require('./routes/facturasRoutes'));
app.use('/api/cuenta-corriente', require('./routes/cuentaCorrienteRoutes'));
app.use('/api/bancos', require('./routes/bancosRoutes'));
app.use('/api/config', require('./routes/configRoutes'));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', project: 'Sistema Gestion Proveedores 2.0', mode: 'Architected' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Backend 2.0 corriendo en http://localhost:${PORT}`);
    console.log(`   - Modo: ${process.env.NODE_ENV || 'Development'}`);
});
