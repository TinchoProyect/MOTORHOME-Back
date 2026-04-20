const fs = require('fs');

let js = fs.readFileSync('src/controllers/masterTableController.js', 'utf8');

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
    };`;

const t1 = `    getOperativaRecords: async (req, res) => {
        try {
            const supabase = require('../config/supabaseClient');`;
const r1 = t1 + `
            // [ARQUITECTURA DE CURADURÍA - FUSIÓN EN LECTURA O(n)]
            const { data: curaduria } = await supabase.from('curaduria_excepciones').select('*');
            const curMap = new Map();
            if (curaduria) {
                 curaduria.forEach(c => curMap.set(c.proveedor_id + '_' + String(c.producto_codigo).trim().toLowerCase(), c));
            }
` + fuzzyHelper;

if (js.includes(t1) && !js.includes('curaduria_excepciones')) {
    js = js.replace(t1, r1);
}

const t2 = `            const mappedData = (data || []).map(row => {
                const outRow = { ...row };`;
const r2 = t2 + `
                // Fusión Curaduría
                const codigoProd = getFuzzyCode(outRow.datos_maestros);
                if (codigoProd) {
                    const cKey = outRow.proveedor_id + '_' + String(codigoProd).trim().toLowerCase();
                    if (curMap.has(cKey)) {
                         const exc = curMap.get(cKey);
                         if (exc.unidad_fijada !== undefined && exc.unidad_fijada !== null) {
                             let fU = false;
                             for (let key in outRow.datos_maestros) {
                                  if (String(key).toLowerCase() === 'unidad') { outRow.datos_maestros[key] = exc.unidad_fijada; fU = true; }
                             }
                             if (!fU) outRow.datos_maestros['Unidad'] = exc.unidad_fijada;
                         }
                         if (exc.rubro_fijado !== undefined) {
                             outRow.rubro_id = exc.rubro_fijado;
                             outRow.bloqueo_edicion_manual = true;
                         }
                    }
                }`;

if (js.includes(t2)) { js = js.replace(t2, r2); }

// PATCH bulkUpdateRubro
const s1 = js.indexOf('    bulkUpdateRubro: async (req, res) => {');
const e1 = js.indexOf('    bulkUpdateUnidad: async (req, res) => {');
const repBulkR = `    bulkUpdateRubro: async (req, res) => {
        try {
            const { itemIds, target_rubro_id } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs no proporcionados." });

            const supabase = require('../config/supabaseClient');
            const real_rubro_id = target_rubro_id === 'UNASSIGN' ? null : target_rubro_id;

            ${fuzzyHelper}
            
            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) uMap.set(r.proveedor_id + '_' + String(code).trim().toLowerCase(), { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), rubro_fijado: real_rubro_id });
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { ext.forEach(e => { const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); if (uMap.has(k)) { uMap.get(k).unidad_fijada = e.unidad_fijada; } }); }
                 
                 if (uMap.size > 0) await supabase.from('curaduria_excepciones').upsert(Array.from(uMap.values()), { onConflict: 'proveedor_id,producto_codigo' });
            }
            return res.json({ success: true, message: "Reasignación Semántica.", count: itemIds.length });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
`;
if (s1 !== -1 && e1 !== -1) { js = js.substring(0, s1) + repBulkR + js.substring(e1); }

// PATCH bulkUpdateUnidad
const s2 = js.indexOf('    bulkUpdateUnidad: async (req, res) => {');
const e2 = js.indexOf('    revertExtraction: async (req, res) => {');
const repBulkU = `    bulkUpdateUnidad: async (req, res) => {
        try {
            const { itemIds, target_unidad } = req.body;
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ success: false, error: "IDs vacíos." });

            const supabase = require('../config/supabaseClient');
            ${fuzzyHelper}

            const { data: rows } = await supabase.from('tabla_maestra_operativa').select('id, proveedor_id, datos_maestros').in('id', itemIds);
            if (rows && rows.length > 0) {
                 const uMap = new Map();
                 rows.forEach(r => {
                      const code = getFuzzyCode(r.datos_maestros);
                      if (code) uMap.set(r.proveedor_id + '_' + String(code).trim().toLowerCase(), { proveedor_id: r.proveedor_id, producto_codigo: String(code).trim().toLowerCase(), unidad_fijada: target_unidad });
                 });
                 
                 const { data: ext } = await supabase.from('curaduria_excepciones').select('*');
                 if (ext) { ext.forEach(e => { const k = e.proveedor_id + '_' + String(e.producto_codigo).trim().toLowerCase(); if (uMap.has(k)) { uMap.get(k).rubro_fijado = e.rubro_fijado; } }); }
                 
                 if (uMap.size > 0) await supabase.from('curaduria_excepciones').upsert(Array.from(uMap.values()), { onConflict: 'proveedor_id,producto_codigo' });
            }
            return res.json({ success: true, message: "Unidad reasignada.", count: itemIds.length });
        } catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    },
`;
if (s2 !== -1 && e2 !== -1) { js = js.substring(0, s2) + repBulkU + js.substring(e2); }

fs.writeFileSync('src/controllers/masterTableController.js', js);
console.log('Backend patched!');
