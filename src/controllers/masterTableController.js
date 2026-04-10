const supabase = require('../config/supabaseClient');

// GET /api/master-table/dictionary
async function getMasterFields(req, res) {
    try {
        console.log(`[MasterTableController] 🔍 Solicitando catálogo maestro (diccionario). query:`, req.query);
        const { activeOnly } = req.query;

        let query = supabase
            .from('diccionario_campos_maestros')
            .select('*, diccionario_categorias(nombre, orden_visual)')
            // Mantenimiento de legacy (pero las categorias usan orden_visual propio)
            .order('orden', { ascending: true })
            .order('nombre_campo', { ascending: true });

        if (activeOnly === 'true') {
            query = query.eq('esta_activo', true);
        }

        const { data, error } = await query;

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

// GET /api/master-table/providers/active-count
async function getActiveProvidersCount(req, res) {
    try {
        console.log(`[MasterTableController] 🔍 Consultando cantidad de proveedores activos...`);
        const { count, error } = await supabase
            .from('proveedores')
            .select('*', { count: 'exact', head: true })
            .eq('activo', true);

        if (error) {
            console.error("[MasterTableController] Error DB:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({ success: true, count: count || 0 });
    } catch (error) {
        console.error("[MasterTableController] Catch Error getActiveProvidersCount:", error);
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

        let resolvedCategoryId = req.body.categoria_id || null;
        
        // [V5 ROBUSTNESS] Si el frontend accidentalmente envía un texto en lugar de un UUID (ej por caché desactualizado)
        if (resolvedCategoryId && !resolvedCategoryId.includes('-')) {
            console.warn(`[MasterTableController] ⚠️ Se recibió el texto "${resolvedCategoryId}" como categoria_id. Intentando resolver UUID dinámicamente...`);
            const { data: catLookup } = await supabase
                .from('diccionario_categorias')
                .select('id')
                .ilike('nombre', resolvedCategoryId)
                .single();
            if (catLookup && catLookup.id) {
                resolvedCategoryId = catLookup.id;
                console.log(`[MasterTableController] ✅ UUID resuelto dinámicamente: ${resolvedCategoryId}`);
            } else {
                console.warn(`[MasterTableController] ❌ Falla resolviendo el nombre. Se omitirá id_categoria para prevenir constraint errors.`);
                resolvedCategoryId = null; // Prevent FK Exception
            }
        }

        const payload = {
            nombre_campo: finalName,
            tipo_dato: finalTipoDato, // Respetamos el string fallback ('texto') para evitar 'null constraint' 
            categoria_id: resolvedCategoryId, // Nueva relación FK corregida/resuelta
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
        
        let resolvedCategoryId = req.body.categoria_id;
        if (resolvedCategoryId && !resolvedCategoryId.includes('-')) {
            console.warn(`[MasterTableController] ⚠️ Actualización con texto libre "${resolvedCategoryId}". Resolviendo UUID...`);
            const { data: catLookup } = await supabase
                .from('diccionario_categorias')
                .select('id')
                .ilike('nombre', resolvedCategoryId)
                .single();
            if (catLookup && catLookup.id) {
                resolvedCategoryId = catLookup.id;
            } else {
                resolvedCategoryId = null;
            }
        }

        if (resolvedCategoryId !== undefined) {
            updatePayload.categoria_id = resolvedCategoryId || null;
            // Ya no forzamos tipo_dato = null para no romper constraints, el engine usa la FK si existe.
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

// DELETE /api/master-table/dictionary/:id
async function deleteMasterField(req, res) {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, error: "ID de campo requerido" });

        console.log(`[MasterTableController] 🗑️ Intentando borrar físicamente el campo ID: ${id}`);

        const { data, error } = await supabase
            .from('diccionario_campos_maestros')
            .delete()
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error("[MasterTableController] Error borrando campo:", error);
            // Si el error es constraint (ej: fk usada), lo atrapamos
            if (error.code === '23503') {
               return res.status(409).json({ success: false, error: "No se puede borrar este campo porque está mapeado en alguna vista guardada." });
            }
            return res.status(500).json({ success: false, error: "Error de BD borrando campo", details: error.message });
        }

        console.log(`[MasterTableController] ✅ Campo borrado con éxito Opcion:`, data);
        return res.json({ success: true, data });

    } catch (error) {
        console.error("[MasterTableController] Catch Error deleteting field:", error);
        return res.status(500).json({ success: false, error: "Error interno en el borrado" });
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
    getActiveProvidersCount,
    createMasterField,
    updateMasterField,
    toggleMasterFieldStatus,
    deleteMasterField,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    extractToMasterTable: async (req, res) => {
        try {
            const { proveedor_id, archivo_id, nombre_proveedor, records, force_overwrite } = req.body;
            
            if (!proveedor_id || !archivo_id || !Array.isArray(records)) {
                return res.status(400).json({ success: false, error: "Parámetros inválidos" });
            }
            
            const supabase = require('../config/supabaseClient');
            
            const { count, error: countErr } = await supabase
                .from('tabla_maestra_operativa')
                .select('*', { count: 'exact', head: true })
                .eq('archivo_origen_id', archivo_id);
                
            if (countErr && countErr.code !== '42P01') throw countErr;
            
            if (count > 0) {
                return res.status(409).json({ success: false, error: "Este archivo ya fue extraído.", needs_overwrite: false });
            }

            // [HOTFIX] Trazabilidad Histórica Determinista: Usar la fecha nativa del documento (fecha_vigencia) o su created_at, NUNCA el Date.now() del servidor.
            let timestamp_real = new Date().toISOString();
            const { data: rawFileMetas } = await supabase
                .from('proveedor_listas_raw')
                .select('fecha_vigencia, created_at')
                .eq('archivo_id', archivo_id)
                .maybeSingle();

            if (rawFileMetas) {
                if (rawFileMetas.fecha_vigencia) {
                    // Para que PostgreSQL lo tome como timestamp valido sumamos hora 00 si viene solo YYYY-MM-DD
                    timestamp_real = rawFileMetas.fecha_vigencia.length <= 10 ? `${rawFileMetas.fecha_vigencia}T00:00:00.000Z` : rawFileMetas.fecha_vigencia;
                } else if (rawFileMetas.created_at) {
                    timestamp_real = rawFileMetas.created_at;
                }
            }

            // Motor de Deltas Bi-Dimensional y Upsert: Recuperar estado histórico completo
            const historyMap = new Map();     // Almacena el ID primario de la DB
            const activeDataMap = new Map();  // Almacena la data 'Viva' (No BAJA) para comparar Deltas
            
            // Funcilla helper para resolver el código (SKU/DNI) independientemente de cómo se llame la columna
            const getFuzzyCode = (obj) => {
                if (!obj) return null;
                if (obj.codigo) return obj.codigo;
                if (obj['código']) return obj['código'];
                for (let key in obj) {
                    const kText = String(key).toLowerCase();
                    if (kText === 'sku' || kText.includes('codigo') || kText.includes('código')) {
                        return obj[key];
                    }
                }
                return null;
            };

            const { data: previousSnapshot, error: snapErr } = await supabase
                .from('tabla_maestra_operativa')
                .select('id, datos_maestros, timestamp_extraccion')
                .eq('proveedor_id', proveedor_id)
                .order('timestamp_extraccion', { ascending: false });
                
            if (!snapErr && previousSnapshot && previousSnapshot.length > 0) {
                for (const row of previousSnapshot) {
                    const code = getFuzzyCode(row.datos_maestros);
                    if (code) {
                        const strCode = String(code).trim();
                        // Almacenamos SIEMPRE el 'id' para sobreescribir ese renglón (incluso si era BAJA antes)
                        if (!historyMap.has(strCode)) {
                            historyMap.set(strCode, row.id);
                        }
                        // Solo usamos para calcular Deltas (Precio anterior) si el producto estaba vivo
                        if (!activeDataMap.has(strCode) && row.datos_maestros._estado_delta !== 'BAJA') {
                            activeDataMap.set(strCode, row.datos_maestros);
                        }
                    }
                }
            }
            
            const processedCodes = new Set();
            const upserts = [];
            const intraBatchCollisions = new Set(); // Para prevenir colisión intra-lote (duplicados en el archivo Excel)

            // 1. Matricular las llegadas reales (Altas, Intactos y Modificados)
            records.forEach(record => {
                 let estado_delta = 'ALTA';
                 let es_delta = true;
                 
                 const foundCodeValue = getFuzzyCode(record);
                 const rawCode = foundCodeValue ? String(foundCodeValue).trim() : null;
                 
                 // [FIX Concurrencia Intra-Lote] Si encontramos duplicados dentro del MISMO archivo, evitamos insertarlos dos veces para que no choquen UUIDs.
                 if (rawCode) {
                     if (intraBatchCollisions.has(rawCode)) return; // Ignorar el duplicado visual del Excel
                     intraBatchCollisions.add(rawCode);
                 }
                 
                 if (rawCode && activeDataMap.has(rawCode)) {
                     processedCodes.add(rawCode);
                     const historicalData = activeDataMap.get(rawCode);
                     const historicalPrice = historicalData.precio;
                     const currentPrice = record.precio;
                     
                     // Si hubo salto algorítmico, marcar como modificado.
                     if (String(historicalPrice).trim() !== String(currentPrice).trim()) {
                         estado_delta = 'MODIFICADO';
                         record._precio_anterior = historicalPrice;
                         es_delta = true;
                     } else {
                         estado_delta = 'INTACTO';
                         es_delta = false;
                     }
                 } else if (rawCode) {
                     // Si es ALTA pero ya existía en historyMap (era BAJA), la revive
                     processedCodes.add(rawCode);
                 }

                 record._estado_delta = estado_delta;

                 const payload = {
                     proveedor_id,
                     archivo_origen_id: archivo_id,
                     nombre_proveedor: nombre_proveedor || 'Desconocido',
                     datos_maestros: record,
                     es_delta: es_delta,
                     timestamp_extraccion: timestamp_real
                 };
                 
                 // Inyectar el ID existente para forzar UPDATE
                 if (rawCode && historyMap.has(rawCode)) {
                     payload.id = historyMap.get(rawCode);
                 }

                 upserts.push(payload);
            });

            // 2. Inyectar "Ghosts" para el tracking de Bajas (Descontinuados)
            for (const [historicalCode, historicalData] of activeDataMap.entries()) {
                if (!processedCodes.has(historicalCode)) {
                    // El producto existía vivo en T-1 pero no vino en T0. Es una BAJA definitiva forzada por UPDATE.
                    const ghostPayload = { ...historicalData };
                    ghostPayload._estado_delta = 'BAJA';
                    
                    const payload = {
                        proveedor_id,
                        archivo_origen_id: archivo_id,
                        nombre_proveedor: nombre_proveedor || 'Desconocido',
                        datos_maestros: ghostPayload,
                        es_delta: true,
                        timestamp_extraccion: timestamp_real
                    };
                    
                    if (historyMap.has(historicalCode)) {
                        payload.id = historyMap.get(historicalCode);
                    }
                    
                    upserts.push(payload);
                }
            }
            
            const { error: insertErr } = await supabase.from('tabla_maestra_operativa').upsert(upserts);
            if (insertErr) {
                 if (insertErr.code === '42P01') {
                     return res.status(500).json({ success: false, error: "Tabla tabla_maestra_operativa no existe. Comuníquese con base de datos." });
                 }
                 throw insertErr;
            }
            
            await supabase.from('proveedor_listas_raw')
                .update({ status_global: 'EXTRAIDO' })
                .eq('id', archivo_id);
            
            return res.json({ success: true, message: "Extracción exitosa." });
        } catch(e) {
            console.error("[MasterTableController] extractToMasterTable error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },
    revertExtraction: async (req, res) => {
        try {
            const { archivoId } = req.params;
            const supabase = require('../config/supabaseClient');
            const { error } = await supabase.from('tabla_maestra_operativa').delete().eq('archivo_origen_id', archivoId);
            if (error && error.code !== '42P01') throw error;
            
            await supabase.from('proveedor_listas_raw')
                .update({ status_global: 'CONFIRMED' })
                .eq('id', archivoId);
                
            return res.json({ success: true, message: "Extracción revertida con éxito." });
        } catch(e) {
            console.error("[MasterTableController] revertExtraction error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },
    getOperativaRecords: async (req, res) => {
        try {
            const supabase = require('../config/supabaseClient');
            const { data, error } = await supabase
                .from('tabla_maestra_operativa')
                .select('id, proveedor_id, archivo_origen_id, nombre_proveedor, timestamp_extraccion, datos_maestros, es_delta')
                .order('timestamp_extraccion', { ascending: false });
            
            if (error) {
                 if (error.code === '42P01') {
                     return res.json({ success: true, data: [] });
                 }
                 throw error;
            }
            
            return res.json({ success: true, data: data || [] });
        } catch(e) {
            console.error("[MasterTableController] getOperativaRecords error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }
};
