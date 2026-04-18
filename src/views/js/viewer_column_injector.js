/**
 * VIEWER COLUMN INJECTOR - Módulo Satélite V2.8
 * Permite la inserción dinámica de "Placeholders" (Columnas Vacías)
 * en la etapa pre-ETL para ser mapeables sin corromper el Excel físico.
 */

window.ViewerColumnInjector = {
    /**
     * Inyecta una nueva columna virtual (Placeholder vacía) 
     * en la grilla del Visor Universal.
     */
    injectEmptyColumn: function() {
        if (!window.virtualColumns) {
            console.warn("⚠️ [INJECTOR] Aún no hay columnas virtuales inicializadas.");
            alert("No puedes agregar columnas hasta que el archivo esté cargado.");
            return;
        }
        
        // 1. Encontrar el índice más alto actualmente en uso por el dataset
        let maxDataIdx = -1;
        window.virtualColumns.forEach(c => {
            const parsedIdx = parseInt(c.dataIdx, 10);
            if (!isNaN(parsedIdx) && parsedIdx > maxDataIdx) {
                maxDataIdx = parsedIdx;
            }
        });
        
        const newDataIdx = maxDataIdx + 1;
        // [V10 FIX DETERMINISTA] Usar Date.now() para generar el ID de la columna,
        // garantizando aislamiento total en memoria y previniendo reciclaje de mapeos "Zombies".
        const newColId = `col_ph_${Date.now()}`;
        
        // Limpiador defensivo por si hubiera un milisegundo gemelo (imposible)
        if (window.draftPipelines && window.draftPipelines[newColId]) delete window.draftPipelines[newColId];
        if (window.columnMapping && window.columnMapping[newColId]) delete window.columnMapping[newColId];
        
        // 2. Crear Columna Virtual "Placeholder" Física (Trata la nueva columna como dato orgánico)
        const newCol = {
            id: newColId,
            dataIdx: newDataIdx,
            isGhostPlaceholder: true,
            _isNewTemp: true // Permite que sobreviva hasta ser mapeada
        };
        
        window.virtualColumns.push(newCol);
        
        // 3. Forzar existencia física mutando temporalmente la memoria RAM (currentSheetData)
        // Esto previene que el renderer salte por Out of Bounds, y permite que las celdas se dibujen
        if (window.currentSheetData && Array.isArray(window.currentSheetData)) {
            window.currentSheetData.forEach((row, i) => {
                if (i === 0) {
                    row[newDataIdx] = 'NUEVA (VACÍA)'; // Encabezado Simulador
                } else {
                    row[newDataIdx] = null; // Celdas vacías
                }
            });
        }
        
        // 4. Guardar Automáticamente la estructura Alterada (Pipeline 1 a la Base de Datos V3)
        if (typeof window.saveSheetState === 'function' && window.currentSheetName) {
            window.saveSheetState(window.currentSheetName);
        }
        
        if (typeof window.saveSimulationConfig === 'function') {
            window.saveSimulationConfig(null, true);
        }

        // 5. Re-renderizar Vista
        if (typeof window.renderVirtualTable === 'function') {
            window.renderVirtualTable(window.currentSheetData);
        }
        
        console.log(`✅ [INJECTOR] Columna Placeholder Inyectada -> ID: ${newColId} (dataIdx: ${newDataIdx})`);
    },
    
    /**
     * Inicializa el módulo y vincula el listener de forma robusta
     * Previniendo memory leaks o suscripciones múltiples (firing twice)
     */
    init: function() {
        if (this._isInitialized) return;
        
        const btn = document.getElementById("btnInjectColumn");
        if (btn) {
            // Remueve listeners previos limpiando el nodo en el DOM
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener("click", () => {
                this.injectEmptyColumn();
            });
            
            this._isInitialized = true;
            console.log("✅ [INJECTOR] Event Listener montado exitosamente de forma aislada.");
        }
    }
};

// Automontaje de Eventos al Documento
document.addEventListener('DOMContentLoaded', () => {
    window.ViewerColumnInjector.init();
});
