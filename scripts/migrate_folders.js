// Migration Script: Retroactive Folder Provisioning
const driveService = require('../src/services/driveService');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load Env
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

async function migrate() {
    console.log("🚀 Starting Infrastructure Migration...");

    // 1. Get Suppliers
    const { data: suppliers, error } = await supabase.from('proveedores').select('*');
    if (error) {
        console.error("❌ DB Error:", error);
        process.exit(1);
    }

    console.log(`Found ${suppliers.length} suppliers in database.`);

    let migratedCount = 0;

    for (const sup of suppliers) {
        console.log(`\n🔍 Checking: ${sup.nombre} (ID: ${sup.id})`);

        let updates = {};
        const rootId = sup.drive_folder_id;

        if (!rootId) {
            console.log("   ⚠️ No Root Folder ID linked. Skipping.");
            continue;
        }

        // Check availability of subfolders
        if (!sup.drive_folder_prices_id || !sup.drive_folder_extracted_id) {
            console.log(`   🛠️  Incomplete Infrastructure. Provisioning inside Root: ${rootId}...`);

            try {
                // Create Prices Folder if missing
                if (!sup.drive_folder_prices_id) {
                    const f = await driveService.createFolder('Listas de Precios', rootId);
                    updates.drive_folder_prices_id = f.id;
                    console.log(`      ✅ 'Listas de Precios' created: ${f.id}`);
                }

                // Create Extracted Folder if missing
                if (!sup.drive_folder_extracted_id) {
                    const f = await driveService.createFolder('Listas Extraídas', rootId);
                    updates.drive_folder_extracted_id = f.id;
                    console.log(`      ✅ 'Listas Extraídas' created: ${f.id}`);
                }

                // Update DB Recrod
                if (Object.keys(updates).length > 0) {
                    const { error: upErr } = await supabase.from('proveedores').update(updates).eq('id', sup.id);
                    if (upErr) throw upErr;
                    console.log("      💾 Database record updated successfully.");
                    migratedCount++;
                }

            } catch (e) {
                console.error("      ❌ Error provisioning folder:", e.message);
            }

        } else {
            console.log("   ✨ Infrastructure OK (Already migrated).");
        }
    }
    console.log(`\n🎉 Migration Complete. Updated ${migratedCount} suppliers.`);
}

migrate();
