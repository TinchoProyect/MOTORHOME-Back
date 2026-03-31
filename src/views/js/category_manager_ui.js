import { masterTableService } from './services/master_table_service.js';

let draggedCategoryId = null;

export async function openCategoryManagerModal() {
    document.getElementById('categoryManagerModal').classList.remove('hidden');
    await loadCategoryListRender();
}

export function closeCategoryManagerModal() {
    document.getElementById('categoryManagerModal').classList.add('hidden');
}

export async function loadCategoryListRender() {
    const listContainer = document.getElementById('catListContainer');
    const errP = document.getElementById('catErrorMsg');
    const loading = document.getElementById('catListLoading');
    
    errP.classList.add('hidden');
    listContainer.innerHTML = '';
    loading.classList.remove('hidden');

    try {
        const result = await masterTableService.fetchCategories();
        const categories = result.data || [];
        window.masterTableCategoriesLocal = categories;

        loading.classList.add('hidden');

        if (categories.length === 0) {
            listContainer.innerHTML = '<div class="text-[10px] text-slate-500 italic text-center py-4">No hay solapas registradas.</div>';
            return;
        }

        // Se renderiza la lista usando Drag & Drop
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = "cat-item flex items-center gap-3 bg-slate-900 border border-slate-700/50 p-2 rounded-lg cursor-grab active:cursor-grabbing hover:border-purple-500/50 transition-colors group";
            item.draggable = true;
            item.dataset.id = cat.id;

            // DRAG EVENTS
            item.addEventListener('dragstart', (e) => {
                draggedCategoryId = cat.id;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => item.classList.add('opacity-50', 'ring-2', 'ring-purple-500'), 0);
            });

            item.addEventListener('dragend', () => {
                draggedCategoryId = null;
                item.classList.remove('opacity-50', 'ring-2', 'ring-purple-500');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault(); // Permitir el Drop
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('border-purple-500', 'bg-slate-800');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('border-purple-500', 'bg-slate-800');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('border-purple-500', 'bg-slate-800');
                if (draggedCategoryId && draggedCategoryId !== cat.id) {
                    handleDropReorder(draggedCategoryId, cat.id);
                }
            });

            // UI
            item.innerHTML = `
                <div class="text-slate-500 group-hover:text-purple-400 cursor-grab px-1 shrink-0">
                    <i data-lucide="grip-vertical" class="w-4 h-4"></i>
                </div>
                <div class="bg-purple-500/10 text-purple-400 font-mono text-[9px] px-2 py-1 rounded w-8 text-center font-bold shrink-0">
                    #${cat.orden_visual}
                </div>
                <div class="flex-grow min-w-0 flex items-center gap-2">
                    <input type="text" id="cat_name_${cat.id}" value="${cat.nombre}" 
                        class="w-full bg-transparent border-b border-transparent focus:border-purple-500 outline-none text-xs text-slate-200 font-bold transition-colors"
                        onkeydown="if(event.key === 'Enter') window.updateCategoryNameFromUI('${cat.id}')">
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="window.updateCategoryNameFromUI('${cat.id}')" title="Guardar Nuevo Nombre" class="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="window.deleteCategoryFromUI('${cat.id}')" title="Eliminar" class="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            `;
            listContainer.appendChild(item);
        });
        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        errP.innerText = `Error cargando solapas: ${error.message}`;
        errP.classList.remove('hidden');
        loading.classList.add('hidden');
    }
}

// ==========================================
// DRAG & DROP LOGIC - BATCH REORDER
// ==========================================
async function handleDropReorder(draggedId, targetId) {
    const listContainer = document.getElementById('catListContainer');
    const items = Array.from(listContainer.querySelectorAll('.cat-item'));
    
    const draggedIndex = items.findIndex(item => item.dataset.id === draggedId);
    const targetIndex = items.findIndex(item => item.dataset.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reposicionamiento del DOM
    const targetEl = items[targetIndex];
    const draggedEl = items[draggedIndex];
    
    if (draggedIndex < targetIndex) {
        targetEl.after(draggedEl);
    } else {
        targetEl.before(draggedEl);
    }

    // Ejecutar guardado posicional en batch
    await saveNewOrder();
}

async function saveNewOrder() {
    const errP = document.getElementById('catErrorMsg');
    errP.classList.add('hidden');
    
    const listContainer = document.getElementById('catListContainer');
    const DOMitems = Array.from(listContainer.querySelectorAll('.cat-item'));
    
    try {
        // Mostramos un loader visual sobre el header (opcional visual feedback)
        listContainer.classList.add('opacity-50', 'pointer-events-none');

        // Iterar en Promise.all recalculando index 1, 2, 3...
        const updatePromises = DOMitems.map((item, index) => {
            const id = item.dataset.id;
            const nuevoOrden = index + 1;
            return masterTableService.updateCategory(id, { orden_visual: nuevoOrden });
        });

        await Promise.all(updatePromises);
        
        // Finalizado, refrescar la lista para re-ordenar el DOM puramente desde base de datos
        await loadCategoryListRender();
        if(window.loadMasterFields) window.loadMasterFields(); // Sync Dropdown central

    } catch (error) {
        errP.innerText = `Error reordenando: ${error.message}`;
        errP.classList.remove('hidden');
    } finally {
        listContainer.classList.remove('opacity-50', 'pointer-events-none');
    }
}

// ==========================================
// CRUD ACCIONES DE USUARIO
// ==========================================
export async function createCategoryFromUI() {
    const errText = document.getElementById('catErrorMsg');
    const nameInput = document.getElementById('catNewName');

    errText.classList.add('hidden');
    
    if(!nameInput.value.trim()) {
        errText.innerText = "Error: El nombre es obligatorio.";
        errText.classList.remove('hidden');
        return;
    }

    try {
        // Se asume order_visual alto por defecto si no hay input manual de orden. Al final de la lista.
        const currentCount = document.querySelectorAll('.cat-item').length;

        await masterTableService.createCategory({
            nombre: nameInput.value.trim(),
            orden_visual: currentCount + 1
        });
        
        nameInput.value = '';
        await loadCategoryListRender();
        if(window.loadMasterFields) window.loadMasterFields(); 
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
    }
}

export async function updateCategoryNameFromUI(id) {
    const errText = document.getElementById('catErrorMsg');
    errText.classList.add('hidden');

    const inputName = document.getElementById(`cat_name_${id}`);
    const newName = inputName.value.trim();

    if(!newName) return;

    // Visual feedback
    inputName.classList.add('animate-pulse', 'text-blue-400');

    try {
        await masterTableService.updateCategory(id, { nombre: newName });
        
        // Remove feedback
        inputName.classList.remove('animate-pulse', 'text-blue-400');
        inputName.classList.add('text-green-400');
        setTimeout(() => inputName.classList.remove('text-green-400'), 1000);
        
        if(window.loadMasterFields) window.loadMasterFields(); 
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
        inputName.classList.remove('animate-pulse', 'text-blue-400');
    }
}

export async function deleteCategoryFromUI(id) {
    if(!confirm("¿Seguro que deseas eliminar esta Solapa? Los campos que dependan de ella quedarán libres y pueden no renderizarse en el visor hasta que les asignes una nueva solapa.")) return;
    
    const errText = document.getElementById('catErrorMsg');
    errText.classList.add('hidden');

    try {
        await masterTableService.deleteCategory(id);
        await loadCategoryListRender();
        if(window.loadMasterFields) window.loadMasterFields(); 
    } catch(err) {
        errText.innerText = `Error: ${err.message}`;
        errText.classList.remove('hidden');
    }
}

// Inyección Global Context
window.openCategoryManagerModal = openCategoryManagerModal;
window.closeCategoryManagerModal = closeCategoryManagerModal;
window.createCategoryFromUI = createCategoryFromUI;
window.updateCategoryNameFromUI = updateCategoryNameFromUI;
window.deleteCategoryFromUI = deleteCategoryFromUI;
