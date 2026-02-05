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

    // Public API
    return {
        updateHeader,
        toggleLoader,
        showError,
        resetView,
        showContainer,
        renderSheetTabs,
        refreshIcons
    };
})();

console.log("🎨 ViewerUI Module Loaded");
