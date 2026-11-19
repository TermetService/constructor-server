const fs = require('fs');

function patch(file, pairs, importLine) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) s = s.split(from).join(to);
  if (importLine && !s.includes(importLine)) s = importLine + '\n' + s;
  fs.writeFileSync(file, s, 'utf8');
  console.log('patched', file);
}

patch('src/monitoring/helper.spec.ts', [
  ["let previousCodeLength: string | undefined;\n\n  beforeAll(() => {\n    previousCodeLength = config.CODE_LENGTH;\n    process.env.CODE_LENGTH = '78';\n  });", "beforeAll(() => {\n    setConfigOverride('CODE_LENGTH', '78');\n  });"],
  ["afterAll(() => {\n    if (previousCodeLength === undefined) delete process.env.CODE_LENGTH;\n    else config.CODE_LENGTH = previousCodeLength;\n  });", "afterAll(() => {\n    setConfigOverride('CODE_LENGTH', undefined);\n  });"],
], "import { setConfigOverride } from 'src/config/config';");

patch('src/code/bind/box-label-check.service.spec.ts', [
  ['delete process.env.IS_DEVELOP;', "setConfigOverride('IS_DEVELOP', undefined);"],
  ["process.env.IS_DEVELOP = 'true';", "setConfigOverride('IS_DEVELOP', 'true');"],
], "import { setConfigOverride } from 'src/config/config';");

patch('src/code/helpers/code-scan-weights.spec.ts', [
  ['delete process.env.IS_USING_API;', "setConfigOverride('IS_USING_API', undefined);"],
  ["process.env.IS_USING_API = 'true';", "setConfigOverride('IS_USING_API', 'true');"],
  ["process.env.CODE_SEARCH_MODE = '93';", "setConfigOverride('CODE_SEARCH_MODE', '93');"],
  ["process.env.IP_SERVER = '127.0.0.1';", "setConfigOverride('IP_SERVER', '127.0.0.1');"],
  ['delete process.env.IP_SERVER;', "setConfigOverride('IP_SERVER', undefined);"],
], "import { setConfigOverride } from 'src/config/config';");
