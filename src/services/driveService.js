const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

// Config
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEY_FILE_PATH = path.join(__dirname, '../../service-account.json');

// State
let driveClient = null;

async function getDriveClient() {
    if (driveClient) return driveClient;

    if (!fs.existsSync(KEY_FILE_PATH)) {
        throw new Error(`[DriveService] Falta service-account.json en: ${KEY_FILE_PATH}`);
    }

    // Read Key File
    const keys = JSON.parse(fs.readFileSync(KEY_FILE_PATH, 'utf8'));

    console.log("[DriveService] Inicializando JWT Auth (vía KeyFile)...");

    const client = new JWT({
        email: keys.client_email,
        keyFile: KEY_FILE_PATH, // Delegate parsing to library (fixes \n issues)
        scopes: SCOPES,
    });

    // Explicitly verify connection
    await client.authorize();

    driveClient = google.drive({ version: 'v3', auth: client });
    console.log("   [DriveService] Cliente JWT Autenticado OK.");
    return driveClient;
}

/**
 * List files in a specific Google Drive folder
 */
async function listFiles(folderId, mimeType = null) {
    try {
        const drive = await getDriveClient();

        let query = `'${folderId}' in parents and trashed = false`;
        if (mimeType) {
            query += ` and mimeType = '${mimeType}'`;
        }

        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
            orderBy: 'name asc', // Sort by name for dropdowns
            pageSize: 100 // Increased limit
        });
        return res.data.files;
    } catch (error) {
        console.error("[DriveService] Error listing files:", error.message);

        // MOCK FALLBACK (Para avanzar con Frontend)
        console.warn("[DriveService] ⚠️ Activando MOCK DATA por fallo de credenciales.");
        return [
            { id: 'mock-1', name: 'Lista de Precios Base.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { id: 'mock-2', name: 'Proveedores Enero.pdf', mimeType: 'application/pdf' }
        ];
    }
}

/**
 * Get file content as ArrayBuffer
 */
async function getFileContent(fileId) {
    const drive = await getDriveClient();
    try {
        const res = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
        return res.data;
    } catch (error) {
        console.error(`[DriveService] Error downloading file ${fileId}:`, error.message);
        throw error;
    }
}

async function getFileMetadata(fileId) {
    const drive = await getDriveClient();
    try {
        const res = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType'
        });
        return res.data;
    } catch (error) {
        console.error(`[DriveService] Error getting metadata ${fileId}:`, error.message);
        throw error;
    }
}

module.exports = {
    listFiles,
    getFileContent,
    getFileMetadata
};
