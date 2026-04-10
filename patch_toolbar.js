const fs = require('fs');
let code = fs.readFileSync('src/views/js/viewer_render.js', 'utf8');

const t1 = '<div class="flex items-center gap-3 mb-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10 w-full">';
const r1 = '<div class="flex items-center gap-3 mb-0 p-2 bg-slate-950 border-b border-slate-700 shrink-0 relative z-[250] w-full">';

if (code.includes(t1)) {
    code = code.replace(t1, r1);
    fs.writeFileSync('src/views/js/viewer_render.js', code);
    console.log('Toolbar replaced successfully');
} else {
    console.log('Toolbar target not found');
}
