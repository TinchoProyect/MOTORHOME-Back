const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/views/dashboard.html');

console.log("🕵️ INICIANDO DIAGNÓSTICO DE SINTAXIS PARA: dashboard.html");
console.log("============================================================");

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // El error reportado es "Unexpected token '<'" en dashboard.html:907
    // Nota: Las líneas en el editor son 1-indexed, el array es 0-indexed.
    const errorLineIndex = 906; // Línea 907

    // Validación básica de existencia
    if (lines.length <= errorLineIndex) {
        console.error("❌ El archivo es más corto de lo esperado. No se puede analizar la línea 907.");
        process.exit(1);
    }

    // 1. Verificar contexto (¿Estamos dentro de un <script>?)
    console.log(`🔍 Analizando contexto de la línea ${errorLineIndex + 1}...`);

    let scriptStart = -1;
    let scriptEnd = -1;
    let inScript = false;

    // Buscamos el bloque script relevante (el último antes del error)
    for (let i = 0; i <= errorLineIndex; i++) {
        if (lines[i].includes('<script>')) {
            scriptStart = i;
            inScript = true;
        }
        if (lines[i].includes('</script>')) {
            scriptEnd = i;
            inScript = false;
        }
    }

    if (inScript) {
        console.log(`   ✅ CONFIRMADO: La línea ${errorLineIndex + 1} está DENTRO de un bloque <script> (iniciado en línea ${scriptStart + 1}).`);
    } else {
        console.log(`   ⚠️ ALERTA: La línea ${errorLineIndex + 1} parece estar fuera de un script. Revisar estructura.`);
    }

    // 2. Extraer y mostrar el código problemático
    console.log("\n📷 SNAPSHOT DEL CÓDIGO (Líneas 900-915):");
    console.log("-----------------------------------------");
    for (let i = 899; i < 915; i++) {
        if (lines[i] !== undefined) {
            const mark = (i === errorLineIndex) ? "🟥 ERROR >> " : "            ";
            console.log(`${mark}${i + 1}: ${lines[i]}`);
        }
    }
    console.log("-----------------------------------------");

    // 3. Análisis de Causa Raíz
    const problemLine = lines[errorLineIndex].trim();

    console.log("\n🧠 ANÁLISIS HEURÍSTICO:");
    if (inScript && problemLine.startsWith('<')) {
        console.log("   DETECTADO: Código HTML crudo dentro de JavaScript.");
        console.log("   1. La línea 907 comienza con caracteres HTML ('" + problemLine + "').");
        console.log("   2. El intérprete de JS espera código (variables, funciones), no etiquetas.");
        console.log("   3. CAUSA PROBABLE: Error de 'Corte y Pegado'.");
        console.log("      Se insertaron las funciones 'openFileViewer' y 'closeViewerModal' (Líneas 826-906)");
        console.log("      rompiendo una plantilla de texto (template string) existente.");
        console.log("      El código a partir de la línea 907 son restos huérfanos de la plantilla original.");
    } else {
        console.log("   No se detectó el patrón obvio, pero la sintaxis es incorrecta.");
    }

    console.log("\n🛠️ RECOMENDACIÓN DE REPARACIÓN:");
    console.log("   Eliminar las líneas de código HTML huérfano (907 en adelante) que quedaron fuera de la función 'renderFileGrid'.");
    console.log("   Asegurar que la función 'renderFileGrid' anterior esté bien cerrada.");

} catch (err) {
    console.error("❌ Error fatal leyendo el archivo:", err.message);
}
