const fs = require('fs');
let js = fs.readFileSync('src/controllers/masterTableController.js', 'utf8');

// 1. Fusion Logic in getOperativaRecords
const fuzzyHelper = `
            const getFuzzyCode = (obj) => {
                if (!obj) return null;
                if (obj.codigo) return obj.codigo;
                if (obj['código']) return obj['código'];
                for (let key in obj) {
                    const kText = String(key).toLowerCase();
                    if (kText === 'sku' || kText.includes('codigo') || kText.includes('código')) {
                        return obj[key];
                    }
                }
                return null;
            };
`;

const fetchLine = `            const mappedData = (data || []).map(row => {`;
if (!js.includes('curMap.has(cKey)')) {
    const fusionBlock = `
            // [ARQUITECTURA DE CURADURÍA - FUSIÓN EN LECTURA MEMORY MAP O(N)]
            const { data: curaduria, error: curErr } = await supabase.from('curaduria_excepciones').select('*');
            const curMap = new Map();
            if (curaduria && !curErr) {
                 curaduria.forEach(c => curMap.set(c.proveedor_id + '_' + String(c.producto_codigo).trim().toLowerCase(), c));
            }
            ` + fuzzyHelper + `

            const mappedData = (data || []).map(row => {
                const outRow = { ...row };
                
                const codigoProd = getFuzzyCode(outRow.datos_maestros);
                if (codigoProd) {
                    const cKey = outRow.proveedor_id + '_' + String(codigoProd).trim().toLowerCase();
                    if (curMap.has(cKey)) {
                         const exception = curMap.get(cKey);
                         
                         if (exception.unidad_fijada !== undefined && exception.unidad_fijada !== null) {
                             let foundUnit = false;
                             for (let key in outRow.datos_maestros) {
                                  if (String(key).toLowerCase() === 'unidad') {
                                      outRow.datos_maestros[key] = exception.unidad_fijada;
                                      foundUnit = true;
                                  }
                             }
                             if (!foundUnit) {
                                  outRow.datos_maestros['Unidad'] = exception.unidad_fijada;
                             }
                             outRow.datos_maestros._unidad_fijada = true;
                         }
                         
                         if (exception.rubro_fijado !== undefined && exception.rubro_fijado !== null) {
                             outRow.rubro_id = exception.rubro_fijado;
                             outRow.bloqueo_edicion_manual = true;
                         } else if (exception.rubro_fijado === null && exception.hasOwnProperty('rubro_fijado')) {
                             outRow.rubro_id = null;
                             outRow.bloqueo_edicion_manual = true;
                         }
                    }
                }
    `;
    js = js.replace(fetchLine, fusionBlock);
    console.log('Fusion applied.');
}

// 2. Rewrite bulkUpdateRubro and bulkUpdateUnidad COMPLETELY to use UPSERT onto curaduria_excepciones!
// And return the written object in the payload!
const startR = js.indexOf('    bulkUpdateRubro: async');
const endR = js.indexOf('    bulkUpdateUnidad: async');
if (startR !== -1 && endR !== -1) {
    const newBulkR = `    bulkUpdateRubro: async (req, res) => {
        try {
            const { itemIds, target_rubro_id } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });

            const supabase = require('../config/supabaseClient');
            const real_rubro_id = target_rubro_id === 'UNASSIGN' ? null : target_rubro_id;
            ${fuzzyHelper}
            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            let writtenPayloads = [];
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) {
                          const k = r.proveedor_id + '_' + String(code).trim().toLowerCase();
                          uMap.set(k, { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), rubro_fijado: real_rubro_id });
                      }
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { 
                     ext.forEach(e => { 
                         const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); 
                         if (uMap.has(k)) { 
                             uMap.get(k).unidad_fijada = e.unidad_fijada; 
                         } 
                     }); 
                 }
                 
                 if (uMap.size > 0) {
                     const payload = Array.from(uMap.values());
                     const { data: upsertData, error: upsertErr } = await supabase.from('curaduria_excepciones').upsert(payload, { onConflict: 'proveedor_id,producto_codigo' }).select();
                     if (upsertErr) throw upsertErr;
                     writtenPayloads = upsertData;
                 }
            }
            return res.json({ success: true, message: "Reasignación aplicada.", count: itemIds.length, upserted: writtenPayloads });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
`;
    js = js.substring(0, startR) + newBulkR + js.substring(endR);
    console.log('bulkUpdateRubro patched.');
}

const startU = js.indexOf('    bulkUpdateUnidad: async');
const endU = js.indexOf('    revertExtraction: async');
if (startU !== -1 && endU !== -1) {
    const newBulkU = `    bulkUpdateUnidad: async (req, res) => {
        try {
            const { itemIds, target_unidad } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });
            if (target_unidad === undefined) return res.status(400).json({ success: false, error: "Unidad vacía." });

            const supabase = require('../config/supabaseClient');
            ${fuzzyHelper}
            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            let writtenPayloads = [];
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) {
                          const k = r.proveedor_id + '_' + String(code).trim().toLowerCase();
                          uMap.set(k, { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), unidad_fijada: target_unidad });
                      }
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { 
                     ext.forEach(e => { 
                         const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); 
                         if (uMap.has(k)) { 
                             uMap.get(k).rubro_fijado = e.rubro_fijado; 
                         } 
                     }); 
                 }
                 
                 if (uMap.size > 0) {
                     const payload = Array.from(uMap.values());
                     console.log("[QA-AUDIT] UPSERT Payload (Unidades):", JSON.stringify(payload, null, 2));
                     const { data: upsertData, error: upsertErr } = await supabase.from('curaduria_excepciones').upsert(payload, { onConflict: 'proveedor_id,producto_codigo' }).select();
                     if (upsertErr) throw upsertErr;
                     writtenPayloads = upsertData;
                     console.log("[QA-AUDIT] UPSERT Result:", JSON.stringify(writtenPayloads, null, 2));
                 }
            }
            return res.json({ success: true, message: "Unidad aplicada.", count: itemIds.length, upserted: writtenPayloads });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
`;
    js = js.substring(0, startU) + newBulkU + js.substring(endU);
    console.log('bulkUpdateUnidad patched.');
}

fs.writeFileSync('src/controllers/masterTableController.js', js);
