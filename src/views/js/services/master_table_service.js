// src/views/js/services/master_table_service.js

/**
 * Service for handling HTTP requests for the Master Table logic dictionary
 * Architected to be completely agnostic of the DOM.
 */
const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

export const masterTableService = {
    /**
     * Fetch all fields from the master dictionary
     */
    async fetchMasterFields(activeOnly = false) {
        try {
            const url = activeOnly ? `${backendUrl}/api/master-table/dictionary?activeOnly=true&_t=${new Date().getTime()}` : `${backendUrl}/api/master-table/dictionary?_t=${new Date().getTime()}`;
            const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP Error ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("[MasterTableService] fetchMasterFields error:", error);
            throw error;
        }
    },

    /**
     * Create a new field in the master dictionary
     */
    async createMasterField(payload) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/dictionary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => { throw new Error("Respuesta inválida del servidor (No JSON)"); });
            if (!response.ok) {
                throw new Error(data.error || `HTTP Error ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error("[MasterTableService] createMasterField error:", error);
            throw error;
        }
    },

    /**
     * Update an existing field properties
     */
    async updateMasterField(id, payload) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/dictionary/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => { throw new Error("Respuesta inválida del servidor (No JSON)"); });
            if (!response.ok) {
                throw new Error(data.error || `HTTP Error ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error("[MasterTableService] updateMasterField error:", error);
            throw error;
        }
    },

    /**
     * Delete a field physically from the master dictionary
     */
    async deleteMasterField(id) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/dictionary/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json().catch(() => { throw new Error("Respuesta inválida del servidor (No JSON)"); });
            if (!response.ok) {
                throw new Error(data.error || `HTTP Error ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error("[MasterTableService] deleteMasterField error:", error);
            throw error;
        }
    },

    /**
     * Toggle the active status of a master field (Soft Delete)
     */
    async toggleMasterFieldStatus(id, isActive) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/dictionary/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ esta_activo: isActive })
            });

            const data = await response.json().catch(() => { throw new Error("Respuesta inválida del servidor (No JSON)"); });
            if (!response.ok) {
                throw new Error(data.error || `HTTP Error ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error("[MasterTableService] toggleMasterFieldStatus error:", error);
            throw error;
        }
    },

    // ==========================================
    // V5: CATEGORÍAS (Solapas Posicionales)
    // ==========================================
    async fetchCategories() {
        try {
            const url = `${backendUrl}/api/master-table/categories?_t=${new Date().getTime()}`;
            const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP Error ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("[MasterTableService] fetchCategories error:", error);
            throw error;
        }
    },

    async createCategory(payload) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => { throw new Error("No JSON"); });
            if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
            return data;
        } catch (error) {
            console.error("[MasterTableService] createCategory error:", error);
            throw error;
        }
    },

    async updateCategory(id, payload) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => { throw new Error("No JSON"); });
            if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
            return data;
        } catch (error) {
            console.error("[MasterTableService] updateCategory error:", error);
            throw error;
        }
    },

    async deleteCategory(id) {
        try {
            const response = await fetch(`${backendUrl}/api/master-table/categories/${id}`, {
                method: 'DELETE'
            });
            const data = await response.json().catch(() => { throw new Error("No JSON"); });
            if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
            return data;
        } catch (error) {
            console.error("[MasterTableService] deleteCategory error:", error);
            throw error;
        }
    }
};
