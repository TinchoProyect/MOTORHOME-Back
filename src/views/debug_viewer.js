/**
 * VIGÍA DEL VISOR - Script de Diagnóstico Frontend
 * Intercepta la apertura de archivos y muestra logs en pantalla
 */
(function () {
    console.log("🕵️ VIGÍA DEL VISOR INICIADO");

    // Crear consola flotante
    const debugConsole = document.createElement('div');
    debugConsole.id = 'viewerDebugConsole';
    debugConsole.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 300px;
        background: rgba(0,0,0,0.9);
        color: #0f0;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 10px;
        border: 1px solid #0f0;
        z-index: 9999;
        overflow-y: auto;
        overflow-y: auto;
        display: none; /* OCULTO POR DEFECTO PARA NO MOLESTAR */
        pointer-events: none;
    `;
    // document.body.appendChild(debugConsole); // MOVED TO LOAD EVENT -> Fixes TypeError

    function log(msg, type = 'info') {
        const line = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ${msg}`;
        if (type === 'error') line.style.color = '#f00';
        if (type === 'warn') line.style.color = '#fa0';
        debugConsole.appendChild(line);
        debugConsole.scrollTop = debugConsole.scrollHeight;
        console.log(`[VIGÍA] ${msg}`);

        // Auto-mostrar si hay error
        if (type === 'error') debugConsole.style.display = 'block';
    }

    // Interceptar fetch original
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = args[0] ? args[0].toString() : '';

        // Solo monitorear descargas
        if (url.includes('/api/files/download')) {
            // debugConsole.style.display = 'block'; // NO MOSTRAR AUTOMÁTICAMENTE SI NO HAY ERROR
            log(`➡️ INICIANDO DESCARGA: ${url}`);

            try {
                const response = await originalFetch.apply(this, args);
                log(`⬅️ RESPUESTA: ${response.status} ${response.statusText}`);

                // Clonar para inspeccionar headers sin consumir body
                const clone = response.clone();
                const contentType = clone.headers.get('content-type');
                log(`   Content-Type: ${contentType}`);

                if (!response.ok) {
                    try {
                        const errText = await clone.text();
                        log(`❌ ERROR BODY: ${errText.substring(0, 100)}...`, 'error');
                    } catch (e) {
                        log(`❌ NO SE PUDO LEER ERROR: ${e.message}`, 'error');
                    }
                } else {
                    log(`✅ STREAM OK (Headers recibidos)`);
                }

                return response;
            } catch (err) {
                log(`💥 ERROR DE RED: ${err.message}`, 'error');
                throw err;
            }
        }
        return originalFetch.apply(this, args);
    };

    // Hookear funciones globales si existen
    if (typeof window.openFileViewer === 'function') {
        const originalOpen = window.openFileViewer;
        window.openFileViewer = async function (fileId, fileName) {
            debugConsole.innerHTML = ''; // Limpiar previo
            // debugConsole.style.display = 'block'; // NO MOSTRAR AUTOMÁTICAMENTE
            log(`👁️ INTENTO ABRIR: ${fileName} (ID: ${fileId})`);

            try {
                await originalOpen(fileId, fileName);
                log(`🏁 PROCESO VISUALIZACIÓN TERMINADO`);
            } catch (err) {
                log(`🔥 EXCEPCIÓN EN UI: ${err.message}`, 'error');
                console.error(err);
            }
        }
    } else {
        log("⚠️ openFileViewer no encontrado aún. Esperando...", 'warn');
    }

    // Wait for load to ensure body exists
    window.addEventListener('load', () => {
        document.body.appendChild(debugConsole);
        log("Listo para interceptar.", 'info');
    });

})();
