const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

async function preflight() {
    console.log("🔍 Preflight Check: Listado de Proveedores a Migrar");
    console.log("====================================================");

    const { data: suppliers, error } = await supabase.from('proveedores').select('*').order('nombre');

    if (error) {
        console.error("Error BD:", error);
        return;
    }

    let pendingCount = 0;

    for (const s of suppliers) {
        const needsPricing = !s.drive_folder_prices_id;
        const needsExtracted = !s.drive_folder_extracted_id;
        const hasRoot = s.drive_folder_id;

        if (!hasRoot) {
            console.log(`⚠️  [SKIP] ${s.nombre.padEnd(20)} | ID: ${s.id} | Motivo: Sin Carpeta Raíz vinculada.`);
            continue;
        }

        if (!needsPricing && !needsExtracted) {
            console.log(`✅ [LISTO] ${s.nombre.padEnd(20)} | ID: ${s.id} | Infraestructura completa.`);
            continue;
        }

        pendingCount++;
        console.log(`🚀 [PENDIENTE] ${s.nombre} (ID: ${s.id})`);
        console.log(`    📂 Root ID: ${s.drive_folder_id}`);
        if (needsPricing) console.log(`    ➕ Acción: Crear subcarpeta 'Listas de Precios'`);
        if (needsExtracted) console.log(`    ➕ Acción: Crear subcarpeta 'Listas Extraídas'`);
        console.log("-".repeat(50));
    }
    console.log(`\n📊 Resumen: ${pendingCount} proveedores esperan migración.`);
}

preflight();
