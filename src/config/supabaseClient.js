require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // Or SERVICE_ROLE_KEY if needed for backend admin tasks

if (!supabaseUrl || !supabaseKey) {
    console.error("[Supabase] Falta SUPABASE_URL o SUPABASE_KEY en .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
