/**
 * VIEWER WORKER - Excel Processing Logic
 * Extracted from viewer_engine.js
 */

// --- 2. CÓDIGO DEL OBRERO (Worker) ---
window.WORKER_CODE = `
    importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

    let currentWorkbook = null;

    onmessage = function (e) {
        const { type, payload } = e.data;

        switch (type) {
            case 'INIT_FILE':
                try {
                    console.log('[Worker] Recibido archivo. Procesando...');
                    currentWorkbook = XLSX.read(payload, { type: 'array' });
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
                    const sheetName = payload;
                    const worksheet = currentWorkbook.Sheets[sheetName];
                    if (!worksheet) throw new Error("Hoja " + sheetName + " no encontrada.");
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    postMessage({
                        type: 'SHEET_DATA_READY',
                        payload: { sheetName: sheetName, data: jsonData }
                    });
                } catch (error) {
                    postMessage({ type: 'ERROR', payload: error.message });
                }
                break;
            
                break;

            case 'GET_ALL_SHEETS':
                try {
                    if (!currentWorkbook) throw new Error("No hay libro cargado.");
                    const result = [];
                    currentWorkbook.SheetNames.forEach(name => {
                        const ws = currentWorkbook.Sheets[name];
                        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        result.push({ name: name, data: json });
                    });
                    postMessage({
                        type: 'ALL_SHEETS_READY',
                        payload: result
                    });
                } catch (error) {
                    postMessage({ type: 'ERROR', payload: error.message });
                }
                break;
            
            case 'CLEANUP':
                currentWorkbook = null;
                break;
        }
    };
`;

// --- Export Function ---
async function exportAllSheets() {
    return new Promise((resolve, reject) => {
        if (!viewerWorker) {
            // Local Fallback (Si no hay worker activo)
            if (workbook) {
                try {
                    const result = [];
                    workbook.SheetNames.forEach(name => {
                        const ws = workbook.Sheets[name];
                        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        result.push({ name: name, data: json });
                    });
                    resolve(result);
                } catch (e) { reject(e); }
            } else {
                reject(new Error("No hay libro cargado para exportar."));
            }
            return;
        }

        // Worker Request
        const handler = (e) => {
            const { type, payload } = e.data;
            if (type === 'ALL_SHEETS_READY') {
                viewerWorker.removeEventListener('message', handler); // Cleanup listener
                resolve(payload);
            } else if (type === 'ERROR') {
                viewerWorker.removeEventListener('message', handler);
                reject(new Error(payload));
            }
        };

        // One-time listener for this request (to avoid capturing other messages)
        // Note: The main onmessage handler in openFileViewer might also catch this? 
        // We added a specific TYPE so the main handler (viewerWorker.onmessage) should just ignore it 
        // OR we need to be careful.
        // Actually, viewerWorker.onmessage is a property, not a listener list.
        // If we attach a new onmessage, we overwrite the old one!
        // FIX: Use the existing onmessage or event listeners.
        // Since the current implementation uses `viewerWorker.onmessage = ...`, we cannot easily "add" another one without hijacking.

        // BETTER STRATEGY: Modify the main onmessage to handle ALL_SHEETS_READY and dispatch a custom event.
        // OR, temporarily hijack onmessage? Safe enough for this operation as it is blocking-like UI action.

        const originalOnMessage = viewerWorker.onmessage;
        viewerWorker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'ALL_SHEETS_READY') {
                viewerWorker.onmessage = originalOnMessage; // Restore
                resolve(payload);
            } else if (type === 'ERROR') {
                viewerWorker.onmessage = originalOnMessage; // Restore
                reject(new Error(payload));
            } else {
                // Determine if we should pass it to original?
                // Probably yes if it's unrelated, although unlikely during specific export call.
                if (originalOnMessage) originalOnMessage(e);
            }
        };

        viewerWorker.postMessage({ type: 'GET_ALL_SHEETS' });
    });
}

// [VIGÍA DE CONTROL] - Protocolo de Pruebas
console.log("👷 [ViewerWorker] Módulo de Procesamiento Cargado.");

// Global Export
window.exportAllSheets = exportAllSheets;
