const fs = require('fs');
const path = require('path');

// 1. Cargar Variables de Entorno (Manual parsing para no depender de dotenv)
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_KEY; // Service Role Key

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ Error: Faltan credenciales en .env");
    process.exit(1);
}

const ADMIN_USER = {
    email: "miserrano75@gmail.com",
    password: "di5dñ3&l7#ll8",
    email_confirm: true
};

async function createAdmin() {
    console.log(`🔐 Creando Llave Maestra para: ${ADMIN_USER.email}`);

    // A. Crear Usuario en Auth (Admin API)
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'apikey': SERVICE_KEY
            },
            body: JSON.stringify(ADMIN_USER)
        });

        const data = await response.json();

        if (!response.ok) {
            // Si ya existe, intentamos obtener su ID
            if (data.msg && data.msg.includes("already registered")) {
                console.log("⚠️ El usuario ya existe. Intentando recuperar ID...");
                // No podemos buscar por email via admin API fácilmente sin listar todos (o usar listUsers con filtro).
                // Alternativa: Listar usuarios
                const listResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
                    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY }
                });
                const listData = await listResp.json();
                const existing = listData.users.find(u => u.email === ADMIN_USER.email);
                if (existing) {
                    await verifyProfile(existing.id);
                    return;
                }
            }
            throw new Error(data.msg || data.error_description || "Error desconocido");
        }

        console.log(`✅ Usuario Auth Creado. UID: ${data.id}`);
        await verifyProfile(data.id);

    } catch (error) {
        console.error(`❌ Error Auth: ${error.message}`);
    }
}

async function verifyProfile(uid) {
    console.log(`🔎 Verificando perfil en tabla 'perfiles_acceso' para UID: ${uid}`);

    // B. Verificar en Tabla Publica
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/perfiles_acceso?id=eq.${uid}`, {
        headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY
        }
    });

    const profiles = await resp.json();

    if (profiles.length > 0) {
        console.log("✅ Perfil Sincronizado Correctamente:");
        console.table(profiles);
    } else {
        console.log("⚠️ Perfil no encontrado (Trigger falló o no existe). Creando manualmente...");
        // Insertar manual
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/perfiles_acceso`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'apikey': SERVICE_KEY,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                id: uid,
                email: ADMIN_USER.email,
                fecha_creacion: new Date().toISOString()
            })
        });

        if (insertResp.ok) {
            console.log("✅ Perfil Insertado Manualmente.");
        } else {
            console.error("❌ Error insertando perfil:", await insertResp.text());
        }
    }
}

createAdmin();
