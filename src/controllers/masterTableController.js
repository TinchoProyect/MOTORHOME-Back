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
        
        // TICKET #014: Todos los atributos del diccionario son comerciales, se exponen todos.
        // Los metadatos de sistema (id, fechas, estado) ya están filtrados al no existir en esta tabla.
        const mappedData = (data || []).map(f => {
            return {
                ...f,
                visible_en_manual: true
            };
        });

        console.log(`[MasterTableController] ✅ Datos obtenidos: ${mappedData.length} campos.`);
        return res.json({ success: true, data: mappedData });

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

// GET /api/master-table/proveedores
async function getProveedores(req, res) {
    try {
        console.log(`[MasterTableController] 🔍 Consultando padrón de proveedores activos...`);
        const { data, error } = await supabase
            .from('proveedores')
            .select('id, cuit, nombre, afip_razon_social')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error) {
            console.error("[MasterTableController] Error DB al obtener proveedores:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // Map para compatibilidad con razon_social
        const mappedData = (data || []).map(p => ({
            ...p,
            razon_social: p.nombre || p.afip_razon_social || 'Proveedor Sin Nombre'
        }));

        return res.json({ success: true, data: mappedData });
    } catch (error) {
        console.error("[MasterTableController] Catch Error getProveedores:", error);
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
    getProveedores,
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
            
            // [VINCULACIÓN ESTRUCTURAL] Cargar diccionario de Rubros Activos
            const { data: rubrosActivos } = await supabase.from('maestro_rubros').select('id, nombre_rubro').eq('es_activo', true);
            const rubrosMap = new Map();
            if (rubrosActivos) {
                rubrosActivos.forEach(r => rubrosMap.set(String(r.nombre_rubro).trim().toLowerCase(), r.id));
            }

            const getFuzzyRubro = (obj) => {
                if (!obj) return null;
                for (let key in obj) {
                    if (String(key).toLowerCase().includes('rubro')) {
                        return obj[key];
                    }
                }
                return null;
            };

            // Motor de Deltas Bi-Dimensional y Upsert: Recuperar estado histórico completo
            const historyMap = new Map();     // Almacena el ID primario de la DB
            const activeDataMap = new Map();  // Almacena la data 'Viva' (No BAJA) para comparar Deltas
            const lockedMap = new Map();      // Almacena rubros fijados manualmente
            
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
                .select('id, datos_maestros, timestamp_extraccion, rubro_id, bloqueo_edicion_manual')
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
                        
                        // Guardar estado de bloqueo semántico
                        if (row.bloqueo_edicion_manual) {
                            lockedMap.set(strCode, row.rubro_id);
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
                 // Inyección de Metadata Cronológico (Efective Date / QA Requirement)
                 record.ultima_actualizacion_origen = timestamp_real;
                 record.Origen_Sistema = 'Proceso Automático';

                 const payload = {
                     proveedor_id,
                     archivo_origen_id: archivo_id,
                     nombre_proveedor: nombre_proveedor || 'Desconocido',
                     datos_maestros: record,
                     es_delta: es_delta,
                     timestamp_extraccion: timestamp_real,
                     rubro_id: null
                 };
                 
                 // [VINCULACIÓN ESTRUCTURAL] Mapear Rubro Name a UUID Relacional (Sólo si NO está bloqueado)
                 if (rawCode && lockedMap.has(rawCode)) {
                     // Conservar el UUID que fijó el Humano, descartar inferencia text de la IA.
                     payload.rubro_id = lockedMap.get(rawCode);
                     // También mantenemos encendido el flag, porque la operación de Postgres UPSERT lo pisaría por omisión (PostgREST omite lo no declarado pero por las dudas).
                     payload.bloqueo_edicion_manual = true;
                     console.log(`[ETL Protector] Respetando bloqueo manual para ${rawCode}`);
                 } else {
                     const nombreRubroDetectado = getFuzzyRubro(record);
                     if (nombreRubroDetectado && typeof nombreRubroDetectado === 'string') {
                         const testClave = nombreRubroDetectado.split('|')[0].trim().toLowerCase(); // Limpiar artifacts textuales del Chofer IA si quedaron
                         if (rubrosMap.has(testClave)) {
                             payload.rubro_id = rubrosMap.get(testClave);
                         }
                     }
                 }
                 
                 // Inyectar el ID existente para forzar UPDATE o uno nuevo (Fallback) para ALTA pura
                 if (rawCode && historyMap.has(rawCode)) {
                     payload.id = historyMap.get(rawCode);
                 } else {
                     payload.id = require('crypto').randomUUID(); // Fallback determinista backend
                 }

                 upserts.push(payload);
            });

            // 2. Inyectar "Ghosts" para el tracking de Bajas (Descontinuados)
            for (const [historicalCode, historicalData] of activeDataMap.entries()) {
                if (!processedCodes.has(historicalCode)) {
                    // El producto existía vivo en T-1 pero no vino en T0. Es una BAJA definitiva forzada por UPDATE.
                    const ghostPayload = { ...historicalData };
                    ghostPayload._estado_delta = 'BAJA';
                    // Conservamos o actualizamos la fecha de vigencia al momento de convertirse en Fantasma
                    ghostPayload.ultima_actualizacion_origen = timestamp_real;
                    
                    const payload = {
                        proveedor_id,
                        archivo_origen_id: archivo_id,
                        nombre_proveedor: nombre_proveedor || 'Desconocido',
                        datos_maestros: ghostPayload,
                        es_delta: true,
                        timestamp_extraccion: timestamp_real,
                        rubro_id: null
                    };
                    
                    // Asegurar que el fantasma también mapee su rubro histórico
                    const nombreRubroFantasma = getFuzzyRubro(ghostPayload);
                    if (nombreRubroFantasma && typeof nombreRubroFantasma === 'string') {
                        const testClaveFuego = nombreRubroFantasma.split('|')[0].trim().toLowerCase();
                        if (rubrosMap.has(testClaveFuego)) {
                            payload.rubro_id = rubrosMap.get(testClaveFuego);
                        }
                    }
                    
                    if (historyMap.has(historicalCode)) {
                        payload.id = historyMap.get(historicalCode);
                    } else {
                        // Edge case preventivo (Si por alguna razón el histórico no estaba en historyMap)
                        payload.id = require('crypto').randomUUID();
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
    bulkUpdateRubro: async (req, res) => {
        try {
            const { itemIds, target_rubro_id } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });

            const supabase = require('../config/supabaseClient');
            const real_rubro_id = target_rubro_id === 'UNASSIGN' ? null : target_rubro_id;
            
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

            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            let writtenPayloads = [];
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) {
                          const k = r.proveedor_id + '_' + String(code).trim().toLowerCase();
                          uMap.set(k, { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), rubro_fijado: real_rubro_id });
                      }
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { 
                     ext.forEach(e => { 
                         const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); 
                         if (uMap.has(k)) { 
                             uMap.get(k).unidad_fijada = e.unidad_fijada; 
                         } 
                     }); 
                 }
                 
                 if (uMap.size > 0) {
                     const payload = Array.from(uMap.values());
                     const { data: upsertData, error: upsertErr } = await supabase.from('curaduria_excepciones').upsert(payload, { onConflict: 'proveedor_id,producto_codigo' }).select();
                     if (upsertErr) throw upsertErr;
                     writtenPayloads = upsertData;
                 }
            }
            return res.json({ success: true, message: "Reasignación aplicada.", count: itemIds.length, upserted: writtenPayloads });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
    bulkUpdateGeneric: async (req, res) => {
        try {
            const { itemIds, target_col, target_val } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });
            if (!target_col) return res.status(400).json({ success: false, error: "Columna destino no especificada." });

            const supabase = require('../config/supabaseClient');
            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, datos_maestros').in('id', itemIds);
            
            if (rows && rows.length > 0) {
                 const payloads = rows.map(r => {
                     const dm = { ...(r.datos_maestros || {}) };
                     if (target_val === 'UNASSIGN') {
                         delete dm[target_col]; // Eliminamos la llave para no dejar strings vacíos si no es necesario
                     } else {
                         dm[target_col] = target_val;
                     }
                     return { id: r.id, datos_maestros: dm };
                 });
                 
                 const { error: upsertErr } = await supabase.from('tabla_maestra_operativa').upsert(payloads);
                 if (upsertErr) throw upsertErr;
            }
            return res.json({ success: true, message: "Actualización genérica aplicada.", count: itemIds.length });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
    bulkUpdateUnidad: async (req, res) => {
        try {
            const { itemIds, target_unidad } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });
            if (target_unidad === undefined) return res.status(400).json({ success: false, error: "Unidad vacía." });

            const supabase = require('../config/supabaseClient');
            
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

            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            let writtenPayloads = [];
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) {
                          const k = r.proveedor_id + '_' + String(code).trim().toLowerCase();
                          uMap.set(k, { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), unidad_fijada: target_unidad });
                      }
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { 
                     ext.forEach(e => { 
                         const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); 
                         if (uMap.has(k)) { 
                             uMap.get(k).rubro_fijado = e.rubro_fijado; 
                         } 
                     }); 
                 }
                 
                 if (uMap.size > 0) {
                     const payload = Array.from(uMap.values());
                     console.log("[QA-AUDIT] UPSERT Payload (Unidades):", JSON.stringify(payload, null, 2));
                     const { data: upsertData, error: upsertErr } = await supabase.from('curaduria_excepciones').upsert(payload, { onConflict: 'proveedor_id,producto_codigo' }).select();
                     if (upsertErr) throw upsertErr;
                     writtenPayloads = upsertData;
                     console.log("[QA-AUDIT] UPSERT Result:", JSON.stringify(writtenPayloads, null, 2));
                 }
            }
            return res.json({ success: true, message: "Unidad aplicada.", count: itemIds.length, upserted: writtenPayloads });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
    revertExtraction: async (req, res) => {
        try {
            const { archivoId } = req.params;
            const supabase = require('../config/supabaseClient');
            
            // Resolve drive file ID to guarantee determinism
            const { data: rawRecord } = await supabase
                .from('proveedor_listas_raw')
                .select('archivo_id')
                .eq('id', archivoId)
                .maybeSingle();

            const driveId = rawRecord && rawRecord.archivo_id ? rawRecord.archivo_id : null;
            let delQuery = supabase.from('tabla_maestra_operativa').delete();
            if (driveId) {
                delQuery = delQuery.or(`archivo_origen_id.eq.${archivoId},archivo_origen_id.eq.${driveId}`);
            } else {
                delQuery = delQuery.eq('archivo_origen_id', archivoId);
            }
            
            const { error } = await delQuery;
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
            
            // [VINCULACIÓN ESTRUCTURAL] Ahora hacemos query incluyendo maestro_rubros y categorias_proveedores
            const { data, error } = await supabase
                .from('tabla_maestra_operativa')
                .select('id, proveedor_id, archivo_origen_id, nombre_proveedor, timestamp_extraccion, datos_maestros, es_delta, rubro_id, bloqueo_edicion_manual, maestro_rubros(id, nombre_rubro), proveedores(categorias_proveedores(nombre))')
                .order('timestamp_extraccion', { ascending: false });
            
            if (error) {
                 if (error.code === '42P01') {
                     return res.json({ success: true, data: [] });
                 }
                 throw error;
            }
            
            // Re-inyección semántica (Transversalidad en FrontEnd)
            // Aseguramos que la llave "Rubro" de datos_maestros tenga el nombre actual desde maestro_rubros

            // [ARQUITECTURA DE CURADURÍA - FUSIÓN EN LECTURA MEMORY MAP O(N)]
            const { data: curaduria, error: curErr } = await supabase.from('curaduria_excepciones').select('*');
            const curMap = new Map();
            if (curaduria && !curErr) {
                 curaduria.forEach(c => curMap.set(c.proveedor_id + '_' + String(c.producto_codigo).trim().toLowerCase(), c));
            }
            
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


            const mappedData = (data || []).map(row => {
                const outRow = { ...row };
                
                const codigoProd = getFuzzyCode(outRow.datos_maestros);
                if (codigoProd) {
                    const cKey = outRow.proveedor_id + '_' + String(codigoProd).trim().toLowerCase();
                    if (curMap.has(cKey)) {
                         const exception = curMap.get(cKey);
                         
                         if (exception.unidad_fijada !== undefined && exception.unidad_fijada !== null) {
                             let foundUnit = false;
                             for (let key in outRow.datos_maestros) {
                                  if (String(key).toLowerCase() === 'unidad') {
                                      outRow.datos_maestros[key] = exception.unidad_fijada;
                                      foundUnit = true;
                                  }
                             }
                             if (!foundUnit) {
                                  outRow.datos_maestros['Unidad'] = exception.unidad_fijada;
                             }
                             outRow.datos_maestros._unidad_fijada = true;
                         }
                         
                         if (exception.rubro_fijado !== undefined && exception.rubro_fijado !== null) {
                             outRow.rubro_id = exception.rubro_fijado;
                             outRow.bloqueo_edicion_manual = true;
                         } else if (exception.rubro_fijado === null && exception.hasOwnProperty('rubro_fijado')) {
                             outRow.rubro_id = null;
                             outRow.bloqueo_edicion_manual = true;
                         }
                    }
                }
    

                // TICKET #015: Inyección de Tipo de Proveedor
                let tipoProveedor = "No Clasificado";
                if (outRow.proveedores && outRow.proveedores.categorias_proveedores && outRow.proveedores.categorias_proveedores.nombre) {
                    tipoProveedor = outRow.proveedores.categorias_proveedores.nombre;
                }
                outRow.datos_maestros['tipo_proveedor'] = tipoProveedor;

                if (outRow.maestro_rubros && outRow.maestro_rubros.nombre_rubro) {
                    // Buscar si existe una key que hable de rubro y usar la Capitalizada si existe
                    let foundKey = "Rubro";
                    for (let key in outRow.datos_maestros) {
                        if (String(key).toLowerCase() === 'rubro') {
                            foundKey = key;
                            break;
                        }
                    }
                    outRow.datos_maestros[foundKey] = outRow.maestro_rubros.nombre_rubro;
                } else if (!outRow.rubro_id && outRow.bloqueo_edicion_manual) {
                    // INCIDENCIA 2: Vaciamiento Manual de Rubro (Falso Positivo silencioso)
                    // Si el operario eligió "Desasignar" (Null), purificamos el JSONB para que AG-Grid reciba el campo vacío
                    // en vez de visualizar el fantasma del texto original inyectado por el CSV
                    for (let key in outRow.datos_maestros) {
                        if (String(key).toLowerCase().includes('rubro') || String(key).toLowerCase() === 'categoría') {
                            outRow.datos_maestros[key] = "";
                        }
                    }
                }
                
                // Cleanup relacional crudo para no contaminar la UI grid
                delete outRow.maestro_rubros;
                return outRow;
            });
            
            return res.json({ success: true, data: mappedData });
        } catch(e) {
            console.error("[MasterTableController] getOperativaRecords error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    // ==========================================
    // V4.1: PRESETS DE FILTROS CASCADA
    // ==========================================
    getPresets: async (req, res) => {
        try {
            console.log(`[MasterTableController] 🔍 Solicitando presets de filtrado...`);
            const { data, error } = await supabase
                .from('master_table_presets')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            console.error("[MasterTableController] getPresets error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    savePreset: async (req, res) => {
        try {
            const { nombre_preset, filter_state } = req.body;
            if (!nombre_preset || !filter_state) {
                return res.status(400).json({ success: false, error: "Parámetros incompletos." });
            }

            console.log(`[MasterTableController] 💾 Guardando nuevo preset: ${nombre_preset}`);
            const { data, error } = await supabase
                .from('master_table_presets')
                .insert([{ nombre_preset, filter_state }])
                .select();

            if (error) throw error;
            return res.json({ success: true, data: data[0] });
        } catch (e) {
            console.error("[MasterTableController] savePreset error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    updatePreset: async (req, res) => {
        try {
            const { id } = req.params;
            const { nombre_preset, filter_state } = req.body;
            
            console.log(`[MasterTableController] ✏️ Actualizando preset: ${id}`);
            
            const payload = {};
            if (nombre_preset) payload.nombre_preset = nombre_preset;
            if (filter_state) payload.filter_state = filter_state;

            const { data, error } = await supabase
                .from('master_table_presets')
                .update(payload)
                .eq('id', id)
                .select();

            if (error) throw error;
            return res.json({ success: true, data: data[0] });
        } catch (e) {
            console.error("[MasterTableController] updatePreset error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    deletePreset: async (req, res) => {
        try {
            const { id } = req.params;
            console.log(`[MasterTableController] 🗑️ Eliminando preset: ${id}`);
            const { error } = await supabase
                .from('master_table_presets')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.json({ success: true });
        } catch (e) {
            console.error("[MasterTableController] deletePreset error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    // ==========================================
    // V6.1: INGRESO MANUAL DE DOBLE VÍA
    // ==========================================
    insertManualRecord: async (req, res) => {
        try {
            const { proveedor_id, nombre_proveedor, datos_maestros } = req.body;
            if (!proveedor_id || !datos_maestros) {
                return res.status(400).json({ success: false, error: "Faltan datos obligatorios." });
            }

            // Ticket #013: Autogeneración Determinista de SKU (Adaptado a Data-Driven)
            let skuActual = datos_maestros["sku"] || datos_maestros["codigo"] || datos_maestros["código"] || "";
            if (!skuActual || skuActual.trim() === "") {
                const crypto = require('crypto');
                const desc = datos_maestros["descripcion"] || datos_maestros["descripción"] || "SINDESCRIPCION";
                // Hash corto (8 caracteres) basado en UUID y Descripción
                const hashInput = `${proveedor_id}-${desc.trim().toLowerCase()}`;
                const hash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 8).toUpperCase();
                
                skuActual = `LMD-MAN-${hash}`;
                // Ahora el frontend debe enviarnos la estructura de llaves normalizada, inyectamos en 'codigo'
                datos_maestros["codigo"] = skuActual;
            }

            // Upsert payload (Token determinista para manual entry)
            const payload = {
                proveedor_id,
                archivo_origen_id: 'MANUAL_ENTRY_V1',
                nombre_proveedor: nombre_proveedor || 'Desconocido (Manual)',
                datos_maestros: {
                    ...datos_maestros,
                    _estado_delta: 'ALTA',
                    _origen: 'Carga Manual'
                },
                es_delta: true,
                timestamp_extraccion: new Date().toISOString()
            };

            if (req.body.id) {
                payload.id = req.body.id;
            } else {
                // TICKET 007: Guardia de Unicidad (Evitar duplicación de SKU)
                // Buscar si existe un artículo de este proveedor con el mismo SKU
                const { data: existingData, error: existError } = await supabase
                    .from('tabla_maestra_operativa')
                    .select('id, datos_maestros')
                    .eq('proveedor_id', proveedor_id);
                
                let foundId = null;
                if (!existError && existingData) {
                    const skuTarget = String(skuActual).trim().toLowerCase();
                    for (const row of existingData) {
                        if (row.datos_maestros) {
                            const dm = row.datos_maestros;
                            const rowSku = String(dm.SKU || dm['Código'] || dm.codigo || "").trim().toLowerCase();
                            if (rowSku === skuTarget && rowSku !== "") {
                                foundId = row.id;
                                break;
                            }
                        }
                    }
                }
                
                if (foundId) {
                    payload.id = foundId;
                } else {
                    payload.id = require('crypto').randomUUID();
                }
            }

            const { data, error } = await supabase.from('tabla_maestra_operativa').upsert([payload]).select().single();
            if (error) throw error;

            return res.json({ success: true, data, message: "Ingreso manual registrado." });
        } catch (e) {
            console.error("[MasterTableController] insertManualRecord error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    },

    deleteManualRecord: async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) return res.status(400).json({ success: false, error: "ID requerido." });

            const { data: record, error: fetchError } = await supabase
                .from('tabla_maestra_operativa')
                .select('archivo_origen_id, datos_maestros')
                .eq('id', id)
                .single();

            if (fetchError || !record) {
                return res.status(404).json({ success: false, error: "Registro no encontrado." });
            }

            // Validar que sea un registro manual
            const isManual = record.archivo_origen_id === 'MANUAL_ENTRY_V1' || 
                            (record.datos_maestros && String(record.datos_maestros._origen || "").toLowerCase().includes("manual"));
            
            if (!isManual) {
                return res.status(403).json({ success: false, error: "Solo se pueden eliminar registros cargados manualmente." });
            }

            const { error: delError } = await supabase
                .from('tabla_maestra_operativa')
                .delete()
                .eq('id', id);

            if (delError) throw delError;

            return res.json({ success: true, message: "Registro manual eliminado." });
        } catch (e) {
            console.error("[MasterTableController] deleteManualRecord error:", e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }
};
