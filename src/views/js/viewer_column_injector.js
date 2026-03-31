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
            if (c.dataIdx !== undefined && c.dataIdx > maxDataIdx) {
                maxDataIdx = c.dataIdx;
            }
        });
        
        const newDataIdx = maxDataIdx + 1;
        const newColId = `col_ph_${Date.now()}`;
        
        // 2. Crear Columna Virtual "Placeholder" Física (Trata la nueva columna como dato orgánico)
        const newCol = {
            id: newColId,
            dataIdx: newDataIdx,
            isGhostPlaceholder: true 
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
    }
};
