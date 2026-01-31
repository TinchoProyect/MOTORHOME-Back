require('dotenv').config();
const driveService = require('../src/services/driveService');

const TARGET_FILE_ID = '16IXaMj9tliq7g_qEgKw9VT5pecIFj7ps';

async function diagnoseFile() {
    console.log(`🕵️ DIAGNOSTICANDO ARCHIVO: ${TARGET_FILE_ID}`);
    try {
        // 1. Obtener Metadata
        console.log("1. Intentando obtener metadatos...");
        const metadata = await driveService.getFileMetadata(TARGET_FILE_ID);
        console.log("✅ METADATA RECIBIDA:", metadata);

        // 2. Intentar obtener stream (simular flujo real)
        console.log("2. Intentando obtener stream...");
        try {
            const stream = await driveService.getFileStream(TARGET_FILE_ID);
            console.log("✅ STREAM OBTENIDO CORRECTAMENTE (Tipo Objeto:", typeof stream, ")");
        } catch (streamError) {
            console.log("❌ ERROR EN GET STREAM:", streamError.message);
            if (streamError.response) {
                console.log("   Status:", streamError.response.status);
                console.log("   StatusText:", streamError.response.statusText);
            }
        }

    } catch (error) {
        console.error("❌ ERROR FATAL (Acceso/Metadata):", error.message);
        if (error.response) {
            console.error("   Data:", error.response.data);
        }
    }
}

diagnoseFile();
