
/**
 * 🕵️‍♂️ VIEWER DEBUG WATCHDOG - "El Vigía"
 * Depurador de Contexto y Flujo de Datos para el Visor Universal.
 * Inyectado para diagnosticar pérdida de nombre de proveedor.
 */

(function () {
    console.log("%c 🕵️‍♂️ VIGÍA ACTIVO ", "background: #f59e0b; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;");

    // 1. Monitor Global Context Changes
    if (!window.globalContext) {
        console.warn("⚠️ [Vigía] window.globalContext no existía al iniciar. Creándolo...");
        window.globalContext = {};
    }

    // Proxy para interceptar cambios en globalContext
    /*
    const originalContext = window.globalContext;
    window.globalContext = new Proxy(originalContext, {
        set: function (target, key, value) {
            console.log(`📝 [Vigía] Context Change: ${key} =`, value);
            target[key] = value;
            return true;
        }
    });
    */

    // 2. Intercept openFileViewer
    const originalOpenViewer = window.openFileViewer;
    if (originalOpenViewer) {
        window.openFileViewer = function (fileId, fileName, providerId) {
            console.group("🔍 [Vigía] openFileViewer Called");
            console.log("Argument: fileId =", fileId);
            console.log("Argument: fileName =", fileName);
            console.log("Argument: providerId =", providerId);
            console.log("Current GlobalContext (Before):", JSON.stringify(window.globalContext));

            // Check Provider Resolution
            if (providerId && window.currentSuppliers) {
                const found = window.currentSuppliers.find(p => p.id === providerId);
                console.log("Provider Lookup:", found ? `✅ FOUND: ${found.nombre}` : "❌ NOT FOUND");
            } else {
                console.log("Provider Lookup Skipped: Missing ID or Suppliers List");
            }

            // Call Original
            const result = originalOpenViewer.apply(this, arguments);

            console.log("Current GlobalContext (After):", JSON.stringify(window.globalContext));
            console.groupEnd();
            return result;
        };
        console.log("✅ [Vigía] openFileViewer instrumented.");
    } else {
        console.error("❌ [Vigía] openFileViewer NOT found.");
    }

    // 3. Monitor Dashboard Tabs Context
    const originalResolve = window.resolveProviderContext;
    if (originalResolve) {
        window.resolveProviderContext = function (id) {
            console.log(`🔍 [Vigía] resolveProviderContext called for ID: ${id}`);
            const res = originalResolve(id);
            console.log("Result:", res);
            return res;
        }
    }

})();
