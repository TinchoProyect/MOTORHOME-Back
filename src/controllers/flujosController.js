const supabase = require('../config/supabaseClient');

/**
 * [Flujos Controller]
 * Gestión de plantillas del Universal Viewer.
 */
const flujosController = {};

/**
 * GET /api/flujos/:proveedorId
 * Lista los flujos asociados a un proveedor. Ideal para cargar selectores en UI.
 */
flujosController.listarPorProveedor = async (req, res) => {
    try {
        const { proveedorId } = req.params;
        if (!proveedorId) return res.status(400).json({ error: "Falta proveedorId" });

        const { data, error } = await supabase
            .from('flujos_extraccion')
            .select('id_flujo, proveedor_id, nombre_flujo, fecha_actualizacion, activo')
            .eq('proveedor_id', proveedorId)
            .eq('activo', true)
            .order('fecha_actualizacion', { ascending: false });

        if (error) throw error;
        
        return res.json(data || []);
    } catch (err) {
        console.error("🛑 [API Flujos] Error listando flujos:", err.message);
        return res.status(500).json({ error: "Error interno del servidor", detalle: err.message });
    }
};

/**
 * GET /api/flujos/detalle/:idFlujo
 * Recupera el config_payload completo para rehidratar el Visor Universal.
 */
flujosController.obtenerDetalle = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        if (!idFlujo) return res.status(400).json({ error: "Falta idFlujo" });

        const { data, error } = await supabase
            .from('flujos_extraccion')
            .select('id_flujo, proveedor_id, nombre_flujo, config_payload')
            .eq('id_flujo', idFlujo)
            .single();

        if (error) throw error;
        
        return res.json(data);
    } catch (err) {
        console.error("🛑 [API Flujos] Error obteniendo detalle de flujo:", err.message);
        return res.status(500).json({ error: "Error al recuperar flujo", detalle: err.message });
    }
};

/**
 * POST /api/flujos
 * Crea un flujo nuevo o actualiza uno existente (si se envía id_flujo).
 */
flujosController.upsertFlujo = async (req, res) => {
    try {
        const { id_flujo, proveedor_id, nombre_flujo, config_payload } = req.body;
        
        if (!proveedor_id || !nombre_flujo || !config_payload) {
            return res.status(400).json({ error: "Data incompleta. Requiere proveedor, nombre y payload." });
        }

        let payload = {
            proveedor_id,
            nombre_flujo,
            config_payload,
            fecha_actualizacion: new Date().toISOString()
        };

        let resultData, resultError;

        if (id_flujo) {
            // Actualización
            const { data, error } = await supabase
                .from('flujos_extraccion')
                .update(payload)
                .eq('id_flujo', id_flujo)
                .select()
                .single();
            resultData = data;
            resultError = error;
        } else {
            // Inserción
            const { data, error } = await supabase
                .from('flujos_extraccion')
                .insert([payload])
                .select()
                .single();
            resultData = data;
            resultError = error;
        }

        if (resultError) throw resultError;

        return res.json({ success: true, flujo: resultData });
    } catch (err) {
        console.error("🛑 [API Flujos] Error en Upsert Flujo:", err.message);
        return res.status(500).json({ error: "Error al guardar el flujo", detalle: err.message });
    }
};

/**
 * DELETE /api/flujos/:idFlujo
 * Realiza un borrado (lógico)
 */
flujosController.eliminar = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        const { error } = await supabase
            .from('flujos_extraccion')
            .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
            .eq('id_flujo', idFlujo);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        console.error("🛑 [API Flujos] Error borrando flujo:", err.message);
        return res.status(500).json({ error: "Error al eliminar flujo", detalle: err.message });
    }
};

module.exports = flujosController;
