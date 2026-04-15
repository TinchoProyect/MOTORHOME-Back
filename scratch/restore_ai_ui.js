const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

// The content we need to append
const methodsToAppend = `

    async _displayCategoryAuditPanel(translationMap, vCol) {
         let groupedMatches = {}; 
         let totalPending = 0;
         let exactMatches = {};
         let existingCategoriesCount = new Set();
         
         const rawKeys = Object.keys(translationMap);
         for (const rawKey of rawKeys) {
             let baseName = translationMap[rawKey] || "S/D";
             let narrativa = "";
             if (baseName.includes('|NARRATIVA|')) {
                 const parts = baseName.split('|NARRATIVA|');
                 baseName = parts[0];
                 narrativa = parts[1] || "";
             }
             
             if (baseName.includes('[NUEVO_RUBRO_PROPUESTO]')) {
                 const destName = baseName.replace('[NUEVO_RUBRO_PROPUESTO]:', '').replace(/<[^>]*>?/gm, '').trim().toUpperCase();
                 if(!groupedMatches[destName]) groupedMatches[destName] = { subItems: [], narrativa: "" };
                 groupedMatches[destName].subItems.push(rawKey);
                 if (narrativa && !groupedMatches[destName].narrativa) groupedMatches[destName].narrativa = narrativa;
                 totalPending++;
             } else {
                 exactMatches[rawKey] = baseName;
                 existingCategoriesCount.add(baseName);
             }
        }

        if (existingCategoriesCount.size >= 15) {
             if (window.Swal) {
                  Swal.fire({
                      toast: true, position: 'top-end', icon: 'warning',
                      title: 'Alerta de Arquitectura',
                      text: \`Existen \${existingCategoriesCount.size} rubros cruzados. LAMDA recomienda 6-10 para no degradar la IA.\`,
                      showConfirmButton: false, timer: 6000
                  });
             }
        }

        // Auto-ingest exact matches that don't need audit
        if (Object.keys(exactMatches).length > 0 && window.viewerRuleWorkshop) {
             await window.viewerRuleWorkshop.createLocalRuleDirect({
                 nombre_regla: "Términos Históricos Re-Conocidos (IA)",
                 accion: { tipo_accion: "DICTIONARY_REPLACE", valor: exactMatches }
             });
        }

        // GUI Overlay Construction
        const panelId = 'viewerRightPanel';
        let panel = document.getElementById(panelId);
        if (panel) panel.remove();
        
        panel = document.createElement('div');
        panel.id = panelId;
        panel.className = "fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-sm transition-all duration-300 pointer-events-none";
        
        panel.innerHTML = \`
            <div class="w-full max-w-7xl h-full mx-auto shadow-2xl flex flex-col bg-slate-900 border border-slate-700 pointer-events-auto shadow-[0_15px_40px_-5px_rgba(0,0,0,0.8)] relative" style="animation: slideUp 0.3s ease-out forwards;">
                <!-- HEAD -->
                <div class="px-8 py-5 border-b border-slate-800 flex justify-between items-center shrink-0 bg-slate-950/80">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg border border-orange-400/50">
                            <i data-lucide="bot" class="w-5 h-5 text-white"></i>
                        </div>
                        <div>
                            <h2 class="text-white font-black text-lg tracking-wildest uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] title-shadow pt-1">Auditoría Jerárquica</h2>
                            <p class="text-orange-400 font-bold text-[10px] tracking-widest uppercase mt-0.5">Asistente de Ingesta Inteligente</p>
                        </div>
                    </div>
                    
                    <!-- ACTIONS -->
                    <div class="flex gap-4">
                        <button id="vaiCloseAuditBtn" class="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all flex items-center justify-center">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>

                <!-- TOOLBAR -->
                 <div class="flex justify-between items-center px-8 py-4 bg-slate-900 border-b border-slate-800/80 shadow-sm shrink-0">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2"><i data-lucide="layers" class="w-4 h-4 text-orange-500"></i> Sugerencias de Clasificación (\${totalPending} SKUs huérfanos)</p>
                    <button id="vaiNewGroupBtn" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 text-xs font-bold rounded-lg uppercase tracking-widest transition-colors flex items-center gap-2"><i data-lucide="folder-plus" class="w-4 h-4"></i> Pendientes de Clasificación</button>
                </div>

                <!-- CARDS CONTAINER -->
                <div id="vaiAuditCardsContainer" class="flex-grow overflow-y-auto custom-scrollbar p-8 bg-slate-950 space-y-8">
                </div>
            </div>
        \`;
        document.body.appendChild(panel);
        
        const container = panel.querySelector('#vaiAuditCardsContainer');
        
        /** FUNCION RENDER GROUP **/
        const renderGroup = (groupName, items, narrativa = "") => {
            const cardId = 'vai_card_' + Math.random().toString(36).substr(2, 9);
            const card = document.createElement('div');
            card.id = cardId;
            card.className = "bg-slate-900 border border-slate-700/80 rounded-xl flex flex-col shadow-xl overflow-hidden group-card transition-all duration-300";
            
            // Render Header
            let rowsHtml = '';
            items.forEach((sku, idx) => {
                const skuId = cardId + '_sku_' + idx;
                rowsHtml += \`
                    <div id="\${skuId}" class="flex items-center justify-between p-3 border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors grouper-row group" data-raw="\${String(sku).replace(/"/g, '&quot;')}">
                        <div class="flex items-center gap-3 flex-1 min-w-0 pr-4">
                             <input type="checkbox" class="bulk-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                             <span class="text-[13px] text-slate-300 font-mono truncate group-hover:text-amber-200 transition-colors" title="\${String(sku).replace(/"/g, '&quot;')}">\${String(sku).replace(/</g, "&lt;")}</span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="text-slate-500 hover:text-blue-400 p-1.5 transition-colors move-sku-btn rounded hover:bg-slate-800" title="Transferir Artículo a Otro Lote"><i data-lucide="arrow-right-left" class="w-4 h-4"></i></button>
                            <button type="button" class="text-slate-500 hover:text-red-400 p-1.5 transition-colors remove-sku-btn rounded hover:bg-slate-800" title="Descartar Ítem del Mapeo"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                \`;
            });

            card.innerHTML = \`
                <!-- CARD HEADER (Editable) -->
                <div class="bg-gradient-to-r from-slate-950/80 to-slate-900 p-6 border-b border-slate-800 flex flex-col gap-4 relative">
                    <button type="button" class="btn-discard-group absolute top-4 right-4 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 font-bold rounded-lg text-[9px] uppercase tracking-widest transition-colors border border-red-500/20 flex items-center justify-center gap-1.5" title="Desechar este bloque por completo de la IA">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Desechar Total
                    </button>

                    <div class="flex justify-between items-start gap-6 mt-2">
                        <div class="flex-1 flex flex-col gap-4">
                            <div class="space-y-1 relative">
                                <label class="text-[9px] font-black uppercase text-orange-500 tracking-widest pl-1 absolute -top-2 left-3 bg-slate-950 px-1 border border-orange-500/20 rounded z-10">Rubro Maestro (Destino)</label>
                                <input type="text" class="card-rubro-name w-full bg-slate-950 border border-slate-700/80 text-orange-400 text-sm font-black uppercase rounded-lg px-4 py-3.5 focus:border-orange-500 focus:bg-slate-900 shadow-inner outline-none transition-all" value="\${groupName}">
                                <i data-lucide="edit-3" class="w-4 h-4 absolute right-4 top-4 text-slate-600 pointer-events-none"></i>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black uppercase text-slate-500 tracking-widest pl-1">Directiva de Clasificación / Narrativa (Opcional)</label>
                                <input type="text" class="card-rubro-desc w-full bg-slate-900/60 border border-slate-700/50 text-slate-300 text-xs rounded-lg px-4 py-2.5 focus:border-blue-500 outline-none transition-colors" placeholder="Ej: Agrupa todos los elementos derivados del plástico exceptuando PET..." value="\${narrativa.replace(/"/g, '&quot;')}">
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-3 shrink-0">
                            <span class="bg-slate-950 text-slate-400 border border-slate-700 px-4 py-1.5 rounded-lg text-xs font-mono shadow-inner"><span class="card-count font-bold text-orange-400">\${items.length}</span> Muestras a Validar</span>
                            
                            <!-- ACTIONS CONTAINER -->
                            <div class="flex flex-col gap-2 w-full mt-2">
                                <button type="button" class="btn-approve-card px-4 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-[0_4px_15px_rgba(234,88,12,0.3)] border border-orange-400/20 flex items-center justify-center gap-2">
                                    <i data-lucide="check-circle" class="w-5 h-5"></i> Integrar Lote
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- BULK ACTION BAR -->
                    <div class="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50">
                          <label class="flex items-center gap-2 cursor-pointer group px-2">
                               <input type="checkbox" class="select-all-chk form-checkbox h-4 w-4 text-orange-500 rounded border-slate-600 bg-slate-900 focus:ring-0 cursor-pointer">
                               <span class="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-300">Seleccionar Todo</span>
                          </label>
                          <div class="flex items-center gap-2">
                               <button type="button" class="btn-bulk-move px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>📦 Mover Selección</button>
                               <button type="button" class="btn-bulk-trash px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 rounded text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled>🗑️ Desechar</button>
                          </div>
                    </div>
                </div>
                <!-- CARD BODY (Entities) -->
                <div class="bg-slate-900/50 flex flex-col card-body" style="max-height: 350px; overflow-y: auto;">
                    \${rowsHtml}
                    <div class="p-8 text-center text-xs text-slate-500 italic hidden empty-msg flex flex-col items-center justify-center gap-3">
                        <i data-lucide="ghost" class="w-8 h-8 opacity-40"></i>
                        Contenedor Semántico Vacío. Transfiera artículos o elimine este lote.
                    </div>
                </div>
            \`;
            
            // ================= BULK ACTIONS LOGIC =================
            const bulkCheckboxes = card.querySelectorAll('.bulk-chk');
            const selectAllChk = card.querySelector('.select-all-chk');
            const btnBulkMove = card.querySelector('.btn-bulk-move');
            const btnBulkTrash = card.querySelector('.btn-bulk-trash');
            const btnDiscardGroup = card.querySelector('.btn-discard-group');
            
            const updateBulkButtonsState = () => {
                const checkedCount = card.querySelectorAll('.bulk-chk:checked').length;
                const totalCount = card.querySelectorAll('.bulk-chk').length;
                
                if (checkedCount > 0) {
                     btnBulkMove.disabled = false;
                     btnBulkTrash.disabled = false;
                } else {
                     btnBulkMove.disabled = true;
                     btnBulkTrash.disabled = true;
                }
                
                if (selectAllChk) selectAllChk.checked = (checkedCount === totalCount && totalCount > 0);
            };

            if (selectAllChk) {
                selectAllChk.addEventListener('change', (e) => {
                     const isChecked = e.target.checked;
                     card.querySelectorAll('.bulk-chk').forEach(chk => {
                          const row = chk.closest('.grouper-row');
                          if (row && row.style.display !== 'none') chk.checked = isChecked;
                     });
                     updateBulkButtonsState();
                });
            }

            // Must use event delegation or attach to each. We attach to each generated row initially.
            card.querySelectorAll('.bulk-chk').forEach(chk => chk.addEventListener('change', updateBulkButtonsState));
            
            if (btnBulkTrash) {
                 btnBulkTrash.onclick = () => {
                      card.querySelectorAll('.bulk-chk:checked').forEach(chk => {
                           const row = chk.closest('.grouper-row');
                           if(row) row.remove();
                      });
                      const remaining = card.querySelectorAll('.grouper-row').length;
                      card.querySelector('.card-count').innerText = remaining;
                      if(remaining === 0) {
                          const emptyMsg = card.querySelector('.empty-msg');
                          if(emptyMsg) emptyMsg.classList.remove('hidden');
                          const btnApprove = card.querySelector('.btn-approve-card');
                          if(btnApprove) btnApprove.classList.add('opacity-50', 'pointer-events-none');
                      }
                      if(selectAllChk) selectAllChk.checked = false;
                      updateBulkButtonsState();
                 };
            }
            
            if (btnDiscardGroup) {
                 btnDiscardGroup.onclick = () => { card.remove(); };
            }

            if (btnBulkMove) {
                 btnBulkMove.onclick = async () => {
                      const sel = card.querySelectorAll('.bulk-chk:checked');
                      if (sel.length === 0) return;
                      
                      let options = {};
                      document.querySelectorAll('.group-card').forEach(c => {
                           const nInput = c.querySelector('.card-rubro-name');
                           if(nInput) {
                               const n = nInput.value.trim().toUpperCase();
                               if(n && c.id !== cardId) options[c.id] = n;
                           }
                      });
                      
                      if (Object.keys(options).length === 0) {
                          if (window.Swal) Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'Aviso', text: 'Crea otro lote desde "Nuevo Lote" para poder transferir.', timer: 3000});
                          return;
                      }
                      
                      if(window.Swal) {
                          const { value: destCardId } = await Swal.fire({
                              title: 'Transferencia Masiva',
                              text: \`Selecciona el Lote de destino para los \${sel.length} agrupamientos:\`,
                              input: 'select',
                              inputOptions: options,
                              inputPlaceholder: '-- Determina un nuevo contenedor --',
                              showCancelButton: true,
                              cancelButtonText: 'Cancelar',
                              confirmButtonText: 'Mover Fila(s)',
                              background: '#0f172a', color: '#e2e8f0',
                              customClass: { input: 'bg-slate-900 border-slate-700 text-sm w-full p-2 rounded' }
                          });
                          
                          if (destCardId) {
                               const destCard = document.getElementById(destCardId);
                               if(destCard) {
                                    const destBody = destCard.querySelector('.card-body');
                                    let newTrashList = [];
                                    
                                    sel.forEach(chk => {
                                         const row = chk.closest('.grouper-row');
                                         if(row) {
                                             chk.checked = false;
                                             destBody.insertBefore(row, destBody.querySelector('.empty-msg'));
                                             newTrashList.push(row);
                                         }
                                    });
                                    
                                    newTrashList.forEach(row => {
                                        const tBtn = row.querySelector('.remove-sku-btn');
                                        if(tBtn) {
                                            tBtn.onclick = () => {
                                                row.remove();
                                                const ct2 = destCard.querySelectorAll('.grouper-row').length;
                                                const ctEl = destCard.querySelector('.card-count');
                                                if(ctEl) ctEl.innerText = ct2;
                                                if(ct2===0) {
                                                    const msg = destCard.querySelector('.empty-msg');
                                                    if(msg) msg.classList.remove('hidden');
                                                    destCard.querySelector('.btn-approve-card').classList.add('opacity-50', 'pointer-events-none');
                                                }
                                            };
                                        }
                                        const mBtn = row.querySelector('.move-sku-btn');
                                        if(mBtn) {
                                            mBtn.onclick = async () => {
                                                // Keep the old generic logic for moving since it calculates on the fly and gets prompt again.
                                                // We don't redefine single move because single move just relies on .closest('.grouper-row')
                                            }
                                        }
                                    });
                                    
                                    [card, destCard].forEach(c => {
                                        const ct = c.querySelectorAll('.grouper-row').length;
                                        const ctEl = c.querySelector('.card-count');
                                        if(ctEl) ctEl.innerText = ct;
                                        if(ct === 0) {
                                            const msg = c.querySelector('.empty-msg');
                                            if(msg) msg.classList.remove('hidden');
                                            const aBtn = c.querySelector('.btn-approve-card');
                                            if(aBtn) aBtn.classList.add('opacity-50', 'pointer-events-none');
                                        } else {
                                            const msg = c.querySelector('.empty-msg');
                                            if(msg) msg.classList.add('hidden');
                                            const aBtn = c.querySelector('.btn-approve-card');
                                            if(aBtn) aBtn.classList.remove('opacity-50', 'pointer-events-none');
                                        }
                                    });
                                    
                                    if(selectAllChk) selectAllChk.checked = false;
                                    updateBulkButtonsState();
                               }
                          }
                      }
                 };
            }

            // Single Delete Logic
            const trashBtns = card.querySelectorAll('.remove-sku-btn');
            trashBtns.forEach(btn => {
                btn.onclick = () => {
                    btn.closest('.grouper-row').remove();
                    const remaining = card.querySelectorAll('.grouper-row').length;
                    card.querySelector('.card-count').innerText = remaining;
                    if(remaining === 0) {
                        card.querySelector('.empty-msg').classList.remove('hidden');
                        card.querySelector('.btn-approve-card').classList.add('opacity-50', 'pointer-events-none');
                    }
                    updateBulkButtonsState();
                };
            });
            
            // Single Move Logic (Redeclared explicitly to persist re-moves correctly)
            const bindMoveLogic = (btn) => {
                btn.onclick = async () => {
                    const row = btn.closest('.grouper-row');
                    let options = {};
                    document.querySelectorAll('.group-card').forEach(c => {
                         const n = c.querySelector('.card-rubro-name').value.trim().toUpperCase();
                         if(n && c.id !== cardId) options[c.id] = n;
                    });
                    
                    if (Object.keys(options).length === 0) return;
                    
                    if(window.Swal) {
                        const { value: destCardId2 } = await Swal.fire({
                            title: 'Mover Artículo (1)',
                            input: 'select',
                            inputOptions: options,
                            showCancelButton: true
                        });
                        if (destCardId2) {
                             const destCard2 = document.getElementById(destCardId2);
                             if(destCard2) {
                                  const destBody2 = destCard2.querySelector('.card-body');
                                  destBody2.insertBefore(row, destBody2.querySelector('.empty-msg'));
                                  
                                  [card, destCard2].forEach(c => {
                                        const ct = c.querySelectorAll('.grouper-row').length;
                                        const ctEl = c.querySelector('.card-count');
                                        if(ctEl) ctEl.innerText = ct;
                                  });
                                  updateBulkButtonsState();
                             }
                        }
                    }
                };
            };
            const moveBtns = card.querySelectorAll('.move-sku-btn');
            moveBtns.forEach(bindMoveLogic);

            // APPROVE CARD (INGEST)
            const approveBtn = card.querySelector('.btn-approve-card');
            if (approveBtn) {
                approveBtn.onclick = async () => {
                    const destName = card.querySelector('.card-rubro-name').value.trim().toUpperCase();
                    if(!destName) return;
                    
                    const rows = card.querySelectorAll('.grouper-row');
                    let objMap = {};
                    rows.forEach(r => {
                         objMap[r.dataset.raw.replace(/&quot;/g, '"')] = destName;
                    });
                    
                    if (window.viewerRuleWorkshop) {
                         const state = window.viewerRuleWorkshop.getActiveState();
                         if (state) {
                              const newTranslationNode = {
                                  nombre_regla: "Clasificación IA: " + destName,
                                  accion: { tipo_accion: "DICTIONARY_REPLACE", valor: objMap }
                              };
                              await window.viewerRuleWorkshop.createLocalRuleDirect(newTranslationNode);
                              
                              if (window.Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Agrupamiento Ingestado', showConfirmButton: false, timer: 2000 });
                              
                              card.remove();
                              
                              const totalPendingCards = document.querySelectorAll('.group-card').length;
                              if (totalPendingCards === 0) {
                                  if (window.Swal) Swal.fire({title: "Auditoría Completa", icon: "success", background: "#0f172a", color: "#fff"});
                                  panel.remove();
                              }
                         }
                    }
                };
            }
            
            container.appendChild(card);
            if(window.lucide) window.lucide.createIcons({root: card});
        };
        
        // Render initial exact match groups
        for (const [gName, data] of Object.entries(groupedMatches)) {
            renderGroup(gName, data.subItems, data.narrativa);
        }
        
        // Add "New Empty Group" logic
        panel.querySelector('#vaiNewGroupBtn').onclick = () => {
             renderGroup("NUEVO_LOTE_"+Math.floor(Math.random()*1000), []);
        };

        const closeFn = () => {
             panel.classList.add('opacity-0');
             setTimeout(() => panel.remove(), 300);
        };

        panel.querySelector('#vaiCloseAuditBtn').onclick = closeFn;
        if(window.lucide) window.lucide.createIcons({root: panel});
    }

    _mergeDictionary(pipeline, newObj) {
         let base = {};
         if (pipeline && pipeline.length) {
              const ruleArr = Array.isArray(pipeline) ? pipeline : [pipeline];
              for(const r of ruleArr) {
                  if (r.accion && r.accion.tipo_accion === 'DICTIONARY_REPLACE') {
                      base = { ...base, ...r.accion.valor };
                  }
              }
         }
         return { ...base, ...newObj };
    }
`;

// Encontrar el cierre de la clase ViewerAiUi para insertar los métodos just antes
const classEndIndex = content.lastIndexOf('}');
if (classEndIndex !== -1) {
    const preContent = content.substring(0, classEndIndex);
    const postContent = content.substring(classEndIndex);
    const finalContent = preContent + methodsToAppend + postContent;
    fs.writeFileSync(file, finalContent, 'utf8');
    console.log('Restoration and implementation injected successfully!');
} else {
    console.error('Could not find class ending bracket.');
}
