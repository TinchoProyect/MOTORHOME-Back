/**
 * Gestión Centralizada de Rubros Maestros
 * Arquitectura LAMDA (Submódulo Datos Maestros)
 */

class RubrosManager {
    constructor() {
        this.apiUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        this.endpoint = `${this.apiUrl}/api/rubros`;
        this.rubrosList = [];
        this.isEditing = false;
        
        // Elementos UI
        this.modal = document.getElementById('rubrosManagerModal');
        this.tableBody = document.getElementById('rmTableBody');
        this.editorPanel = document.getElementById('rmEditorPanel');
        this.loader = document.getElementById('rmLoader');
        
        // Inputs Editor
        this.inputId = document.getElementById('rmEditorId');
        this.inputNombre = document.getElementById('rmEditorNombre');
        this.inputNarrativa = document.getElementById('rmEditorNarrativa');
        this.searchInput = document.getElementById('rmSearchInput');
        this.saveBtn = document.getElementById('rmSaveBtn');
        this.editorTitle = document.getElementById('rmEditorTitle');

        // Binds
        this.filterTable = this.filterTable.bind(this);
    }

    openModal() {
        if (!this.modal) return;
        
        // Setup initial state
        this.searchInput.value = '';
        this.closeEditor();
        this.modal.classList.remove('hidden');
        
        // Fetch data
        this.loadRubros();
    }

    closeModal() {
        if (!this.modal) return;
        this.modal.classList.add('hidden');
    }

    async loadRubros() {
        this.showLoader();
        try {
            const res = await fetch(this.endpoint);
            if (!res.ok) throw new Error("Fallo de conexión al backend");
            
            const payload = await res.json();
            
            // Expected { success: true, data: [...] }
            this.rubrosList = (payload.data && Array.isArray(payload.data)) ? payload.data : [];
            this.renderTable(this.rubrosList);
            
        } catch (error) {
            console.error("Error al cargar rubros:", error);
            Swal.fire({
                title: 'Error de Red',
                text: 'No se pudieron recuperar los rubros de la base de datos.',
                icon: 'error',
                background: '#0f172a',
                color: '#f8fafc'
            });
            this.tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500 font-bold">Error de sincronización</td></tr>`;
        } finally {
            this.hideLoader();
            if (window.lucide) window.lucide.createIcons();
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;
        this.tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-12 text-center">
                        <div class="flex flex-col items-center justify-center text-slate-500">
                            <i data-lucide="archive" class="w-10 h-10 mb-2 opacity-50"></i>
                            <p class="font-bold text-slate-400">Sin rubros registrados</p>
                            <p class="text-[10px] mt-1">Utilice el botón "Nuevo Maestro" para comenzar a poblar la base lógica.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        data.forEach(rubro => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-900/50 transition-colors group";
            
            // Fallback content handler for empty descriptions
            const desc = rubro.descripcion_narrativa ? rubro.descripcion_narrativa : "<span class='text-amber-500/70 italic'>Sin narrativa configurada. El Chofer IA podría tener problemas de clasificación.</span>";
            
            tr.innerHTML = `
                <td class="py-4 px-4 align-top w-48">
                    <div class="font-bold text-white uppercase text-[11px] tracking-wide mb-1">${rubro.nombre_rubro || 'UNDEFINED'}</div>
                    <div class="text-[9px] text-slate-500">Creado: ${new Date(rubro.created_at).toLocaleDateString()}</div>
                </td>
                <td class="py-4 px-4 align-top">
                    <div class="text-[11px] text-slate-400 line-clamp-3 leading-relaxed max-w-xl group-hover:text-slate-300 transition-colors pr-8">
                        ${desc}
                    </div>
                </td>
                <td class="py-4 px-4 align-top text-right w-32">
                    <div class="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onclick="window.rubrosManager.openEditor('${rubro.id}', '${(rubro.nombre_rubro || '').replace(/'/g, "\\'")}', '${(rubro.descripcion_narrativa || '').replace(/'/g, "\\'").replace(/\n/g, "\\n")}')" 
                            class="p-2 bg-slate-800 hover:bg-fuchsia-600 hover:text-white text-slate-400 rounded-lg transition-colors border border-slate-700 hover:border-fuchsia-500 shadow-sm" title="Editar Narrativa">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.rubrosManager.deleteRubro('${rubro.id}', '${(rubro.nombre_rubro || '').replace(/'/g, "\\'")}')" 
                            class="p-2 bg-slate-800 hover:bg-red-600 hover:text-white text-slate-400 rounded-lg transition-colors border border-slate-700 hover:border-red-500 shadow-sm" title="Eliminar/Desactivar Rubro">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });
        
        if (window.lucide) window.lucide.createIcons();
    }

    filterTable() {
        const term = this.searchInput.value.toLowerCase().trim();
        if (!term) {
            this.renderTable(this.rubrosList);
            return;
        }

        const filtered = this.rubrosList.filter(rubro => {
            const n = (rubro.nombre_rubro || '').toLowerCase();
            const d = (rubro.descripcion_narrativa || '').toLowerCase();
            return n.includes(term) || d.includes(term);
        });

        this.renderTable(filtered);
    }

    openEditor(id = null, nombre = '', narrativa = '') {
        this.isEditing = id !== null;
        
        // Reset Inputs
        this.inputId.value = id || '';
        this.inputNombre.value = nombre;
        this.inputNarrativa.value = narrativa;
        
        // Setup UI
        this.editorTitle.innerText = this.isEditing ? 'EDITAR NARRATIVA DE RUBRO' : 'ALTA DE NUEVO RUBRO MAESTRO';
        this.saveBtn.innerHTML = this.isEditing ? '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Actualizar Entidad' : '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Guardar Entidad';
        
        this.editorPanel.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        
        // Focus name
        setTimeout(() => this.inputNombre.focus(), 150);
    }

    closeEditor() {
        this.editorPanel.classList.add('hidden');
    }

    async saveRubro() {
        const nombre = this.inputNombre.value.trim().toUpperCase();
        const descripcion = this.inputNarrativa.value.trim();
        const id = this.inputId.value;

        if (!nombre) {
            Swal.fire({
                title: 'Validación',
                text: 'El nombre del rubro no puede estar vacío.',
                icon: 'warning',
                background: '#0f172a',
                color: '#f8fafc'
            });
            return;
        }

        const payload = {
            nombre_rubro: nombre,
            descripcion_narrativa: descripcion,
            es_activo: true
        };

        const isUpdate = this.isEditing && id;
        const method = isUpdate ? 'PUT' : 'POST';
        const url = isUpdate ? `${this.endpoint}/${id}` : this.endpoint;

        this.showLoader();

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Fallo en la persistencia del rubro");

            // Refrescar lista principal
            await this.loadRubros();
            
            // Emitir evento global (Para la Consola Semántica / Caza-Rubros)
            document.dispatchEvent(new CustomEvent('lamda:rubros-updated'));

            this.closeEditor();
            
            Swal.fire({
                title: 'Éxito',
                text: isUpdate ? 'Rubro actualizado correctamente.' : 'Rubro creado correctamente.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                background: '#0f172a',
                color: '#f8fafc',
                customClass: { popup: 'border border-fuchsia-900/50 rounded-2xl shadow-[0_0_40px_rgba(217,70,239,0.15)]' }
            });

        } catch (error) {
            console.error("Error guardando rubro:", error);
            Swal.fire({
                title: 'Error de Persistencia',
                text: 'No se pudo guardar la información en la base de datos central.',
                icon: 'error',
                background: '#0f172a',
                color: '#f8fafc'
            });
        } finally {
            this.hideLoader();
        }
    }

    async deleteRubro(id, nombre) {
        const result = await Swal.fire({
            title: '¿Confirmar Baja?',
            html: `¿Está seguro que desea dar de baja el maestro <b>${nombre}</b>?<br><br><span class="text-[11px] text-slate-400">Esta acción no elimina el registro físico, pero lo ocultará para el Chofer IA.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, dar de baja',
            cancelButtonText: 'Cancelar',
            background: '#0f172a',
            color: '#f8fafc',
            customClass: {
                popup: 'border border-slate-700 shadow-2xl rounded-2xl'
            }
        });

        if (result.isConfirmed) {
            this.showLoader();
            try {
                const res = await fetch(`${this.endpoint}/${id}`, {
                    method: 'DELETE'
                });

                if (!res.ok) throw new Error("Fallo eliminando el rubro");

                await this.loadRubros();
                
                // Emitir evento global
                document.dispatchEvent(new CustomEvent('lamda:rubros-updated'));

                Swal.fire({
                    title: 'Baja Exitosa',
                    text: 'El rubro ha sido desactivado del sistema.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    background: '#0f172a',
                    color: '#f8fafc',
                    customClass: { popup: 'border border-fuchsia-900/50 rounded-2xl shadow-[0_0_40px_rgba(217,70,239,0.15)]' }
                });
            } catch (error) {
                console.error("Error eliminando rubro:", error);
                Swal.fire({
                    title: 'Error',
                    text: 'Hubo un problema procesando la baja en el servidor.',
                    icon: 'error',
                    background: '#0f172a',
                    color: '#f8fafc'
                });
            } finally {
                this.hideLoader();
            }
        }
    }

    showLoader() {
        if (this.loader) this.loader.classList.remove('hidden');
    }

    hideLoader() {
        if (this.loader) this.loader.classList.add('hidden');
    }
}

// Inicializar globalmente la clase
document.addEventListener('DOMContentLoaded', () => {
    window.rubrosManager = new RubrosManager();
});
