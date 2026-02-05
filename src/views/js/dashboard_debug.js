/**
 * DASHBOARD DEBUG - VIGÍA DE REFRESCO 🕵️‍♂️
 * Inyecta logs en funciones críticas de carga y renderizado.
 * Uso: Diagnóstico de Bug de Refresco (Ingesta/Rollback)
 */

(function () {
    console.log("%c 🕵️‍♂️ DASHBOARD DEBUG: WATCHDOG ACTIVE ", "background: #7c3aed; color: #fff; font-weight: bold; padding: 4px; border-radius: 4px;");

    function hookFunctions() {
        // 1. Hook de Carga Drive (Pendientes)
        if (typeof window.exploreSupplierFiles === 'function' && !window.exploreSupplierFiles._hooked) {
            const originalExplore = window.exploreSupplierFiles;
            window.exploreSupplierFiles = async function (folderId) {
                console.groupCollapsed(`%c 📂 EXPLORE DRIVE [${folderId}]`, "color: #3b82f6");
                console.time("DriveLoad");
                try {
                    await originalExplore(folderId);
                    console.log("✅ exploreSupplierFiles completado.");
                } catch (e) {
                    console.error("❌ Error:", e);
                    throw e;
                } finally {
                    console.timeEnd("DriveLoad");
                    console.groupEnd();
                }
            };
            window.exploreSupplierFiles._hooked = true;
            console.log("✅ Watchdog: exploreSupplierFiles HOOKED.");
        }

        // 2. Hook de Carga BD
        if (typeof window.loadProcessedFiles === 'function' && !window.loadProcessedFiles._hooked) {
            const originalLoad = window.loadProcessedFiles;
            window.loadProcessedFiles = async function () {
                console.groupCollapsed(`%c 🗄️ LOAD PROCESSED`, "color: #10b981");
                console.time("DBLoad");
                try {
                    await originalLoad();
                    console.log("✅ loadProcessedFiles completado.");
                } catch (e) { console.error(e); throw e; }
                finally { console.timeEnd("DBLoad"); console.groupEnd(); }
            };
            window.loadProcessedFiles._hooked = true;
            console.log("✅ Watchdog: loadProcessedFiles HOOKED.");
        }

        // 3. Polyfill/Alias Check
        if (typeof window.loadFiles === 'undefined' && typeof window.exploreSupplierFiles === 'function') {
            console.warn("🛠️ Watchdog: Creando POLYFILL Tardío para loadFiles");
            window.loadFiles = window.exploreSupplierFiles;
        }
    }

    // Attempt immediately
    hookFunctions();

    // Attempt after delay (wait for Modules)
    setTimeout(hookFunctions, 1000);
    setTimeout(hookFunctions, 3000);
    setTimeout(hookFunctions, 5000); // Just in case

    // 4. Hook de Renderizado Grid (Legacy hook if needed)
    if (typeof window.renderProcessedGrid === 'function' && !window.renderProcessedGrid._hooked) {
        // Optional hook
    }

})();
