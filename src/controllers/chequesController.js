const chequesIngestService = require('../services/chequesIngestService');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

exports.getConfig = async (req, res) => {
    try {
        let folderId = process.env.DRIVE_CHEQUES_FOLDER_ID;

        // Buscar en configuracion_sistema si no está en entorno
        if (!folderId) {
            const { data } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('llave', 'drive_cheques_folder_id')
                .single();
            if (data && data.valor) {
                folderId = data.valor;
            }
        }

        // Auto-aprovisionamiento
        if (!folderId) {
            const driveService = require('../services/driveService');
            const parentId = process.env.DRIVE_FOLDER_ID; // Root
            
            if (!parentId) {
                throw new Error("Falta configurar DRIVE_FOLDER_ID raíz en el servidor para crear la carpeta.");
            }

            const newFolder = await driveService.createFolder('Ingesta_Cheques_CSV', parentId);
            folderId = newFolder.id;

            await supabase
                .from('configuracion_sistema')
                .upsert({ 
                    llave: 'drive_cheques_folder_id', 
                    valor: folderId,
                    descripcion: 'ID de la carpeta en Drive para la ingesta de Cheques.',
                    updated_at: new Date()
                }, { onConflict: 'llave' });
        }

        res.json({ success: true, folderId });
    } catch (error) {
        console.error("[ChequesController] Error getConfig:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getDisponibles = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .eq('estado_interno', 'EN_CARTERA')
            .order('fecha_vencimiento_calculada', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error("[ChequesController] Error getDisponibles:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTodos = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .order('fecha_pago', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error("[ChequesController] Error getTodos:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.ingestarDrive = async (req, res) => {
    try {
        const result = await chequesIngestService.startDriveIngestion();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error("[ChequesController] Error ingestarDrive:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.endosar = async (req, res) => {
    const { id } = req.params;
    const { proveedor_id } = req.body;
    try {
        // Validación de proveedor y cheque existente, actualizar a ENDOSADO
        // [WARNING]: Integrar aquí la llamada al módulo de cuenta corriente para impactar pago.
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ 
                estado_interno: 'ENDOSADO',
                proveedor_endosado_id: proveedor_id,
                fecha_endoso: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque endosado con éxito" });
    } catch (error) {
        console.error("[ChequesController] Error endosar:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.acreditar = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ 
                estado_interno: 'ACREDITADO',
                fecha_deposito: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque acreditado con éxito" });
    } catch (error) {
        console.error("[ChequesController] Error acreditar:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.rechazar = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ estado_interno: 'DEVUELTO' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque devuelto/rechazado" });
    } catch (error) {
        console.error("[ChequesController] Error rechazar:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.purge = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (error) throw error;
        res.json({ success: true, message: "Base de datos de cheques vaciada correctamente." });
    } catch (error) {
        console.error("[ChequesController] Error purge:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
