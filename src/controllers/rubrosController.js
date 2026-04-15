const { createClient } = require('@supabase/supabase-js');

// Init Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const rubrosController = {
    /**
     * Endpoint: GET /api/rubros
     * Descripción: Obtiene todo el Cuaderno Maestro de Rubros Activos.
     */
    getRubros: async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('maestro_rubros')
                .select('*')
                .eq('es_activo', true)
                .order('nombre_rubro', { ascending: true });

            if (error) {
                // Tolerancia a falla (si el script SQL no fue corrido an)
                if (error.code === '42P01') {
                    console.warn("[Rubros Controller] Tabla maestro_rubros no existe an. Devolviendo vaco.");
                    return res.status(200).json({ success: true, count: 0, data: [] });
                }
                throw error;
            }

            res.status(200).json({
                success: true,
                count: data.length,
                data: data
            });
        } catch (error) {
            console.error('[Rubros Controller] GET Error:', error.message);
            res.status(500).json({ success: false, error: 'Error fetching Maestro Rubros' });
        }
    },

    /**
     * Endpoint: POST /api/rubros
     * Descripción: Crea un nuevo rubro en el Cuaderno Maestro.
     */
    createRubro: async (req, res) => {
        try {
            const { nombre_rubro, descripcion_narrativa } = req.body;
            if (!nombre_rubro || !descripcion_narrativa) {
                return res.status(400).json({ success: false, error: "Missing required fields" });
            }

            const { data, error } = await supabase
                .from('maestro_rubros')
                .insert([{ 
                    nombre_rubro: String(nombre_rubro).toUpperCase().trim(), 
                    descripcion_narrativa: String(descripcion_narrativa).trim() 
                }])
                .select();

            if (error) {
                if (error.code === '23505') {
                    return res.status(409).json({ success: false, error: "El Rubro ya existe" });
                }
                throw error;
            }

            res.status(201).json({
                success: true,
                data: data[0]
            });
        } catch (error) {
            console.error('[Rubros Controller] POST Error:', error.message);
            res.status(500).json({ success: false, error: 'Error creating Rubro Maestro' });
        }
    },

    /**
     * Endpoint: PUT /api/rubros/:id
     * Descripción: Actualiza la narrativa descriptiva de un rubro existente.
     */
    updateRubro: async (req, res) => {
        try {
            const { id } = req.params;
            const { descripcion_narrativa, nombre_rubro } = req.body;

            const updates = { updated_at: new Date() };
            if (descripcion_narrativa !== undefined) updates.descripcion_narrativa = String(descripcion_narrativa).trim();
            if (nombre_rubro !== undefined) updates.nombre_rubro = String(nombre_rubro).toUpperCase().trim();

            const { data, error } = await supabase
                .from('maestro_rubros')
                .update(updates)
                .eq('id', id)
                .select();

            if (error) throw error;

            res.status(200).json({ success: true, data: data[0] });
        } catch (error) {
            console.error('[Rubros Controller] PUT Error:', error.message);
            res.status(500).json({ success: false, error: 'Error updating Rubro Maestro' });
        }
    },

    /**
     * Endpoint: DELETE /api/rubros/:id
     * Descripción: Da de baja (Soft Delete) a un rubro maestro.
     */
    deleteRubro: async (req, res) => {
        try {
            const { id } = req.params;
            
            const { error } = await supabase
                .from('maestro_rubros')
                .update({ es_activo: false, updated_at: new Date() })
                .eq('id', id);

            if (error) throw error;

            res.status(200).json({ success: true, message: "Rubro eliminado (soft delete)" });
        } catch (error) {
            console.error('[Rubros Controller] DELETE Error:', error.message);
            res.status(500).json({ success: false, error: 'Error deleting Rubro Maestro' });
        }
    }
};

module.exports = rubrosController;
