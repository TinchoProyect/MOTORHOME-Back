require('dotenv').config();
const supabase = require('../config/supabaseClient');

// Mapa de evolución semántica (Antiguo Textual en JSON -> Nuevo Hash Relacional o Nombre)
// Contempla cómo se llamaban antes en el crudo, hacia cómo se llaman ahora en maestro_rubros
const semanticEvolutionMap = {
    "DULCES-GLASEADOS-CONFITADOS": "REPOSTERIA",
    "CONDIMENTOS": "CONDIMENTOS-ESPECIAS-HIERBAS"
};

async function repairLinks() {
    console.log("[Reparador] 1. Descargando Diccionario de Rubros Maestros Actuales...");
    const { data: rubrosActivos, error: errRubros } = await supabase.from('maestro_rubros').select('*');
    if (errRubros) throw errRubros;
    
    // Hash map para búsqueda rápida
    const rubrosMap = new Map();
    rubrosActivos.forEach(r => rubrosMap.set(String(r.nombre_rubro).trim().toLowerCase(), r.id));

    console.log("[Reparador] 2. Descargando Productos Huérfanos en la Tabla Maestra...");
    const { data: items, error: errItems } = await supabase
        .from('tabla_maestra_operativa')
        .select('id, datos_maestros, rubro_id')
        .filter('rubro_id', 'is', null);
        
    if (errItems) throw errItems;
    
    console.log(`[Reparador] Se encontraron ${items.length} productos sin vinculación relacional.`);
    if (items.length === 0) return console.log("Nada que reparar.");

    let successCount = 0;
    
    // Batch Update preparations
    for (const item of items) {
        // En Postgres / Supabase, las keys varían. El script SQL falló por case-sensitivity y renombre
        const rawRubro = item.datos_maestros.rubro || item.datos_maestros.Rubro;
        if (!rawRubro) continue; // Si el producto no tiene rubro crudo, no podemos emparejarlo

        const normalizedRaw = String(rawRubro).trim().toUpperCase();
        const targetName = semanticEvolutionMap[normalizedRaw] || normalizedRaw;
        const targetSearchKey = targetName.toLowerCase();
        
        if (rubrosMap.has(targetSearchKey)) {
            const resolvedId = rubrosMap.get(targetSearchKey);
            
            // Efectuar UPDATE individual para enlazar
            const { error: updErr } = await supabase
                .from('tabla_maestra_operativa')
                .update({ rubro_id: resolvedId })
                .eq('id', item.id);
                
            if (updErr) {
                console.error(`Error al vincular el ID ${item.id}:`, updErr.message);
            } else {
                successCount++;
            }
        }
    }

    console.log(`\n[REPARACIÓN FINALIZADA]`);
    console.log(`Productos cicatrizados y enlazados relacionalmente: ${successCount} de ${items.length}`);
}

repairLinks().catch(console.error);
