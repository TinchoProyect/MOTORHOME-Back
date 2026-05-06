const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const configController = {
    getConfig: async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('configuracion_sistema')
                .select('*')
                .order('llave', { ascending: true });

            if (error) {
                // If the table doesn't exist yet, we don't want to crash. 
                // Return an empty array or the error so the frontend can handle it.
                if (error.code === '42P01') {
                    return res.json({ success: true, config: [] });
                }
                throw error;
            }

            res.json({ success: true, config: data });
        } catch (error) {
            console.error("[ConfigController] Error obteniendo config:", error);
            res.status(500).json({ error: error.message });
        }
    },

    updateConfig: async (req, res) => {
        const { llave, valor } = req.body;

        if (!llave) return res.status(400).json({ error: "Falta la llave a actualizar" });

        try {
            const { data, error } = await supabase
                .from('configuracion_sistema')
                .update({ valor: valor, updated_at: new Date() })
                .eq('llave', llave)
                .select()
                .single();

            if (error) throw error;

            res.json({ success: true, data });
        } catch (error) {
            console.error(`[ConfigController] Error actualizando config (${llave}):`, error);
            res.status(500).json({ error: error.message });
        }
    },

    provisionBancosFolder: async (req, res) => {
        // Necesitamos driveService para crear la carpeta
        const driveService = require('../services/driveService');
        const parentId = process.env.DRIVE_FOLDER_ID; // Root "Madre"

        if (!parentId) {
            return res.status(500).json({ error: "Falta configurar DRIVE_FOLDER_ID raíz en el servidor" });
        }

        try {
            console.log(`[ConfigController] Aprovisionando carpeta global de Bancos en: ${parentId}`);

            // 1. Crear carpeta en Drive
            const folderName = 'Extractos_Bancarios_In';
            const newFolder = await driveService.createFolder(folderName, parentId);
            
            console.log(`[ConfigController] Carpeta creada en Drive: ${newFolder.id}`);

            // 2. Guardar el ID en la BD de configuración
            const { data, error } = await supabase
                .from('configuracion_sistema')
                .upsert({ 
                    llave: 'drive_folder_bancos_id', 
                    valor: newFolder.id,
                    descripcion: 'ID de la carpeta unificada en Google Drive para la Ingesta Bancaria.',
                    updated_at: new Date()
                }, { onConflict: 'llave' })
                .select()
                .single();

            if (error) throw error;

            res.json({
                success: true,
                message: "Carpeta creada exitosamente",
                folderId: newFolder.id,
                webViewLink: newFolder.webViewLink,
                data: data
            });

        } catch (error) {
            console.error("[ConfigController] Error aprovisionando carpeta:", error);
            res.status(500).json({ error: "Fallo el aprovisionamiento: " + error.message });
        }
    }
};

module.exports = configController;
