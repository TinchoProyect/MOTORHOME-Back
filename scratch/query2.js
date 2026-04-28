const supabase = require('../src/config/supabaseClient');
async function run() {
    const { data, error } = await supabase.from('proveedores').select('*, diccionario_proveedor_categorias(*)').limit(1);
    if(error) {
       console.log("TRY 1 ERR:", error.message);
       const { data: d2, error: e2 } = await supabase.from('proveedores').select('*, proveedor_categorias(*)').limit(1);
       if (e2) console.log("TRY 2 ERR:", e2.message);
       else console.log("OK 2:", Object.keys(d2[0].proveedor_categorias || {}));
    } else {
       console.log("OK 1:", Object.keys(data[0].diccionario_proveedor_categorias || {}));
    }
}
run();
