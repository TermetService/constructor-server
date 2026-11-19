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
const line = "import { config } from 'src/config/config';";
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(line)) continue;
  s = s.split('\n').filter((l) => l.trim() !== line).join('\n');
  s = line + '\n' + s;
  fs.writeFileSync(file, s, 'utf8');
  console.log('fixed', file);
}
