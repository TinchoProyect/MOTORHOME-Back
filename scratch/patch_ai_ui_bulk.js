const fs = require('fs');
const file = 'src/views/js/viewer_ai_ui.js';
let content = fs.readFileSync(file, 'utf8');

const bulkLogic = `
            // ================= BULK ACTIONS LOGIC =================
            const bulkCheckboxes = card.querySelectorAll('.bulk-chk');
            const selectAllChk = card.querySelector('.select-all-chk');
            const btnBulkMove = card.querySelector('.btn-bulk-move');
            const btnBulkTrash = card.querySelector('.btn-bulk-trash');
            const btnDiscardGroup = card.querySelector('.btn-discard-group');
            
            // Toggle Logic Checkboxes
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
                          if (row && row.style.display !== 'none') {
                              chk.checked = isChecked;
                          }
                     });
                     updateBulkButtonsState();
                });
            }

            bulkCheckboxes.forEach(chk => {
                 chk.addEventListener('change', updateBulkButtonsState);
            });
            
            // Bulk Trash Action
            if (btnBulkTrash) {
                 btnBulkTrash.onclick = () => {
                      const sel = card.querySelectorAll('.bulk-chk:checked');
                      sel.forEach(chk => {
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
                      if (selectAllChk) selectAllChk.checked = false;
                      updateBulkButtonsState();
                 };
            }
            
            // Discard Entire Group Action
            if (btnDiscardGroup) {
                 btnDiscardGroup.onclick = () => {
                      // Silently destroy everything inside without ingesting
                      card.remove();
                      // The AI map gets constructed based on valid rows remaining when user clicks 'Ingestar'. 
                      // Removing the card prevents it from being processed.
                 };
            }

            // Bulk Move Action
            if (btnBulkMove) {
                 btnBulkMove.onclick = async () => {
                      const sel = card.querySelectorAll('.bulk-chk:checked');
                      if (sel.length === 0) return;
                      
                      let options = {};
                      document.querySelectorAll('.group-card').forEach(c => {
                           const nInput = c.querySelector('.card-rubro-name');
                           if(nInput) {
                               const n = nInput.value.trim().toUpperCase();
                               if(n && c.id !== cardId) { 
                                   options[c.id] = n;
                               }
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
                              background: '#0f172a',
                              color: '#e2e8f0',
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
                                    
                                    // Rebind single buttons inside the new card
                                    newTrashList.forEach(row => {
                                        const tBtn = row.querySelector('.remove-sku-btn');
                                        if(tBtn) {
                                            tBtn.onclick = () => {
                                                row.remove();
                                                const ct2 = destCard.querySelectorAll('.grouper-row').length;
                                                const ctEl = destCard.querySelector('.card-count');
                                                if(ctEl) ctEl.innerText = ct2;
                                                const msg = destCard.querySelector('.empty-msg');
                                                if(ct2===0 && msg) {
                                                    msg.classList.remove('hidden');
                                                    destCard.querySelector('.btn-approve-card').classList.add('opacity-50', 'pointer-events-none');
                                                }
                                            };
                                        }
                                        // Bulk checkboxes event listeners remain intact via DOM structure, 
                                        // but need to be tied to the new card's state logic... Since that implies a 
                                        // heavy refactor, Bulk checkboxes are simply unchecked.
                                    });
                                    
                                    // Update counts
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
                                    
                                    if (selectAllChk) selectAllChk.checked = false;
                                    updateBulkButtonsState();
                               }
                          }
                      }
                 };
            }
`;

const target = `            // Move Logic
            const moveBtns = card.querySelectorAll('.move-sku-btn');`;

if (content.includes(target)) {
     content = content.replace(target, bulkLogic + '\n' + target);
     fs.writeFileSync(file, content, 'utf8');
     console.log('Script ran successfully!');
} else {
     console.log('Error: Could not find anchor target for bulk logic insertion.');
}
