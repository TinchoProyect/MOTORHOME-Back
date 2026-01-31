const crypto = require('crypto');
const supabase = require('../config/supabaseClient');

/**
 * Genera un hash MD5 resiliente de los encabezados.
 * @param {string[]} headers - Array de encabezados (ej: [" SKU ", "Precio", ""])
 * @returns {string} Hash MD5
 */
function generateHeaderHash(headers) {
    if (!headers || !Array.isArray(headers)) return null;

    // 1. Normalización ULTRA-STRICT: Trim, Lowercase, AlphaNumeric Only
    // "Codigo Articulo" -> "codigoarticulo"
    const cleanHeaders = headers
        .map(h => h ? h.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : "")
        .filter(h => h.length > 0);

    if (cleanHeaders.length === 0) return null;

    // 2. Concatenación con separador seguro
    const fingerprintString = cleanHeaders.join('|');

    // 3. Hashing MD5
    return crypto.createHash('md5').update(fingerprintString).digest('hex');
}

/**
 * Busca si existe una plantilla conocida para este fingerprint.
 * @param {string} headerHash - El hash generado
 * @param {string} providerId - ID del proveedor (opcional, para filtrar)
 * @returns {Promise<object|null>} Objeto formato o null
 */
async function matchFingerprint(headerHash, providerId) {
    try {
        let query = supabase
            .from('proveedor_formatos_guia')
            .select('*')
            .eq('estado', 'ACTIVA');

        // Filtro por proveedor si se provee
        if (providerId) {
            query = query.eq('proveedor_id', providerId);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) return null;

        // Búsqueda en memoria del JSONB fingerprint
        // (Idealmente esto se hace en SQL con operador @>, pero por flexibilidad recorremos aquí)
        // Buscamos exact match en "header_hash"
        const match = data.find(f => {
            return f.fingerprint && f.fingerprint.header_hash === headerHash;
        });

        return match || null;

    } catch (err) {
        console.error("[FingerprintService] Error matching:", err);
        return null; // Fail safe: treat as new format
    }
}

module.exports = {
    generateHeaderHash,
    matchFingerprint
};
