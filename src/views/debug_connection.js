
(function () {
    console.log("%c 🕵️ VIGÍA ACTIVADO ", "background: #222; color: #bada55; font-size: 20px; padding: 10px; border-radius: 5px;");

    // Configuración
    const BACKEND_PORT = 5655; // El puerto real
    const FRONTEND_PORT = window.location.port;

    console.group("📊 REPORTE DE ESTADO INICIAL [VIGÍA]");
    console.log(`🌍 URL Actual: ${window.location.href}`);
    console.log(`🔌 Puerto Frontend: ${FRONTEND_PORT}`);
    console.log(`🎯 Puerto Backend Esperado: ${BACKEND_PORT}`);
    console.groupEnd();

    // 1. Interceptar Fetch para logging
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = args[0];
        const isBackendRequest = url.includes(BACKEND_PORT) || url.startsWith('/api');

        if (isBackendRequest) {
            console.log(`📡 [VIGÍA] Fetch Detectado -> ${url}`);
        }

        try {
            const start = performance.now();
            const response = await originalFetch.apply(this, args);
            const duration = (performance.now() - start).toFixed(2);

            if (isBackendRequest) {
                const statusColor = response.ok ? '#4ade80' : '#ef4444';
                console.log(`%c 🔙 [VIGÍA] Respuesta ${response.status} (${duration}ms) `, `color: ${statusColor}; font-weight: bold;`);

                if (!response.ok) {
                    console.warn(`🛑 Error en Backend: ${response.statusText}`);
                }
            }
            return response;
        } catch (error) {
            if (isBackendRequest) {
                console.error(`🔥 [VIGÍA] FALLO CRÍTICO DE CONEXIÓN:`, error);

                // Notificación visual en pantalla si falla conexión al backend
                showVigiaAlert(`Error de Conexión al Backend (${BACKEND_PORT})`, error.message);
            }
            throw error;
        }
    };

    // 2. Notificación Visual (Floating Toast)
    function showVigiaAlert(msg, type) {
        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; 
            background: ${type === 'error' ? '#7f1d1d' : '#064e3b'}; 
            color: white; padding: 15px; border-radius: 8px; 
            z-index: 99999; font-family: monospace; font-size: 12px;
            border: 1px solid ${type === 'error' ? '#ef4444' : '#34d399'};
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            animation: slideIn 0.3s ease-out;
        `;
        div.innerHTML = `<strong>👽 VIGÍA REPORTA:</strong><br>${msg}`;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 5000);

        // Add animation style if not exists
        if (!document.getElementById('vigia-style')) {
            const style = document.createElement('style');
            style.id = 'vigia-style';
            style.innerHTML = `@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`;
            document.head.appendChild(style);
        }

        // VOZ DE NOTIFICACIÓN
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(type === 'error' ? 'Atención: ' + msg : 'Éxito: Operación completada');
            utterance.lang = 'es-ES';
            utterance.rate = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    }

    // 3. Test de Conexión (Ping)
    async function checkBackend() {
        // ... (Ping logic remains if needed, or just close IIFE)
    }

})();
