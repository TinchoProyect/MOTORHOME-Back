require('dotenv').config();
const supabase = require('../src/config/supabaseClient');

const schema = {
  prompt: "PRIORIDAD ABSOLUTA: Ignora la columna impresa 'Precio por Kilo'. Extrae únicamente el Precio de Caja bajo 'precio_unitario'. Extrae la cantidad de Kilos bajo la clave 'kilos' (ej: si dice '10 KG', extrae 10.0).",
  columns: [
    { field: "precio_unitario", headerName: "Precio Caja" },
    { field: "kilos", headerName: "Kilos Bulto" },
    { field: "precio_kilo", headerName: "Precio Kilo Calc", is_calculated: true }
  ],
  calculated_columns: [
    { field: "precio_kilo", formula: "precio_unitario / kilos" }
  ]
};

async function main() {
    console.log("Actualizando Pueblo Viejo...");
    const { data, error } = await supabase
        .from('proveedores')
        .update({ mapa_ocr_listas: JSON.stringify(schema) })
        .ilike('nombre', '%Pueblo Viejo%')
        .select();
        
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Éxito. Proveedores actualizados:", data.length);
    }
}

main();
