const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/js/app_core.js');
let content = fs.readFileSync(filePath, 'utf8');

// Inyección 1: Visor Local HTML en la vista del proveedor.
// Buscamos el final de la constante template:
// </div>\n        </div>\n    </div>\n        </div >\n    `;\n    lucide.createIcons();\n}
const regexHtml = /<\/div>\s*<\/div>\s*<\/div>\s*<\/div\s*>\s*`;\s*lucide\.createIcons\(\);/g;

const htmlReplacement = `            </div>
        </div>
    </div>
    
    <!-- [NEW] Visor Local de Artículos -->
    <div class="mt-6 p-6 bg-slate-900/40 rounded-xl border border-slate-800/50">
        <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <i data-lucide="layout-list" class="w-3 h-3 text-blue-400"></i> Catálogo Activo del Proveedor
        </h3>
        <div class="overflow-y-auto max-h-[300px] custom-scrollbar rounded-lg border border-slate-800/50 bg-slate-950/30 relative">
            <table class="w-full text-left border-collapse">
                <thead class="sticky top-0 bg-slate-900/90 backdrop-blur border-b border-slate-800 z-10 shadow-sm">
                    <tr>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Cód / SKU</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Descripción</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">P. Neto</th>
                        <th class="py-2 px-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">Origen</th>
                    </tr>
                </thead>
                <tbody id="supplierLocalGrid" class="divide-y divide-slate-800/50 text-xs text-slate-300">
                    <tr>
                        <td colspan="4" class="p-8 text-center text-slate-500 flex-col items-center gap-2 hidden">
                            <i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500"></i>
                            <span class="text-[10px] uppercase tracking-widest">Cargando catálogo operativo...</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
        </div >
    \`;
    lucide.createIcons();
    if (window.loadSupplierArticles) window.loadSupplierArticles(supplier.id);`;

if (regexHtml.test(content)) {
    content = content.replace(regexHtml, htmlReplacement);
    console.log("SUCCESS: HTML del Visor inyectado.");
} else {
    console.log("FAIL: HTML regex no encontró coincidencia.");
}

// Inyección 2: JS Lógica (loadSupplierArticles y generateFrontendSku)
const regexJs = /window\.openManualEntryModal\s*=\s*function\(providerId,\s*providerName\)\s*\{/g;

const jsReplacement = `window.generateFrontendSku = async function() {
    const providerId = document.getElementById('manualEntryProviderId').value;
    const desc = document.getElementById('manualEntryDesc').value || "SINDESCRIPCION";
    if (!providerId) {
        if(window.Swal) Swal.fire('Error', 'Falta el proveedor actual.', 'error');
        return;
    }
    
    // Hash SHA-256 en frontend
    const textToHash = providerId + "-" + desc.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(textToHash);
    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0,8).toUpperCase();
        
        const generatedSku = "LMD-MAN-" + hashHex;
        const skuInput = document.getElementById('manualEntrySku');
        skuInput.value = generatedSku;
        
        // Destello visual
        skuInput.classList.add('bg-blue-900/50', 'ring-2', 'ring-blue-500');
        setTimeout(() => skuInput.classList.remove('bg-blue-900/50', 'ring-2', 'ring-blue-500'), 500);
    } catch(e) {
        console.error("Crypto error:", e);
    }
};

window.loadSupplierArticles = async function(providerId) {
    const grid = document.getElementById('supplierLocalGrid');
    if (!grid) return;
    
    grid.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500"></i>Cargando...</td></tr>';
    if(window.lucide) lucide.createIcons();
    
    try {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : 'http://localhost:5655';
        const res = await fetch(backendUrl + '/api/master-table/operativa');
        if (res.ok) {
            const json = await res.json();
            const data = json.data || [];
            const localData = data.filter(r => r.proveedor_id === providerId);
            
            if (localData.length === 0) {
                grid.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 text-[11px] italic">No hay artículos cargados para este proveedor.</td></tr>';
                return;
            }
            
            let html = '';
            localData.forEach(r => {
                const dm = r.datos_maestros || {};
                const origen = dm._origen || dm.Origen_Sistema || 'Drive / Auto';
                const isManual = String(origen).toLowerCase().includes('manual');
                const badge = isManual 
                    ? '<span class="px-2 py-0.5 rounded text-[9px] bg-blue-900/30 text-blue-400 border border-blue-500/30 font-bold uppercase tracking-widest"><i data-lucide="user" class="w-2.5 h-2.5 inline pb-0.5"></i> Manual</span>'
                    : '<span class="px-2 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-widest"><i data-lucide="bot" class="w-2.5 h-2.5 inline pb-0.5"></i> IA</span>';
                
                const sku = dm.SKU || dm['Código'] || dm.codigo || '-';
                const desc = dm['Descripción'] || dm.descripcion || dm.Producto || 'Sin descripción';
                const precio = dm.Precio || dm.precio || dm.Precio_Unitario || 0;
                
                html += \`<tr class="hover:bg-slate-800/30 transition-colors">
                    <td class="py-2 px-4 font-mono text-[11px] text-blue-300">\${sku}</td>
                    <td class="py-2 px-4 font-medium text-slate-200 truncate max-w-[200px]" title="\${desc}">\${desc}</td>
                    <td class="py-2 px-4 font-mono text-emerald-400">$\${parseFloat(precio).toFixed(2)}</td>
                    <td class="py-2 px-4">\${badge}</td>
                </tr>\`;
            });
            grid.innerHTML = html;
            if(window.lucide) lucide.createIcons();
        }
    } catch(e) {
        console.error("Error loading articles:", e);
        grid.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-400">Error al cargar datos.</td></tr>';
    }
};

window.openManualEntryModal = function(providerId, providerName) {`;

if (regexJs.test(content)) {
    content = content.replace(regexJs, jsReplacement);
    console.log("SUCCESS: JS Lógica inyectada.");
} else {
    console.log("FAIL: JS regex no encontró coincidencia.");
}

fs.writeFileSync(filePath, content, 'utf8');
