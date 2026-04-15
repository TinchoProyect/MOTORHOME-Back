/**
 * VIGÍA DE RED ROBUSTO (Global Fetch Interceptor)
 * Exigencia de QA - Determinismo Absoluto en Capa de Red
 */
(function() {
    // Restaurar console.log original para que el Vigía pueda hablar (sobrepasando el silencio de radio previo)
    const log = window.originalConsoleLog || console.log;
    const error = console.error;

    log("🛡️ [VIGÍA DE RED] Interceptor Global Inicializado. Capturando tráfico de datos...");

    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
        const [resource, config] = args;
        const method = config?.method || 'GET';
        const isApi = typeof resource === 'string' && resource.includes('/api/');
        
        let reqLog = `\n=======================================\n`;
        reqLog += `🌐 [VIGÍA - SALIDA] Petición Interceptada\n`;
        reqLog += `- Endpoint Exacto: ${resource}\n`;
        reqLog += `- Método: ${method}\n`;
        
        // El Vigía evalúa el estado del Token
        const headers = config?.headers || {};
        const authToken = headers['Authorization'] || headers['authorization'];
        if (authToken) {
            reqLog += `- Token Inyectado en Headers (Frontend): [PRESENTE] ${authToken.substring(0, 15)}...\n`;
        } else {
            reqLog += `- Token Inyectado en Headers (Frontend): [NULO / NO APLICA]\n  (Nota Arquitectónica: LAMDA NO envía tokens de Google desde el frontend. El Token viaja nulo porque el Backend lee 'oauth2_tokens.json' localmente de su disco duro).\n`;
        }
        
        if (isApi) log(reqLog);

        try {
            const response = await originalFetch.apply(this, args);
            
            // Evaluar Respuesta Cruda HTTP
            let resLog = `\n📥 [VIGÍA - RETORNO] Respuesta del Servidor\n`;
            resLog += `- Servidor devolvió HTTP Code: ${response.status} (${response.statusText})\n`;
            
            if (!response.ok) {
                resLog += `⚠️ ALERTA: LA PETICIÓN FALLÓ A NIVEL RED.\n`;
                // Clonamos para leer el body sin consumirlo para la app
                const clone = response.clone();
                try {
                    const errorText = await clone.text();
                    resLog += `- Error Crudo del Backend: ${errorText}\n`;
                } catch(e) {
                    resLog += `- Error Crudo del Backend: [Inaccesible]\n`;
                }
            } else {
                resLog += `✅ Estado de Enlace: Estable\n`;
            }
            resLog += `=======================================\n`;
            
            if (isApi || !response.ok) {
                if (!response.ok) error(resLog);
                else log(resLog);
            }
            
            return response;
        } catch (err) {
            let catchLog = `\n📥 [VIGÍA - RETORNO] CAÍDA FULMINANTE DE RED\n`;
            catchLog += `- HTTP Code: ERR_CONNECTION_REFUSED / NETWORK_ERROR\n`;
            catchLog += `- Detalles: ${err.message}\n`;
            catchLog += `=======================================\n`;
            error(catchLog);
            throw err;
        }
    };
})();
