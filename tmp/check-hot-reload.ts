/**
 * Проверка горячей перезагрузки: меняем config.json на лету,
 * сервер (этот процесс) должен увидеть новое значение без перезапуска.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  config,
  loadConfig,
  onConfigChange,
  watchConfig,
} from 'src/config/config';
import { getConfigPath } from 'src/config/app-config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const file = getConfigPath();
  const original = fs.readFileSync(file, 'utf8');
  const before = config.IS_PRINT;

  let notified = 0;
  onConfigChange(() => {
    notified++;
    console.log(`  [watch] новое IS_PRINT = ${config.IS_PRINT}`);
  });

  loadConfig();
  watchConfig();

  try {
    const json = JSON.parse(original);
    json.IS_PRINT = !(json.IS_PRINT === true || json.IS_PRINT === 'true');
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

    await sleep(1500);

    console.log(`до: ${before}, после: ${config.IS_PRINT}, событий: ${notified}`);
    console.log(
      config.IS_PRINT !== String(before) && notified > 0
        ? 'HOT RELOAD: OK'
        : 'HOT RELOAD: FAIL',
    );
  } finally {
    fs.writeFileSync(file, original, 'utf8');
    await sleep(500);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
