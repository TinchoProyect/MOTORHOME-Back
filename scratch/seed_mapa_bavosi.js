const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MAPA_BAVOSI = `
Estructura Anatómica del Documento:
- Puntuación Inversa: El documento utiliza la coma (,) como separador de miles y el punto (.) como separador de decimales (Ej: 4,115,553.62). Debes extraer los números interpretando este formato.
- Columnas de la Grilla (Orden literal de izquierda a derecha):
  1. Código
  2. Descripción
  3. Cantidad (Extraer estrictamente de esta columna, ej. 6.00)
  4. U/M (Ignorar para fines de precio unitario)
  5. % Descuento (Ignorar como precio unitario, es un descuento de fila)
  6. Importe (Este es el "subtotal" neto de la fila, extrae este valor exacto como subtotal).

Regla Crítica: NO extraigas el "% Descuento" como "precio_unitario". La columna Importe representa el subtotal real de la fila.
`;

async function seed() {
    try {
        console.log("Buscando proveedor Bavosi...");
        const { data: proveedores, error: errSearch } = await supabase
            .from('proveedores')
            .select('id, nombre')
            .ilike('nombre', '%Bavosi%');
            
        if (errSearch) throw errSearch;
        
        if (!proveedores || proveedores.length === 0) {
            console.log("No se encontró el proveedor Bavosi.");
            return;
        }

        const bavosiId = proveedores[0].id;
        console.log(`Proveedor encontrado: ${proveedores[0].nombre} (ID: ${bavosiId})`);

        const { data, error } = await supabase
            .from('proveedores')
            .update({ mapa_extraccion_ia: MAPA_BAVOSI.trim() })
            .eq('id', bavosiId);

        if (error) throw error;

        console.log("Mapa de extracción inyectado exitosamente.");
    } catch (e) {
        console.error("Error al inyectar el mapa:", e);
    }
}

seed();
