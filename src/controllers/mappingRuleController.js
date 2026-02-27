const supabase = require('../config/supabaseClient');

// 1. OBTENER REGLAS DISPONIBLES (Catálogo)
exports.getRules = async (req, res) => {
    try {
        const { providerId, sheetName } = req.query;
        let formatoId = null;

        // Intentar resolver formato_id si envían context actual
        if (providerId && sheetName) {
            const hojaBusqueda = sheetName || 'Sheet1';
            const { data: formato } = await supabase
                .from('proveedor_formatos_guia')
                .select('id')
                .eq('proveedor_id', providerId)
                .eq('hoja_excel', hojaBusqueda)
                .maybeSingle();

            if (formato) {
                formatoId = formato.id;
            }
        }

        let query = supabase.from('reglas_limpieza').select('*');

        if (formatoId) {
            query = query.or(`es_global.eq.true,formato_id.eq.${formatoId}`);
        } else {
            query = query.eq('es_global', true);
        }

        const { data, error } = await query.order('creado_en', { ascending: true });

        if (error) throw error;

        return res.status(200).json(data || []);
    } catch (error) {
        console.error("❌ [ETL] Error obteniendo reglas:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 2. GUARDAR PIPELINE DE MAPEO (Transaccional simulado)
exports.saveMapping = async (req, res) => {
    try {
        console.log("🛑 [BACKEND VIGÍA SAVE] Payload recibido:\n", JSON.stringify(req.body, null, 2));

        const { proveedor_id, nombre_hoja, mapeos } = req.body;

        if (!proveedor_id) {
            return res.status(400).json({ error: "Falta proveedor_id requerido para guardar configuración ETL." });
        }

        // Buscar Formato Guía (El puente principal del archivo)
        const hojaBusqueda = nombre_hoja || 'Sheet1';
        let { data: formato, error: formatoError } = await supabase
            .from('proveedor_formatos_guia')
            .select('id, hoja_excel')
            .eq('proveedor_id', proveedor_id)
            .eq('hoja_excel', hojaBusqueda)
            .maybeSingle();

        if (formatoError && formatoError.code !== 'PGRST116') {
            console.error("🛑 [BACKEND FATAL] Error en Supabase buscando formato:", formatoError);
            throw formatoError;
        }

        if (!formato) {
            // Si el formato no existe para esta hoja, hay un problema en V2 donde el ingest ya debió haberlo creado.
            // Para robustez, retornamos error claro.
            console.warn(`[ETL] Cuidado: No se encontró formato base para el proveedor ${proveedor_id} en hoja ${hojaBusqueda}. Insertando on-the-fly.`);
            const { data: newFormato, error: insertError } = await supabase
                .from('proveedor_formatos_guia')
                .insert({
                    proveedor_id: proveedor_id,
                    hoja_excel: hojaBusqueda,
                    nombre_formato: `Formato Híbrido - ${hojaBusqueda}`
                })
                .select('id')
                .single();

            if (insertError) {
                console.error("🛑 [BACKEND FATAL] Error en Supabase creando formato on-the-fly:", insertError);
                throw insertError;
            }
            formato = newFormato;
        }

        const formatoId = formato.id;

        // VACIADO PREVIO CASCADA: Al borrar el mapeo de columnas, la Foreign Key ON DELETE CASCADE
        // se encarga de borrar también los registros en mapeo_reglas_aplicadas
        const { error: deleteError } = await supabase
            .from('mapeo_columnas')
            .delete()
            .eq('formato_id', formatoId);

        if (deleteError) {
            console.error("🛑 [BACKEND FATAL] Error en Supabase eliminando mapeos previos en cascada:", deleteError);
            throw deleteError;
        }

        if (!mapeos || mapeos.length === 0) {
            return res.status(200).json({ status: 'cleared', message: "Se ha limpiado el pipeline de esa hoja." });
        }

        // INSERT MASIVO: Mapeo Columnas
        for (const m of mapeos) {
            // Insertar PUENTE Mapeo (Retorna ID para asociar reglas)
            let mapeoId = null;

            const { data: mapeoRow, error: mapErr } = await supabase
                .from('mapeo_columnas')
                .insert({
                    formato_id: formatoId,
                    campo_maestro_id: m.campo_maestro_id,
                    columna_origen_index: m.columna_origen_index,
                    columna_origen_nombre: m.columna_origen_nombre
                })
                .select('id')
                .maybeSingle();

            if (mapErr) {
                // Si es un error de unicidad (Violates unique_formato_maestro_columna)
                if (mapErr.code === '23505') {
                    console.log(`⚠️ [BACKEND] Conflicto de unicidad detectado para columna ${m.columna_origen_index} y maestro ${m.campo_maestro_id}. Reutilizando Mapeo Existente.`);

                    const { data: existingMap, error: extractErr } = await supabase
                        .from('mapeo_columnas')
                        .select('id')
                        .eq('formato_id', formatoId)
                        .eq('campo_maestro_id', m.campo_maestro_id)
                        .eq('columna_origen_index', m.columna_origen_index)
                        .single();

                    if (extractErr || !existingMap) {
                        console.error("🛑 [BACKEND FATAL] Error recuperando mapeo duplicado:", extractErr);
                        throw extractErr || new Error("Duplicate mapping could not be resolved");
                    }
                    mapeoId = existingMap.id;
                } else {
                    console.error("🛑 [BACKEND FATAL] Error en Supabase insertando mapeo de columna:", mapErr);
                    throw mapErr;
                }
            } else {
                mapeoId = mapeoRow.id;
            }

            // INSERT Opcional: Tubería de reglas de esta columna
            if (mapeoId && m.reglas && m.reglas.length > 0) {
                // Fetch existing rules for this mapping to determine the starting execution order and avoid duplicates
                const { data: existingRules, error: fetchRulesErr } = await supabase
                    .from('mapeo_reglas_aplicadas')
                    .select('regla_id, orden_ejecucion')
                    .eq('mapeo_id', mapeoId)
                    .order('orden_ejecucion', { ascending: false });

                const startOrder = (existingRules && existingRules.length > 0) ? existingRules[0].orden_ejecucion + 1 : 1;
                const existingRuleIds = existingRules ? existingRules.map(r => r.regla_id) : [];

                const newReglas = m.reglas.filter(rId => !existingRuleIds.includes(rId));

                if (newReglas.length > 0) {
                    const reglasPayload = newReglas.map((reglaId, idx) => ({
                        mapeo_id: mapeoId,
                        regla_id: reglaId,
                        orden_ejecucion: startOrder + idx
                    }));

                    const { error: ruleErr } = await supabase
                        .from('mapeo_reglas_aplicadas')
                        .insert(reglasPayload);

                    if (ruleErr) {
                        console.error("🛑 [BACKEND FATAL] Error en Supabase insertando reglas aplicadas:", ruleErr);
                        throw ruleErr;
                    }
                }
            }
        }

        return res.status(200).json({ status: 'saved', success: true });

    } catch (error) {
        console.error("❌ [ETL] Error guardando mapeo:", error);
        return res.status(500).json({ error: error.message, stack: error.stack, fullError: error });
    }
};

// 3. OBTENER PIPELINE DE MAPEO (Retrieval)
exports.getMapping = async (req, res) => {
    try {
        console.log("🛑 [BACKEND GET VIGÍA] Parámetros de búsqueda recibidos:", req.query, req.body, req.params);

        const { providerId, sheetName } = req.params;
        const hojaBusqueda = sheetName || 'Sheet1';

        const { data: formato, error: formatoError } = await supabase
            .from('proveedor_formatos_guia')
            .select('id, hoja_excel')
            .eq('proveedor_id', providerId)
            .eq('hoja_excel', hojaBusqueda)
            .maybeSingle();

        console.log("🛑 [BACKEND GET VIGÍA] Resultado búsqueda Formato Base:", formato, formatoError);

        if (formatoError) {
            console.error("🛑 [BACKEND FATAL] Error buscando formato base en GET:", formatoError);
            throw formatoError;
        }

        if (!formato) {
            console.log("⚠️ [BACKEND VIGÍA GET] Formato no encontrado. Devolviendo array vacío.");
            return res.status(200).json({ status: 'not_found', mapeos: [] });
        }

        const { data: mapeos, error: mapeoError } = await supabase
            .from('mapeo_columnas')
            .select(`
                id,
                columna_origen_index,
                columna_origen_nombre,
                campo_maestro_id,
                mapeo_reglas_aplicadas (
                    regla_id,
                    orden_ejecucion,
                    reglas_limpieza ( nombre_regla, tipo_regex )
                )
            `)
            .eq('formato_id', formato.id)
            .order('columna_origen_index', { ascending: true });

        console.log("🛑 [BACKEND GET VIGÍA] Resultado búsqueda Mapeos:", mapeos, mapeoError);

        if (mapeoError) {
            console.error("🛑 [BACKEND FATAL] Error buscando mapeos anidados en GET:", mapeoError);
            throw mapeoError;
        }

        // Ordenar reglas internas por orden_ejecucion (PostgREST no siempre ordena los nested items directamente de forma limpia)
        if (mapeos) {
            mapeos.forEach(m => {
                if (m.mapeo_reglas_aplicadas) {
                    m.mapeo_reglas_aplicadas.sort((a, b) => a.orden_ejecucion - b.orden_ejecucion);
                }
            });
        }

        return res.status(200).json({ status: 'found', formato, mapeos });
    } catch (error) {
        console.error("❌ [ETL] Error obteniendo mapeo:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 4. CREAR REGLA PERSONALIZADA (Local)
exports.createCustomRule = async (req, res) => {
    try {
        const { nombre_regla, descripcion, tipo_regex, proveedor_id, nombre_hoja } = req.body;

        if (!proveedor_id || !nombre_hoja || !tipo_regex) {
            return res.status(400).json({ error: "Faltan parámetros requeridos para crear una regla local." });
        }

        const hojaBusqueda = nombre_hoja || 'Sheet1';
        let { data: formato, error: formatoError } = await supabase
            .from('proveedor_formatos_guia')
            .select('id')
            .eq('proveedor_id', proveedor_id)
            .eq('hoja_excel', hojaBusqueda)
            .maybeSingle();

        if (formatoError && formatoError.code !== 'PGRST116') {
            throw formatoError;
        }

        if (!formato) {
            const { data: newFormato, error: insertError } = await supabase
                .from('proveedor_formatos_guia')
                .insert({
                    proveedor_id: proveedor_id,
                    hoja_excel: hojaBusqueda,
                    nombre_formato: `Formato Híbrido - ${hojaBusqueda}`
                })
                .select('id')
                .single();

            if (insertError) throw insertError;
            formato = newFormato;
        }

        const { data: ruleData, error: ruleError } = await supabase
            .from('reglas_limpieza')
            .insert({
                nombre_regla: nombre_regla || 'Regla Personalizada',
                descripcion: descripcion || 'Regla local',
                tipo_regex: tipo_regex,
                es_global: false,
                formato_id: formato.id
            })
            .select('*')
            .single();

        if (ruleError) throw ruleError;

        return res.status(201).json({ status: 'created', rule: ruleData });
    } catch (error) {
        console.error("❌ [ETL] Error creando regla custom:", error);
        return res.status(500).json({ error: error.message });
    }
};
