/**
 * WORKER.JS - Obrero de Procesamiento de Excel
 * Ejecuta SheetJS en segundo plano para no congelar la UI
 */

// Importar SheetJS desde archivo local (Robustez total)
importScripts('xlsx.full.min.js');

let currentWorkbook = null;

onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT_FILE':
            try {
                // Payload: ArrayBuffer del archivo
                console.log('[Worker] Recibido archivo. Procesando...');
                currentWorkbook = XLSX.read(payload, { type: 'array' });

                // Devolver lista de hojas
                postMessage({
                    type: 'SHEETS_READY',
                    payload: currentWorkbook.SheetNames
                });
            } catch (error) {
                postMessage({ type: 'ERROR', payload: error.message });
            }
            break;

        case 'PARSE_SHEET':
            try {
                if (!currentWorkbook) throw new Error("No hay libro cargado.");

                const sheetName = payload; // Payload: Nombre de la hoja
                console.log(`[Worker] Procesando hoja: ${sheetName}`);

                const worksheet = currentWorkbook.Sheets[sheetName];
                if (!worksheet) throw new Error(`Hoja ${sheetName} no encontrada.`);

                // Convertir a JSON (Array de Arrays)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                postMessage({
                    type: 'SHEET_DATA_READY',
                    payload: {
                        sheetName: sheetName,
                        data: jsonData
                    }
                });
            } catch (error) {
                postMessage({ type: 'ERROR', payload: error.message });
            }
            break;

        case 'CLEANUP':
            console.log('[Worker] Limpieza de memoria.');
            currentWorkbook = null;
            break;
    }
};
