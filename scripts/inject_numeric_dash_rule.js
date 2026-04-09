const supabase = require('../src/config/supabaseClient');

async function run() {
    const { data: existing, error: err } = await supabase
        .from('reglas_limpieza')
        .select('*')
        .eq('tipo_regex', 'SANITIZER_NUMERIC_AND_DASH');

    if (existing && existing.length > 0) {
        console.log("Ya existe:", existing);
        return;
    }

    const { data, error } = await supabase
        .from('reglas_limpieza')
        .insert({
            nombre_regla: 'Mantener solo números y guiones',
            descripcion: 'Limpieza estricta de ID Compuesto (elimina todo menos dígitos y guiones)',
            tipo_regex: 'SANITIZER_NUMERIC_AND_DASH',
            es_global: true
        })
        .select();
    
    console.log("Inserted:", data, error);
}

run();
