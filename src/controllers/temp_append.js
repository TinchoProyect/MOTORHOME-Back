
// =============================================================================
// PHASE 5: PROCESSED FILES ENDPOINTS
// =============================================================================

async function listProcessedFiles(req, res) {
    try {
        const { providerId } = req.query;
        if (!providerId) return res.status(400).json({ error: "Falta providerId" });

        const { data, error } = await supabase
            .from('proveedor_listas_raw')
            .select('id, nombre_archivo, created_at, items_count')
            .eq('proveedor_id', providerId)
            .eq('status_global', 'CONFIRMED')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, files: data });

    } catch (error) {
        console.error("[FilesController] Error listing processed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

async function getProcessedFileContent(req, res) {
    try {
        const { rawListId } = req.params;
        if (!rawListId) return res.status(400).json({ error: "Falta rawListId" });

        const { data, error } = await supabase
            .from('proveedor_items_extraidos')
            .select('raw_data')
            .eq('lista_raw_id', rawListId);

        if (error) throw error;

        // Flatten data (supabase returns array of objects with raw_data key)
        const items = data.map(i => i.raw_data);

        res.json({ success: true, items: items });

    } catch (error) {
        console.error("[FilesController] Error fetching content:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction,
    getDictionaryTerms,
    createDictionaryTerm,
    updateDictionaryTerm,
    deleteDictionaryTerm,
    downloadFile,
    provisionVendorFolders,
    listProcessedFiles,     // [PHASE 5]
    getProcessedFileContent // [PHASE 5]
};
