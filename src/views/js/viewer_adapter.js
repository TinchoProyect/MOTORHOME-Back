/**
 * VIEWER ADAPTER - Módulo de Transformación de Datos
 * Responsabilidad: Convertir JSON (DB) a Matriz (Viewer/SheetJS).
 * Pure Function Module.
 */

console.log("%c 🔌 VIEWER ADAPTER: READY ", "background: #f59e0b; color: #000; font-weight: bold; padding: 4px;");

window.adaptJsonToMatrix = function (jsonData) {
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        return [];
    }

    console.log(`[ViewerAdapter] Transforming ${jsonData.length} objects to Matrix...`);

    // 1. Extract Unique Headers (Union of all keys)
    // We iterate specific items or all items to find all possible keys
    // For performance, checking first 50 items might be enough, but to be safe we check all?
    // Let's rely on the first item for now as most CSV/Excel imports have uniform schema.
    // Better strategy: Collect all keys from first 100 rows.

    const keysSet = new Set();
    const scanLimit = Math.min(jsonData.length, 100);

    for (let i = 0; i < scanLimit; i++) {
        Object.keys(jsonData[i]).forEach(k => keysSet.add(k));
    }

    const headers = Array.from(keysSet);

    // 2. Build Matrix
    // First row is Headers
    const matrix = [headers];

    // Subsequent rows are values
    jsonData.forEach(item => {
        const row = headers.map(header => {
            const val = item[header];
            return (val === undefined || val === null) ? "" : val;
        });
        matrix.push(row);
    });

    return matrix;
};

window.adaptJsonToWorkbook = function (items) {
    console.log(`[ViewerAdapter] Reconstructing Workbook from ${items.length} items...`);
    const sheets = {};

    items.forEach(item => {
        // Support for new format { data: [[...]], sheetName: "Sheet1" }
        // Support for legacy format { ...columns... } (implied flat list)

        let sheetName = "Hoja1";
        let matrix = [];

        if (item.sheetName && Array.isArray(item.data)) {
            // New Format: Blob
            sheetName = item.sheetName;
            matrix = item.data;
        } else {
            // Legacy Format: Row Object (or just raw_data as object)
            // We need to re-group legacy rows! But wait, `item` comes from getProcessedFileContent
            // which returns { data: raw_data, sheetName: hoja_nombre }
            // If it was legacy insert, `raw_data` is an Object (Row), and `sheetName` is 'Hoja1'.

            // Complex Case: Legacy rows need to be collected and transformed to matrix?
            // Actually, `items` passed here is an array of what `filesController` returned.
            // If legacy: item.data is Object, item.sheetName is 'Hoja1'.
            // We need to group them.

            // Can we assume if item.data is Array, it's a BLOB? Yes.
            // If item.data is Object, it's a ROW.

            if (Array.isArray(item.data)) {
                // IT IS A BLOB (New Architecture)
                // Note: There might be multiple blobs if we chunked (unlikely for now, 1 sheet = 1 blob)
                sheets[sheetName] = item.data;
            } else {
                // IT IS A ROW (Legacy Architecture)
                if (!sheets[sheetName]) sheets[sheetName] = [];
                sheets[sheetName].push(item.data);
            }
        }
    });

    // Post-process: Convert Legacy Row Lists to Matrix
    Object.keys(sheets).forEach(name => {
        const content = sheets[name]; // Matrix or Array of Objects
        if (content.length > 0 && !Array.isArray(content[0])) {
            // It's an array of objects -> Validar que no sea vacío
            console.log(`[ViewerAdapter] Adapting Legacy Rows for sheet '${name}'...`);
            sheets[name] = window.adaptJsonToMatrix(content);
        }
    });

    return sheets; // { "Sheet1": [[...]], "Sheet2": [[...]] }
};
