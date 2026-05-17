const fs = require('fs');
let data = fs.readFileSync('src/views/js/inventory_ui.js', 'utf8');

// 1. Extract iva in the map loop
const enrichmentStart = 'let precioUnitario = 0;';
const enrichmentReplacement = 'let precioUnitario = 0;\n        let ivaPorcentaje = 21;';
data = data.replace(enrichmentStart, enrichmentReplacement);

const masterExtract = 'precioUnitario = parseFloat(mp.precio || masterItem.precio || 0);';
const masterExtractRep = `precioUnitario = parseFloat(mp.precio || masterItem.precio || 0);
                let rawIva = mp.iva || masterItem.iva || '21';
                ivaPorcentaje = parseFloat(String(rawIva).replace('%', '').replace(',', '.')) || 0;`;
data = data.replace(masterExtract, masterExtractRep);

const returnObj = 'precioBulto: precioUnitario * valor,';
const returnObjRep = 'precioBulto: precioUnitario * valor,\n            ivaPorcentaje,';
data = data.replace(returnObj, returnObjRep);

// 2. Add ivaPorcentaje to the render loop
const varExtract = 'const precioBulto = item.precioBulto;';
const varExtractRep = `const precioBulto = item.precioBulto;
        const ivaP = item.ivaPorcentaje || 0;
        const ivaDisplay = ivaP === 0 ? '0%' : (ivaP === 10.5 ? '10,5%' : \`\${ivaP}%\`);
        const ivaColor = ivaP === 0 ? 'text-slate-500 bg-slate-800/50' : (ivaP === 10.5 ? 'text-blue-400 bg-blue-900/20' : 'text-amber-400 bg-amber-900/20');`;
data = data.replace(varExtract, varExtractRep);

// 3. Inject into HTML
const targetSpan = '<span class="text-[10px] text-slate-500 mb-0.5 transition-colors">$${precioUnitario.toLocaleString(\'es-AR\', {minimumFractionDigits: 2})} / ${abrevUnit}</span>';
const newSpan = '<span class="text-[10px] text-slate-500 mb-0.5 transition-colors flex items-center justify-end gap-1">$${precioUnitario.toLocaleString(\'es-AR\', {minimumFractionDigits: 2})} / ${abrevUnit} <span class="text-[8px] font-bold px-1 rounded uppercase tracking-wider ${ivaColor}">IVA ${ivaDisplay}</span></span>';
data = data.replace(targetSpan, newSpan);

fs.writeFileSync('src/views/js/inventory_ui.js', data);
console.log('IVA functionality injected successfully');
