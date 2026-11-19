const fs = require('fs');
let a = fs.readFileSync('src/files1s/files1s.service.ts', 'utf8');
a = a.replace(/const interval = \+config\.CHECK_1S_INTERVAL \|\| 60000;\r?\n/, '');
fs.writeFileSync('src/files1s/files1s.service.ts', a, 'utf8');

let b = fs.readFileSync('src/code/code-search.service.ts', 'utf8');
b = b.replace(/\/\/ eslint-disable-next-line @typescript-eslint\/no-unused-vars\r?\nconst isPrint = config\.IS_PRINT === 'true';\r?\n/, '');
fs.writeFileSync('src/code/code-search.service.ts', b, 'utf8');
console.log('removed leftovers');
