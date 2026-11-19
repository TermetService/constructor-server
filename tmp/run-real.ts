/**
 * Реальный прогон: поднимаем настоящий AppModule (Nest DI), берём из него
 * реальные CameraService и CodeService и сразу отправляем сообщение камеры
 * в handleMessage2. Никакой ручной сборки сервисов, никаких прямых вызовов
 * ParseLayer / validateAndSaveCode.
 *
 * Задание и состояние мониторинга выставляются как при старте смены.
 * Таблицу создаёт само приложение при первом коде.
 *
 * Запуск:
 *   npm run test:real                 # 15 кодов, по 5 (слоями)
 *   npm run test:real -- --mode=full  # 15 кодов одним сообщением
 *   CODES_LIMIT=116 npm run test:real
 *
 * Настройки: CODES_FILE, CODES_LIMIT, KEEP_DB=1.
 */
import 'reflect-metadata';
import { config, loadConfig } from 'src/config/config';
import * as fs from 'fs';
import * as path from 'path';

loadConfig();

const STAMP = new Date()
  .toISOString()
  .slice(0, 19)
  .replace('T', '_')
  .replace(/[-:]/g, '_');

const TABLE = `test-real-${STAMP}`;
const CODES_FILE =
  process.env.CODES_FILE || path.join(__dirname, 'codes-220.txt');
const CODES_LIMIT = Number(process.env.CODES_LIMIT) || 15;

const GTIN = '04810272003892';
const DATE_TASK = '01.01.2026';
const LAYERS = 3;
const CODES_PER_LAYER = 5;
const BOX_CAPACITY = LAYERS * CODES_PER_LAYER;

function normalize(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (clean.includes('\x1D')) return clean;

  const head = clean.slice(0, 24);
  const mid = clean.slice(24, 30);
  const rest = clean.slice(30);
  if (mid !== '91FFD0' || !rest.startsWith('92')) return null;

  return `${head}\x1D${mid}\x1D${rest}`;
}

async function main() {
  process.on('unhandledRejection', (reason: any) => {
    console.error('  [unhandledRejection]', reason?.message ?? reason);
  });

  // --- заглушка path.util до загрузки AppModule ---
  const pathUtilId = require.resolve('src/path.util');
  require.cache[pathUtilId] = {
    id: pathUtilId,
    filename: pathUtilId,
    loaded: true,
    exports: {
      getRecordsTextFilesDirectory: () => 'tmp/records-text',
      getTaskJsonDirectory: () => 'tmp/tasks',
      getNomenclatureJsonDirectory: () => 'tmp/nomenclature',
      getSettingJsonDirectory: () => 'tmp/settings',
      getTemplateDirectory: () => 'tmp/templates',
      getRecordsJsonDirectory: () => ['tmp/records-1', 'tmp/records-2'],
      getReserveFilesDirectory: () => 'tmp/reserve',
      getStartTaskJsonDirectory: () => 'tmp/finish',
      getFilesDirectory: () => 'tmp/files',
      getAvailableFilesDirectory: () => 'tmp/available',
      getRecordsFilesDirectory: () => 'tmp/records-files',
      getFilesDirectory1S: () => 'tmp/1s',
      getJsonDirectory1S: () => 'tmp/1s-json',
      getFilesDirectory1STemplate: () => 'tmp/1s-template',
      getJsonDirectory1STemplate: () => 'tmp/1s-template-json',
      sha: 'stub-machine-id',
    },
  } as any;

  // --- реальный модуль приложения (DI), без запуска lifecycle-хуков ---
  const { Test } = require('@nestjs/testing');
    const { AppModule } = require('src/app.module');
  const { AppGateway } = require('src/app.gateway');

  // сокет-сервера в контексте нет — заменяем gateway на пустышку,
  // иначе sendProductCount/sendLogData падают на null server
  const gatewayStub = {
    sendProductCount: () => undefined,
    sendLogData: () => undefined,
    sendRootMessage: () => undefined,
    sendRootMessage2: () => undefined,
    sendCoordinates: () => undefined,
    sendCameraConnectionStatus: () => undefined,
  };

  console.log('=== ПОДЪЁМ ПРИЛОЖЕНИЯ ===');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AppGateway)
    .useValue(gatewayStub)
    .compile();

  const { CameraService } = require('src/camera/camera.service');
  const { CameraNames } = require('src/camera/types');
  const { CodeService } = require('src/code/code.service');
  const { DataSource } = require('typeorm');

  const camera = moduleRef.get(CameraService);
  const codeService = moduleRef.get(CodeService);
  const ds = moduleRef.get(DataSource);
  const globalMonVar = moduleRef.get('GLOBAL_MONITORING_VARIABLES');

  console.log(`CameraService: ${camera.constructor.name}`);
  console.log(`CodeService:   ${codeService.constructor.name}`);
  console.log(`DataSource:    ${ds.isInitialized ? 'подключён' : 'нет'}`);
  console.log('');

  // --- коды ---
  const rawCodes = fs
    .readFileSync(CODES_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const codes = Array.from(
    new Set(
      rawCodes
        .map((raw) => normalize(raw))
        .filter((code): code is string => Boolean(code)),
    ),
  ).slice(0, CODES_LIMIT);

  if (codes.length < CODES_LIMIT) {
    throw new Error(`Нужно ${CODES_LIMIT} кодов, найдено ${codes.length}`);
  }

  const mode =
    (process.argv.find((value) => value.startsWith('--mode='))?.split('=')[1] ||
      'partial') === 'full'
      ? 'full'
      : 'partial';

  // --- состояние как при старте смены ---
  Object.assign(globalMonVar, {
    task: {
      gtin: GTIN,
      layers: String(LAYERS),
      layer1: String(CODES_PER_LAYER),
      layer2: String(CODES_PER_LAYER),
      layer3: String(CODES_PER_LAYER),
      codesInLayer: CODES_PER_LAYER,
      codes,
      batch: 'real-camera',
      date_manufacture: DATE_TASK,
      date_expiration: '01.01.2027',
      pieces_per_package: BOX_CAPACITY,
      packaging_per_pallet: 6,
      startCorob: '1',
      startPallet: '1',
    },
    taskName: 'real-camera.json',
    tableName: TABLE,
    limitProductInBox: BOX_CAPACITY,
    limitBoxInPallet: 6,
    productCount: 0,
    boxCount: 0,
    palletCount: 0,
    currentBoxNumber: 1,
    currentPalletNumber: 1,
    productsInCurrentBox: 0,
    boxesInCurrentPallet: 0,
    isMonitoring: true,
    isPaused: false,
    codeStatus: null,
    konturTime: 0,
  });

  // состояние как при старте смены, ничего вручную в CodeService не пишем
  // (startSession в приложении вызывается из startMonitoring)
  globalMonVar.taskName = 'real-camera.json';

  // чистим следы прошлых прогонов: коды в реестре и старые таблицы test-real-*
  const oldTables = await ds.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'test-real-%'`,
  );
  for (const table of oldTables.sort((a: any, b: any) =>
    b.table_name.localeCompare(a.table_name),
  )) {
    await ds.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
  }
  await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
    codes,
  ]);

  const messages: string[][] = [];
  const size = mode === 'full' ? BOX_CAPACITY : CODES_PER_LAYER;
  for (let index = 0; index < codes.length; index += size) {
    messages.push(codes.slice(index, index + size));
  }

  console.log('=== ПАРАМЕТРЫ ===');
  console.log(`таблица:   ${TABLE} (создаст приложение при первом коде)`);
  console.log(`кодов:     ${codes.length}`);
  console.log(`режим:     ${mode} (по ${size})`);
  console.log(`сообщений: ${messages.length}`);
  console.log(`камера:    ${CameraNames.Camera1}`);
  console.log('');

  const rowCount = async (): Promise<number> => {
    try {
      const result = await ds.query(
        `SELECT count(*)::int AS c FROM "${TABLE}"`,
      );
      return result[0].c;
    } catch {
      return 0;
    }
  };

  const send = async (index: number, batch: string[]) => {
    const before = await rowCount();
    const started = Date.now();

    camera.handleMessage2(
      ` ${batch.join('@@')}\t`,
      CameraNames.Camera1,
    );

    // ждём, пока приложение реально запишет коды
    for (let attempt = 0; attempt < 300; attempt++) {
      if ((await rowCount()) >= before + batch.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const after = await rowCount();
    const state = codeService.cameraStates?.['Camera1'];
    const last = await ds
      .query(
        `SELECT box_number, pallet_number, camera_name FROM "${TABLE}" ORDER BY id DESC LIMIT 1`,
      )
      .catch(() => []);

    console.log(
      `#${String(index + 1).padStart(2, '0')}/${messages.length}: ` +
        `${batch.length} кодов, строк ${before} → ${after}, ` +
        `коробка ${codeService.getLastUsedBoxNumber()} (${state?.currectProductInBox ?? '—'}/${BOX_CAPACITY}), ` +
        `паллета ${state?.UsedPalletNumber ?? '—'}, ` +
        `последняя запись: box=${last[0]?.box_number ?? '—'}, pallet=${last[0]?.pallet_number ?? '—'}, ` +
        `${Date.now() - started} мс`,
    );
  };

  console.log('=== ОТПРАВКА СООБЩЕНИЙ В handleMessage2 ===');
  for (let index = 0; index < messages.length; index++) {
    await send(index, messages[index]);
  }

  console.log('\n=== БАЗА ===');
  console.log(`строк: ${await rowCount()}`);
  console.table(
    await ds
      .query(
        `SELECT box_number, pallet_number, count(*)::int AS codes FROM "${TABLE}" GROUP BY box_number, pallet_number ORDER BY box_number`,
      )
      .catch(() => []),
  );
  console.log('состояние:', {
    lastUsedBoxNumber: codeService.getLastUsedBoxNumber(),
    cameraState: codeService.cameraStates?.['Camera1'],
    productCount: globalMonVar.productCount,
    boxCount: globalMonVar.boxCount,
    palletCount: globalMonVar.palletCount,
  });

  if (process.env.KEEP_DB !== '1') {
    await ds.query(`DROP TABLE IF EXISTS "${TABLE}" CASCADE`);
    await ds.query(`DROP TABLE IF EXISTS "${TABLE}_task" CASCADE`);
    await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
      codes,
    ]);
    console.log('убрано за прогоном');
  }

  await moduleRef.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('FATAL:', error?.message ?? error);
  process.exit(1);
});
