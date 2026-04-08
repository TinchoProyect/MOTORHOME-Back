const supabase = require('./src/config/supabaseClient');
async function check() {
    const { data } = await supabase.from('reglas_limpieza').select('id, nombre_regla');
    console.log("REGLAS:");
    console.dir(data, {maxArrayLength: null});
}
check();
