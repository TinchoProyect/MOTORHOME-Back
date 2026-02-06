/**
 * VIEWER INGEST - Módulo de Confirmación de Ingesta
 * Responsabilidad: Capturar snapshot del visor y enviarlo al backend.
 */

console.log("%c 📥 VIEWER INGEST: READY ", "background: #10b981; color: #fff; font-weight: bold; padding: 4px;");

window.confirmIngestion = async function () {
    console.log("[Ingest] Iniciando confirmación...");

    // 1. Capturar Snapshot del Visor (MULTI-SHEET SUPPORT)
    let finalPayload = {};
    let itemCount = 0;

    try {
        if (window.exportAllSheets) {
            // Nueva Arquitectura: Multi-Hoja
            const allSheets = await window.exportAllSheets();

            // Validar que haya datos
            const validSheets = allSheets.filter(s => s.data && s.data.length > 0);
            if (validSheets.length === 0) throw new Error("El libro está vacío.");

            itemCount = validSheets.reduce((acc, s) => acc + s.data.length, 0);

            if (itemCount === 0) throw new Error("No hay filas con datos en ninguna hoja.");

            finalPayload = {
                mode: 'MULTI_SHEET_BLOB',
                sheets: validSheets // [{ name: "Sheet1", data: [[...]] }]
            };
            console.log(`[Ingest] Snapshot Multi-Hoja capturado: ${validSheets.length} hojas, ${itemCount} filas totales.`);
        } else {
            // Fallback Legacy (Solo por seguridad, el motor debería tener la función)
            const snapshot = window.getViewerSnapshot ? window.getViewerSnapshot() : null;
            if (!snapshot || snapshot.length === 0) throw new Error("No hay datos visibles.");
            itemCount = snapshot.length;
            finalPayload = snapshot; // Legacy array payload
        }
    } catch (e) {
        alert("Error capturando datos del visor: " + e.message);
        return;
    }

    const context = window.globalContext || {};

    if (!context.fileId || !context.providerId) {
        alert("Error de Contexto: Falta FileId o ProviderId.");
        return;
    }

    // 2. Confirmación de Usuario
    const confirmed = confirm(`¿Estás seguro de confirmar la ingesta?\n\n📄 Hojas detectadas: ${finalPayload.sheets ? finalPayload.sheets.length : 1}\n📊 Filas totales: ${itemCount}\n\nEsto guardará los datos en la Base de Datos.`);
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
        const apiPayload = {
            fileId: context.fileId,
            providerId: context.providerId,
            dataSnapshot: finalPayload
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

            // Helper to get current Drive Folder ID (Robust Context Aware)
            const getDriveFolderId = () => {
                // 1. Priority: Global Memory (The "Ghost" Folder)
                if (window.currentDriveFolderId) return window.currentDriveFolderId;

                // 2. Fallback: Calculated from Provider
                if (window.currentActiveProviderId && window.currentSuppliers) {
                    const p = window.currentSuppliers.find(s => s.id === window.currentActiveProviderId);
                    return p ? (p.drive_folder_prices_id || p.drive_folder_id) : null;
                }
                return null;
            };

            const targetFolderId = getDriveFolderId();

            // Refrescar lista de archivos (si existe la función)
            if (window.loadFiles && targetFolderId) {

                window.loadFiles(targetFolderId);
            }

            // [FIX] Dashboard Refresh Logic
            if (window.loadProcessedFiles && window.switchDashboardTab) {
                // Refresh Drive List (if active)
                const btnDrive = document.getElementById('tabPending');
                if (btnDrive && btnDrive.classList.contains('text-blue-400')) {
                    // We are in Drive Mode

                    if (window.loadFiles && targetFolderId) window.loadFiles(targetFolderId);
                }
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
