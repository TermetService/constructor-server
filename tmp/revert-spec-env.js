const fs = require('fs');
const path = require('path');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.spec.ts')) out.push(f);
  }
  return out;
}
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(/delete config\.([A-Za-z0-9_]+);/g, 'delete process.env.$1;');
  s = s.replace(/(^|\n)(\s*)config\.([A-Za-z0-9_]+) = /g, '$1$2process.env.$3 = ');
  if (s !== before) { fs.writeFileSync(file, s, 'utf8'); console.log('reverted', file); }
}
