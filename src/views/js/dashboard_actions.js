/**
 * DASHBOARD ACTIONS - Módulo Satélite de Gestión 🕹️
 * Responsable de la UI de Acciones en Lote (Eliminar, Rollback, etc.)
 * Desacoplado de dashboard_tabs.js
 */

window.DashboardActions = (function () {
    const DOM = {
        actionBar: 'dashboardActionBar',
        modal: 'rollbackModal',
        modalContent: 'rollbackModalContent'
    };

    let _selectedIds = [];
    let _providerId = null;

    // 1. Render Action Bar (FAB)
    function renderActionBar(count) {
        let bar = document.getElementById(DOM.actionBar);

        // Create if not exists
        if (!bar) {
            bar = document.createElement('div');
            bar.id = DOM.actionBar;
            bar.className = "fixed bottom-8 right-8 z-50 flex flex-col items-end gap-2 transition-all duration-300 transform translate-y-20 opacity-0";
            document.body.appendChild(bar);
        }

        if (count > 0) {
            bar.innerHTML = `
                <button onclick="window.DashboardActions.openRollbackModal()" 
                    class="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl hover:shadow-red-900/50 transition-all font-bold tracking-wide">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                    <span class="text-sm">ELIMINAR (${count})</span>
                </button>
            `;
            // Animate In
            setTimeout(() => {
                bar.classList.remove('translate-y-20', 'opacity-0');
            }, 10);

            if (window.lucide) window.lucide.createIcons();
        } else {
            // Animate Out
            bar.classList.add('translate-y-20', 'opacity-0');
        }
    }

    // State flags for the current context
    let _hasExtracted = false;

    // 2. Open Decision Modal
    function openRollbackModal(ids = null, providerId = null) {
        // Get Context from Global if not passed
        _selectedIds = ids || (window.selectedFiles ? Array.from(window.selectedFiles.keys()) : []);
        _providerId = providerId || window.currentActiveProviderId;

        // Context Evaluation (Detect if ANY file is extracted)
        _hasExtracted = false;
        if (window.selectedFiles && window.selectedFiles.size > 0) {
            for (const value of window.selectedFiles.values()) {
                if (value.isExtraido) {
                    _hasExtracted = true;
                    break;
                }
            }
        }

        if (_selectedIds.length === 0) return;

        // Create Modal Structure if missing
        let modal = document.getElementById(DOM.modal);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = DOM.modal;
            modal.className = "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 hidden opacity-0 transition-opacity duration-300";
            modal.innerHTML = `<div id="${DOM.modalContent}" class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform scale-95 transition-transform duration-300"></div>`;
            document.body.appendChild(modal);
        }

        const content = document.getElementById(DOM.modalContent);
        content.innerHTML = `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4 text-slate-300">
                    <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                        <i data-lucide="alert-triangle" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-white">Gestionar Eliminación</h3>
                        <p class="text-xs text-slate-400">Seleccionados: ${_selectedIds.length} archivos</p>
                    </div>
                </div>
                
                <p class="text-sm text-slate-400 mb-6">
                    ¿Qué destino deseas dar a estos archivos? Esta acción afectará la base de datos y los archivos físicos.
                </p>

                <div class="grid gap-4">
                    <!-- Opción A: ROLLBACK -->
                    <div class="rounded-xl border border-blue-500/30 bg-blue-500/5 hover:border-blue-400 transition-all p-4">
                        <button onclick="window.DashboardActions.executeRollback('ROLLBACK')" 
                            class="group relative flex items-start gap-3 w-full text-left">
                            <div class="mt-0.5 text-blue-400 group-hover:text-blue-300">
                                <i data-lucide="undo-2" class="w-5 h-5"></i>
                            </div>
                            <div class="flex-1">
                                <span class="block text-sm font-bold text-blue-100 mb-1">Volver a Pendientes (Rollback Total)</span>
                                <span class="block text-xs text-blue-300/60 leading-relaxed">
                                    Mueve el archivo al Inbox y borra el registro de ingestión.
                                </span>
                            </div>
                        </button>
                        ${_hasExtracted ? `
                        <div class="mt-4 pt-3 border-t border-blue-500/20 flex flex-col gap-2">
                            <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-200/80">
                                <input type="checkbox" id="toggleDist_A" class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer" checked>
                                ¿Eliminar también la información ingresada en el sistema destino?
                            </label>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Opción B: UNLINK -->
                    <div class="rounded-xl border border-red-500/30 bg-red-500/5 hover:border-red-400 transition-all p-4">
                        <button onclick="window.DashboardActions.executeRollback('UNLINK')"
                            class="group relative flex items-start gap-3 w-full text-left">
                            <div class="mt-0.5 text-red-400 group-hover:text-red-300">
                                <i data-lucide="scissors" class="w-5 h-5"></i>
                            </div>
                            <div class="flex-1">
                                <span class="block text-sm font-bold text-red-100 mb-1">Solo Desvincular (Unlink)</span>
                                <span class="block text-xs text-red-300/60 leading-relaxed">
                                    Dejar el archivo en "Procesados" pero limpiar el registro en la BD LAMDA.
                                </span>
                            </div>
                        </button>
                        ${_hasExtracted ? `
                        <div class="mt-4 pt-3 border-t border-red-500/20 flex flex-col gap-2">
                            <label class="flex items-center gap-2 cursor-pointer text-xs text-red-200/80">
                                <input type="checkbox" id="toggleDist_B" class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500 cursor-pointer">
                                Eliminar también los registros impactados en el sistema destino
                            </label>
                        </div>
                        ` : ''}
                    </div>
                    
                    <button onclick="window.DashboardActions.closeModal()" 
                        class="mt-2 w-full py-3 text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-wider">
                        Cancelar
                    </button>
                </div>
            </div>
            
            <!-- Loading Overlay (Hidden by default) -->
            <div id="rollbackLoader" class="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-4 hidden">
                <i data-lucide="loader-2" class="w-8 h-8 text-blue-400 animate-spin"></i>
                <p class="text-sm font-mono text-blue-300" id="rollbackStatus">Procesando...</p>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Show Modal
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
            modal.querySelector('div').classList.add('scale-100');
        }, 10);
    }

    function closeModal() {
        const modal = document.getElementById(DOM.modal);
        if (modal) {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    }

    // 3. API Execution
    async function executeRollback(action) {
        if (!_selectedIds || _selectedIds.length === 0) return;

        const loader = document.getElementById('rollbackLoader');
        const status = document.getElementById('rollbackStatus');

        // Evaluate Toggles
        let deleteDestination = false;
        if (_hasExtracted) {
            if (action === 'ROLLBACK') {
                const elA = document.getElementById('toggleDist_A');
                deleteDestination = elA ? elA.checked : false;
            } else if (action === 'UNLINK') {
                const elB = document.getElementById('toggleDist_B');
                deleteDestination = elB ? elB.checked : false;
            }
        }

        if (loader) loader.classList.remove('hidden');

        try {
            const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

            // [ORCHESTRATOR PHASE 1]: Destrucción Externa Garantizada
            if (deleteDestination) {
                if (status) status.innerText = "Orquestando: Eliminando en Sistema Destino...";
                
                // Extraer unicamente los IDs que realmente estaban "isExtraido"
                const extractedIds = [];
                if (window.selectedFiles) {
                    for (const [id, val] of window.selectedFiles.entries()) {
                         if (val.isExtraido && _selectedIds.includes(id)) {
                             extractedIds.push(id);
                         }
                    }
                }

                // Borrado Secuencial Controlado
                for (let i = 0; i < extractedIds.length; i++) {
                    const id = extractedIds[i];
                    if (status) status.innerText = `Destino: Procesando ${i+1} de ${extractedIds.length}...`;
                    
                    const dr = await fetch(`${backendUrl}/api/master-table/revert/${id}`, { method: 'DELETE' });
                    if (!dr.ok) {
                        const dres = await dr.json();
                        throw new Error(`Fallo limpiando destino del archivo ${id}: ` + (dres.error || dr.statusText));
                    }
                }
            }

            // [ORCHESTRATOR PHASE 2]: Transacción LAMDA Core Pura
            if (status) status.innerText = action === 'ROLLBACK' ? "Moviendo Archivos en Motor Central..." : "Eliminando Registros RAW...";

            const res = await fetch(`${backendUrl}/api/files/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileIds: _selectedIds,
                    action: action,
                    providerId: _providerId
                })
            });

            const result = await res.json();
            if (!result.success) throw new Error(result.error);



            // Success Feedback
            // Close Modal
            closeModal();

            // Trigger Refresh in Dashboard Logic
            if (window.loadProcessedFiles) {
                // Clear Selection
                if (window.clearSelection) window.clearSelection();

                // 1. Refresh Current View (Processed)

                await window.loadProcessedFiles();

                // 2. If Rollback, invalidate/refresh Drive View too (if possible)
                // We can't easily refresh Drive from here without knowing the folder ID stored in the other tab DOM.
                // But we can check if the Drive Tab element exists and maybe trigger a click or just leave it for lazy load.
                // Best practice: Let the user refresh Drive when they go there, OR force it if we can access the ID.
                // [CONTEXT FIX] Robust Folder ID Retrieval
                const getDriveFolderId = () => {
                    // 1. Priority: Global Memory
                    if (window.currentDriveFolderId) return window.currentDriveFolderId;
                    // 2. Fallback: DOM
                    return document.getElementById('currentFolderId')?.value;
                };

                const targetFolderId = getDriveFolderId();

                if (action === 'ROLLBACK' && targetFolderId && window.loadFiles) {
                    // Silent refresh of drive content? Or just let it be.

                    if (window.loadFiles) {

                        window.loadFiles(targetFolderId);
                    }
                }
            } else {
                console.error("Window.loadProcessedFiles not found.");
            }

        } catch (error) {
            console.error("Rollback Error:", error);
            if (status) {
                status.innerText = "Error: " + error.message;
                status.classList.add('text-red-400');
            }
            // Keep loader visible to show error or close after timeout
            setTimeout(() => {
                if (loader) loader.classList.add('hidden');
                alert("Error al procesar: " + error.message);
            }, 1000);
        }
    }

    return {
        renderActionBar,
        openRollbackModal,
        closeModal,
        executeRollback
    };
})();

console.log("🛠️ DashboardActions Module Loaded");
