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

    // SAFEGUARD: Sanitize Private Key
    const privateKey = keys.private_key.includes('\\n')
        ? keys.private_key.replace(/\\n/g, '\n')
        : keys.private_key;

    console.log("[DriveService] Inicializando JWT Auth...");

    const client = new JWT({
        email: keys.client_email,
        key: privateKey,
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
async function listFiles(folderId) {
    try {
        const drive = await getDriveClient();
        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 50
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

module.exports = {
    listFiles,
    getFileContent
};
