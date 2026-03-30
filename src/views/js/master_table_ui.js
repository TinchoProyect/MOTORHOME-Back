// src/views/js/master_table_ui.js
import { masterTableService } from './services/master_table_service.js';

let masterTableFieldsLocal = []; // State for Table Sync
let masterTableCategoriesLocal = []; // State for Categories
let currentEditId = null;        // State for active Form

// =========================================================================
// 1. MAIN MODAL LOGIC
// =========================================================================
export async function openMasterTableModal() {
    const modal = document.getElementById('masterTableModal');
    if (modal) {
        modal.classList.remove('hidden');
        await loadMasterFields();
    }
}

export function closeMasterTableModal() {
    const modal = document.getElementById('masterTableModal');
    if (modal) modal.classList.add('hidden');
}

async function loadMasterFields() {
    await loadCategories(); // Load dependencies first
    const tbody = document.getElementById('masterTableBody');
    const emptyState = document.getElementById('masterTableEmpty');
    const loadingState = document.getElementById('masterTableLoading');

    tbody.innerHTML = '';
    tbody.classList.add('hidden');
    emptyState.classList.add('hidden');
    loadingState.classList.remove('hidden');

    try {
        const result = await masterTableService.fetchMasterFields();
        masterTableFieldsLocal = result.data || [];

        if (masterTableFieldsLocal.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            renderMasterTableRows(masterTableFieldsLocal);
            tbody.classList.remove('hidden');
        }
    } catch (error) {
        console.error("UI Error Load:", error);
        // Fallback UI error state (since we can't use swal)
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = `<i data-lucide="x-circle" class="w-12 h-12 mb-4 text-red-500"></i>
                                <p class="text-sm font-bold text-red-400">Error de Conexión</p>
                                <p class="text-xs text-slate-500">${error.message}</p>`;
    } finally {
        loadingState.classList.add('hidden');
        if (window.lucide) window.lucide.createIcons();
    }
}

function renderMasterTableRows(fields) {
    const tbody = document.getElementById('masterTableBody');
    tbody.innerHTML = '';

    fields.forEach(field => {
        const isActivo = field.esta_activo;
        const statusColor = isActivo ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 bg-slate-800';
        const rowOpacity = isActivo ? 'opacity-100' : 'opacity-50';

        const idBadge = field.es_identificador ? `<i data-lucide="key" class="w-3 h-3 text-amber-500 inline ml-2" title="Identificador Único (DNI)"></i>` : '';

        const tr = document.createElement('tr');
        tr.className = `border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${rowOpacity}`;
        tr.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg ${statusColor} flex items-center justify-center shrink-0">
                        <i data-lucide="database" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-200 flex items-center">${field.nombre_campo} ${idBadge}</p>
                        <p class="text-[10px] text-slate-500 font-mono tracking-wider">SOLAPA: ${field.diccionario_categorias?.nombre || field.tipo_dato || 'N/A'} (Cat ID: ${field.categoria_id ? field.categoria_id.split('-')[0]+'...' : 'Legacy'})</p>
                    </div>
                </div>
            </td>
            <td class="p-4">
                <span class="px-2 py-1 text-[10px] uppercase font-bold tracking-widest rounded-md ${field.es_requerido ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-500'}">
                    ${field.es_requerido ? 'Obligatorio' : 'Opcional'}
                </span>
            </td>
            <td class="p-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="window.editMasterField('${field.id}')" class="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Editar Campo">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <label class="relative inline-flex items-center cursor-pointer ml-2" title="${isActivo ? 'Apagar' : 'Encender'}">
                        <input type="checkbox" value="" class="sr-only peer" ${isActivo ? 'checked' : ''} onchange="window.promptToggleField('${field.id}', this.checked)">
                        <div class="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =========================================================================
// 2. FORM MODAL (CREATE / EDIT) & CATEGORY INTEGRATION
// =========================================================================

async function loadCategories() {
    try {
        const result = await masterTableService.fetchCategories();
        masterTableCategoriesLocal = result.data || [];
        
        // Populate the `<select>` in the Create Field modal
        const select = document.getElementById('mfmType');
        if (select) {
            select.innerHTML = '<option value="">Seleccionar solapa...</option>';
            masterTableCategoriesLocal.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id; // We use UUID as value
                opt.innerText = cat.nombre;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error loading categories", e);
    }
}

export function promptCreateMasterField() {
    currentEditId = null;
    document.getElementById('mfmId').value = '';
    document.getElementById('mfmName').value = '';
    document.getElementById('mfmType').value = '';
    document.getElementById('mfmReq').checked = false;
    document.getElementById('mfmIsId').checked = false;

    document.getElementById('mfmTitle').innerText = 'Nuevo Campo';
    document.getElementById('mfmWarning').classList.add('hidden');
    document.getElementById('mfmError').classList.add('hidden');
    document.getElementById('masterFieldModal').classList.remove('hidden');
}

export function editMasterField(id) {
    const field = masterTableFieldsLocal.find(f => f.id === id);
    if (!field) return;

    currentEditId = id;
    document.getElementById('mfmId').value = id;
    document.getElementById('mfmName').value = field.nombre_campo;
    
    // Select the right category UUID or leave empty if legacy
    const select = document.getElementById('mfmType');
    if (field.categoria_id) {
        select.value = field.categoria_id;
    } else {
        select.value = "";
    }
    
    document.getElementById('mfmReq').checked = field.es_requerido;
    document.getElementById('mfmIsId').checked = field.es_identificador || false;

    document.getElementById('mfmTitle').innerText = 'Editar Campo';
    document.getElementById('mfmWarning').classList.remove('hidden');
    document.getElementById('mfmError').classList.add('hidden');
    document.getElementById('masterFieldModal').classList.remove('hidden');
}

export function closeMasterFieldModal() {
    document.getElementById('masterFieldModal').classList.add('hidden');
}

export async function saveMasterFieldModal() {
    const btn = document.getElementById('mfmSaveBtn');
    const errText = document.getElementById('mfmError');

    const id = document.getElementById('mfmId').value;
    const name = document.getElementById('mfmName').value.trim();
    const catId = document.getElementById('mfmType').value;
    const isReq = document.getElementById('mfmReq').checked;
    const isId = document.getElementById('mfmIsId').checked;

    errText.classList.add('hidden');

    if (!name) {
        errText.innerText = "Error: El nombre del campo es obligatorio.";
        errText.classList.remove('hidden');
        return;
    }

    if (!catId) {
        errText.innerText = "Error: Es obligatorio seleccionar una solapa (Categoría).";
        errText.classList.remove('hidden');
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();

        const payload = { nombre_campo: name, categoria_id: catId, es_requerido: isReq, es_identificador: isId };

        if (id) {
            // EDIT MODE
            const originalField = masterTableFieldsLocal.find(f => f.id === id);
            // Skip network if identical
            if (originalField && originalField.nombre_campo === name && originalField.categoria_id === catId && originalField.es_requerido === isReq && !!originalField.es_identificador === isId) {
                closeMasterFieldModal();
                return;
            }
            await masterTableService.updateMasterField(id, payload);
        } else {
            // CREATE MODE
            await masterTableService.createMasterField(payload);
        }

        closeMasterFieldModal();
        await loadMasterFields();

    } catch (error) {
        errText.innerText = `Error: ${error.message}`;
        errText.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Guardar`;
        if (window.lucide) window.lucide.createIcons();
    }
}

// =========================================================================
// 3. CONFIRMATION MODAL (SOFT DELETE TOGGLE)
// =========================================================================
let pendingToggle = null;

export function promptToggleField(id, targetStatus) {
    const field = masterTableFieldsLocal.find(f => f.id === id);
    if (!field) return;

    pendingToggle = { id, targetStatus };

    const title = document.getElementById('mcmTitle');
    const desc = document.getElementById('mcmDesc');
    const btn = document.getElementById('mcmConfirmBtn');
    const icon = document.getElementById('mcmIcon');
    const iconBg = document.getElementById('mcmIconBg');
    document.getElementById('mcmError').classList.add('hidden');

    title.innerText = targetStatus ? '¿Activar Campo?' : '¿Apagar Campo?';
    desc.innerText = targetStatus
        ? `El campo "${field.nombre_campo}" volverá a estar disponible para mapeos.`
        : `El campo "${field.nombre_campo}" será ocultado, pero conservará sus datos existentes para no romper la estructura visual real.`;

    if (targetStatus) {
        btn.className = "w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors";
        icon.className = "w-8 h-8 text-emerald-400";
        iconBg.className = "w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-2";
    } else {
        btn.className = "w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors";
        icon.className = "w-8 h-8 text-amber-400";
        iconBg.className = "w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center mb-2";
    }

    // Attach function dynamically to the button to avoid creating many event listeners
    btn.onclick = async () => {
        try {
            document.getElementById('mcmError').classList.add('hidden');
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline-block"></i>`;
            if (window.lucide) window.lucide.createIcons();

            await masterTableService.toggleMasterFieldStatus(pendingToggle.id, pendingToggle.targetStatus);
            closeMasterConfirmModal();
            await loadMasterFields();
        } catch (error) {
            const errP = document.getElementById('mcmError');
            errP.innerText = `Error: ${error.message}`;
            errP.classList.remove('hidden');
            btn.innerText = "Reintentar";
        }
    };

    document.getElementById('masterConfirmModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

export function closeMasterConfirmModal() {
    document.getElementById('masterConfirmModal').classList.add('hidden');
    // Si cancela, tenemos que revertir el checkbox gráficamente porque el evento onChange ya pasó.
    loadMasterFields();
}

// =========================================================================
// 4. CATEGORY MANAGER MODAL CRUD
// =========================================================================
export async function openCategoryManagerModal() {
    document.getElementById('categoryManagerModal').classList.remove('hidden');
    await loadCategoryListRender();
}

export function closeCategoryManagerModal() {
    document.getElementById('categoryManagerModal').classList.add('hidden');
}

async function loadCategoryListRender() {
    const listContainer = document.getElementById('catListContainer');
    const errP = document.getElementById('catErrorMsg');
    const loading = document.getElementById('catListLoading');
    
    errP.classList.add('hidden');
    listContainer.innerHTML = '';
    loading.classList.remove('hidden');

    await loadCategories(); // Refresca desde BD
    loading.classList.add('hidden');

    if (masterTableCategoriesLocal.length === 0) {
        listContainer.innerHTML = '<div class="text-[10px] text-slate-500 italic text-center py-4">No hay solapas registradas.</div>';
        return;
    }

    masterTableCategoriesLocal.forEach(cat => {
        const item = document.createElement('div');
        item.className = "flex items-center gap-3 bg-slate-900 border border-slate-700/50 p-3 rounded-lg";
        item.innerHTML = `
            <div class="bg-purple-500/10 text-purple-400 font-mono text-[9px] px-2 py-1 rounded w-10 text-center font-bold">#${cat.orden_visual}</div>
            <div class="flex-grow min-w-0">
                <input type="text" id="cat_name_${cat.id}" value="${cat.nombre}" class="w-full bg-transparent border-b border-transparent focus:border-purple-500 outline-none text-xs text-slate-200 font-bold">
            </div>
            <div class="w-16">
                 <input type="number" id="cat_ord_${cat.id}" value="${cat.orden_visual}" class="w-full bg-transparent border-b border-transparent focus:border-purple-500 outline-none text-xs text-slate-400 text-center">
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <button onclick="window.updateCategoryFromUI('${cat.id}')" title="Guardar cambios" class="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="window.deleteCategoryFromUI('${cat.id}')" title="Eliminar (No borra los campos maestros)" class="p-1.5 text-red-400 hover:bg-red-500/20 rounded">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
        listContainer.appendChild(item);
    });
    if (window.lucide) window.lucide.createIcons();
}

export async function createCategoryFromUI() {
    const errText = document.getElementById('catErrorMsg');
    const nameInput = document.getElementById('catNewName');
    const ordInput = document.getElementById('catNewOrder');

    errText.classList.add('hidden');
    
    if(!nameInput.value.trim()) {
        errText.innerText = "Error: El nombre es obligatorio.";
        errText.classList.remove('hidden');
        return;
    }

    try {
        await masterTableService.createCategory({
            nombre: nameInput.value.trim(),
            orden_visual: ordInput.value
        });
        nameInput.value = '';
        ordInput.value = '99';
        await loadCategoryListRender();
        loadMasterFields(); // Refresca dropdown
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
    }
}

export async function updateCategoryFromUI(id) {
    const errText = document.getElementById('catErrorMsg');
    errText.classList.add('hidden');

    const name = document.getElementById(`cat_name_${id}`).value;
    const ord = document.getElementById(`cat_ord_${id}`).value;

    try {
        await masterTableService.updateCategory(id, {
            nombre: name,
            orden_visual: ord
        });
        await loadCategoryListRender();
        loadMasterFields(); 
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
    }
}

export async function deleteCategoryFromUI(id) {
    if(!confirm("¿Seguro que deseas eliminar esta Solapa? Los campos que dependan de ella quedarán libres y pueden no renderizarse en el visor hasta que les asignes una nueva solapa.")) return;
    
    const errText = document.getElementById('catErrorMsg');
    errText.classList.add('hidden');

    try {
        await masterTableService.deleteCategory(id);
        await loadCategoryListRender();
        loadMasterFields(); 
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
    }
}

// =========================================================================
// WIRING GLOBAL CONTEXT FOR HTML onClick
// =========================================================================
window.openMasterTableModal = openMasterTableModal;
window.closeMasterTableModal = closeMasterTableModal;

window.promptCreateMasterField = promptCreateMasterField;
window.editMasterField = editMasterField;
window.saveMasterFieldModal = saveMasterFieldModal;
window.closeMasterFieldModal = closeMasterFieldModal;

window.promptToggleField = promptToggleField;
window.closeMasterConfirmModal = closeMasterConfirmModal;

window.openCategoryManagerModal = openCategoryManagerModal;
window.closeCategoryManagerModal = closeCategoryManagerModal;
window.createCategoryFromUI = createCategoryFromUI;
window.updateCategoryFromUI = updateCategoryFromUI;
window.deleteCategoryFromUI = deleteCategoryFromUI;
