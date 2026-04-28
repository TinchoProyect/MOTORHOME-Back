const supabase = require('../src/config/supabaseClient');
async function run() {
    const { data, error } = await supabase.from('proveedores').select('*').limit(1);
    console.log("PROVEEDORES COLS:", Object.keys(data[0] || {}));
}
run();
