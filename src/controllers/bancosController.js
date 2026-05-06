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

            res.json({
                success: true,
                count: files.length,
                files: files,
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

            // 1. Obtener Padrón de Proveedores
            const { data: proveedores, error: errProv } = await supabase
                .from('proveedores')
                .select('id, cuit, razon_social')
                .eq('status', 'activo');

            if (errProv) throw new Error("No se pudo obtener el padrón de proveedores: " + errProv.message);
            if (!proveedores || proveedores.length === 0) throw new Error("Padrón de proveedores vacío");

            // 2. Descargar Excel desde Google Drive
            console.log(`[BancosController] Descargando archivo desde Drive...`);
            const fileBuffer = await driveService.downloadFileToBuffer(fileId);

            // 3. Procesar y parsear
            const parserResult = bancosParserService.parseExtracto(fileBuffer, proveedores);

            if (!parserResult.success) {
                return res.status(500).json({ error: parserResult.error });
            }

            const { pagosValidos, omitidos } = parserResult;
            
            let insertadosExitosos = 0;
            let omitidosPorDuplicado = 0;

            // 4. Inyección en Base de Datos (con blindaje anti-duplicados)
            console.log(`[BancosController] Iniciando inyección a BD de ${pagosValidos.length} pagos matcheados...`);

            for (const pago of pagosValidos) {
                const insertData = {
                    hash_id: pago.hash_id,
                    proveedor_id: pago.proveedor_id,
                    fecha_pago: pago.fecha_pago,
                    monto_pago: pago.monto_pago,
                    descripcion_original: pago.descripcion_original,
                    archivo_origen_id: fileId
                };

                // Insertamos uno a uno para manejar colisiones limpiamente
                const { error: errInsert } = await supabase
                    .from('pagos_bancarios_raw')
                    .insert([insertData]);

                if (errInsert) {
                    // 23505 = Unique Violation en PostgreSQL
                    if (errInsert.code === '23505' || errInsert.message.includes('duplicate key value')) {
                        omitidosPorDuplicado++;
                    } else {
                        console.error(`[BancosController] Error insertando pago ${pago.hash_id}:`, errInsert);
                    }
                } else {
                    insertadosExitosos++;
                }
            }

            console.log(`[BancosController] Ingesta finalizada.`);
            console.log(`- Insertados (Nuevos): ${insertadosExitosos}`);
            console.log(`- Duplicados Ignorados: ${omitidosPorDuplicado}`);

            return res.json({
                success: true,
                resultados: {
                    leidos_validos: pagosValidos.length,
                    insertados: insertadosExitosos,
                    duplicados_hash: omitidosPorDuplicado,
                    omitidos_parser: omitidos
                }
            });

        } catch (error) {
            console.error("[BancosController] Error crítico en ingestarExtracto:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = bancosController;
