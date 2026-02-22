/**
 * VIEWER UI - Módulo de Presentación 🎨
 * Responsable exclusivo de manipular el DOM del Visor Universal.
 * Desacoplado de la lógica de negocio y estado.
 */

window.ViewerUI = (function () {
  const DOM = {
    title: "viewerTitle",
    iconContainer: "viewerIconContainer",
    badges: "viewerBadges",
    loader: "viewerLoader",
    errorContainer: "errorContainer",
    errorMessage: "viewerErrorMessage",
    sheetTabs: "sheetTabs",
    modal: "viewerModal",
    containers: {
      excel: "excelContainer",
      pdf: "pdfContainer",
      image: "imageContainer",
    },
  };

  /**
   * Actualiza el encabezado del visor (Título, Icono, Badges).
   */
  function updateHeader(fileName, meta = {}) {
    const titleEl = document.getElementById(DOM.title);
    if (titleEl) {
      titleEl.textContent = fileName || "Documento";
      titleEl.className =
        "text-sm font-bold text-white tracking-wide opacity-70";
    }

    // Hard Reset Icon Container
    const iconContainer = document.getElementById(DOM.iconContainer);
    if (iconContainer) {
      const iconName = meta.isProcessed
        ? "file-check"
        : meta.fileType === "LISTA_PRECIOS"
          ? "layers"
          : "file-text";
      const colorClass = meta.isProcessed
        ? "text-emerald-400"
        : "text-slate-400";
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
        const badgeColor =
          type === "LISTA_PRECIOS"
            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
            : "bg-blue-500/10 text-blue-400 border-blue-500/20";
        const badgeIcon = type === "LISTA_PRECIOS" ? "layers" : "folder";

        badgesContainer.innerHTML = `
                    <span class="px-2 py-0.5 text-[10px] rounded-full border bg-slate-800 text-slate-300 border-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <i data-lucide="building-2" class="w-3 h-3"></i> ${pName}
                    </span>
                    <span class="px-2 py-0.5 text-[10px] rounded-full border ${badgeColor} uppercase tracking-wider font-mono flex items-center gap-1">
                        <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${type.replace("_", " ")}
                    </span>
                `;
      }
    }

    refreshIcons();
  }

  function toggleLoader(show) {
    const loader = document.getElementById(DOM.loader);
    if (loader) {
      if (show) loader.classList.remove("hidden");
      else loader.classList.add("hidden");
    }
  }

  function showError(message) {
    const container = document.getElementById(DOM.errorContainer);
    const msgEl = document.getElementById(DOM.errorMessage);
    if (container && msgEl) {
      msgEl.textContent = message;
      container.classList.remove("hidden");
      toggleLoader(false);
    }
  }

  function resetView() {
    // Ocultar todos los contenedores de contenido
    Object.values(DOM.containers).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });

    const err = document.getElementById(DOM.errorContainer);
    if (err) err.classList.add("hidden");

    const tabs = document.getElementById(DOM.sheetTabs);
    if (tabs) tabs.innerHTML = "";
  }

  function showContainer(type) {
    resetView(); // Primero ocultamos todo
    const targetId = DOM.containers[type];
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.classList.remove("hidden");
    }
  }

  function renderSheetTabs(sheetNames, currentSheet, onTabClick) {
    const container = document.getElementById(DOM.sheetTabs);
    if (!container) return;

    container.innerHTML = "";
    if (!sheetNames || sheetNames.length <= 1) {
      container.classList.add("hidden");
      return;
    }

    container.classList.remove("hidden");
    sheetNames.forEach((name) => {
      const isActive = name === currentSheet;
      const btn = document.createElement("button");
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
    const btnMap = document.getElementById("btnMappingMode");
    const btnOff = document.getElementById("btnOffsetMode");
    const btnCalc = document.getElementById("btnCalcMode");
    // [NEW]
    const btnSave = document.getElementById("btnSaveConfig");
    const btnReset = document.getElementById("btnResetConfig");

    const tools = [btnMap, btnOff, btnCalc, btnSave, btnReset];

    tools.forEach((btn) => {
      if (btn) {
        if (show) btn.classList.remove("hidden");
        else btn.classList.add("hidden");
      }
    });
  }

  // --- [PHASE 4: DYNAMIC DOM MODAL] ---

  function renderCreateTermModal(termData, onSaveCallback) {
    // [ADAPTIVIDAD ENTRE V3 (String) y V4 (Object)]
    const isEditMode =
      (typeof termData === "object" && termData !== null) ||
      (typeof termData === "string" && termData.length > 0);

    const initialValues =
      typeof termData === "object"
        ? termData
        : { term: termData, description: "" };
    const termId = initialValues.id || null;

    // 1. Create Overlay (GLASSMOPHISM: Reduced opacity, strong blur)
    const overlay = document.createElement("div");
    overlay.id = "dynamicCreationModal";
    overlay.className =
      "fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200";

    // 2. Create Panel (PREMIUM GLASS: No solid bg, pure blur + subtle border)
    const panel = document.createElement("div");
    panel.className =
      "w-full max-w-md glass-panel rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10 ring-1 ring-white/5";

    // 3. Header
    const header = document.createElement("div");
    header.className =
      "p-4 border-b border-white/5 bg-slate-900/40 flex justify-between items-center";
    header.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-500/20 rounded-lg text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]"><i data-lucide="${isEditMode ? "edit-2" : "plus-circle"}" class="w-5 h-5"></i></div>
                <div>
                    <h3 class="text-white font-bold text-sm tracking-wide">${isEditMode ? "Editar Encabezado" : "Nuevo Encabezado"}</h3>
                    <p class="text-[10px] text-slate-400 font-mono tracking-wider">DICCIONARIO DINÁMICO</p>
                </div>
            </div>
        `;
    const closeBtn = document.createElement("button");
    closeBtn.className =
      "text-slate-500 hover:text-white transition-colors hover:rotate-90 duration-300";
    closeBtn.innerHTML = '<i data-lucide="x" class="w-5 h-5"></i>';
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 4. Body
    const body = document.createElement("div");
    body.className =
      "p-6 space-y-5 bg-gradient-to-b from-transparent to-slate-900/30";

    // Input 1: Name
    const group1 = document.createElement("div");
    group1.className = "space-y-1.5";
    group1.innerHTML =
      '<label class="text-[10px] font-bold text-blue-300/80 uppercase ml-1 tracking-wider">Nombre del Término (Obligatorio)</label>';
    const inputName = document.createElement("input");
    inputName.type = "text";
    inputName.value = initialValues.term || "";
    inputName.placeholder = "Ej: CÓDIGO SKU";
    inputName.className =
      "w-full bg-slate-950/40 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/50 outline-none placeholder:text-slate-600 font-bold tracking-wide transition-all shadow-inner";
    group1.appendChild(inputName);
    body.appendChild(group1);

    // Input 2: Description
    const group2 = document.createElement("div");
    group2.className = "space-y-1.5";
    group2.innerHTML =
      '<label class="text-[10px] font-bold text-slate-500 uppercase ml-1 tracking-wider">Descripción (Opcional)</label>';
    const inputDesc = document.createElement("input");
    inputDesc.type = "text";
    inputDesc.value = initialValues.description || "";
    inputDesc.placeholder = "Contexto de uso para la IA...";
    inputDesc.className =
      "w-full bg-slate-950/40 border border-slate-700/50 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:border-blue-500/60 outline-none placeholder:text-slate-600 transition-all shadow-inner";
    group2.appendChild(inputDesc);
    body.appendChild(group2);

    // 5. Privacy Switch Logic
    const privacyContainer = document.createElement("div");
    privacyContainer.className = "pt-2";

    // Determinar estado lógico inicial real
    let isPrivateInitial = true;
    if (termId) {
      isPrivateInitial =
        initialValues.proveedor_id !== null &&
        initialValues.proveedor_id !== undefined;
    }

    const switchLabel = document.createElement("label");
    const leftSide = document.createElement("div");
    leftSide.className = "flex items-center gap-3";

    const iconBox = document.createElement("div");
    const textCol = document.createElement("div");
    textCol.className = "flex flex-col";

    const titleSpan = document.createElement("span");
    const descSpan = document.createElement("span");

    textCol.appendChild(titleSpan);
    textCol.appendChild(descSpan);
    leftSide.appendChild(iconBox);
    leftSide.appendChild(textCol);

    const switchWrapper = document.createElement("div");
    switchWrapper.className =
      "relative inline-flex items-center cursor-pointer";
    const infoCheckbox = document.createElement("input");
    infoCheckbox.type = "checkbox";
    infoCheckbox.className = "sr-only peer";
    infoCheckbox.checked = isPrivateInitial; // Inyecta el estado inicial al checkbox

    const visualSwitch = document.createElement("div");
    visualSwitch.className =
      "w-9 h-5 bg-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500 shadow-inner";

    switchWrapper.appendChild(infoCheckbox);
    switchWrapper.appendChild(visualSwitch);

    switchLabel.appendChild(leftSide);
    switchLabel.appendChild(switchWrapper);
    privacyContainer.appendChild(switchLabel);
    body.appendChild(privacyContainer);

    // UI Updater Helper
    const updatePrivacyUI = (isPrivate) => {
      if (isPrivate) {
        switchLabel.className =
          "flex items-center justify-between p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 cursor-pointer group hover:bg-blue-500/10 transition-all select-none";
        iconBox.className =
          "p-2 rounded-lg bg-blue-500/20 text-blue-400 shadow-sm transition-all";
        iconBox.innerHTML = '<i data-lucide="lock" class="w-4 h-4"></i>';
        titleSpan.innerText = "Privado (Recomendado)";
        titleSpan.className =
          "text-xs font-bold text-blue-100 group-hover:text-white transition-colors";
        descSpan.innerText = "Solo visible para este proveedor";
      } else {
        switchLabel.className =
          "flex items-center justify-between p-3 rounded-xl border border-slate-700/50 bg-slate-900/30 cursor-pointer group hover:bg-slate-800/50 transition-all select-none";
        iconBox.className =
          "p-2 rounded-lg bg-slate-700/50 text-slate-400 transition-all";
        iconBox.innerHTML = '<i data-lucide="globe" class="w-4 h-4"></i>';
        titleSpan.innerText = "Global (Público)";
        titleSpan.className =
          "text-xs font-bold text-slate-400 group-hover:text-white transition-colors";
        descSpan.innerText = "Visible para TODOS los proveedores";
      }
      if (window.lucide) window.lucide.createIcons({ root: iconBox });
    };

    // Initialize First Render
    updatePrivacyUI(isPrivateInitial);

    // Toggle Logic Hook
    infoCheckbox.onchange = () => updatePrivacyUI(infoCheckbox.checked);

    panel.appendChild(body);

    // 6. Footer
    const footer = document.createElement("div");
    footer.className =
      "p-4 border-t border-white/5 bg-slate-900/60 flex justify-between items-center rounded-b-2xl backdrop-blur-md";

    // --- ZONA IZQUIERDA: BOTÓN ELIMINAR (Solo si hay ID o Nombre) ---
    const leftActions = document.createElement("div");

    // Solo mostramos eliminar si tenemos un ID válido (Ideal) o al menos un nombre para intentar.
    if (termId || initialValues.term) {
      const btnDelete = document.createElement("button");
      btnDelete.className =
        "text-red-400 hover:text-red-300 text-xs font-bold uppercase flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-all group";
      btnDelete.innerHTML =
        '<i data-lucide="trash-2" class="w-4 h-4 group-hover:scale-110 transition-transform"></i> Eliminar';
      btnDelete.onclick = () => {
        // Si no hay ID, advertimos.
        if (!termId) {
          alert(
            "Aviso: Estás intentando eliminar un término sin ID persistente. Si es nuevo, simplemente cancela.",
          );
        }

        // Llamamos al modal de confirmación
        renderDeleteConfirmation(initialValues.term, async () => {
          const deleteId = termId || initialValues.term; // Fallback al nombre (aunque el servicio requiere ID)

          // Lógica de Eliminación
          if (window.NomenclatureService && window.NomenclatureService.delete) {
            try {
              // INTENTO 1: Borrar por ID (Si existe)
              if (termId) {
                await window.NomenclatureService.delete(termId);
              } else {
                // Fallback crítico: No tenemos ID.
                // Opcion A: Buscar ID por nombre? (Muy caro)
                // Opcion B: Error.
                throw new Error(
                  "No se puede eliminar un término sin ID guardado.",
                );
              }

              if (onSaveCallback) onSaveCallback(null); // Null indica borrado/cancelado
              overlay.remove();
            } catch (e) {
              console.error("Error eliminando:", e);
              alert("Error al eliminar: " + e.message);
            }
          } else {
            // Fallback si no hay servicio DELETE
            alert(
              "Error Crítico: Servicio NomenclatureService.delete no encontrado.",
            );
            overlay.remove();
          }
        });
      };
      leftActions.appendChild(btnDelete);
    }
    footer.appendChild(leftActions);

    // --- ZONA DERECHA: CANCELAR / GUARDAR ---
    const rightActions = document.createElement("div");
    rightActions.className = "flex gap-3";

    const btnCancel = document.createElement("button");
    btnCancel.innerText = "Cancelar";
    btnCancel.className =
      "px-4 py-2 text-xs text-slate-500 hover:text-white font-bold uppercase transition-colors";
    btnCancel.onclick = () => overlay.remove();

    const btnSave = document.createElement("button");
    btnSave.innerHTML =
      '<i data-lucide="save" class="w-3 h-3 inline mr-1"></i> Guardar';
    btnSave.className =
      "px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-400/20";

    btnSave.onclick = async () => {
      const termName = inputName.value.trim();
      const termDesc = inputDesc.value.trim();

      if (!termName) {
        inputName.focus();
        inputName.classList.add("border-red-500");
        setTimeout(() => inputName.classList.remove("border-red-500"), 2000);
        return;
      }

      btnSave.innerText = "Guardando...";
      btnSave.disabled = true;

      try {
        // Determine Provider ID
        const isPrivate = infoCheckbox.checked;
        // Si es privado, usamos el ID global. Si no, NULL.
        const targetProviderId = isPrivate
          ? window.globalContext?.providerId || null
          : null;

        // [FIX] Detectar Modo EDICIÓN vs CREACIÓN
        if (termId && window.NomenclatureService.update) {
          // MODO EDICIÓN:
          // Necesitamos decirle al backend si es Global (isGlobal: !isPrivate)
          // Y necesitamos pasar el currentProviderId para que pueda validarlo si vuelve a Privado.
          await window.NomenclatureService.update(termId, {
            termino: termName,
            descripcion: termDesc,
            isGlobal: !isPrivate, // Invertimos check "Solo Mío" -> Global
            currentProviderId: window.globalContext?.providerId,
          });
        } else if (window.NomenclatureService) {
          // MODO CREACIÓN:
          await window.NomenclatureService.create(
            termName,
            termDesc,
            targetProviderId,
          );
        } else {
          throw new Error("Servicio de Nomenclatura no disponible");
        }

        // Success callback
        if (onSaveCallback) onSaveCallback(termName);
        overlay.remove();
      } catch (e) {
        console.error("[ViewerUI] Error saving term:", e);
        alert("Error al guardar: " + e.message);
        btnSave.innerText = "Guardar";
        btnSave.disabled = false;
      }
    };

    rightActions.appendChild(btnCancel);
    rightActions.appendChild(btnSave);
    footer.appendChild(rightActions);

    panel.appendChild(footer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Initialize Icons & Focus
    if (window.lucide) window.lucide.createIcons({ root: overlay });
    setTimeout(() => inputName.focus(), 50);
  }

  // --- [PHASE 5: RULES MANAGER POP-OVER] ---

  function renderRulesManager(colIndex, anchorElement) {
    // 1. Remove existing if any
    const existing = document.getElementById("rulesManagerPopover");
    if (existing) existing.remove();

    // 2. Create Popover (GLASSMOPHISM UPDATE)
    const popover = document.createElement("div");
    popover.id = "rulesManagerPopover";
    popover.className =
      "fixed z-[300] glass-panel rounded-xl shadow-2xl flex flex-col w-[300px] animate-in zoom-in-95 duration-100 border border-white/10 ring-1 ring-black/50 backdrop-blur-xl";

    // Positioning (Initial or fallback)
    if (anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      popover.style.top = rect.bottom + 8 + "px";
      popover.style.left = rect.left - 130 + "px"; // Center align roughly
    } else {
      // Failsafe center
      popover.style.top = "50%";
      popover.style.left = "50%";
      popover.style.transform = "translate(-50%, -50%)";
    }

    // 3. Header
    const header = document.createElement("div");
    header.className =
      "px-4 py-3 border-b border-white/5 bg-slate-900/60 flex justify-between items-center rounded-t-xl";
    header.innerHTML =
      '<span class="text-[10px] font-bold text-blue-300 uppercase tracking-widest flex items-center gap-2"><i data-lucide="zap" class="w-3 h-3"></i> Pipeline de Reglas</span>';
    const closeBtn = document.createElement("button");
    closeBtn.className =
      "text-slate-500 hover:text-white transition-colors hover:bg-white/10 rounded p-0.5";
    closeBtn.innerHTML = '<i data-lucide="x" class="w-3 h-3"></i>';
    closeBtn.onclick = () => popover.remove();
    header.appendChild(closeBtn);
    popover.appendChild(header);

    // 4. Rules List (Pipeline)
    const listContainer = document.createElement("div");
    listContainer.className =
      "p-2 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar bg-slate-950/20";

    // Ensure array
    let currentRules = [];
    if (processingRules[colIndex]) {
      currentRules = Array.isArray(processingRules[colIndex])
        ? processingRules[colIndex]
        : [processingRules[colIndex]];
    }

    // Helper to refresh and re-anchor
    const refreshAndReAnchor = () => {
      // 1. Refresh Data
      if (window.generatePreview) window.generatePreview();
      else renderVirtualTable(currentSheetData);

      // 2. Find New Anchor (The button was destroyed and recreated)
      setTimeout(() => {
        const newAnchor = document.querySelector(
          `#simTableScrollArea button[onclick*="ViewerUI.openRulesManager(${colIndex},"]`,
        );
        renderRulesManager(colIndex, newAnchor);
      }, 50); // Small delay for DOM paint
    };

    if (currentRules.length === 0) {
      listContainer.innerHTML =
        '<div class="text-[10px] text-slate-500 text-center py-6 italic flex flex-col items-center gap-2"><i data-lucide="wind" class="w-5 h-5 opacity-50"></i><span>Sin reglas aplicadas</span></div>';
    } else {
      currentRules.forEach((rule, idx) => {
        const item = document.createElement("div");
        item.className = `flex items-center justify-between p-2.5 rounded-lg border transition-all ${rule.disabled ? "border-slate-800 bg-slate-900/50 opacity-60" : "border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60 hover:border-slate-600"} group`;

        let icon = "settings-2";
        let label = rule.type;
        if (rule.type === "sanitize_numbers") {
          icon = "hash";
          label = "Solo Números";
        }
        if (rule.type === "sanitize") {
          icon = "eraser";
          label = "Sanitizar Texto";
        }
        if (rule.type === "split") {
          icon = "split";
          label = "Dividir Columna";
        }
        if (rule.type === "row_filter") {
          icon = "filter-x";
          label = "Filtro de Fila";
        }

        item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="p-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-colors"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i></div>
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-slate-300 group-hover:text-white uppercase tracking-wide transition-colors">${label}</span>
                            <span class="text-[9px] text-slate-500 font-mono">Paso ${idx + 1}</span>
                        </div>
                    </div>
                `;

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-1";

        // Toggle Btn
        const btnToggle = document.createElement("button");
        btnToggle.className =
          "p-1.5 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors";
        btnToggle.title = rule.disabled ? "Habilitar" : "Deshabilitar";
        btnToggle.innerHTML = `<i data-lucide="${rule.disabled ? "eye-off" : "eye"}" class="w-3.5 h-3.5"></i>`;
        btnToggle.onclick = () => {
          rule.disabled = !rule.disabled;
          refreshAndReAnchor();
        };

        // Delete Btn
        const btnDel = document.createElement("button");
        btnDel.className =
          "p-1.5 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors";
        btnDel.title = "Eliminar Regla";
        btnDel.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>`;
        btnDel.onclick = () => {
          currentRules.splice(idx, 1);
          if (currentRules.length === 0) delete processingRules[colIndex];
          refreshAndReAnchor();
        };

        actions.appendChild(btnToggle);
        actions.appendChild(btnDel);
        item.appendChild(actions);
        listContainer.appendChild(item);
      });
    }
    popover.appendChild(listContainer);

    // 5. Menu Builder (Multi-Option)
    const footer = document.createElement("div");
    footer.className =
      "p-3 border-t border-white/5 bg-slate-900/40 flex flex-col gap-2 rounded-b-xl";

    const createRuleBtn = (label, icon, type, config) => {
      const btn = document.createElement("button");
      btn.className =
        "w-full py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 text-[10px] text-slate-300 hover:text-white hover:bg-blue-600 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition-all flex items-center justify-start px-3 gap-3 group";
      btn.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors"></i> ${label}`;
      btn.onclick = () => {
        if (!processingRules[colIndex]) processingRules[colIndex] = [];
        if (!Array.isArray(processingRules[colIndex]))
          processingRules[colIndex] = [processingRules[colIndex]];

        processingRules[colIndex].push({
          type: type,
          config: config,
          disabled: false,
        });
        refreshAndReAnchor(); // Use the existing helper
      };
      return btn;
    };

    // Opción A: Solo Números
    footer.appendChild(
      createRuleBtn("Limpiar: Solo Números", "hash", "sanitize_numbers"),
    );
    // Opción B: Eliminar Vacíos
    footer.appendChild(
      createRuleBtn("Filtrar: Eliminar Vacíos", "filter-x", "row_filter", {
        exclude_empty: true,
      }),
    );

    popover.appendChild(footer);

    document.body.appendChild(popover);
    if (window.lucide) window.lucide.createIcons({ root: popover });

    // Close on click outside
    const closeHandler = (e) => {
      // Check if popover still exists (might be removed by re-render)
      const currentPopover = document.getElementById("rulesManagerPopover");
      if (!currentPopover) {
        document.removeEventListener("click", closeHandler);
        return;
      }
      // Check anchor existence (might be dead)
      const isAnchorLive =
        anchorElement && document.body.contains(anchorElement);

      if (!currentPopover.contains(e.target)) {
        // If anchor is dead, we don't care if we clicked it (it's gone).
        // If anchor is live, we check if we clicked it.
        if (!isAnchorLive || !anchorElement.contains(e.target)) {
          currentPopover.remove();
          document.removeEventListener("click", closeHandler);
        }
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }

  // --- [PHASE 6: DELETE CONFIRMATION] ---

  function renderDeleteConfirmation(termName, onConfirm) {
    // 1. Crear Overlay
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200";

    // 2. Crear Panel Glass
    const panel = document.createElement("div");
    panel.className =
      "w-full max-w-sm glass-panel rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200 border border-red-500/20 ring-1 ring-red-500/10 relative overflow-hidden";

    // Background Gradient Accent for Danger
    const accent = document.createElement("div");
    accent.className =
      "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500";
    panel.appendChild(accent);

    // Icono de Alerta
    const iconDiv = document.createElement("div");
    iconDiv.className =
      "w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-pulse";
    iconDiv.innerHTML = '<i data-lucide="alert-triangle" class="w-7 h-7"></i>';
    panel.appendChild(iconDiv);

    // Título
    const title = document.createElement("h3");
    title.className = "text-xl font-bold text-white mb-2 tracking-tight";
    title.innerText = "¿Eliminar Encabezado?";
    panel.appendChild(title);

    // Mensaje
    const msg = document.createElement("p");
    msg.className = "text-sm text-slate-300/80 mb-8 px-4 leading-relaxed";
    msg.innerHTML = `Estás a punto de borrar <strong class="text-white bg-white/5 px-2 py-0.5 rounded border border-white/10 mx-1">${termName}</strong>.<br>Esta acción es irreversible y liberará la columna.`;
    panel.appendChild(msg);

    // Botones
    const btnContainer = document.createElement("div");
    btnContainer.className = "flex gap-3 justify-center";

    const btnCancel = document.createElement("button");
    btnCancel.className =
      "px-5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider";
    btnCancel.innerText = "Cancelar";
    btnCancel.onclick = () => overlay.remove();

    const btnConfirm = document.createElement("button");
    btnConfirm.className =
      "px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all text-xs font-bold uppercase flex items-center gap-2 hover:scale-105 active:scale-95 border border-red-500/50";
    btnConfirm.innerHTML =
      '<i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar';
    btnConfirm.onclick = () => {
      if (onConfirm) onConfirm();
      overlay.remove();
    };

    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnConfirm);
    panel.appendChild(btnContainer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    if (window.lucide) window.lucide.createIcons({ root: panel });
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
    renderCreateTermModal,
    openRulesManager: renderRulesManager,
    renderDeleteConfirmation: renderDeleteConfirmation, // <-- EXPOSED
  };
})();

console.log("🎨 ViewerUI Module Loaded");
