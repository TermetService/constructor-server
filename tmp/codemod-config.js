const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = walk('src');
const skip = new Set(['src/config/app-config.ts', 'src/config/config.ts']);
let changed = 0;

for (const file of files) {
  if (skip.has(file.replace(/\\/g, '/'))) continue;

  let source = fs.readFileSync(file, 'utf8');
  if (!/process\.env\.[A-Za-z0-9_]+/.test(source)) continue;

  const before = source;
  source = source.replace(/process\.env\.([A-Za-z0-9_]+)/g, 'config.$1');

  if (source === before) continue;

  const importLine = "import { config } from 'src/config/config';\n";
  if (!source.includes("from 'src/config/config'")) {
    // вставляем после последнего import в начале файла
    const lines = source.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) lastImport = i;
      if (lastImport !== -1 && i > lastImport && lines[i].trim() !== '' && !lines[i].startsWith('import ') && !lines[i].startsWith('}')) break;
    }
    if (lastImport === -1) lines.unshift(importLine.trimEnd());
    else lines.splice(lastImport + 1, 0, importLine.trimEnd());
    source = lines.join('\n');
  }

  fs.writeFileSync(file, source, 'utf8');
  changed++;
  console.log('patched', file);
}

console.log('files changed:', changed);
