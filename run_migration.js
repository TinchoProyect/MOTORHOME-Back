const { Client } = require('pg');

async function runMigration() {
    const client = new Client({
        connectionString: 'postgresql://postgres:p-Jnz4N8yac9rSW@db.wofttcnpipozwupmpuul.supabase.co:5432/postgres'
    });
    
    try {
        await client.connect();
        console.log("Connected to DB");
        const res = await client.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS mapa_ocr_listas TEXT;');
        console.log("Migration successful:", res);
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

runMigration();
