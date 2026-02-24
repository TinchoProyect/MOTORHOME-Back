const supabase = require('../config/supabaseClient');

// 1. OBTENER REGLAS DISPONIBLES (Catálogo)
exports.getRules = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('reglas_limpieza')
            .select('*')
            .order('creado_en', { ascending: true });

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
            const { data: mapeoRow, error: mapErr } = await supabase
                .from('mapeo_columnas')
                .insert({
                    formato_id: formatoId,
                    campo_maestro_id: m.campo_maestro_id,
                    columna_origen_index: m.columna_origen_index,
                    columna_origen_nombre: m.columna_origen_nombre
                })
                .select('id')
                .single();

            console.log("SUPABASE RESPONSE MAPEO_COLUMNAS:", mapeoRow, mapErr);

            if (mapErr) {
                console.error("🛑 [BACKEND FATAL] Error en Supabase insertando mapeo de columna:", mapErr);
                throw mapErr;
            }

            // INSERT Opcional: Tubería de reglas de esta columna
            if (m.reglas && m.reglas.length > 0) {
                const reglasPayload = m.reglas.map((reglaId, idx) => ({
                    mapeo_id: mapeoRow.id,
                    regla_id: reglaId,
                    orden_ejecucion: idx + 1
                }));

                const { error: ruleErr } = await supabase
                    .from('mapeo_reglas_aplicadas')
                    .insert(reglasPayload);

                console.log("SUPABASE RESPONSE MAPEO_REGLAS_APLICADAS:", ruleErr);

                if (ruleErr) {
                    console.error("🛑 [BACKEND FATAL] Error en Supabase insertando reglas aplicadas:", ruleErr);
                    throw ruleErr;
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
