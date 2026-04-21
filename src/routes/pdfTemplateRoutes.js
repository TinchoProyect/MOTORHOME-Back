const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// GET /api/pdf-templates/:providerId
// Obtiene todas las plantillas para un proveedor, ordenadas por is_default DESC y fecha
router.get('/:providerId', async (req, res) => {
    try {
        const { providerId } = req.params;
        if (!providerId) return res.status(400).json({ error: 'Falta providerId' });

        const { data, error } = await supabase
            .from('pdf_templates')
            .select('*')
            .eq('provider_id', providerId)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('[pdfTemplateRoutes] GET Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pdf-templates
// Crea o actualiza (Upsert basado en constraint provider_id + template_name)
router.post('/', async (req, res) => {
    try {
        const { provider_id, template_name, threshold_y, threshold_x_merge, col_tolerance, is_default, omitted_columns } = req.body;
        
        if (!provider_id || !template_name) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        // Si este se marca como default, desmarcar los otros
        if (is_default) {
            await supabase
                .from('pdf_templates')
                .update({ is_default: false })
                .eq('provider_id', provider_id);
        }

        // Upsert
        const { data, error } = await supabase
            .from('pdf_templates')
            .upsert({
                provider_id,
                template_name,
                threshold_y: parseInt(threshold_y) || 6,
                threshold_x_merge: parseInt(threshold_x_merge) || 8,
                col_tolerance: parseInt(col_tolerance) || 15,
                is_default: !!is_default,
                omitted_columns: Array.isArray(omitted_columns) ? omitted_columns : [], // [Ticket #010]
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'provider_id, template_name' // [Ticket #012] Corregido: Nombres de columnas en lugar de constraint
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('[pdfTemplateRoutes] POST Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/pdf-templates/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('pdf_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[pdfTemplateRoutes] DELETE Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
