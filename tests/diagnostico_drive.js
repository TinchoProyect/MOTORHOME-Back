const driveService = require('../src/services/driveService');
const fs = require('fs');
const path = require('path');

async function testDownload() {
    try {
        console.log("Iniciando prueba de descarga...");
        const fileId = "1NkmNfwsD4d5Yvdxx50qB-wN7y2Yvj-7M"; // ID de 'Lista de Precios Base.xlsx' visto en logs o inventado para test
        // O mejor, listamos primero para agarrar uno real
        const files = await driveService.listFiles(process.env.DRIVE_FOLDER_ID || '1yM2x3p4z5');
        if (files.length === 0) throw new Error("No hay archivos para testear");

        const targetFile = files.find(f => f.mimeType.includes('spreadsheet'));
        if (!targetFile) throw new Error("No se encontró un Excel para testear");

        console.log(`Intentando descargar: ${targetFile.name} (${targetFile.id})`);
        const buffer = await driveService.getFileContent(targetFile.id);

        console.log(`Descarga exitosa. Tamaño: ${buffer.byteLength} bytes`);
        const outPath = path.join(__dirname, 'test_downloaded.xlsx');
        fs.writeFileSync(outPath, Buffer.from(buffer));
        console.log(`Guardado en: ${outPath}`);

    } catch (error) {
        console.error("FALLÓ LA PRUEBA:", error);
    }
}

testDownload();
