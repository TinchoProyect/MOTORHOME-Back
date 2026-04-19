const fs = require('fs');
let html = fs.readFileSync('src/views/monitor_proveedores.html', 'utf8');

// 1. ADD headerCheckboxSelectionFilteredOnly TO GRIDOPTIONS
const gridOptsKey = "rowSelection: 'multiple',";
if (html.includes(gridOptsKey)) {
    if (!html.includes('headerCheckboxSelectionFilteredOnly: true')) {
        html = html.replace(gridOptsKey, gridOptsKey + '\\n                    headerCheckboxSelectionFilteredOnly: true,');
        console.log("Injected headerCheckboxSelectionFilteredOnly");
    } else {
        console.log("headerCheckboxSelectionFilteredOnly ALREADY INJECTED");
    }
} else {
    console.log("COULD NOT FIND gridOptsKey");
}

// 2. REFACTOR populateUnidadDropdown TO USE allLeafChildren
const s = html.indexOf('window.populateUnidadDropdown = function() {');
if (s !== -1) {
    const e = html.indexOf('window.executeDynamicBulkUpdate', s);
    if (e !== -1) {
        const newLogic = `window.populateUnidadDropdown = function() {
            if (!window.v4GridApi) return;
            
            const logFn = window.originalConsoleLog || console.log;
            
            const uniqueUnidades = new Set();
            
            // FILTRADO ANULADO: EXTRACCIÓN CRUDA Y GLOBAL DE TODOS LOS NODOS EN MEMORIA (Requerimiento Estricto QA)
            const globalNodes = window.v4GridApi.getModel().getRootNode().allLeafChildren;
            if (!globalNodes || globalNodes.length === 0) {
                logFn("Auditoría de Inyección UI - El modelo de datos está completamente vacío.");
            } else {
                globalNodes.forEach(node => {
                    if (node.data && node.data.datos_maestros) {
                        let dm = node.data.datos_maestros;
                        for (let key in dm) {
                            if (String(key).toLowerCase() === 'unidad') {
                                const rawVal = dm[key];
                                if (rawVal !== null && rawVal !== undefined) {
                                    const cleanVal = String(rawVal).trim();
                                    if (cleanVal !== '' && cleanVal.toLowerCase() !== '[vacio]') {
                                        uniqueUnidades.add(cleanVal);
                                    }
                                }
                            }
                        }
                    }
                });
            }
            
            logFn("Cargando Módulo Unidades... Escaneo Crudo Terminado.");
            logFn("Auditoría de Inyección UI - Unidades Únicas Extraídas del Pool Global (", globalNodes ? globalNodes.length : 0 , "nodos ):", uniqueUnidades.size);
            
            const select = document.getElementById('fmtBulkUnidadSelect');
            if (select) {
                select.innerHTML = '<option value="">-- Seleccionar Unidad --</option>';
                select.innerHTML += '<option value="UNASSIGN" class="text-rose-400 font-bold bg-rose-950/20">🧹 VACIAR CELDA</option>';
                
                const sorted = Array.from(uniqueUnidades).sort();
                sorted.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u;
                    opt.textContent = u;
                    select.appendChild(opt);
                });
            }
        };

        `;
        html = html.substring(0, s) + newLogic + html.substring(e);
        fs.writeFileSync('src/views/monitor_proveedores.html', html);
        console.log("Injected allLeafChildren extraction logic");
    } else {
        console.log("COULD NOT FIND end of populateUnidadDropdown");
    }
} else {
    console.log("COULD NOT FIND populateUnidadDropdown");
}
