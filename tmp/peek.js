const fs = require('fs');
for (const f of ['src/files1s/files1s.service.ts', 'src/code/code-search.service.ts']) {
  const s = fs.readFileSync(f, 'utf8');
  const idx = s.indexOf('const interval');
  const idx2 = s.indexOf('const isPrint');
  const at = idx >= 0 ? idx : idx2;
  console.log(f, JSON.stringify(s.slice(Math.max(0, at - 80), at + 60)));
}
