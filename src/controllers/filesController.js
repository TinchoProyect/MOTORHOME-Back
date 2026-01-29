const driveService = require('../services/driveService');

const DEFAULT_FOLDER_ID = process.env.DRIVE_FOLDER_ID; // We need to add this to .env

async function listFiles(req, res) {
    try {
        // Allow overriding folderId via query, else use default
        const folderId = req.query.folderId || DEFAULT_FOLDER_ID;

        if (!folderId) {
            return res.status(400).json({ error: "Falta Folder ID (Verificar .env o query param)" });
        }

        console.log(`[FilesController] Listando archivos de: ${folderId}`);
        const files = await driveService.listFiles(folderId);

        res.json({
            success: true,
            count: files.length,
            files: files
        });

    } catch (error) {
        console.error("[FilesController] Error Detail:", error);
        console.error("[FilesController] Stack:", error.stack);
        res.status(500).json({ error: "Error al listar archivos de Drive: " + error.message });
    }
}

module.exports = {
    listFiles
};
