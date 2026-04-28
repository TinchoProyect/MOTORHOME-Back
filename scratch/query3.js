const supabase = require('../src/config/supabaseClient');
async function run() {
    const { data, error } = await supabase.from('categorias_proveedores').select('*').limit(1);
    console.log("ERR:", error?.message);
    console.log("OK:", Object.keys(data?.[0] || {}));
}
run();
