/**
 * Прогон CodeService.ParseLayer на реальном задании:
 * 3 слоя по 5 кодов, коробка 15, камера Camera1.
 *
 * Запуск: npm run test:layers
 *
 * Сценарии:
 *   1. полный слой (5 кодов)          → координаты не отправляются
 *   2. те же коды ещё раз             → дубликаты, isValid=false
 *   3. неполный слой (3 кода)         → координаты отправляются
 *   4. три слоя по 5 кодов            → полная коробка 15
 *   5. код не из задания              → отказ по списку задания
 *   6. codesInLayer строкой '5'       → текущий баг сравнения
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const GTIN = '04810272003892';
const CAMERA = 'Camera1';
const CODES_FILE = path.join(__dirname, 'codes-raw.txt');

const LAYERS = 3;
const CODES_PER_LAYER = 5;
const BOX_CAPACITY = 15;

function normalize(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (clean.includes('\x1D')) return clean;

  const head = clean.slice(0, 24);
  const mid = clean.slice(24, 30);
  const rest = clean.slice(30);
  if (mid !== '91FFD0' || !rest.startsWith('92')) return null;

  return `${head}\x1D${mid}\x1D${rest}`;
}

/** Гасит отладочный вывод приложения на время вызова */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalTime = console.time;
  const originalTimeEnd = console.timeEnd;

  console.time = () => undefined;
  console.timeEnd = () => undefined;
  console.log = (...args: any[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : ''))
      .join(' ');
    const isNoise =
      text.startsWith('==============extractProductCodesWithCoords') ||
      text.startsWith('productCodes') ||
      text.startsWith('productCoords') ||
      text.startsWith('duplicate_check_') ||
      text.startsWith('Детализация:');

    if (!isNoise) originalLog(...args);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.time = originalTime;
    console.timeEnd = originalTimeEnd;
  }
}

async function main() {
  // --- заглушка path.util (machineIdSync в песочнице падает) ---
  const stub = {
    getRecordsTextFilesDirectory: () => 'tmp/records-text',
    sha: 'stub',
  };
  const pathUtilId = require.resolve('src/path.util');
  require.cache[pathUtilId] = {
    id: pathUtilId,
    filename: pathUtilId,
    loaded: true,
    exports: stub,
  } as any;

  // --- модули проекта ---
  const { DataSource } = require('typeorm');
  const { CodeEntity } = require('src/code/code.entity');
  const { CodeRepository } = require('src/code/code.repository');
  const { CodeService } = require('src/code/code.service');
  const { CodeLayersService } = require('src/code/helpers/code-layers.service');

  const logger = {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  };

  const sendCoordinatesCalls: any[] = [];
  const appGateway = {
    sendCoordinates: (coords: any) => sendCoordinatesCalls.push(coords),
    sendProductCount: () => undefined,
    sendLogData: () => undefined,
    sendRootMessage: () => undefined,
  };

  const helperStub = {
    isCodeTask: (codes: string[], code: string) =>
      Array.isArray(codes) && codes.includes(code),
    handleValidationError: () => undefined,
  };

  // --- коды ---
  const allCodes = fs
    .readFileSync(CODES_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => normalize(line.trim()))
    .filter(Boolean);

  if (allCodes.length < 25) {
    throw new Error(
      `Нужно минимум 25 кодов в ${CODES_FILE}, найдено ${allCodes.length}`,
    );
  }

  const codes = allCodes.slice(0, 25);
  const fullLayer = codes.slice(0, 5);
  const nextLayer = codes.slice(5, 10);
  const threeLayers = codes.slice(5, 20);
  const outsideTask = codes[24];

  // --- БД ---
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [CodeEntity],
    synchronize: false,
  });
  await ds.initialize();

  // чистим только эти коды, чтобы дубликаты были предсказуемы
  await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
    codes,
  ]);

  const codeRepository = new CodeRepository(
    ds.manager,
    ds.getRepository(CodeEntity),
    logger,
  );

  const globalMonVar: any = {
    task: {
      gtin: GTIN,
      layers: String(LAYERS),
      layer1: String(CODES_PER_LAYER),
      layer2: String(CODES_PER_LAYER),
      layer3: String(CODES_PER_LAYER),
      codesInLayer: CODES_PER_LAYER,
      codes, // список допустимых кодов задания
    },
    taskName: 'layers-task.json',
    tableName: 'layers-2026_11_13_10_00_00',
    limitProductInBox: BOX_CAPACITY,
    limitBoxInPallet: 6,
    productCount: 0,
    boxCount: 0,
    palletCount: 0,
    currentBoxNumber: 1,
    currentPalletNumber: 1,
    productsInCurrentBox: 0,
    boxesInCurrentPallet: 0,
    isFirstBoxOdd: true,
    isMonitoring: true,
    isOldSorting: false,
    isPaused: false,
    codeStatus: null,
    circuitResetDelayTime: 0,
    konturTime: 0,
  };

  const layersService = new CodeLayersService(globalMonVar, logger);

  const service = new CodeService(
    codeRepository,
    ds.manager,
    { emit: () => undefined },
    appGateway,
    helperStub,
    { UpdateBoxNumber: async () => undefined },
    layersService,
    globalMonVar,
    logger,
  );

  const report = (title: string, result: any) => {
    console.log(`\n=== ${title} ===`);
    console.log(`isValid: ${result?.isValid}`);
    console.log(`кодов в результате: ${result?.codes?.length ?? 0}`);
    if (result?.isValid === false) {
      for (const bad of result.codes.slice(0, 5)) {
        console.log(`  отклонён: ${bad.reason} — ${bad.code.slice(0, 30)}…`);
      }
    }
    console.log(
      `sendCoordinates: ${sendCoordinatesCalls.length > 0 ? 'вызван' : 'не вызван'}` +
        (sendCoordinatesCalls.length
          ? ` (точек: ${sendCoordinatesCalls.at(-1)?.length ?? 0})`
          : ''),
    );
  };

  console.log('=== ЗАДАНИЕ ===');
  console.log(`слоёв: ${layersService.getTotalLayers()}`);
  console.log(`конфигурация слоёв: ${JSON.stringify(layersService.getLayersConfig())}`);
  console.log(`всего в коробке: ${layersService.calculateTotalExpectedProducts()}`);
  console.log(`кодов на слой (codesInLayer): ${globalMonVar.task.codesInLayer}`);
  console.log(`камера: ${CAMERA}`);

  // 1. полный слой
  let result = await quiet(() => service.ParseLayer(fullLayer, CAMERA));
  report('1. Полный слой: 5 кодов', result);

  // 2. те же коды ещё раз — дубликаты
  await ds.query(
    `INSERT INTO code_entity (code) VALUES ${fullLayer
      .map((_, index) => `($${index + 1})`)
      .join(', ')} ON CONFLICT (code) DO NOTHING`,
    fullLayer,
  );
  sendCoordinatesCalls.length = 0;
  result = await quiet(() => service.ParseLayer(fullLayer, CAMERA));
  report('2. Те же 5 кодов повторно (дубликаты)', result);

  // 3. неполный слой
  sendCoordinatesCalls.length = 0;
  result = await quiet(() =>
    service.ParseLayer(nextLayer.slice(0, 3), CAMERA),
  );
  report('3. Неполный слой: 3 кода из 5', result);

  // 4. три слоя по 5 — полная коробка 15
  sendCoordinatesCalls.length = 0;
  console.log('\n=== 4. Три слоя по 5 кодов (коробка 15) ===');
  let totalAccepted = 0;
  for (let layer = 0; layer < LAYERS; layer++) {
    const layerCodes = threeLayers.slice(
      layer * CODES_PER_LAYER,
      (layer + 1) * CODES_PER_LAYER,
    );
    const layerResult: any = await quiet(() =>
      service.ParseLayer(layerCodes, CAMERA),
    );
    totalAccepted += layerResult?.codes?.length ?? 0;

    const progress = layersService.getLayerProgress(totalAccepted);
    console.log(
      `  слой ${layer + 1}: принято ${layerResult?.codes?.length ?? 0}, ` +
        `всего ${totalAccepted}/${BOX_CAPACITY}, ` +
        `текущий слой ${progress.layerNumber} (${progress.codesInLayer}/${progress.expectedCodes}), ` +
        `sendCoordinates: ${sendCoordinatesCalls.length > 0 ? 'да' : 'нет'}`,
    );
    sendCoordinatesCalls.length = 0;
  }

  // 5. код не из задания
  globalMonVar.task.codes = codes.filter((code) => code !== outsideTask);
  sendCoordinatesCalls.length = 0;
  result = await quiet(() => service.ParseLayer([outsideTask], CAMERA));
  report('5. Код не из списка задания', result);

  // 6. codesInLayer строкой — свежие коды, без дубликатов
  const freshLayer = codes.slice(20, 25);
  globalMonVar.task.codes = freshLayer;
  globalMonVar.task.codesInLayer = String(CODES_PER_LAYER);
  sendCoordinatesCalls.length = 0;
  result = await quiet(() => service.ParseLayer(freshLayer, CAMERA));
  report("6. Полный слой, codesInLayer строкой '5'", result);

  console.log('\n=== ИТОГ ===');
  console.log(`всего кодов в наборе: ${codes.length}`);
  console.log(`коробка: ${BOX_CAPACITY} (${LAYERS} × ${CODES_PER_LAYER})`);
  console.log(
    'замечание: при codesInLayer строкой координаты уходят даже для полного слоя',
  );

  // убираем за собой: коды из общего реестра
  await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
    codes,
  ]);
  console.log('коды прогона удалены из code_entity');

  await ds.destroy();
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
