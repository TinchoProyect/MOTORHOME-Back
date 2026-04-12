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
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error de Extracción', text: e.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Error capturando datos del visor: " + e.message);
        return;
    }

    const context = window.globalContext || {};

    if (!context.fileId || !context.providerId) {
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error de Contexto', text: 'Falta FileId o ProviderId.', icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("Error de Contexto: Falta FileId o ProviderId.");
        return;
    }

    // 2. Confirmación de Usuario (Intervención Selectiva por Solapas)
    let confirmed = false;

    if (finalPayload.mode === 'MULTI_SHEET_BLOB' && finalPayload.sheets) {
        // --- FLUJO MULTI-HOJA DUAL (Selectivo) ---
        const validSheets = finalPayload.sheets;
        const sheetsHtml = validSheets.map((s, idx) => `
            <div class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-colors">
                <input type="checkbox" id="chk_sheet_${idx}" value="${s.name}" class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 cursor-pointer" ${idx === 0 ? 'checked' : ''}>
                <div class="flex-1 text-left cursor-pointer" onclick="document.getElementById('chk_sheet_${idx}').click()">
                    <div class="text-white text-sm font-bold flex items-center gap-2">
                        <i data-lucide="sheet" class="w-4 h-4 text-slate-400"></i> ${s.name || 'Hoja ' + (idx + 1)}
                    </div>
                    <div class="text-xs text-slate-500 font-mono mt-0.5">Filas: ${s.data.length}</div>
                </div>
            </div>
        `).join('');

        const res = await Swal.fire({
            title: 'Parámetros de Ingesta',
            html: `
                <p class="text-slate-400 text-sm mb-4">Selecciona qué hojas deseas inyectar en la base de datos:</p>
                <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-left text-base">
                    ${sheetsHtml}
                </div>
            `,
            icon: 'question',
            background: '#0f172a', color: '#f8fafc',
            showCancelButton: true,
            confirmButtonText: 'Ejecutar Ingesta',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#334155',
            didOpen: () => {
                if (window.lucide) window.lucide.createIcons();
            },
            preConfirm: () => {
                const selected = [];
                validSheets.forEach((s, idx) => {
                    const chk = document.getElementById(`chk_sheet_${idx}`);
                    if (chk && chk.checked) {
                        selected.push(s);
                    }
                });
                if (selected.length === 0) {
                    Swal.showValidationMessage('⚠️ Debes seleccionar al menos una solapa para continuar.');
                    return false;
                }
                return selected;
            }
        });

        if (!res.isConfirmed) return;
        
        // Mutar el Payload con la selección determinista
        const selectedSheetsArray = res.value;
        const oldTotal = finalPayload.sheets.length;
        
        finalPayload.sheets = selectedSheetsArray;
        itemCount = selectedSheetsArray.reduce((acc, s) => acc + s.data.length, 0);
        
        console.log(`[Ingest] Auditoría: Seleccionadas ${selectedSheetsArray.length} hojas de ${oldTotal}. Filas totales a procesar: ${itemCount}.`);
        confirmed = true;
        
    } else {
        // --- FLUJO LEGACY (Fallback Confirm Simple) ---
        if (typeof Swal !== 'undefined') {
            const res = await Swal.fire({
                title: '¿Confirmar Extracción?',
                html: `¿Estás seguro de inyectar estos datos en la Tabla Maestra?<br><br><span class="text-slate-400">📊 Filas: <b>${itemCount}</b></span>`,
                icon: 'question',
                background: '#0f172a', color: '#f8fafc',
                showCancelButton: true,
                confirmButtonText: 'Sí, procesar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#334155'
            });
            confirmed = res.isConfirmed;
        } else {
            confirmed = confirm(`¿Estás seguro de confirmar la extracción?\n\n📊 Filas totales: ${itemCount}\n\nEsto guardará los datos en la Base de Datos.`);
        }
        if (!confirmed) return;
    }

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
            body: JSON.stringify(apiPayload)
        });

        const result = await response.json();

        if (result.success) {
            // 5. Success UI
            if (typeof Swal !== 'undefined') {
                await Swal.fire({ title: 'Extracción Exitosa', text: result.message || "Archivo procesado y movido.", icon: 'success', background: '#0f172a', color: '#f8fafc', timer: 2500, showConfirmButton: false });
            } else {
                alert("✅ Extracción Exitosa!\n\n" + (result.message || "Archivo procesado y movido."));
            }



            // Cerrar Modal y refrescar (Rebote determinista para Estado UI del Padre)
            if (window.closeViewerModal) window.closeViewerModal();
            
            // Hooks a la arquitectura del Dashboard
            const providerContext = window.globalContext?.providerId || window.currentActiveProviderId;
            
            // [QA-2] Evitar Race Condition ("File Not Found" en Drive)
            // En vez de recuperar "Pendientes" donde el archivo ya NO está (fue movido por Backend),
            // Redirigimos suavemente a la pestaña "Procesados"
            
            // Refrescar lista de Procesados
            if (providerContext) {
                if (window.loadProcessedFiles) window.loadProcessedFiles(providerContext);
            }

            // Realizar cambio visual de pestaña
            setTimeout(() => {
                const tabProcesados = document.getElementById('tabProcessed');
                if (tabProcesados && typeof tabProcesados.click === 'function') {
                    // Simular click en la pestaña de procesados si existe en el DOM
                    tabProcesados.click();
                } else if (window.switchTab) {
                    window.switchTab('tabProcessed');
                }
            }, 100);

        } else {
            throw new Error(result.error || "Error desconocido en backend.");
        }

    } catch (error) {
        console.error("[Ingest] Error:", error);
        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error de Extracción', text: error.message, icon: 'error', background: '#0f172a', color: '#f8fafc' });
        else alert("❌ Error en Extracción:\n" + error.message);
    } finally {
        // Restore UI
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
            btn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    }
};
