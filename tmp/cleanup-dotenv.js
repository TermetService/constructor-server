const fs = require('fs');
for (const f of ['tmp/run-real.ts']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/import \* as dotenv from 'dotenv';\r?\n/, "import { config, loadConfig } from 'src/config/config';\n");
  s = s.replace(/dotenv\.config\(\);\r?\n/, 'loadConfig();\n');
  s = s.replace(/const \{ loadConfig \} = require\('src\/config\/config'\);\r?\n\s*loadConfig\(\);\r?\n/, '');
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched', f);
}
// комментарии
for (const f of ['src/main.ts', 'src/scanner/scanner.service.ts']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/модульные dotenv\.config\(\)/g, 'модульные чтения конфига');
  s = s.replace(/Конфигурация портов из \.env/g, 'Конфигурация портов из config.json');
  fs.writeFileSync(f, s, 'utf8');
}
