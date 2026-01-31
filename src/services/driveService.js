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

        console.error("[DriveService] Error listing files:", error.message);
        throw error; // [STRICT MODE] No mocks. Fallo es fallo.
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
            fields: 'id, name, mimeType, webViewLink'
        });
        return res.data;
    } catch (error) {
        console.error(`[DriveService] Error getting metadata for ${fileId}:`, error.message);
        throw error;
    }
}

/**
 * Get file content as Stream (for viewer)
 * Handles both binary files (alt=media) and Google Docs (export)
 */
async function getFileStream(fileId) {
    const drive = await getDriveClient();
    try {
        // 1. Obtener metadatos para saber el MIME Type real
        const metadata = await drive.files.get({ fileId, fields: 'mimeType, name' });
        const mimeType = metadata.data.mimeType;

        console.log(`[DriveService] Stream init for ${fileId} (${mimeType})`);

        if (mimeType === 'application/vnd.google-apps.folder') {
            throw new Error("Cannot stream a folder. Please select a file.");
        }

        // 2. Decidir estrategia: Export vs Get Media
        if (mimeType.startsWith('application/vnd.google-apps.')) {
            // Es un Google Doc/Sheet -> Exportar
            let exportMime = 'application/pdf'; // Fallback debug

            if (mimeType.includes('spreadsheet')) {
                exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // .xlsx
            } else if (mimeType.includes('document')) {
                exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; // .docx
            } else if (mimeType.includes('presentation')) {
                exportMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; // .pptx
            }

            console.log(`[DriveService] Google Native File detected. Exporting as ${exportMime}...`);

            const res = await drive.files.export(
                { fileId: fileId, mimeType: exportMime },
                { responseType: 'stream' }
            );
            return res.data;

        } else {
            // Es un archivo binario real -> Descarga Directa
            const res = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );
            return res.data;
        }

    } catch (error) {
        console.error(`[DriveService] Error streamlining file ${fileId}:`, error.message);
        throw error; // Propagate to controller
    }
}

module.exports = {
    listFiles,
    getFileContent,
    getFileMetadata,
    getFileStream
};
