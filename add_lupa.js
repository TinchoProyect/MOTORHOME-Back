const fs = require('fs');
let data = fs.readFileSync('src/views/js/inventory_ui.js', 'utf8');

// Use precise substring matching to avoid template literal conflicts
const targetStr = '<td class="p-4 text-right border-l border-slate-800/30 font-mono text-slate-400 text-xs">';
const replacementStr = '<td class="p-4 text-right border-l border-slate-800/30 font-mono text-slate-400 text-xs relative group/price z-10 hover:z-50">';

const targetDiv = '<div class="flex flex-col items-end justify-center">';
const replacementDiv = '<div class="flex flex-col items-end justify-center transform origin-right transition-all duration-300 group-hover/price:scale-[1.8] group-hover/price:-translate-x-4 group-hover/price:bg-slate-800 group-hover/price:p-3 group-hover/price:rounded-lg group-hover/price:shadow-2xl group-hover/price:border group-hover/price:border-slate-600 cursor-pointer">';

let modified = false;

if (data.includes(targetStr)) {
    // Only replace the first occurrence which is inside the loop
    data = data.replace(targetStr, replacementStr);
    modified = true;
}

if (data.includes(targetDiv)) {
    data = data.replace(targetDiv, replacementDiv);
    modified = true;
}

if (modified) {
    fs.writeFileSync('src/views/js/inventory_ui.js', data);
    console.log('Lupa effect injected successfully.');
} else {
    console.log('Failed to find targets.');
}
