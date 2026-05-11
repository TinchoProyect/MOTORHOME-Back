const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const driveService = require('../services/driveService');
const bancosParserService = require('../services/bancosParserService');

const bancosController = {
    listarExtractos: async (req, res) => {
        try {
            // 1. Intentar leer desde la BD (Configuración Global)
            let folderId = null;
            const { data: configData, error: configError } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('llave', 'drive_folder_bancos_id')
                .maybeSingle();
            
            if (!configError && configData && configData.valor) {
                folderId = configData.valor;
            } else {
                // Fallback al .env si la tabla/llave no existe
                folderId = process.env.DRIVE_FOLDER_BANCOS_ID;
            }

            if (!folderId) {
                return res.status(400).json({ error: "Falta configurar DRIVE_FOLDER_BANCOS_ID en Parámetros del Sistema (o .env)" });
            }

            console.log(`[BancosController] Listando archivos de la carpeta bancaria: ${folderId}`);
            
            // Listar solo archivos de Excel (.xlsx, .xls) o genéricos
            const files = await driveService.listFiles(folderId);

            // Obtener estado de archivos desde la BD
            const { data: archivosProcesados } = await supabase
                .from('bancos_archivos_raw')
                .select('archivo_id, estado_global');

            const procesadosMap = {};
            if (archivosProcesados) {
                archivosProcesados.forEach(a => {
                    procesadosMap[a.archivo_id] = a.estado_global;
                });
            }

            // Mapear estado
            const filesConEstado = files.map(f => ({
                ...f,
                estado: procesadosMap[f.id] || 'PENDIENTE'
            }));

            res.json({
                success: true,
                count: filesConEstado.length,
                files: filesConEstado,
                folderId: folderId
            });
        } catch (error) {
            console.error("[BancosController] Error al listar extractos:", error);
            res.status(500).json({ error: "Error de Drive: " + error.message });
        }
    },

    ingestarExtracto: async (req, res) => {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ error: "Missing fileId" });
        }

        try {
            console.log(`[BancosController] Iniciando ingesta de extracto bancario. Archivo ID: ${fileId}`);

            // 1. Obtener Padrón de Proveedores y Memoria de Mapeo
            const [provRes, memoriaRes] = await Promise.all([
                supabase.from('proveedores').select('id, cuit, nombre, afip_razon_social').eq('activo', true),
                supabase.from('bancos_memoria_mapeo').select('patron_busqueda, proveedor_id')
            ]);

            if (provRes.error) throw new Error("No se pudo obtener el padrón de proveedores: " + provRes.error.message);
            const proveedores = provRes.data || [];
            const memoriaMapeo = memoriaRes.data || [];

            // 2. Descargar Excel desde Google Drive
            console.log(`[BancosController] Descargando archivo desde Drive...`);
            const fileBuffer = await driveService.downloadFileToBuffer(fileId);

            // Obtener metadata del archivo para guardarla
            const fileMetadata = await driveService.getFileMetadata(fileId);
            const fileName = fileMetadata.name || `extracto_${fileId}.xlsx`;

            // 3. Procesar y parsear
            const parserResult = bancosParserService.parseExtracto(fileBuffer, proveedores, memoriaMapeo, fileId);

            if (!parserResult.success) {
                return res.status(500).json({ error: parserResult.error });
            }

            const { pagosCrudos, estadisticas } = parserResult;
            
            let insertadosExitosos = 0;
            let omitidosPorDuplicado = 0;

            // 4. Inyección en Base de Datos (con blindaje anti-duplicados)
            console.log(`[BancosController] Iniciando inyección a BD de ${pagosCrudos.length} movimientos...`);

            for (const pago of pagosCrudos) {
                // Validación explícita de idempotencia (Ticket: Fallo de Deduplicación)
                const { data: existente } = await supabase
                    .from('pagos_bancarios_raw')
                    .select('hash_id')
                    .eq('hash_id', pago.hash_id)
                    .maybeSingle();

                if (existente) {
                    omitidosPorDuplicado++;
                    continue; // Blindaje Anti-Duplicados Activo
                }

                // Insertamos uno a uno para manejar colisiones limpiamente
                const { error: errInsert } = await supabase
                    .from('pagos_bancarios_raw')
                    .insert([pago]);

                if (errInsert) {
                    // 23505 = Unique Violation en PostgreSQL (Fallback safety)
                    if (errInsert.code === '23505' || errInsert.message.includes('duplicate key value') || errInsert.message.includes('already exists')) {
                        omitidosPorDuplicado++;
                    } else {
                        console.error(`[BancosController] Error insertando pago ${pago.hash_id}:`, errInsert);
                    }
                } else {
                    insertadosExitosos++;
                }
            }

            // 5. Registrar el archivo como PROCESADO
            await supabase
                .from('bancos_archivos_raw')
                .upsert({
                    archivo_id: fileId,
                    nombre_archivo: fileName,
                    estado_global: 'PROCESADO'
                }, { onConflict: 'archivo_id' });

            console.log(`[BancosController] Ingesta finalizada.`);
            console.log(`- Insertados (Nuevos): ${insertadosExitosos}`);
            console.log(`- Duplicados Ignorados: ${omitidosPorDuplicado}`);

            return res.json({
                success: true,
                resultados: {
                    procesados_total: estadisticas.procesados,
                    insertados: insertadosExitosos,
                    duplicados_hash: omitidosPorDuplicado,
                    pendientes_hitl: estadisticas.pendientes_hitl,
                    auto_vinculados: estadisticas.auto_vinculados_cuit + estadisticas.auto_vinculados_memoria
                }
            });

        } catch (error) {
            console.error("[BancosController] Error crítico en ingestarExtracto:", error);
            res.status(500).json({ error: error.message });
        }
    },

    getMovimientos: async (req, res) => {
        const { archivoId } = req.query;
        try {
            let query = supabase
                .from('pagos_bancarios_raw')
                .select(`
                    *,
                    proveedores ( nombre, cuit, afip_razon_social )
                `)
                .order('fecha_pago', { ascending: false });

            if (archivoId) {
                query = query.eq('archivo_origen_id', archivoId);
            }

            const { data, error } = await query;

            if (error) throw error;

            res.json({ success: true, data });
        } catch (error) {
            console.error("[BancosController] Error obteniendo movimientos:", error);
            res.status(500).json({ error: error.message });
        }
    },

    vincularMovimiento: async (req, res) => {
        const { hashId } = req.params;
        const { proveedor_id, accion, guardar_memoria, patron_busqueda } = req.body;

        try {
            if (!hashId) throw new Error("Falta hashId");

            if (accion === 'IGNORAR') {
                const { error } = await supabase
                    .from('pagos_bancarios_raw')
                    .update({ estado: 'IGNORADO' })
                    .eq('hash_id', hashId);
                if (error) throw error;
                return res.json({ success: true, message: "Movimiento ignorado exitosamente." });
            }

            if (accion === 'VINCULAR') {
                if (!proveedor_id) throw new Error("Falta proveedor_id para vincular.");

                // Actualizar a VINCULADO (esto dispara el trigger hacia cuenta corriente)
                const { error: errUpdate } = await supabase
                    .from('pagos_bancarios_raw')
                    .update({ 
                        proveedor_id: proveedor_id, 
                        estado: 'VINCULADO' 
                    })
                    .eq('hash_id', hashId);

                if (errUpdate) throw errUpdate;

                // Guardar en memoria si lo solicita
                if (guardar_memoria && patron_busqueda) {
                    const { error: errMem } = await supabase
                        .from('bancos_memoria_mapeo')
                        .insert({
                            patron_busqueda: patron_busqueda.toLowerCase(),
                            proveedor_id: proveedor_id
                        });
                    // Ignore duplicate key if patron already exists
                    if (errMem && errMem.code !== '23505') {
                        console.error("[BancosController] Error guardando memoria:", errMem);
                    }
                }

                return res.json({ success: true, message: "Movimiento vinculado exitosamente." });
            }

            throw new Error("Acción inválida.");

        } catch (error) {
            console.error("[BancosController] Error en vincularMovimiento:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = bancosController;
