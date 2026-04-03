/**
 * Viewer AI Service
 * Capa de Transporte Aislada y Controlador de Estado Periférico
 */

class ViewerAiService {
    constructor() {
        this.backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        this.isHealthy = false;
        this.isProcessing = false;
        this.lastCallTime = 0;
        this.THROTTLE_MS = 1500; // Anti DoS Wallets
    }

    async checkHealth() {
        try {
            // Simulamos un endpoint ultra rápido tipo ping
            const response = await fetch(`${this.backendUrl}/api/ai/health`, { 
                method: 'GET',
                signal: AbortSignal.timeout(3000) 
            });
            this.isHealthy = response.ok;
            return this.isHealthy;
        } catch (err) {
            this.isHealthy = false;
            return false;
        }
    }

    async generateETLRule(payload) {
        if (this.isProcessing) throw new Error("Generación en progreso");
        
        const now = Date.now();
        if (now - this.lastCallTime < this.THROTTLE_MS) {
            throw new Error(`Esperar ${this.THROTTLE_MS}ms entre peticiones`);
        }

        this.isProcessing = true;
        this.lastCallTime = now;

        try {
            const bodyStr = JSON.stringify(payload);
            console.log("==========================================");
            console.log("[AI UI - STEP 1] 🌐 Network Request (Frontend -> Backend)");
            console.log("URL:", `${this.backendUrl}/api/ai/generate-etl-rule`);
            console.log("PAYLOAD SIZE:", bodyStr.length, "bytes");
            console.log("PAYLOAD COMPLETO:\n", JSON.parse(bodyStr));
            console.log("==========================================\n");

            const response = await fetch(`${this.backendUrl}/api/ai/generate-etl-rule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bodyStr
            });

            if (!response.ok) {
                let errorMsg = `HTTP Error: ${response.status} ${response.statusText}`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch(e) {}
                console.error("[AI UI - STEP 1] ❌ Terminó con error:", errorMsg);
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            return data;
        } finally {
            this.isProcessing = false;
        }
    }
}

// Singleton local
const aiService = new ViewerAiService();
export default aiService;
