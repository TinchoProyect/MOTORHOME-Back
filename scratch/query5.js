const supabase = require('../src/config/supabaseClient');
async function run() {
    const { data, error } = await supabase.from('tabla_maestra_operativa')
    .select('id, proveedores(categorias_proveedores(nombre))')
    .limit(2);
    console.log("ERR:", error?.message);
    console.log("OK:", JSON.stringify(data, null, 2));
}
run();
