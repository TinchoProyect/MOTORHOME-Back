require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

async function verifyDrive() {
    console.log("🔍 Iniciando Verificación de Infraestructura Google Drive...");

    const serviceAccountPath = path.resolve(__dirname, '../../service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
        console.error("❌ ERROR: No se encuentra 'service-account.json'.");
        process.exit(1);
    }
    console.log("✅ 'service-account.json' detectado.");

    const folderId = process.env.DRIVE_FOLDER_ID;
    if (!folderId) {
        console.error("❌ ERROR: 'DRIVE_FOLDER_ID' no definido en .env.");
        process.exit(1);
    }
    console.log(`✅ DRIVE_FOLDER_ID configurado: ${folderId}`);

    try {
        const keys = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

        // Use keyFile to avoid manual parsing issues
        const client = new JWT({
            email: keys.client_email,
            keyFile: serviceAccountPath,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        await client.authorize();

        const drive = google.drive({ version: 'v3', auth: client });

        console.log("📡 Conectando con Google Drive API (JWT)...");

        const res = await drive.files.get({
            fileId: folderId,
            fields: 'id, name, mimeType'
        });

        console.log(`✅ Conexión EXITOSA. Acceso confirmado a carpeta:`);
        console.log(`   Nombre: ${res.data.name}`);
        console.log(`   ID: ${res.data.id}`);
        console.log(`   Tipo: ${res.data.mimeType}`);

    } catch (error) {
        console.error("❌ ERROR DE CONEXIÓN CON DRIVE:");
        console.error(`   ${error.message}`);
        if (error.code === 404) {
            console.error("   ⚠️ La carpeta no existe O la Service Account no tiene permisos.");
        }
        process.exit(1);
    }
}

verifyDrive();
