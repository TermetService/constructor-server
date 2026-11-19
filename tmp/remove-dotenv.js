const fs = require('fs');
const path = require('path');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.ts')) out.push(f);
  }
  return out;
}
let changed = 0;
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(/^import \* as dotenv from 'dotenv';\n/gm, '');
  s = s.replace(/^\s*dotenv\.config\(\);\n/gm, '');
  if (s !== before) { fs.writeFileSync(file, s, 'utf8'); changed++; console.log('cleaned dotenv', file); }
}
console.log('files:', changed);
