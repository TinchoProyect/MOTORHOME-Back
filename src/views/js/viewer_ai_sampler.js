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

        const shortCluster = new Set();  // < 5 chars
        const mediumCluster = new Set(); // 5 a 20 chars
        const longCluster = new Set();   // > 20 chars
        const exoticCluster = new Set(); // Contains punctuation !@#$%^&*()-=+/etc

        // Escaneo profundo rápido (Skip headers)
        const totalRows = window.currentSheetData.length;
        // Limit to first 15,000 to avoid freezing the browser in huge clusters
        const loopLimit = Math.min(totalRows, 15000);

        for (let i = 1; i < loopLimit; i++) {
            const rawRow = window.currentSheetData[i];
            const rawVal = rawRow[dataIdx];
            
            if (rawVal === null || rawVal === undefined) continue;

            // Mutar al estado presente (Mitigación Objeción 3)
            const stageVal = this._hydrateCell(rawVal, currentPipeline);
            if (stageVal === null || stageVal.trim() === '') continue;

            const len = stageVal.length;
            
            // Detección exótica (suele indicar ruido, codigos, nros complejos)
            if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(stageVal)) {
                if (exoticCluster.size < 40) exoticCluster.add(stageVal);
            }

            if (len < 5 && shortCluster.size < 30) {
                shortCluster.add(stageVal);
            } else if (len >= 5 && len <= 20 && mediumCluster.size < 40) {
                mediumCluster.add(stageVal);
            } else if (len > 20 && longCluster.size < 30) {
                longCluster.add(stageVal);
            }

            // Si los todos se llenaron, cortamos barrido
            if (shortCluster.size >= 30 && mediumCluster.size >= 40 && longCluster.size >= 30 && exoticCluster.size >= 40) {
                break;
            }
        }

        // Combinación inteligente priorizando exóticos y medios (los que suelen romperse)
        const combined = new Set([
            ...Array.from(exoticCluster),
            ...Array.from(mediumCluster),
            ...Array.from(shortCluster),
            ...Array.from(longCluster)
        ]);

        return Array.from(combined).slice(0, maxSamples);
    }
}

export default new ViewerAiSampler();
