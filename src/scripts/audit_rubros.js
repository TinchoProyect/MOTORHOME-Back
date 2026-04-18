require('dotenv').config();
const supabase = require('../config/supabaseClient');

async function runAudit() {
    console.log("Iniciando auditoría de vinculación de Rubros...");
    
    const { data: rubrosActivos } = await supabase.from('maestro_rubros').select('*');
    console.log("\n[MAESTRO DE RUBROS ACTIVOS EN LA DB]:");
    rubrosActivos.forEach(r => console.log(`- ID: ${r.id} | NOMBRE: ${r.nombre_rubro}`));

    const { data: items } = await supabase.from('tabla_maestra_operativa').select('id, datos_maestros, rubro_id');
    
    let total = items.length;
    let huerfanos = 0;
    let vinculados = 0;
    
    const huerfanosEjemplos = new Set();
    const huerfanosValues = new Set();
    
    items.forEach(item => {
        if (!item.rubro_id) {
            huerfanos++;
            const fuzzyMap = item.datos_maestros.Rubro || item.datos_maestros.rubro;
            if (fuzzyMap) huerfanosEjemplos.add(fuzzyMap);
        } else {
            vinculados++;
        }
    });

    console.log(`\n[ANALISIS DE IMPACTO]`);
    console.log(`TOTAL ITEMS EN TABLA MAESTRA: ${total}`);
    console.log(`VINCULADOS EXITOSAMENTE: ${vinculados}`);
    console.log(`HUERFANOS (Sin rubro_id asignado): ${huerfanos}`);
    
    if (huerfanos > 0) {
        console.log(`\n[VALORES TEXTUALES DE LOS HUÉRFANOS] (Lo que dicen en el crudo JSON):`);
        huerfanosEjemplos.forEach(str => console.log(`  -> "${str}"`));
    }
}

runAudit().catch(console.error);
