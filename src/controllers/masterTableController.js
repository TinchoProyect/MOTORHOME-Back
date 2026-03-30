const supabase = require('../config/supabaseClient');

// GET /api/master-table/dictionary
async function getMasterFields(req, res) {
    try {
        console.log(`[MasterTableController] 🔍 Solicitando catálogo maestro (diccionario).`);

        const { data, error } = await supabase
            .from('diccionario_campos_maestros')
            .select('*, diccionario_categorias(nombre, orden_visual)')
            // Mantenimiento de legacy (pero las categorias usan orden_visual propio)
            .order('orden', { ascending: true })
            .order('nombre_campo', { ascending: true });

        if (error) {
            console.error("[MasterTableController] Error DB:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log(`[MasterTableController] ✅ Datos obtenidos: ${data ? data.length : 0} campos.`);
        return res.json({ success: true, data: data || [] });

    } catch (error) {
        console.error("[MasterTableController] Catch Error getMasterFields:", error);
        return res.status(500).json({ success: false, error: "Error interno del servidor", details: error.message });
    }
}

// POST /api/master-table/dictionary
async function createMasterField(req, res) {
    try {
        const { nombre_campo, tipo_dato, es_requerido, es_identificador } = req.body;

        // 1. Validación estricta
        if (!nombre_campo || !nombre_campo.trim()) {
            return res.status(400).json({ success: false, error: "El nombre del campo es obligatorio" });
        }

        // Regla 3: Input libre, pero validamos que envíen 'texto' si está vacío.
        const finalTipoDato = (tipo_dato && tipo_dato.trim() !== '') ? tipo_dato.trim() : 'texto';
        const finalName = nombre_campo.trim().toUpperCase(); // Normalizamos siempre a mayúsculas para evitar duplicidades ocultas

        console.log(`[MasterTableController] ➕ Intentando crear: ${finalName} (${finalTipoDato})`);

        const payload = {
            nombre_campo: finalName,
            tipo_dato: req.body.categoria_id ? null : finalTipoDato, // Si mandan UUID, ignoramos el texto legado
            categoria_id: req.body.categoria_id || null, // Nueva relación FK
            es_requerido: es_requerido === true || es_requerido === 'true',
            es_identificador: es_identificador === true || es_identificador === 'true'
        };

        const { data, error } = await supabase
            .from('diccionario_campos_maestros')
            .insert(payload)
            .select()
            .single();

        if (error) {
            // Manegar colisión UNIQUE (23505)
            if (error.code === '23505') {
                console.warn(`[MasterTableController] ⚠️ Colisión de clave única para: ${finalName}`);
                return res.status(409).json({
                    success: false,
                    error: "Ya existe un campo con este nombre en el diccionario maestro (puede estar inactivo)."
                });
            }
            console.error("[MasterTableController] Error insertando en BD:", error);
            return res.status(500).json({ success: false, error: "Error de base de datos", details: error.message });
        }

        console.log(`[MasterTableController] ✅ Campo creado con éxito: ${data.id}`);
        return res.json({ success: true, data });

    } catch (error) {
        console.error("[MasterTableController] Catch Error createMasterField:", error);
        return res.status(500).json({ success: false, error: "Error interno procesando creación" });
    }
}

// PUT /api/master-table/dictionary/:id
async function updateMasterField(req, res) {
    try {
        const { id } = req.params;
        const { nombre_campo, tipo_dato, es_requerido, es_identificador } = req.body;

        if (!id) return res.status(400).json({ success: false, error: "ID de campo requerido" });

        console.log(`[MasterTableController] 📝 Solicitud de actualización para ID: ${id}`);

        const updatePayload = {};
        if (nombre_campo !== undefined && nombre_campo.trim() !== '') {
            updatePayload.nombre_campo = nombre_campo.trim().toUpperCase();
        }
        if (req.body.categoria_id !== undefined) {
            updatePayload.categoria_id = req.body.categoria_id || null;
            // Clean legacy text string on successful FK assignment
            if (req.body.categoria_id) updatePayload.tipo_dato = null;
        } else if (tipo_dato !== undefined) {
            updatePayload.tipo_dato = (tipo_dato.trim() !== '') ? tipo_dato.trim() : 'texto';
        }
        
        if (es_requerido !== undefined) {
            updatePayload.es_requerido = es_requerido === true || es_requerido === 'true';
        }
        if (es_identificador !== undefined) {
            updatePayload.es_identificador = es_identificador === true || es_identificador === 'true';
        }

        // Si el payload está vacío, no hacemos el hit a DB
        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).json({ success: false, error: "No se enviaron datos válidos para actualizar" });
        }

        const { data, error } = await supabase
            .from('diccionario_campos_maestros')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ success: false, error: "El nuevo nombre proporcionado ya está siendo usado por otro campo." });
            }
            return res.status(500).json({ success: false, error: error.message });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: "No se encontró el campo a actualizar." });
        }

        console.log(`[MasterTableController] ✅ Campo actualizado exitosamente`);
        return res.json({ success: true, data });

    } catch (error) {
        console.error("[MasterTableController] Catch Error updating field:", error);
        return res.status(500).json({ success: false, error: "Error interno actualizando campo" });
    }
}

// PATCH /api/master-table/dictionary/:id/toggle
async function toggleMasterFieldStatus(req, res) {
    try {
        const { id } = req.params;
        const { esta_activo } = req.body;

        if (!id || esta_activo === undefined) {
            return res.status(400).json({ success: false, error: "Faltan parámetros requeridos (ID o esta_activo)" });
        }

        const isActivo = esta_activo === true || esta_activo === 'true';
        console.log(`[MasterTableController] 🔄 Alternando estado lógico de ID: ${id} a ${isActivo}`);

        const { data, error } = await supabase
            .from('diccionario_campos_maestros')
            .update({ esta_activo: isActivo })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: "Campo no encontrado" });
        }

        console.log(`[MasterTableController] ✅ Estado cambiado correctamente`);
        return res.json({ success: true, data });

    } catch (error) {
        console.error("[MasterTableController] Catch Error toggling status:", error);
        return res.status(500).json({ success: false, error: "Error interno cambiando estado" });
    }
}

// ==========================================
// V5 CATEGORÍAS (Solapas Dinámicas) CRUD
// ==========================================

// GET /api/master-table/categories
async function getCategories(req, res) {
    try {
        const { data, error } = await supabase
            .from('diccionario_categorias')
            .select('*')
            .order('orden_visual', { ascending: true })
            .order('nombre', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("[MasterTableController] getCategories error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// POST /api/master-table/categories
async function createCategory(req, res) {
    try {
        let { nombre, orden_visual } = req.body;
        if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, error: "Nombre obligatorio" });
        
        nombre = nombre.trim();
        orden_visual = parseInt(orden_visual) || 99;

        const { data, error } = await supabase
            .from('diccionario_categorias')
            .insert({ nombre, orden_visual })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ success: false, error: "Ya existe una solapa con ese nombre." });
            throw error;
        }
        return res.json({ success: true, data });
    } catch (error) {
        console.error("[MasterTableController] createCategory error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// PUT /api/master-table/categories/:id
async function updateCategory(req, res) {
    try {
        const { id } = req.params;
        let { nombre, orden_visual } = req.body;
        
        const payload = {};
        if (nombre && nombre.trim() !== '') payload.nombre = nombre.trim();
        if (orden_visual !== undefined) payload.orden_visual = parseInt(orden_visual) || 99;

        if (Object.keys(payload).length === 0) return res.status(400).json({ success: false, error: "Nada para actualizar" });

        const { data, error } = await supabase
            .from('diccionario_categorias')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ success: false, error: "Ya existe una solapa con ese nombre." });
            throw error;
        }
        if (!data) return res.status(404).json({ success: false, error: "No encontrada" });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// DELETE /api/master-table/categories/:id
async function deleteCategory(req, res) {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('diccionario_categorias')
            .delete()
            .eq('id', id);

        // Supabase Postgres DELETE with ON DELETE SET NULL on the foreign key automatically nullifies the relations.
        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}


module.exports = {
    getMasterFields,
    createMasterField,
    updateMasterField,
    toggleMasterFieldStatus,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
