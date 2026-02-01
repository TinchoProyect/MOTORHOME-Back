
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load Env
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Env Vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("🔍 Checking 'proveedores' schema...");

    // Attempt to select the new columns
    const { data, error } = await supabase
        .from('proveedores')
        .select('id, drive_folder_prices_id, drive_folder_extracted_id')
        .limit(1);

    if (error) {
        console.error("❌ Schema Check Failed:", error.message);
        if (error.message.includes("does not exist") || error.code === 'PGRST100') { // PostgREST error for column missing
            console.log("👉 The columns likely do not exist. Please run the SQL script.");
        }
        process.exit(1);
    } else {
        console.log("✅ Schema Check Passed! Columns exist.");
        process.exit(0);
    }
}

checkSchema();
