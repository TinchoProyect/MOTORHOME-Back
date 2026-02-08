/**
 * VIEWER UI - Módulo de Presentación 🎨
 * Responsable exclusivo de manipular el DOM del Visor Universal.
 * Desacoplado de la lógica de negocio y estado.
 */

window.ViewerUI = (function () {
    const DOM = {
        title: 'viewerTitle',
        iconContainer: 'viewerIconContainer',
        badges: 'viewerBadges',
        loader: 'viewerLoader',
        errorContainer: 'errorContainer',
        errorMessage: 'viewerErrorMessage',
        sheetTabs: 'sheetTabs',
        modal: 'viewerModal',
        containers: {
            excel: 'excelContainer',
            pdf: 'pdfContainer',
            image: 'imageContainer'
        }
    };

    /**
     * Actualiza el encabezado del visor (Título, Icono, Badges).
     * @param {string} fileName - Nombre del archivo
     * @param {object} meta - { providerName, fileType, isProcessed }
     */
    function updateHeader(fileName, meta = {}) {
        const titleEl = document.getElementById(DOM.title);
        if (titleEl) {
            titleEl.textContent = fileName || "Documento";
            titleEl.className = "text-sm font-bold text-white tracking-wide opacity-70";
        }

        // Hard Reset Icon Container
        const iconContainer = document.getElementById(DOM.iconContainer);
        if (iconContainer) {
            const iconName = meta.isProcessed ? 'file-check' : (meta.fileType === 'LISTA_PRECIOS' ? 'layers' : 'file-text');
            const colorClass = meta.isProcessed ? 'text-emerald-400' : 'text-slate-400';
            iconContainer.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5 ${colorClass}"></i>`;
        }

        // Badges
        const badgesContainer = document.getElementById(DOM.badges);
        if (badgesContainer) {
            if (meta.isProcessed) {
                badgesContainer.innerHTML = `
                    <span class="px-2 py-0.5 rounded text-[9px] bg-emerald-900 text-emerald-300 border border-emerald-800 uppercase tracking-wider font-bold">
                        PROCESADO
                    </span>
                `;
            } else {
                const pName = meta.providerName || "DESCONOCIDO";
                const type = meta.fileType || "GENERAL";
                const badgeColor = type === "LISTA_PRECIOS" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20";
                const badgeIcon = type === "LISTA_PRECIOS" ? "layers" : "folder";

                badgesContainer.innerHTML = `
                    <span class="px-2 py-0.5 text-[10px] rounded-full border bg-slate-800 text-slate-300 border-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <i data-lucide="building-2" class="w-3 h-3"></i> ${pName}
                    </span>
                    <span class="px-2 py-0.5 text-[10px] rounded-full border ${badgeColor} uppercase tracking-wider font-mono flex items-center gap-1">
                        <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${type.replace('_', ' ')}
                    </span>
                `;
            }
        }

        refreshIcons();
    }

    function toggleLoader(show) {
        const loader = document.getElementById(DOM.loader);
        if (loader) {
            if (show) loader.classList.remove('hidden');
            else loader.classList.add('hidden');
        }
    }

    function showError(message) {
        const container = document.getElementById(DOM.errorContainer);
        const msgEl = document.getElementById(DOM.errorMessage);
        if (container && msgEl) {
            msgEl.textContent = message;
            container.classList.remove('hidden');
            toggleLoader(false);
        }
    }

    function resetView() {
        // Ocultar todos los contenedores de contenido
        Object.values(DOM.containers).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        const err = document.getElementById(DOM.errorContainer);
        if (err) err.classList.add('hidden');

        const tabs = document.getElementById(DOM.sheetTabs);
        if (tabs) tabs.innerHTML = '';
    }

    function showContainer(type) {
        resetView(); // Primero ocultamos todo
        const targetId = DOM.containers[type];
        if (targetId) {
            const el = document.getElementById(targetId);
            if (el) el.classList.remove('hidden');
        }
    }

    function renderSheetTabs(sheetNames, currentSheet, onTabClick) {
        const container = document.getElementById(DOM.sheetTabs);
        if (!container) return;

        container.innerHTML = '';
        if (!sheetNames || sheetNames.length <= 1) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        sheetNames.forEach(name => {
            const isActive = name === currentSheet;
            const btn = document.createElement('button');
            btn.className = isActive
                ? "px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-t-lg shadow-lg border-t border-x border-blue-400 capitalize transition-all transform translate-y-[1px]"
                : "px-3 py-1 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold rounded-t-lg border-t border-x border-transparent hover:border-slate-600 capitalize transition-all";
            btn.innerText = name.toLowerCase();

            // Callback Proxy Pattern
            if (onTabClick) {
                btn.onclick = () => onTabClick(name);
            }

            container.appendChild(btn);
        });
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons({ root: document.getElementById(DOM.modal) });
        }
    }

    function toggleTools(show) {
        const btnMap = document.getElementById('btnMappingMode');
        const btnOff = document.getElementById('btnOffsetMode');
        const btnCalc = document.getElementById('btnCalcMode');

        const tools = [btnMap, btnOff, btnCalc];

        tools.forEach(btn => {
            if (btn) {
                if (show) btn.classList.remove('hidden');
                else btn.classList.add('hidden');
            }
        });
    }

    // --- [PHASE 4: DYNAMIC DOM MODAL] ---

    function renderCreateTermModal(defaultTermName, onSaveCallback) {
        // 1. Create Overlay
        const overlay = document.createElement('div');
        overlay.id = 'dynamicCreationModal';
        overlay.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200';

        // 2. Create Panel
        const panel = document.createElement('div');
        panel.className = 'w-full max-w-md bg-slate-900 border border-blue-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200';

        // 3. Header
        const header = document.createElement('div');
        header.className = 'p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center';
        header.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-500/10 rounded-lg text-blue-400"><i data-lucide="plus-circle" class="w-5 h-5"></i></div>
                <div><h3 class="text-white font-bold text-sm">Nuevo Encabezado</h3><p class="text-[10px] text-slate-400 font-mono">DICCIONARIO DINÁMICO</p></div>
            </div>
        `;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-slate-400 hover:text-white transition-colors';
        closeBtn.innerHTML = '<i data-lucide="x" class="w-5 h-5"></i>';
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // 4. Body
        const body = document.createElement('div');
        body.className = 'p-6 space-y-5';

        // Input 1: Name
        const group1 = document.createElement('div');
        group1.className = 'space-y-1';
        group1.innerHTML = '<label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Nombre del Término (Obligatorio)</label>';
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.value = defaultTermName || '';
        inputName.placeholder = 'Ej: Código SKU';
        inputName.className = 'w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none placeholder:text-slate-600 font-bold tracking-wide';
        group1.appendChild(inputName);
        body.appendChild(group1);

        // Input 2: Description
        const group2 = document.createElement('div');
        group2.className = 'space-y-1';
        group2.innerHTML = '<label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Descripción (Opcional)</label>';
        const inputDesc = document.createElement('input');
        inputDesc.type = 'text';
        inputDesc.placeholder = 'Contexto de uso...';
        inputDesc.className = 'w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-300 focus:border-blue-500 outline-none placeholder:text-slate-600';
        group2.appendChild(inputDesc);
        body.appendChild(group2);

        // 5. Privacy Switch Logic
        const privacyContainer = document.createElement('div');
        privacyContainer.className = "pt-2";

        // Structure for switch
        const switchLabel = document.createElement('label');
        switchLabel.className = "flex items-center justify-between p-3 rounded-xl border border-blue-500/30 bg-blue-900/10 cursor-pointer group hover:bg-blue-900/20 transition-all select-none";

        const leftSide = document.createElement('div');
        leftSide.className = "flex items-center gap-3";
        const iconBox = document.createElement('div');
        iconBox.className = "p-2 rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all";
        iconBox.innerHTML = '<i data-lucide="lock" class="w-4 h-4"></i>';

        const textCol = document.createElement('div');
        textCol.className = "flex flex-col";
        const titleSpan = document.createElement('span');
        titleSpan.className = "text-xs font-bold text-blue-100 group-hover:text-white transition-colors";
        titleSpan.innerText = "Privado (Recomendado)";
        const descSpan = document.createElement('span');
        descSpan.className = "text-[9px] text-blue-300/70";
        descSpan.innerText = "Solo visible para este proveedor";

        textCol.appendChild(titleSpan);
        textCol.appendChild(descSpan);
        leftSide.appendChild(iconBox);
        leftSide.appendChild(textCol);

        const switchWrapper = document.createElement('div');
        switchWrapper.className = "relative inline-flex items-center cursor-pointer";
        const infoCheckbox = document.createElement('input');
        infoCheckbox.type = 'checkbox';
        infoCheckbox.className = "sr-only peer";
        infoCheckbox.checked = true; // Default TRUE

        const visualSwitch = document.createElement('div');
        visualSwitch.className = "w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500";

        switchWrapper.appendChild(infoCheckbox);
        switchWrapper.appendChild(visualSwitch);

        switchLabel.appendChild(leftSide);
        switchLabel.appendChild(switchWrapper);
        privacyContainer.appendChild(switchLabel);
        body.appendChild(privacyContainer);

        // Toggle Logic
        infoCheckbox.onchange = () => {
            if (infoCheckbox.checked) {
                switchLabel.className = "flex items-center justify-between p-3 rounded-xl border border-blue-500/30 bg-blue-900/10 cursor-pointer group hover:bg-blue-900/20 transition-all select-none";
                iconBox.className = "p-2 rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all";
                iconBox.innerHTML = '<i data-lucide="lock" class="w-4 h-4"></i>';
                titleSpan.innerText = "Privado (Recomendado)";
                titleSpan.className = "text-xs font-bold text-blue-100 group-hover:text-white transition-colors";
                descSpan.innerText = "Solo visible para este proveedor";
            } else {
                switchLabel.className = "flex items-center justify-between p-3 rounded-xl border border-slate-600 bg-slate-800/30 cursor-pointer group hover:bg-slate-800/50 transition-all select-none";
                iconBox.className = "p-2 rounded-lg bg-slate-700 text-slate-400 transition-all";
                iconBox.innerHTML = '<i data-lucide="globe" class="w-4 h-4"></i>';
                titleSpan.innerText = "Global (Público)";
                titleSpan.className = "text-xs font-bold text-slate-300 group-hover:text-white transition-colors";
                descSpan.innerText = "Visible para TODOS los proveedores";
            }
            if (window.lucide) window.lucide.createIcons({ root: iconBox });
        };

        panel.appendChild(body);

        // 6. Footer
        const footer = document.createElement('div');
        footer.className = 'p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end gap-3 rounded-b-2xl';

        const btnCancel = document.createElement('button');
        btnCancel.innerText = 'Cancelar';
        btnCancel.className = 'px-4 py-2 text-xs text-slate-500 hover:text-white font-bold uppercase transition-colors';
        btnCancel.onclick = () => overlay.remove();

        const btnSave = document.createElement('button');
        btnSave.innerHTML = '<i data-lucide="save" class="w-3 h-3 inline mr-1"></i> Guardar';
        btnSave.className = 'px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-900/20 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed';

        btnSave.onclick = async () => {
            const termName = inputName.value.trim();
            const termDesc = inputDesc.value.trim();

            if (!termName) {
                inputName.focus();
                inputName.classList.add('border-red-500');
                setTimeout(() => inputName.classList.remove('border-red-500'), 2000);
                return;
            }

            btnSave.innerText = 'Guardando...';
            btnSave.disabled = true;

            try {
                // Determine Provider ID
                const isPrivate = infoCheckbox.checked;
                const targetProviderId = isPrivate ? (window.globalContext?.providerId || null) : null;

                // Call Service
                if (window.NomenclatureService) {
                    await window.NomenclatureService.create(termName, termDesc, targetProviderId);

                    // Success callback
                    if (onSaveCallback) onSaveCallback(termName);

                    overlay.remove();
                } else {
                    throw new Error("Servicio de Nomenclatura no disponible");
                }
            } catch (e) {
                console.error("Error creating term:", e);
                alert("Error al guardar: " + e.message);
                btnSave.innerText = 'Guardar';
                btnSave.disabled = false;
            }
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSave);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Initialize Icons & Focus
        if (window.lucide) window.lucide.createIcons({ root: overlay });
        setTimeout(() => inputName.focus(), 50);
    }

    // Public API
    return {
        updateHeader,
        toggleLoader,
        showError,
        resetView,
        showContainer,
        renderSheetTabs,
        refreshIcons,
        toggleTools,
        renderCreateTermModal
    };
})();

console.log("🎨 ViewerUI Module Loaded");