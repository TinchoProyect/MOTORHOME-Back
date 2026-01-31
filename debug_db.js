require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runDebug() {
    let logBuffer = "--- DEBUG LOG ---\n";
    const log = (msg) => { console.log(msg); logBuffer += msg + "\n"; };

    // 1. Listar ultimos 10 archivos procesados
    const { data: rawFiles, error: errRows } = await supabase
        .from('proveedor_listas_raw')
        .select('id, nombre_archivo, status_global, proveedor_id, created_at, formato_guia_id')
        .order('created_at', { ascending: false })
        .limit(10);

    if (errRows) log("Error fetching raw: " + JSON.stringify(errRows));
    else {
        log(`Last 10 files processed:`);
        rawFiles.forEach(f => {
            log(`- File: ${f.nombre_archivo} | Status: ${f.status_global} | Created: ${f.created_at} | ID: ${f.id} | TplID: ${f.formato_guia_id}`);
        });

        if (rawFiles.length > 0) {
            const lastFile = rawFiles[0];
            // Check ITEM COUNT
            const { count, error: errCount } = await supabase
                .from('proveedor_items_extraidos')
                .select('*', { count: 'exact', head: true })
                .eq('lista_raw_id', lastFile.id);

            log(`Item Count for ${lastFile.id}: ${count} (Error: ${errCount})`);

            if (lastFile.formato_guia_id) {
                const { data: tpl } = await supabase.from('proveedor_formatos_guia').select('*').eq('id', lastFile.formato_guia_id).single();
                log(`Foreign Key Check: Template ${lastFile.formato_guia_id} -> ${tpl ? 'FOUND (' + tpl.nombre_formato + ')' : 'NOT FOUND'}`);
            } else {
                log(`Foreign Key Check: File has NULL formato_guia_id! This explains why modal is skipped.`);
            }
        }
    }

    // 2. BUSQUEDA ESPECIFICA DE BABOSSI
    const { data: provs } = await supabase.from('proveedores').select('id, nombre, email').ilike('nombre', '%babossi%');
    log("Providers found: " + JSON.stringify(provs, null, 2));

    if (provs && provs.length > 0) {
        const provId = provs[0].id;
        const { data: templates } = await supabase
            .from('proveedor_formatos_guia')
            .select('*')
            .eq('proveedor_id', provId);

        log(`Templates for Babossi (${provId}):`);
        templates.forEach(t => {
            log(`- Tpl: ${t.nombre_formato} | State: ${t.estado} | FP: ${JSON.stringify(t.fingerprint).substring(0, 50)}...`);
        });
    }

    fs.writeFileSync('debug_log.txt', logBuffer);
}

runDebug();
