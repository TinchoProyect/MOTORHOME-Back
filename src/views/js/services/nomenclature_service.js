/**
 * NOMENCLATURE SERVICE
 * Servicio dedicado para la gestión de términos del diccionario.
 * Encapsula la comunicación con el Backend API para garantizar
 * el aislamiento de datos por proveedor.
 * 
 * v1.0
 */

const NomenclatureService = (function () {

    // Obtener URL base del config o default
    const getBaseUrl = () => (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

    /**
     * Obtiene todos los términos disponibles para un proveedor.
     * @param {string} providerId - ID del proveedor actual (puede ser null para Global)
     * @returns {Promise<Array>} Lista de términos
     */
    async function getAll(providerId) {
        try {
            const url = `${getBaseUrl()}/api/files/dictionary?providerId=${providerId || ''}`;
            console.log(`[NomenclatureService] Fetching terms for Provider: ${providerId || 'GLOBAL (Strict)'}`);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            return await response.json();
        } catch (error) {
            console.error("[NomenclatureService] Error getting terms:", error);
            // Fallback silencioso a lista vacía para no romper la UI
            return [];
        }
    }

    /**
     * Crea un nuevo término en el diccionario.
     * @param {string} term - Nombre del término
     * @param {string} description - Descripción opcional
     * @param {string} providerId - ID del proveedor (Contexto)
     * @returns {Promise<Object>} El término creado
     */
    async function create(term, description, providerId) {
        try {
            const payload = {
                termino: term,
                descripcion: description,
                providerId: providerId // Backend manejará si es null -> Global
            };

            const response = await fetch(`${getBaseUrl()}/api/files/dictionary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Error creando término");

            return result;
        } catch (error) {
            console.error("[NomenclatureService] Error creating term:", error);
            throw error;
        }
    }

    // Public API
    return {
        getAll,
        create
    };

})();

// Expose global
window.NomenclatureService = NomenclatureService;
console.log("📚 NomenclatureService Loaded");
