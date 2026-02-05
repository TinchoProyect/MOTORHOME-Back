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
