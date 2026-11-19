const fs = require('fs');
for (const f of ['src/files1s/files1s.service.ts', 'src/code/code-search.service.ts']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/\r(?!\n)/g, '\n');
  s = s.replace(/^const interval = \+config\.CHECK_1S_INTERVAL \|\| 60000;\n/m, '');
  s = s.replace(/^\/\/ eslint-disable-next-line @typescript-eslint\/no-unused-vars\nconst isPrint = config\.IS_PRINT === 'true';\n/m, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(f, s, 'utf8');
  console.log('normalized', f);
}
