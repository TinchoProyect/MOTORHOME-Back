// src/views/js/master_table_ui.js
import { masterTableService } from './services/master_table_service.js';

let masterTableFieldsLocal = []; // State for Table Sync
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

        const tr = document.createElement('tr');
        tr.className = `border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${rowOpacity}`;
        tr.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg ${statusColor} flex items-center justify-center shrink-0">
                        <i data-lucide="database" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-200">${field.nombre_campo}</p>
                        <p class="text-[10px] text-slate-500 font-mono tracking-wider">TIPO: ${field.tipo_dato}</p>
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
// 2. FORM MODAL (CREATE / EDIT) & DROPDOWN LOGIC
// =========================================================================

function getUniqueDataTypes() {
    return [...new Set(masterTableFieldsLocal
        .map(field => field.tipo_dato)
        .filter(tipo => tipo && tipo.trim() !== '')
    )].sort();
}

export function openDataTypeDropdown() {
    const dropdown = document.getElementById('mfmTypeDropdown');
    const input = document.getElementById('mfmType');
    if (!dropdown || !input) return;

    dropdown.classList.remove('hidden');
    renderDropdownOptions(getUniqueDataTypes(), input.value);
}

export function filterDataTypeDropdown() {
    const input = document.getElementById('mfmType');
    const dropdown = document.getElementById('mfmTypeDropdown');
    if (!dropdown || !input) return;

    // Si el usuario escribe algo, mostramos el menú y filtramos.
    dropdown.classList.remove('hidden');

    const term = input.value.toLowerCase().trim();
    const allTypes = getUniqueDataTypes();

    const filtered = allTypes.filter(t => t.toLowerCase().includes(term));
    renderDropdownOptions(filtered, input.value);
}

function renderDropdownOptions(options, currentInput) {
    const dropdown = document.getElementById('mfmTypeDropdown');
    dropdown.innerHTML = '';

    if (options.length === 0) {
        dropdown.innerHTML = `<div class="p-3 text-xs text-slate-500 italic text-center">Sin sugerencias previas</div>`;
        return;
    }

    options.forEach(tipo => {
        const div = document.createElement('div');
        div.className = "px-4 py-3 text-sm text-slate-300 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors border-b border-slate-700/50 last:border-0";
        div.innerText = tipo;

        div.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('mfmType').value = tipo;
            dropdown.classList.add('hidden');
        };

        dropdown.appendChild(div);
    });
}

// Global click event to close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('mfmTypeContainer');
    const dropdown = document.getElementById('mfmTypeDropdown');
    if (container && dropdown && !container.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

export function promptCreateMasterField() {
    currentEditId = null;
    document.getElementById('mfmId').value = '';
    document.getElementById('mfmName').value = '';
    document.getElementById('mfmType').value = '';
    document.getElementById('mfmReq').checked = false;

    document.getElementById('mfmTitle').innerText = 'Nuevo Campo';
    document.getElementById('mfmWarning').classList.add('hidden');
    document.getElementById('mfmError').classList.add('hidden');
    document.getElementById('mfmTypeDropdown')?.classList.add('hidden');
    document.getElementById('masterFieldModal').classList.remove('hidden');
}

export function editMasterField(id) {
    const field = masterTableFieldsLocal.find(f => f.id === id);
    if (!field) return;

    currentEditId = id;
    document.getElementById('mfmId').value = id;
    document.getElementById('mfmName').value = field.nombre_campo;
    document.getElementById('mfmType').value = field.tipo_dato;
    document.getElementById('mfmReq').checked = field.es_requerido;

    document.getElementById('mfmTitle').innerText = 'Editar Campo';
    document.getElementById('mfmWarning').classList.remove('hidden');
    document.getElementById('mfmError').classList.add('hidden');
    document.getElementById('mfmTypeDropdown')?.classList.add('hidden');
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
    const type = document.getElementById('mfmType').value.trim();
    const isReq = document.getElementById('mfmReq').checked;

    errText.classList.add('hidden');

    if (!name) {
        errText.innerText = "Error: El nombre del campo es obligatorio.";
        errText.classList.remove('hidden');
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...`;
        if (window.lucide) window.lucide.createIcons();

        const payload = { nombre_campo: name, tipo_dato: type, es_requerido: isReq };

        if (id) {
            // EDIT MODE
            const originalField = masterTableFieldsLocal.find(f => f.id === id);
            // Skip network if identical
            if (originalField && originalField.nombre_campo === name && originalField.tipo_dato === type && originalField.es_requerido === isReq) {
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

window.openDataTypeDropdown = openDataTypeDropdown;
window.filterDataTypeDropdown = filterDataTypeDropdown;
