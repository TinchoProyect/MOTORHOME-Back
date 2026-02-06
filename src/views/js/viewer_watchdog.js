/**
 * 🕵️‍♂️ VIEWER WATCHDOG - Script de Depuración
 * Monitorea el estado del Visor, ViewerUI y el DOM en tiempo real.
 * Uso en Consola: window.debugViewer()
 * v2.0 (Adaptado a Arquitectura Modular)
 */

(function () {
    console.log("%c 🕵️‍♂️ WATCHDOG: Activado", "background: #333; color: #bada55; padding: 4px; font-weight: bold;");

    window.debugViewer = function () {
        console.group("📋 REPORTE DE ESTADO DEL VISOR");

        // 1. Verificación de Módulos
        console.log("%c[1] MÓDULOS", "font-weight:bold; color: #4ade80");
        console.log("window.ViewerUI:", window.ViewerUI ? "✅ ACTIVO" : "❌ NO DEFINIDO");

        // CORRECCIÓN: Chequeamos las funciones del nuevo Engine (v2.6)
        console.log("window.openFileViewer:", typeof window.openFileViewer === 'function' ? "✅ ACTIVO" : "❌ NO DEFINIDO");
        console.log("window.loadVirtualWorkbook:", typeof window.loadVirtualWorkbook === 'function' ? "✅ ACTIVO" : "❌ NO DEFINIDO");

        console.log("window.lucide:", window.lucide ? "✅ ACTIVO" : "❌ NO DEFINIDO");

        // 2. Inspección del DOM Crítico
        console.log("%c[2] ELEMENTOS DOM (Header)", "font-weight:bold; color: #4ade80");

        const ui = {
            titleText: document.getElementById('viewerTitle')?.textContent.trim(),
            iconContainerHTML: document.getElementById('viewerIconContainer')?.innerHTML.trim() || "(VACÍO)",
            badgesHTML: document.getElementById('viewerBadges')?.innerHTML.trim() || "(VACÍO)",

            // Contenedores
            excelContainerClass: document.getElementById('excelContainer')?.className,
            modalHidden: document.getElementById('viewerModal')?.classList.contains('hidden')
        };
        console.table(ui);

        // 3. Análisis Gráfico (Iconos)
        const iconContainer = document.getElementById('viewerIconContainer');
        const hasSVG = iconContainer?.querySelector('svg');
        const hasI = iconContainer?.querySelector('i');

        console.log("%c[3] RENDERIZADO GRÁFICO", "font-weight:bold; color: #4ade80");
        if (hasSVG) console.log("✅ Icono es SVG (Lucide procesó correctamente)");
        else if (hasI) console.warn("⚠️ Icono es <i> (Lucide NO ha procesado aún)");
        else console.error("❌ No hay icono renderizado");

        console.groupEnd();
        return "Reporte Finalizado";
    }

    // Auto-ejecución inteligente: Detecta cuando se abre el modal
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'viewerModal' && !mutation.target.classList.contains('hidden')) {
                console.log("🕵️‍♂️ Watchdog detectó apertura del Visor. Analizando en 500ms...");
                setTimeout(window.debugViewer, 500);
            }
        });
    });

    const modal = document.getElementById('viewerModal');
    if (modal) {
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    } else {
        console.warn("Watchdog: No se encontró viewerModal para observar.");
    }

})();