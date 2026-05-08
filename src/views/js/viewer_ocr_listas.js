// viewer_ocr_listas.js - Satélite OCR para Listas de Precios (Imágenes)
console.log("%c 🖼️ VISOR OCR LISTAS: READY ", "background: #4f46e5; color: #fff; font-weight: bold; padding: 4px;");

window.currentVisorOcrZoom = 1;
window.ocrGridInstance = null;
window.currentOcrProviderId = null;
window.currentOcrFileId = null;
window.currentOcrFileName = null;

// ==========================
// Controles de Zoom
// ==========================
window.zoomVisorOcr = function(delta) {
    window.currentVisorOcrZoom += delta;
    if (window.currentVisorOcrZoom < 0.5) window.currentVisorOcrZoom = 0.5;
    if (window.currentVisorOcrZoom > 4) window.currentVisorOcrZoom = 4;
    const img = document.getElementById('imgOcrOriginal');
    if (!img) return;
    const tx = img.dataset.tx || 0;
    const ty = img.dataset.ty || 0;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorOcrZoom})`;
};

window.resetZoomVisorOcr = function() {
    window.currentVisorOcrZoom = 1;
    const img = document.getElementById('imgOcrOriginal');
    if (img) {
        img.style.transform = `translate(0px, 0px) scale(1)`;
        img.dataset.tx = 0;
        img.dataset.ty = 0;
    }
};

// ==========================
// Control de Visor
// ==========================
window.closeVisorOcrListas = function() {
    const modal = document.getElementById('visorOcrListasModal');
    if (modal) modal.classList.add('hidden');
    if (window.ocrGridInstance) {
        window.ocrGridInstance.destroy();
        window.ocrGridInstance = null;
    }
};

window.openVisorOcrListas = async function(fileId, fileName, providerId) {
    const modal = document.getElementById('visorOcrListasModal');
    const img = document.getElementById('imgOcrOriginal');
    const sub = document.getElementById('visorOcrListasSub');
    const btnSave = document.getElementById('btn_save_ocr_listas');
    const badge = document.getElementById('ocr_status_badge');
    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
    
    if (!modal || !img || !sub) return;

    window.currentOcrProviderId = providerId;
    window.currentOcrFileId = fileId;
    window.currentOcrFileName = fileName;

    // Resetear Grilla
    if (window.ocrGridInstance) {
        window.ocrGridInstance.destroy();
        window.ocrGridInstance = null;
    }
    document.getElementById('ocr_grid_container').innerHTML = '';

    // Cargar UI
    sub.textContent = `${fileName} - Procesando...`;
    img.style.display = 'none';
    img.src = ''; // Clear prev
    btnSave.disabled = true;
    btnSave.classList.add('cursor-not-allowed');
    badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
    badge.textContent = 'EXTRAYENDO IA...';
    modal.classList.remove('hidden');

    if (window.Swal) {
        Swal.fire({
            title: 'Motor Chofer IA (Vision)',
            html: 'Convirtiendo imagen desestructurada a tabla...<br><span class="text-xs text-indigo-400 mt-2 block">Esto puede tardar unos segundos.</span>',
            allowOutsideClick: false,
            background: '#0f172a',
            color: '#f8fafc',
            customClass: { popup: 'border border-indigo-500/50 shadow-[0_0_40px_rgba(79,70,229,0.2)] rounded-2xl' },
            didOpen: () => { Swal.showLoading() }
        });
    }

    // 1. Cargar la imagen usando el Proxy (para mostrarla visualmente en el panel izquierdo)
    const proxyUrl = `${backendUrl}/api/facturas/pdf/${fileId}?name=${encodeURIComponent(fileName)}`;
    img.src = proxyUrl;
    img.style.display = 'block';
    window.resetZoomVisorOcr();

    // Setup Dragging for Image
    let isDragging = false;
    let startX, startY;
    
    // Clear old listeners by replacing element if needed, or just handle multiple binds carefully.
    // For simplicity, using one-time binding pattern or anonymous isn't ideal but works if handled carefully.
    img.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX - parseFloat(img.dataset.tx || 0);
        startY = e.clientY - parseFloat(img.dataset.ty || 0);
        e.preventDefault(); 
    };
    window.onmouseup = () => { isDragging = false; };
    window.onmousemove = (e) => {
        if (!isDragging) return;
        const tx = e.clientX - startX;
        const ty = e.clientY - startY;
        img.dataset.tx = tx;
        img.dataset.ty = ty;
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${window.currentVisorOcrZoom})`;
    };
    const wrapper = document.getElementById('visorOcrZoomWrapper');
    wrapper.onwheel = (e) => {
        e.preventDefault();
        window.zoomVisorOcr(e.deltaY > 0 ? -0.1 : 0.1);
    };

    // 2. Extraer datos con el nuevo endpoint
    try {
        const res = await fetch(`${backendUrl}/api/ai/ocr-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, fileId, fileName })
        });
        
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Fallo en extracción OCR IA");
        
        const data = json.data; // { productos: [...] }
        const rowData = data.productos || [];

        if (window.Swal) Swal.close();
        sub.textContent = `${fileName} - Revisión HITL Pendiente`;
        
        badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        badge.textContent = `LISTO (${rowData.length} ÍTEMS)`;
        
        btnSave.disabled = false;
        btnSave.classList.remove('cursor-not-allowed');

        // Inicializar AG Grid
        initOcrGrid(rowData);

    } catch (e) {
        console.error(e);
        if (window.Swal) {
            Swal.fire({
                title: 'Error de Extracción',
                text: e.message,
                icon: 'error',
                background: '#0f172a',
                color: '#f8fafc'
            });
        }
        badge.className = 'px-2 py-1 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30';
        badge.textContent = 'FALLÓ';
    }
};

// ==========================
// Lógica AG-Grid
// ==========================
function initOcrGrid(rowData) {
    const gridOptions = {
        rowData: rowData,
        columnDefs: [
            { field: 'codigo', headerName: 'Código', editable: true, flex: 1, cellEditor: 'agTextCellEditor' },
            { field: 'descripcion', headerName: 'Descripción', editable: true, flex: 2, cellEditor: 'agLargeTextCellEditor' },
            { field: 'presentacion', headerName: 'Presentación', editable: true, flex: 1 },
            { field: 'marca', headerName: 'Marca', editable: true, flex: 1 },
            { field: 'precio_unitario', headerName: 'Precio Unitario', editable: true, flex: 1,
              valueParser: params => Number(params.newValue),
              valueFormatter: params => params.value ? `$ ${Number(params.value).toFixed(2)}` : '$ 0.00' }
        ],
        defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true
        },
        theme: "ag-theme-alpine-dark",
        animateRows: true,
        stopEditingWhenCellsLoseFocus: true
    };

    const eGridDiv = document.querySelector('#ocr_grid_container');
    window.ocrGridInstance = agGrid.createGrid(eGridDiv, gridOptions);
}

// ==========================
// Consolidación a Excel
// ==========================
window.saveOcrListas = async function() {
    if (!window.ocrGridInstance) return;

    if (!window.Swal) return;
    
    const result = await Swal.fire({
        title: '¿Consolidar a Excel?',
        text: "Se generará un archivo .xlsx físico en la misma carpeta del proveedor y se ingesará automáticamente al Visor Universal.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Consolidar',
        cancelButtonText: 'Cancelar',
        background: '#1e293b', color: '#f8fafc'
    });

    if (!result.isConfirmed) return;

    Swal.fire({
        title: 'Generando...',
        background: '#0f172a', color: '#f8fafc',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        // 1. Extraer datos de la grilla
        const rowData = [];
        window.ocrGridInstance.forEachNode(node => rowData.push(node.data));

        // 2. Crear Workbook en Memoria con SheetJS
        const ws = XLSX.utils.json_to_sheet(rowData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Lista OCR");

        // 3. Generar Blob
        const wopts = { bookType: 'xlsx', type: 'array' };
        const wbout = XLSX.write(wb, wopts);
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // 4. Nombre del nuevo archivo
        const cleanName = window.currentOcrFileName.replace(/\.[^/.]+$/, "");
        const newFileName = `${cleanName}_TABULADO_OCR.xlsx`;

        // 5. Preparar FormData para subir a Drive (usando endpoint existente)
        const folderId = window.currentDriveFolderId; // from app_core
        if (!folderId) throw new Error("No hay folderId en contexto");

        const formData = new FormData();
        formData.append('file', blob, newFileName);
        formData.append('folderId', folderId);

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const uploadRes = await fetch(`${backendUrl}/api/files/upload`, {
            method: 'POST',
            body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
            throw new Error(uploadData.error || "Fallo en la comunicación con la API.");
        }

        // 6. Finalizar
        window.closeVisorOcrListas();
        
        Swal.fire({
            icon: 'success', title: 'Archivo Consolidado',
            text: 'La tabla ha sido guardada en Drive y procesada.',
            timer: 2500, showConfirmButton: false,
            background: '#1e293b', color: '#f8fafc'
        });

        // Refrescar el Drive Viewer para que aparezca el nuevo archivo Excel
        if (window.exploreSupplierFiles) {
            window.exploreSupplierFiles(folderId, 'listas');
        }

    } catch (e) {
        console.error("Error al consolidar OCR:", e);
        Swal.fire('Error', 'No se pudo consolidar el archivo: ' + e.message, 'error');
    }
};
