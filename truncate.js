const supabase = require('./src/config/supabaseClient');
async function truncateDB() {
    const { data: data1, error: err1 } = await supabase.from('tabla_maestra_operativa').delete().not('id', 'is', null);
    if(err1) console.error("Error truncating operativa:", err1);
    else console.log("Truncate Operativa exitoso.");

    const { data: data2, error: err2 } = await supabase.from('flujos_extraccion').delete().not('id_flujo', 'is', null);
    if(err2) console.error("Error truncating flujos:", err2);
    else console.log("Truncate Flujos exitoso.");
}
truncateDB();
