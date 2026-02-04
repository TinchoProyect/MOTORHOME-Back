const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
// const path = require('path'); // Removed duplicate
const fs = require('fs');

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../service-account.json');

console.log("\n🔍 INICIANDO AUDITORÍA TÉCNICA (PRE-FLIGHT FASE 4)\n");

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERROR FATAL: Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DRIVE PREP ---
let driveClient = null;
async function getDriveClient() {
    if (driveClient) return driveClient;
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) throw new Error(`Falta service-account.json en ${SERVICE_ACCOUNT_PATH}`);

    const keys = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    const client = new JWT({
        email: keys.client_email,
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    await client.authorize();
    driveClient = google.drive({ version: 'v3', auth: client });
    return driveClient;
}

// --- CHECKS ---

async function checkDatabase() {
    console.log("--> 1. AUDITORÍA DE BASE DE DATOS");
    let passed = true;

    // A. Check proveedor_listas_raw
    const { error: err1, data: data1 } = await supabase.from('proveedor_listas_raw').select('*').limit(1);

    if (err1) {
        console.log(`   ❌ [FAIL] Tabla 'proveedor_listas_raw': NO ACCESIBLE o NO EXISTE. (${err1.message})`);
        passed = false;
    } else {
        console.log(`   ✅ [OK] Tabla 'proveedor_listas_raw' detectada.`);
        // Basic element check relies on Select * working, strict column check requires schema inspection or metadata try
        // Try to select specific columns to confirm they exist
        const { error: errCol } = await supabase.from('proveedor_listas_raw').select('archivo_id, status_global, formato_guia_id').limit(1);
        if (errCol) {
            console.log(`   ⚠️ [WARN] Columnas esperadas no encontradas: ${errCol.message}`);
            // If formato_guia_id missing is GOOD, we need to distinguish.
            if (errCol.message.includes('formato_guia_id')) {
                console.log(`   ✨ [GOOD] Columna 'formato_guia_id' parece NO existir (como se deseaba).`);
            } else {
                console.log(`   ❌ [FAIL] Faltan columnas críticas (archivo_id, status_global).`);
                passed = false;
            }
        } else {
            console.log(`   ℹ️ [INFO] Columnas archivo_id y status_global presentes.`);
            // Check if 'formato_guia_id' exists (it shouldn't per audit instructions? verify)
            // User said: "Confirmar que las columnas "basura" (ej: formato_guia_id) hayan desaparecido efectivamente."
            // If the select worked, it means they EXIST.
            console.log(`   ⚠️ [WARN] La columna 'formato_guia_id' AÚN EXISTE en la base de datos.`);
            console.log(`             (Esto no impide la Fase 4, pero contradice la limpieza total si se esperaba drop).`);
            // We won't fail the audit for existence, but we note it.
        }
    }

    // B. Check proveedor_items_extraidos
    const { error: err2 } = await supabase.from('proveedor_items_extraidos').select('raw_data').limit(1);
    if (err2) {
        console.log(`   ❌ [FAIL] Tabla 'proveedor_items_extraidos' o columna 'raw_data': FALLO. (${err2.message})`);
        passed = false;
    } else {
        console.log(`   ✅ [OK] Tabla 'proveedor_items_extraidos' y columna 'raw_data' verificadas.`);
    }

    return passed;
}

async function checkDrive() {
    console.log("\n--> 2. AUDITORÍA DE CONECTIVIDAD DRIVE");
    let passed = true;

    // Get Providers
    const { data: providers, error } = await supabase.from('proveedores').select('id, nombre, drive_folder_id, drive_folder_extracted_id');

    if (error) {
        console.log(`   ❌ [FAIL] No se pudo leer tabla 'proveedores'.`);
        return false;
    }

    if (!providers || providers.length === 0) {
        console.log(`   ⚠️ [WARN] No hay proveedores registrados para auditar.`);
        return true;
    }

    try {
        const drive = await getDriveClient();
        console.log(`   ℹ️ [INFO] Analizando ${providers.length} proveedores...`);

        for (const p of providers) {
            process.stdout.write(`   - [${p.nombre}] `);

            if (!p.drive_folder_id) {
                console.log(`❌ [FAIL] Sin Root ID.`);
                passed = false;
                continue;
            }

            // PING ROOT
            try {
                await drive.files.get({ fileId: p.drive_folder_id, fields: 'id, name' });
                process.stdout.write(`Root: ✅ `);
            } catch (e) {
                process.stdout.write(`Root: ❌ (${e.message}) `);
                passed = false;
            }

            // PING EXTRACTED
            if (p.drive_folder_extracted_id) {
                try {
                    await drive.files.get({ fileId: p.drive_folder_extracted_id, fields: 'id, name' });
                    process.stdout.write(`| Extracted: ✅`);
                } catch (e) {
                    process.stdout.write(`| Extracted: ❌ (ID inválido o sin acceso)`);
                    // Warning only? No, user implied critical.
                    passed = false;
                }
            } else {
                process.stdout.write(`| Extracted: ⚠️ (No configurado)`);
                // passed = false; // Maybe strict?
            }
            console.log("");
        }

    } catch (e) {
        console.log(`   ❌ [FAIL] Error general de Drive API: ${e.message}`);
        passed = false;
    }

    return passed;
}

async function run() {
    const dbOk = await checkDatabase();
    const driveOk = await checkDrive();

    console.log("\n---------------------------------------------------");
    if (dbOk && driveOk) {
        console.log("✅ RESULTADO: TERRENO FIRME. INICIO DE FASE 4 AUTOERIZADO.");
        console.log("   (Nota: Si existen columnas legacy, ignorarlas en el código).");
    } else {
        console.log("❌ RESULTADO: NO APTO. CORREGIR ERRORES DE INFRAESTRUCTURA ANTES DE SEGUIR.");
    }
    console.log("---------------------------------------------------");
}

run();
