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

    /**
     * Elimina un término del diccionario por su ID.
     * @param {string} id - ID del término a eliminar
     * @returns {Promise<Object>} Resultado de la operación
     */
    async function deleteTerm(id) {
        try {
            if (!id) throw new Error("ID es requerido para eliminar");

            console.log(`[NomenclatureService] Deleting term ID: ${id}`);
            const response = await fetch(`${getBaseUrl()}/api/files/dictionary/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Error eliminando término");
            }
            return await response.json();
        } catch (error) {
            console.error("[NomenclatureService] Error deleting term:", error);
            throw error;
        }
    }

    /**
     * Actualiza un término existente (Scope, Descripción, etc.)
     * @param {string} id - ID del término a actualizar
     * @param {Object} data - Datos a actualizar ({termino, descripcion, isGlobal, currentProviderId})
     */
    async function updateTerm(id, data) {
        try {
            console.log(`[NomenclatureService] Updating Term ID: ${id}`, data);

            // Mapper para adaptar al backend
            const payload = {
                id: id,
                termino: data.termino,
                descripcion_uso: data.descripcion,
                isGlobal: data.isGlobal,
                currentProviderId: data.currentProviderId
            };

            const response = await fetch(`${getBaseUrl()}/api/files/dictionary/update`, {
                method: 'POST', // Backend usa POST para updates complejos
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Error actualizando término");

            return result;
        } catch (error) {
            console.error("[NomenclatureService] Error updating term:", error);
            throw error;
        }
    }

    // Public API
    return {
        getAll,
        create,
        delete: deleteTerm,
        update: updateTerm // [NEW] Exposed Update Method
    };

})();

// Expose global
window.NomenclatureService = NomenclatureService;
console.log("📚 NomenclatureService Loaded");
