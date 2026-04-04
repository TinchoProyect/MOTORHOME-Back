/**
 * Viewer AI Sampler
 * Motor matemático de clusterización por longitud ("Geometría del String")
 */

class ViewerAiSampler {
    constructor() {}

    /**
     * Aplica el draft pipeline actual sobre la celda
     */
    _hydrateCell(rawVal, currentPipeline) {
        if (!currentPipeline || currentPipeline.length === 0 || !window.viewerETL) {
            return String(rawVal || "");
        }
        const rs = window.viewerETL.transformCell(String(rawVal || ""), currentPipeline);
        if (rs.rejected) return null;
        return rs.display || rs.result || "";
    }

    /**
     * Extrae y devuelve un array equilibrado maximal (N=100)
     */
    extractSmartSample(dataIdx, currentPipeline, maxSamples = 100) {
        if (!window.currentSheetData) return [];

        const shortCluster = new Map();  // < 5 chars
        const mediumCluster = new Map(); // 5 a 20 chars
        const longCluster = new Map();   // > 20 chars
        const exoticCluster = new Map(); // Contains punctuation !@#$%^&*()-=+/etc

        // Obtener cabeceras reales (Fila 0 asumiendo que anchor es 0, si no, lo más seguro es mapear por índice si no tenemos headers puros aquí)
        // Para contexto de la fila, simplemente armaremos un objecto Index -> Value, o si existen labels en mapping, usaremos eso.
        // Pero el sampler original no conoce el schema. Solo tenemos currentSheetData.
        // Mejor: armamos "Col 0": "Val", "Col 1": "Val"...
        const totalRows = window.currentSheetData.length;
        const loopLimit = Math.min(totalRows, 15000);
        
        // Cabeceras (asumiendo fila 0)
        const sampleHeaders = window.currentSheetData[0] || [];

        for (let i = 1; i < loopLimit; i++) {
            const rawRow = window.currentSheetData[i];
            if (!rawRow) continue;
            
            const rawVal = rawRow[dataIdx];
            
            if (rawVal === null || rawVal === undefined) continue;

            // Mutar al estado presente
            const stageVal = this._hydrateCell(rawVal, currentPipeline);
            if (stageVal === null || stageVal.trim() === '') continue;

            const len = stageVal.length;
            
            // Construir contexto horizontal (excluyendo la celda actual)
            const rowContext = {};
            // Limitar contexto a un radio de columnas para no colapsar el payload (ej. solo las 10 primeras columnas no vacías)
            let ctxCount = 0;
            for (let c = 0; c < Math.min(rawRow.length, 30); c++) {
                if (c === dataIdx) continue;
                const cVal = rawRow[c];
                if (cVal !== null && cVal !== undefined && String(cVal).trim() !== "") {
                    // Usar la cabecera real si existe, o un nombre genérico
                    const colName = (sampleHeaders[c] ? String(sampleHeaders[c]).trim() : `Columna ${c}`);
                    rowContext[colName] = String(cVal).trim();
                    ctxCount++;
                    if (ctxCount >= 10) break; // Máx 10 columnas de contexto para no inflar masivamente
                }
            }

            const payloadObj = {
                valor_objetivo: stageVal,
                contexto_fila: rowContext
            };
            
            // Detección exótica
            if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(stageVal)) {
                if (exoticCluster.size < 40) exoticCluster.set(stageVal, payloadObj);
            }

            if (len < 5 && shortCluster.size < 30) {
                shortCluster.set(stageVal, payloadObj);
            } else if (len >= 5 && len <= 20 && mediumCluster.size < 40) {
                mediumCluster.set(stageVal, payloadObj);
            } else if (len > 20 && longCluster.size < 30) {
                longCluster.set(stageVal, payloadObj);
            }

            if (shortCluster.size >= 30 && mediumCluster.size >= 40 && longCluster.size >= 30 && exoticCluster.size >= 40) {
                break;
            }
        }

        const combined = [
            ...Array.from(exoticCluster.values()),
            ...Array.from(mediumCluster.values()),
            ...Array.from(shortCluster.values()),
            ...Array.from(longCluster.values())
        ];

        return combined.slice(0, maxSamples);
    }
}

export default new ViewerAiSampler();
