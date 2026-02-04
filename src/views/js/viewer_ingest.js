/**
 * VIEWER INGEST - Módulo de Confirmación de Ingesta
 * Responsabilidad: Capturar snapshot del visor y enviarlo al backend.
 */

console.log("%c 📥 VIEWER INGEST: READY ", "background: #10b981; color: #fff; font-weight: bold; padding: 4px;");

window.confirmIngestion = async function () {
    console.log("[Ingest] Iniciando confirmación...");

    // 1. Capturar Snapshot del Visor
    // const dataSnapshot = window.currentSimData; // <-- ELIMINAR ESTO
    const snapshot = window.getViewerSnapshot ? window.getViewerSnapshot() : null;
    const context = window.globalContext || {};

    if (!snapshot || snapshot.length === 0) {
        alert("No hay datos para confirmar. Por favor espera a que se cargue la simulación.");
        return;
    }

    if (!context.fileId || !context.providerId) {
        alert("Error de Contexto: Falta FileId o ProviderId.");
        return;
    }

    // 2. Confirmación de Usuario
    const confirmed = confirm(`¿Estás seguro de confirmar la ingesta de ${snapshot.length} filas?\n\nEsto guardará los datos y moverá el archivo a 'Listas Extraídas'.`);
    if (!confirmed) return;

    // 3. UI Loading state
    const btn = document.getElementById('btnConfirmIngest');
    const originalText = btn ? btn.innerText : 'CONFIRMAR';
    if (btn) {
        btn.disabled = true;
        btn.innerText = "PROCESANDO...";
        btn.classList.add("opacity-50", "cursor-not-allowed");
    }

    try {
        // 4. Enviar Payload
        const payload = {
            fileId: context.fileId,
            providerId: context.providerId,
            dataSnapshot: snapshot
        };

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const response = await fetch(`${backendUrl}/api/files/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            // 5. Success UI
            alert("✅ Ingesta Exitosa!\n\n" + (result.message || "Archivo procesado y movido."));

            // Cerrar Modal y refrescar
            if (window.closeViewerModal) window.closeViewerModal();

            // Refrescar lista de archivos (si existe la función)
            if (window.loadFiles) {
                const currentFolderId = document.getElementById('currentFolderId')?.value;
                window.loadFiles(currentFolderId);
            }

        } else {
            throw new Error(result.error || "Error desconocido en backend.");
        }

    } catch (error) {
        console.error("[Ingest] Error:", error);
        alert("❌ Error en Ingesta:\n" + error.message);
    } finally {
        // Restore UI
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
            btn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    }
};
