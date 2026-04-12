const supabase = require('./src/config/supabaseClient');
async function truncateDB() {
    const { data, error } = await supabase.from('tabla_maestra_operativa').delete().not('id', 'is', null);
    if(error){
        console.error("Error truncating DB:", error);
    }else{
        console.log("Truncate DB exitoso.");
    }
}
truncateDB();
