const supabase = require('./src/config/supabaseClient');

async function run() {
    const { data: existing, error: err } = await supabase
        .from('reglas_limpieza')
        .select('*')
        .eq('tipo_regex', 'SANITIZE_DECIMAL_FILL');

    if (existing && existing.length > 0) {
        console.log("Ya existe:", existing);
        return;
    }

    const { data, error } = await supabase
        .from('reglas_limpieza')
        .insert({
            nombre_regla: 'Normalización Decimal y Relleno',
            descripcion: 'Reemplaza puntos por comas y rellena vacíos con 0,00',
            tipo_regex: 'SANITIZE_DECIMAL_FILL',
            es_global: true
        })
        .select();
    
    console.log("Inserted:", data, error);
}

run();
