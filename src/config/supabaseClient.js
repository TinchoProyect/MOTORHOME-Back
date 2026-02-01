require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("[Supabase] Falta SUPABASE_URL o SUPABASE_KEY en .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
