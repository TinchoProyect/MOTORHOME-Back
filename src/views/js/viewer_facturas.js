// viewer_facturas.js - Satélite de Facturación HITL
console.log("%c 🧾 VISOR HITL FACTURAS: READY ", "background: #f59e0b; color: #fff; font-weight: bold; padding: 4px;");

window.currentVisorZoom = 1;

window.zoomVisor = function(delta) {
    window.currentVisorZoom += delta;
    if (window.currentVisorZoom < 0.5) window.currentVisorZoom = 0.5;
    if (window.currentVisorZoom > 4) window.currentVisorZoom = 4;
    const wrapper = document.getElementById('visorZoomWrapper');
    if (!wrapper) return;
    const tx = wrapper.dataset.tx || 0;
    const ty = wrapper.dataset.ty || 0;
    wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorZoom})`;
};

window.resetZoomVisor = function() {
    window.currentVisorZoom = 1;
    const wrapper = document.getElementById('visorZoomWrapper');
    if (wrapper) {
        wrapper.style.transform = `translate(0px, 0px) scale(1)`;
        wrapper.dataset.tx = 0;
        wrapper.dataset.ty = 0;
    }
};

window.openVisorFacturas = async function(fileId, fileName, providerId, webViewLink, btnElement = null) {
    const modal = document.getElementById('visorFacturasModal');
    const iframe = document.getElementById('iframeFactura');
    const sub = document.getElementById('visorFacturasSub');
    
    if (!modal || !iframe || !sub) return;

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> <span class="pointer-events-none">Procesando...</span>';
        if (window.lucide) window.lucide.createIcons();
    }

    // Mostrar Loading Inmediato (Antes de abrir el Visor)
    if (window.Swal) {
        Swal.fire({
            title: 'Motor Chofer IA',
            html: 'Extrayendo metadata contable de la factura...<br><span class="text-xs text-amber-500 mt-2 block">Analizando estructura fiscal...</span>',
            allowOutsideClick: false,
            background: '#0f172a',
            color: '#f8fafc',
            customClass: { popup: 'border border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.2)] rounded-2xl' },
            didOpen: () => { Swal.showLoading() }
        });
    }

    // Clear form preventivamente
    const inputs = ['fac_cuit', 'fac_fecha', 'fac_tipo', 'fac_pto', 'fac_num', 'fac_neto', 'fac_iva21', 'fac_iva105', 'fac_perc_iibb', 'fac_perc_iva', 'fac_nograv', 'fac_total', 'fac_cae', 'fac_vto_cae', 'fac_id_db', 'fac_file_id', 'fac_descuento_global'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const cs = document.getElementById('fac_checksum_status');
    if (cs) {
        cs.classList.add('hidden');
        cs.innerHTML = '';
    }
    
    document.getElementById('fac_file_id').value = fileId;

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/facturas/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, fileId, fileName })
        });
        
        const json = await res.json();
        
        if (!res.ok) throw new Error(json.error || "Fallo en extracción IA");
        
        const data = json.data;
        
        // Ahora sí, abrir modal e inyectar el Iframe visualmente
        modal.classList.remove('hidden');
        
        const lowerFileName = fileName.toLowerCase();
        const isImage = lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg') || lowerFileName.endsWith('.png') || lowerFileName.endsWith('.webp');
        const proxyUrl = `${backendUrl}/api/facturas/pdf/${fileId}?name=${encodeURIComponent(fileName)}`;
        const wrapper = document.getElementById('visorZoomWrapper');
        const zoomControls = document.getElementById('visorZoomControls');
        
        if (wrapper) {
            wrapper.innerHTML = ''; // Limpiar previo
            window.resetZoomVisor();
            
            if (isImage) {
                if (zoomControls) zoomControls.classList.remove('hidden');
                const img = document.createElement('img');
                img.id = 'imgFactura';
                img.src = proxyUrl;
                img.className = 'w-full h-full object-contain cursor-grab active:cursor-grabbing';
                img.draggable = false;
                wrapper.appendChild(img);
                
                let isDragging = false;
                let startX, startY;
                
                img.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX - parseFloat(wrapper.dataset.tx || 0);
                    startY = e.clientY - parseFloat(wrapper.dataset.ty || 0);
                    e.preventDefault(); // Evitar selección/arrastre fantasma
                });
                window.addEventListener('mouseup', () => { isDragging = false; });
                window.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    const tx = e.clientX - startX;
                    const ty = e.clientY - startY;
                    wrapper.dataset.tx = tx;
                    wrapper.dataset.ty = ty;
                    wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorZoom})`;
                });
                
                wrapper.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    window.zoomVisor(e.deltaY > 0 ? -0.1 : 0.1);
                });
            } else {
                if (zoomControls) zoomControls.classList.add('hidden');
                const iframeObj = document.createElement('iframe');
                iframeObj.id = 'iframeFactura';
                iframeObj.src = proxyUrl;
                iframeObj.className = 'w-full h-full border-none';
                wrapper.appendChild(iframeObj);
            }
        }
        
        sub.textContent = `${fileName} - Revisión HITL Pendiente`;
        
        // Fill form
        document.getElementById('fac_id_db').value = data.id;
        document.getElementById('fac_cuit').value = data.cuit_emisor || '';
        document.getElementById('fac_fecha').value = data.fecha_emision || '';
        document.getElementById('fac_tipo').value = data.tipo_comprobante || '';
        document.getElementById('fac_pto').value = data.punto_venta || '';
        document.getElementById('fac_num').value = data.numero_comprobante || '';
        
        document.getElementById('fac_neto').value = window.formatCurrency(data.importe_neto_gravado || 0);
        document.getElementById('fac_iva21').value = window.formatCurrency(data.importe_iva_21 || 0);
        document.getElementById('fac_iva105').value = window.formatCurrency(data.importe_iva_105 || 0);
        document.getElementById('fac_perc_iibb').value = window.formatCurrency(data.percepciones_iibb || 0);
        document.getElementById('fac_perc_iva').value = window.formatCurrency(data.percepciones_iva || 0);
        document.getElementById('fac_nograv').value = window.formatCurrency(data.conceptos_no_gravados || 0);
        document.getElementById('fac_total').value = window.formatCurrency(data.importe_total || 0);
        
        // Descuento Global o Bonificación
        const ext = data.datos_extraidos || {};
        const bPct = ext.bonificacion_porcentaje || 0;
        const dGlob = ext.descuento_global_aplicado || 0;
        const descField = document.getElementById('fac_descuento_global');
        if (descField) {
            if (bPct > 0) {
                descField.value = `${bPct}%`;
            } else if (dGlob > 0) {
                descField.value = `$ ${window.formatCurrency(dGlob)}`;
            } else {
                descField.value = '0.00';
            }
        }

        // Checksum Status
        const cs = document.getElementById('fac_checksum_status');
        if (cs && ext.checksum_valido !== undefined) {
            cs.classList.remove('hidden');
            if (ext.checksum_valido) {
                cs.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500" title="Checksum Válido: Diferencia de $${ext.checksum_diferencia}"></i>`;
            } else {
                cs.innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500" title="Checksum Fallido: Desvío de $${ext.checksum_diferencia}"></i>`;
            }
            if (window.lucide) window.lucide.createIcons();
        }
        
        window.currentArticulos = data.articulos || [];
        window.renderGridArticulos();
        
        document.getElementById('fac_cae').value = data.cae || '';
        document.getElementById('fac_vto_cae').value = data.fecha_vto_cae || '';

        if (window.Swal) Swal.close();
        
        // Calcular sumatoria preventiva visual
        window.calcularTotalesFactura();

    } catch (e) {
        if (window.Swal) {
            Swal.fire({
                icon: 'error',
                title: 'Fallo de Lectura',
                text: e.message,
                background: '#0f172a',
                color: '#f8fafc',
                confirmButtonColor: '#f59e0b'
            });
        }
        sub.textContent = `Error: ${e.message}`;
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i data-lucide="bot" class="w-3 h-3 pointer-events-none"></i> <span class="pointer-events-none">Procesar con IA</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// Helpers para Máscara LatAm
window.formatCurrency = function(val) {
    if (val === null || val === undefined || val === '') return '';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

window.parseCurrency = function(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Remueve puntos (miles) y cambia coma por punto (decimal)
    const cleaned = String(val).replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
};

// Array global para la grilla
window.currentArticulos = [];

window.calcularTotalesFactura = function() {
    const neto = window.parseCurrency(document.getElementById('fac_neto').value);
    const iva21 = window.parseCurrency(document.getElementById('fac_iva21').value);
    const iva105 = window.parseCurrency(document.getElementById('fac_iva105').value);
    const percIibb = window.parseCurrency(document.getElementById('fac_perc_iibb').value);
    const percIva = window.parseCurrency(document.getElementById('fac_perc_iva').value);
    const noGrav = window.parseCurrency(document.getElementById('fac_nograv').value);
    
    // Suma de la grilla de artículos
    let sumaArticulos = 0;
    if (window.currentArticulos && window.currentArticulos.length > 0) {
        window.currentArticulos.forEach(art => {
            sumaArticulos += window.parseCurrency(art.subtotal);
        });
    } else {
        // Si no hay artículos, la base de cálculo recae sobre el neto digitado
        sumaArticulos = neto;
    }
    
    // Cálculo integral: Grilla + Impuestos
    const suma = sumaArticulos + iva21 + iva105 + percIibb + percIva + noGrav;
    const totalInput = document.getElementById('fac_total');
    const statusIcon = document.getElementById('fac_math_status');
    const totalOriginal = window.parseCurrency(totalInput.value);
    
    // Si la suma difiere del total original extraido por IA, alertamos.
    if (Math.abs(suma - totalOriginal) > 0.5) {
        totalInput.classList.add('border-red-500', 'text-red-400');
        totalInput.classList.remove('border-emerald-500', 'text-emerald-400', 'border-amber-900/50', 'text-amber-400');
        if (statusIcon) statusIcon.classList.add('hidden');
    } else {
        // Coincidencia exacta -> Visado Verde
        totalInput.classList.remove('border-red-500', 'text-red-400', 'border-amber-900/50', 'text-amber-400');
        totalInput.classList.add('border-emerald-500', 'text-emerald-400');
        if (statusIcon) statusIcon.classList.remove('hidden');
    }

    // =====================================
    // CHECKSUM DETERMINISTA (Grilla vs Neto Gravado)
    // =====================================
    const cs = document.getElementById('fac_checksum_status');
    const btnSave = document.getElementById('btn_save_factura_hitl');
    const inputNeto = document.getElementById('fac_neto');
    
    if (cs) {
        const diffChecksum = Math.abs(sumaArticulos - neto);
        cs.classList.remove('hidden');
        if (diffChecksum <= 5.00) {
            cs.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500" title="Checksum Válido (Grilla coincide con Neto Gravado)"></i>`;
            if (inputNeto) {
                inputNeto.classList.remove('border-red-500', 'border-slate-700');
                inputNeto.classList.add('border-emerald-500');
            }
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.classList.remove('cursor-not-allowed', 'bg-slate-800', 'text-slate-500');
                btnSave.classList.add('bg-amber-600', 'hover:bg-amber-500', 'text-white', 'shadow-amber-600/30');
            }
        } else {
            cs.innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500" title="Checksum Fallido: Desvío de $${window.formatCurrency(diffChecksum)} entre Grilla y Neto"></i>`;
            if (inputNeto) {
                inputNeto.classList.remove('border-emerald-500', 'border-slate-700');
                inputNeto.classList.add('border-red-500');
            }
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.classList.add('cursor-not-allowed', 'bg-slate-800', 'text-slate-500');
                btnSave.classList.remove('bg-amber-600', 'hover:bg-amber-500', 'text-white', 'shadow-amber-600/30');
            }
        }
        if (window.lucide) window.lucide.createIcons();
    }
};

window.renderGridArticulos = function() {
    const tbody = document.getElementById('fac_articulos_tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    window.currentArticulos.forEach((art, index) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        
        tr.innerHTML = `
            <td class="px-4 py-2">
                <input type="text" class="w-full bg-transparent border border-transparent focus:border-slate-700 rounded px-1 py-1 text-xs outline-none fac-grid-input" 
                       data-index="${index}" data-field="codigo" value="${art.codigo || ''}">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="w-full bg-transparent border border-transparent focus:border-slate-700 rounded px-1 py-1 text-xs outline-none fac-grid-input" 
                       data-index="${index}" data-field="descripcion" value="${art.descripcion || ''}">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="w-full bg-transparent border border-transparent focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-center fac-grid-input fac-grid-num" 
                       data-index="${index}" data-field="cantidad" value="${window.formatCurrency(art.cantidad)}">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="w-full bg-transparent border border-transparent focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-right fac-grid-input fac-grid-num" 
                       data-index="${index}" data-field="precio_unitario" value="${window.formatCurrency(art.precio_unitario)}">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="w-full bg-transparent border border-transparent focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-right fac-grid-input fac-grid-num font-bold text-slate-200" 
                       data-index="${index}" data-field="subtotal" value="${window.formatCurrency(art.subtotal)}">
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Bind event listeners para inputs de la grilla
    document.querySelectorAll('.fac-grid-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            let val = e.target.value;
            
            if (e.target.classList.contains('fac-grid-num')) {
                val = window.parseCurrency(val);
                e.target.value = window.formatCurrency(val);
            }
            window.currentArticulos[idx][field] = val;
            
            // Subtotal Dinámico (Tarea 3)
            if (field === 'cantidad' || field === 'precio_unitario') {
                const c = window.parseCurrency(window.currentArticulos[idx].cantidad) || 1;
                const p = window.parseCurrency(window.currentArticulos[idx].precio_unitario) || 0;
                const newSubtotal = c * p;
                window.currentArticulos[idx].subtotal = newSubtotal;
                
                const row = e.target.closest('tr');
                if (row) {
                    const subInput = row.querySelector('[data-field="subtotal"]');
                    if (subInput) subInput.value = window.formatCurrency(newSubtotal);
                }
            }
            
            window.calcularTotalesFactura();
        });

        if (input.classList.contains('fac-grid-num')) {
            input.addEventListener('focus', (e) => {
                const val = window.parseCurrency(e.target.value);
                e.target.value = val === 0 ? '' : val.toString().replace('.', ',');
            });
            input.addEventListener('blur', (e) => {
                e.target.value = window.formatCurrency(window.parseCurrency(e.target.value));
            });
        }
    });
};

// Bind auto-calc on input changes and mask events
['fac_neto', 'fac_iva21', 'fac_iva105', 'fac_perc_iibb', 'fac_perc_iva', 'fac_nograv', 'fac_total'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.addEventListener('input', window.calcularTotalesFactura);
    
    el.addEventListener('focus', (e) => {
        const val = window.parseCurrency(e.target.value);
        e.target.value = val === 0 ? '' : val.toString().replace('.', ',');
    });
    
    el.addEventListener('blur', (e) => {
        e.target.value = window.formatCurrency(window.parseCurrency(e.target.value));
        window.calcularTotalesFactura();
    });
});

window.closeVisorFacturas = function() {
    document.getElementById('visorFacturasModal').classList.add('hidden');
    const iframe = document.getElementById('iframeFactura');
    if (iframe) iframe.src = '';
    const img = document.getElementById('imgFactura');
    if (img) img.src = '';
};

window.saveFacturaHITL = async function() {
    const idDb = document.getElementById('fac_id_db').value;
    if (!idDb) {
        alert("No hay un ID de base de datos asociado.");
        return;
    }

    const payload = {
        cuit_emisor: document.getElementById('fac_cuit').value,
        fecha_emision: document.getElementById('fac_fecha').value || null,
        tipo_comprobante: document.getElementById('fac_tipo').value,
        punto_venta: parseInt(document.getElementById('fac_pto').value) || 0,
        numero_comprobante: parseInt(document.getElementById('fac_num').value) || 0,
        importe_neto_gravado: window.parseCurrency(document.getElementById('fac_neto').value),
        importe_iva_21: window.parseCurrency(document.getElementById('fac_iva21').value),
        importe_iva_105: window.parseCurrency(document.getElementById('fac_iva105').value),
        percepciones_iibb: window.parseCurrency(document.getElementById('fac_perc_iibb').value),
        percepciones_iva: window.parseCurrency(document.getElementById('fac_perc_iva').value),
        conceptos_no_gravados: window.parseCurrency(document.getElementById('fac_nograv').value),
        importe_total: window.parseCurrency(document.getElementById('fac_total').value),
        cae: document.getElementById('fac_cae').value,
        fecha_vto_cae: document.getElementById('fac_vto_cae').value || null,
        articulos: window.currentArticulos
    };

    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(`${backendUrl}/api/facturas/${idDb}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error al guardar");

        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Validación HITL Guardada',
                text: 'La factura ha sido registrada en el sistema.',
                background: '#0f172a',
                color: '#f8fafc',
                timer: 2000,
                showConfirmButton: false
            });
        }
        
        window.closeVisorFacturas();

        // [BUGFIX] Refresco visual del tablero para aplicar filtros
        if (window.exploreSupplierFiles && window.currentDriveFolderId) {
            window.exploreSupplierFiles(window.currentDriveFolderId, 'facturas');
        }

    } catch (e) {
        if (window.Swal) {
            Swal.fire({
                icon: 'error',
                title: 'Fallo al Guardar',
                text: e.message,
                background: '#0f172a',
                color: '#f8fafc'
            });
        }
    }
};
