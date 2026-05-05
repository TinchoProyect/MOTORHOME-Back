// viewer_facturas.js - Satélite de Facturación HITL
console.log("%c 🧾 VISOR HITL FACTURAS: READY ", "background: #f59e0b; color: #fff; font-weight: bold; padding: 4px;");

window.openVisorFacturas = async function(fileId, fileName, providerId, webViewLink) {
    const modal = document.getElementById('visorFacturasModal');
    const iframe = document.getElementById('iframeFactura');
    const sub = document.getElementById('visorFacturasSub');
    
    if (!modal || !iframe || !sub) return;

    // Obtener la URL base del Backend
    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';

    // Abrir modal e Inyectar Iframe desde nuestro Proxy Local para bypassear CSP
    modal.classList.remove('hidden');
    iframe.src = `${backendUrl}/api/facturas/pdf/${fileId}`;
    sub.textContent = `Procesando: ${fileName}...`;
    
    // Clear form
    const inputs = ['fac_cuit', 'fac_fecha', 'fac_tipo', 'fac_pto', 'fac_num', 'fac_neto', 'fac_iva21', 'fac_iva105', 'fac_perc_iibb', 'fac_perc_iva', 'fac_nograv', 'fac_total', 'fac_cae', 'fac_vto_cae', 'fac_id_db', 'fac_file_id'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    document.getElementById('fac_file_id').value = fileId;

    // Mostrar Loading en todo el modal
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
        
        // Fill form
        document.getElementById('fac_id_db').value = data.id;
        document.getElementById('fac_cuit').value = data.cuit_emisor || '';
        document.getElementById('fac_fecha').value = data.fecha_emision || '';
        document.getElementById('fac_tipo').value = data.tipo_comprobante || '';
        document.getElementById('fac_pto').value = data.punto_venta || '';
        document.getElementById('fac_num').value = data.numero_comprobante || '';
        
        document.getElementById('fac_neto').value = Number(data.importe_neto_gravado || 0).toFixed(2);
        document.getElementById('fac_iva21').value = Number(data.importe_iva_21 || 0).toFixed(2);
        document.getElementById('fac_iva105').value = Number(data.importe_iva_105 || 0).toFixed(2);
        document.getElementById('fac_perc_iibb').value = Number(data.percepciones_iibb || 0).toFixed(2);
        document.getElementById('fac_perc_iva').value = Number(data.percepciones_iva || 0).toFixed(2);
        document.getElementById('fac_nograv').value = Number(data.conceptos_no_gravados || 0).toFixed(2);
        document.getElementById('fac_total').value = Number(data.importe_total || 0).toFixed(2);
        
        document.getElementById('fac_cae').value = data.cae || '';
        document.getElementById('fac_vto_cae').value = data.fecha_vto_cae || '';

        sub.textContent = `${fileName} - Revisión HITL Pendiente`;

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
    }
};

window.calcularTotalesFactura = function() {
    const neto = parseFloat(document.getElementById('fac_neto').value) || 0;
    const iva21 = parseFloat(document.getElementById('fac_iva21').value) || 0;
    const iva105 = parseFloat(document.getElementById('fac_iva105').value) || 0;
    const percIibb = parseFloat(document.getElementById('fac_perc_iibb').value) || 0;
    const percIva = parseFloat(document.getElementById('fac_perc_iva').value) || 0;
    const noGrav = parseFloat(document.getElementById('fac_nograv').value) || 0;
    
    const suma = neto + iva21 + iva105 + percIibb + percIva + noGrav;
    const totalInput = document.getElementById('fac_total');
    const totalOriginal = parseFloat(totalInput.value) || 0;
    
    // Si la suma de desgloses difiere del total original extraido por IA, lo marcamos visualmente
    if (Math.abs(suma - totalOriginal) > 0.5) {
        totalInput.classList.add('border-red-500', 'text-red-400');
        totalInput.classList.remove('border-amber-900/50', 'text-amber-400');
    } else {
        totalInput.classList.remove('border-red-500', 'text-red-400');
        totalInput.classList.add('border-amber-900/50', 'text-amber-400');
    }
};

// Bind auto-calc on input changes
['fac_neto', 'fac_iva21', 'fac_iva105', 'fac_perc_iibb', 'fac_perc_iva', 'fac_nograv', 'fac_total'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', window.calcularTotalesFactura);
});

window.closeVisorFacturas = function() {
    document.getElementById('visorFacturasModal').classList.add('hidden');
    document.getElementById('iframeFactura').src = '';
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
        importe_neto_gravado: parseFloat(document.getElementById('fac_neto').value) || 0,
        importe_iva_21: parseFloat(document.getElementById('fac_iva21').value) || 0,
        importe_iva_105: parseFloat(document.getElementById('fac_iva105').value) || 0,
        percepciones_iibb: parseFloat(document.getElementById('fac_perc_iibb').value) || 0,
        percepciones_iva: parseFloat(document.getElementById('fac_perc_iva').value) || 0,
        conceptos_no_gravados: parseFloat(document.getElementById('fac_nograv').value) || 0,
        importe_total: parseFloat(document.getElementById('fac_total').value) || 0,
        cae: document.getElementById('fac_cae').value,
        fecha_vto_cae: document.getElementById('fac_vto_cae').value || null
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
