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

/**
 * PATCH /api/flujos/:idFlujo/nombre
 * Renombra un flujo operativo desde la vista procesados
 */
flujosController.renombrar = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        const { nombre_flujo } = req.body;
        
        if (!nombre_flujo || !nombre_flujo.trim()) return res.status(400).json({ error: "Falta nuevo nombre." });

        const { error } = await supabase
            .from('flujos_extraccion')
            .update({ nombre_flujo: nombre_flujo.trim(), fecha_actualizacion: new Date().toISOString() })
            .eq('id_flujo', idFlujo);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        console.error("🛑 [API Flujos] Error renombrando flujo:", err.message);
        return res.status(500).json({ error: "Error al renombrar flujo", detalle: err.message });
    }
};

/**
 * GET /api/flujos/linked-status/:idFlujo
 * Verifica si este flujo ya fue utilizado para ingestar archivos procesados.
 */
flujosController.checkLinkedStatus = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        if (!idFlujo) return res.status(400).json({ error: "Falta idFlujo" });

        const { excludeFileId } = req.query;

        // Buscamos si existe alguna Lista Raw que asigne este flujo y su status sea de archivo finalizado/procesado
        let query = supabase
            .from('proveedor_listas_raw')
            .select('nombre_archivo', { count: 'exact' })
            .eq('flujo_asignado_id', idFlujo)
            .in('status_global', ['EXTRAIDO', 'CONFIRMED']);

        if (excludeFileId && excludeFileId !== 'null' && excludeFileId !== 'undefined') {
            query = query.neq('id', excludeFileId);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        // Recuperamos también el nombre del flujo para la UI (opcional)
        const { data: flujoData } = await supabase
            .from('flujos_extraccion')
            .select('nombre_flujo')
            .eq('id_flujo', idFlujo)
            .single();

        return res.json({
            success: true,
            isLinked: (count > 0),
            fileCount: count,
            flujo_name: flujoData ? flujoData.nombre_flujo : "Plantilla Activa",
            linkedFiles: data.map(d => d.nombre_archivo)
        });
    } catch (err) {
        console.error("🛑 [API Flujos] Error chequeando estado vinculado:", err.message);
        return res.status(500).json({ error: "Error de servidor", detalle: err.message });
    }
};

/**
 * POST /api/flujos/fork-local/:idFlujo
 * Clona el flujo base y lo asigna exclusivamente al archivo indicado (Bifurcación Silenciosa).
 */
flujosController.forkLocal = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        const { fileId } = req.body;
        
        if (!idFlujo || !fileId) return res.status(400).json({ error: "Faltan idFlujo o fileId" });

        // 1. Obtener flujo base
        const { data: flujoBase, error: errBase } = await supabase
            .from('flujos_extraccion')
            .select('*')
            .eq('id_flujo', idFlujo)
            .single();

        if (errBase) throw errBase;

        // 2. Crear clon (Variante Local)
        const nuevoNombre = `${flujoBase.nombre_flujo} (Local)`;
        const newFlowPayload = {
            proveedor_id: flujoBase.proveedor_id,
            nombre_flujo: nuevoNombre,
            config_payload: flujoBase.config_payload,
            activo: true
        };

        const { data: newFlujo, error: errCreate } = await supabase
            .from('flujos_extraccion')
            .insert([newFlowPayload])
            .select()
            .single();

        if (errCreate) throw errCreate;

        // 3. Re-Vincular fisicamente al fileId actual
        const { error: errLink } = await supabase
            .from('proveedor_listas_raw')
            .update({ flujo_asignado_id: newFlujo.id_flujo })
            .eq('id', fileId);

        if (errLink) throw errLink;

        console.log(`✅ [API Flujos] Bifurcación Local generada exitosamente. Nuevo Flujo: ${newFlujo.id_flujo} > File: ${fileId}`);
        return res.json({ success: true, newFlujoId: newFlujo.id_flujo, newFlujoName: newFlujo.nombre_flujo });
    } catch (err) {
        console.error("🛑 [API Flujos] Error forking local:", err.message);
        return res.status(500).json({ error: "Error al bifurcar localmente", detalle: err.message });
    }
};

/**
 * POST /api/flujos/unlink-history/:idFlujo
 * Rompe el vínculo de todos los archivos históricos con esta plantilla (Sobreescritura destructiva).
 */
flujosController.unlinkHistory = async (req, res) => {
    try {
        const { idFlujo } = req.params;
        if (!idFlujo) return res.status(400).json({ error: "Falta idFlujo" });

        // Hacemos que todos los históricos que miraban este ID se independicen (null)
        const { data, error } = await supabase
            .from('proveedor_listas_raw')
            .update({ flujo_asignado_id: null })
            .eq('flujo_asignado_id', idFlujo)
            .in('status_global', ['EXTRAIDO', 'CONFIRMED']);

        if (error) throw error;

        console.log(`✅ [API Flujos] Vínculos históricos erradicados para ID Flujo: ${idFlujo}`);
        return res.json({ success: true });
    } catch (err) {
        console.error("🛑 [API Flujos] Error ejecutando unlink histórico:", err.message);
        return res.status(500).json({ error: "Error de base de datos", detalle: err.message });
    }
};

module.exports = flujosController;
