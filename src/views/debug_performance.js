/**
 * PERFORMANCE PROFILER - Script de Diagnóstico de Rendimiento
 * Mide tiempos de ejecución de funciones clave en dashboard.html
 */
(function () {
    console.log("⏱️ PROFILER DE RENDIMIENTO INICIADO");

    // Hookear la función renderSheet si existe
    // Nota: renderSheet es interna a openFileViewer, así que tenemos que ser creativos.
    // Vamos a interceptar XLSX.utils.sheet_to_html que es la sospechosa.

    const originalSheetToHtml = XLSX.utils.sheet_to_html;

    XLSX.utils.sheet_to_html = function (worksheet, opts) {
        console.log("🔥 [PROFILER] Iniciando XLSX.utils.sheet_to_html...");
        const start = performance.now();

        // Medir tamaño de la hoja
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const rows = range.e.r - range.s.r + 1;
        const cols = range.e.c - range.s.c + 1;
        const totalCells = rows * cols;

        console.log(`   📊 Dimensiones: ${rows} filas x ${cols} columnas (${totalCells} celdas)`);

        try {
            const result = originalSheetToHtml(worksheet, opts);
            const end = performance.now();
            const duration = (end - start).toFixed(2);

            console.log(`   ✅ [PROFILER] sheet_to_html completado en: ${duration} ms`);

            if (duration > 100) {
                console.warn(`   ⚠️ ALERTA DE RENDIMIENTO: Operación bloqueante detectada (>100ms).`);
                alert(`Diagnóstico: La hoja es muy grande (${rows} filas). El navegador tarda ${duration}ms en generar la tabla.`);
            }

            return result;
        } catch (err) {
            console.error("   ❌ [PROFILER] Error en sheet_to_html:", err);
            throw err;
        }
    };

    console.log("✅ Hook instalado en XLSX.utils.sheet_to_html");

})();
