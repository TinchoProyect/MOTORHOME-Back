require('dotenv').config({ path: '../.env' }); // Adjust path if needed or just .env
const { createClient } = require('@supabase/supabase-js');
const fingerprintService = require('../src/services/fingerprintService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function formatAndAudit() {
    console.log("🕵️‍♂️ INICIANDO AUDITORÍA DE HUELLAS DIGITALES...");

    // 1. Fetch Formatos
    const { data: formatos, error } = await supabase
        .from('proveedor_formatos_guia')
        .select('*');

    if (error) {
        console.error("Error fetching formats:", error);
        return;
    }

    console.log(`📋 Encontrados ${formatos.length} formatos. Verificando compatibilidad Ultra-Strict...`);

    for (const fmt of formatos) {
        const fp = fmt.fingerprint;
        if (!fp || !fp.expected_headers) {
            console.log(`⚠️  Formato ${fmt.id} (${fmt.nombre_formato}) sin headers esperados. Skip.`);
            continue;
        }

        // 2. Recalcular Hash con lógica NUEVA
        const oldHash = fp.header_hash;
        const newHash = fingerprintService.generateHeaderHash(fp.expected_headers);

        if (oldHash !== newHash) {
            console.log(`🔄 DESINCRONIZACIÓN DETECTADA en: ${fmt.nombre_formato}`);
            console.log(`   🔸 Old: ${oldHash}`);
            console.log(`   🔹 New: ${newHash}`);

            // 3. Auto-Fix (Migration)
            fp.header_hash = newHash;

            const { error: updateError } = await supabase
                .from('proveedor_formatos_guia')
                .update({ fingerprint: fp })
                .eq('id', fmt.id);

            if (updateError) console.error("   ❌ Error actualizando:", updateError.message);
            else console.log("   ✅ CORREGIDO (Base de Datos Sincronizada)");
        } else {
            console.log(`✅ OK: ${fmt.nombre_formato}`);
        }
    }
    console.log("🏁 Auditoría Finalizada.");
}

formatAndAudit();
