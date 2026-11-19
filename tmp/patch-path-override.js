const fs = require('fs');
const files = [
  'src/config/app-config.spec.ts',
  'src/config/config.spec.ts',
  'src/settings/runtime-flags.service.spec.ts',
];
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/process\.env\.APP_CONFIG_PATH = path\.join\(dir, 'config\.json'\);/g, "setConfigPath(path.join(dir, 'config.json'));");
  s = s.replace(/delete process\.env\.APP_CONFIG_PATH;/g, 'setConfigPath(null);');
  s = s.replace(/delete process\.env\.FLAG_IN_PALLET;\r?\n/g, '');
  s = s.replace(/delete process\.env\.FLAG_IN_BOX_LABLE;\r?\n/g, '');
  // добавить импорт setConfigPath из app-config, если ещё нет
  if (s.includes('setConfigPath(') && !s.includes("from './app-config'")) {
    if (f.includes('config/app-config.spec')) {
      // уже импортирует функции из './app-config'
      s = s.replace(/from '\.\/app-config';/, "from './app-config';");
    } else {
      s = "import { setConfigPath } from 'src/config/app-config';\n" + s;
    }
  }
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched', f);
}
