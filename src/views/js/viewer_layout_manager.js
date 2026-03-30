/**
 * LAMDA VIEWER LAYOUT MANAGER
 * Módulo puro responsable de encapsular y gestionar la configuración visual (anchos, orden) de la UI.
 * Sustituye monolitos y lógicas acopladas de renderizado.
 */

console.log("%c 📐 VIEWER LAYOUT MANAGER: READY ", "background: #f59e0b; color: #fff; font-weight: bold; padding: 4px;");

window.LayoutManager = {
    // Estado residente de visualización en RAM
    state: {
        widths: {}, // Indexed by Virtual Column ID (e.g. 'col_0') for structural integrity
        order: []   // Array of Virtual Column IDs dictating order
    },

    /**
     * Re-hidrata el estado visual desde la Base de Datos al abrir el Excel.
     */
    hydrateSettings(json) {
        if (!json) return;
        if (json.widths) this.state.widths = json.widths;
        if (json.order && Array.isArray(json.order)) this.state.order = json.order;
        console.log("📐 [LayoutManager] Estado visual rehidratado desde DB.");
    },

    /**
     * Serializa las preferencias actuales para enviarlas por red a Supabase.
     */
    serializeSettings() {
        return {
            widths: this.state.widths || {},
            order: this.state.order || []
        };
    },

    // --- MANEJO DE ANCHOS (WIDTHS) ---
    
    /**
     * Registra un ancho específico para una columna.
     * @param {string} virtualColId ID estricto (no el index volátil del array)
     * @param {number} widthPx píxeles en número entero
     */
    recordWidth(virtualColId, widthPx) {
        if (!virtualColId) return;
        this.state.widths[virtualColId] = widthPx;
    },

    /**
     * Devuelve el ancho formateado en CSS, o un predeterminado si no exite el registro.
     * @param {string} virtualColId 
     * @param {string} fallback defecto ej. "150px"
     */
    getWidthCSS(virtualColId, fallback = "150px") {
        if (virtualColId && this.state.widths[virtualColId]) {
            return this.state.widths[virtualColId] + 'px';
        }
        return fallback;
    },

    // --- MANEJO DE ORDEN (ORDERING) ---

    /**
     * Graba un snapshot del orden actual basado en el array de Virtual Columns.
     * @param {Array} virtualColumnsArray 
     */
    recordOrder(virtualColumnsArray) {
        if (!Array.isArray(virtualColumnsArray)) return;
        this.state.order = virtualColumnsArray.map(v => v.id);
    },

    /**
     * Reorganiza 'in-place' el array virtual orquestándolo contra las preferencias persistidas.
     * @param {Array} virtualColumnsArray 
     */
    applyOrder(virtualColumnsArray) {
        if (!this.state.order || this.state.order.length === 0) return virtualColumnsArray;
        
        virtualColumnsArray.sort((a, b) => {
            let idxA = this.state.order.indexOf(a.id);
            let idxB = this.state.order.indexOf(b.id);
            if (idxA === -1) idxA = 9999;
            if (idxB === -1) idxB = 9999;
            return idxA - idxB;
        });
        
        return virtualColumnsArray;
    }
};
