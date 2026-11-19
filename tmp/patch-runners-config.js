const fs = require('fs');
for (const f of ['tmp/run-codes.ts', 'tmp/run-camera-chain.ts', 'tmp/run-layers.ts']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/import \* as dotenv from 'dotenv';\r?\n/, "import { config, loadConfig } from 'src/config/config';\n");
  s = s.replace(/dotenv\.config\(\);\r?\n/, 'loadConfig();\n');
  s = s.replace(/process\.env\.DB_/g, 'config.DB_');
  s = s.replace(/из \.env/g, 'из config.json');
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched', f);
}
