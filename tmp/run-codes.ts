/**
 * Прогон реального CodeService.validateAndSaveCode на наборе кодов.
 *
 * Используется настоящая БД из .env и настоящие сервисы:
 * CodeService, CodeHelperService, CodeRepository, NumberBoxETEService.
 * Заглушены только внешние вещи: принтер, socket-gateway, шаблоны, EventEmitter
 * и src/path.util (в песочнице machineIdSync падает).
 *
 * Запуск:  npm run test:codes
 * Настройки: переменные окружения CODES_FILE, ETE_SEED=0.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const TABLE = `test-${new Date()
  .toISOString()
  .slice(0, 19)
  .replace('T', '_')
  .replace(/[-:]/g, '_')}`;

const CODES_FILE =
  process.env.CODES_FILE || path.join(__dirname, 'codes-220.txt');

/** Шум самого приложения: отладочные console.log/console.time — гасим на время вызова */
function isAppNoise(args: any[]): boolean {
  if (args.length === 1 && typeof args[0] === 'number') return true; // console.log(counter)
  return args.some(
    (a) =>
      typeof a === 'string' &&
      (a === '3256587' ||
        a === '1422222222' ||
        a.startsWith('duplicate_check_') ||
        a.startsWith('Детализация:')),
  );
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = (...args: any[]) => {
    if (!isAppNoise(args)) original(...args);
  };
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

function normalize(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (clean.includes('\x1D')) return clean;

  const head = clean.slice(0, 24); // 01 + gtin(14) + 21 + serial(6)
  const mid = clean.slice(24, 30); // 91FFD0
  const rest = clean.slice(30); // 92 + payload
  if (mid !== '91FFD0' || !rest.startsWith('92')) return null;

  return `${head}\x1D${mid}\x1D${rest}`;
}

/**
 * Убирает результаты прошлых прогонов: тестовые таблицы, коды из code_entity
 * и строку number_box_ete для этого GTIN/даты.
 * KEEP_DB=1 — не удалять (чтобы посмотреть предыдущий прогон).
 */
async function cleanupPreviousRuns(ds: any, gtin: string, dateTask: string) {
  if (process.env.KEEP_DB === '1') {
    console.log('KEEP_DB=1: очистка пропущена, данные прошлого прогона остаются');
    return;
  }

  const testTables: { table_name: string }[] = await ds.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name ~ '^test-[0-9]{4}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}(_task)?$'`,
  );

  const codePrefix = `01${gtin}`;
  const beforeRows = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity WHERE code LIKE $1`,
    [`${codePrefix}%`],
  );
  await ds.query(`DELETE FROM code_entity WHERE code LIKE $1`, [
    `${codePrefix}%`,
  ]);

  await ds.query(`DELETE FROM number_box_ete WHERE gtin = $1 AND "DateTask" = $2`, [
    gtin,
    dateTask,
  ]);

  for (const table of testTables) {
    await ds.query(`DROP TABLE IF EXISTS "${table.table_name}"`);
  }

  console.log('=== ОЧИСТКА ПРОШЛОГО ПРОГОНА ===');
  console.log(`удалено тестовых таблиц:        ${testTables.length}`);
  console.log(
    `удалено кодов из code_entity:   ${beforeRows?.[0]?.c ?? 0} (префикс ${codePrefix})`,
  );
  console.log(`удалена строка number_box_ete:  ${gtin} / ${dateTask}`);
  console.log('');
}

async function main() {
  // --- заглушка path.util (machineIdSync в песочнице падает) ---
  const pathStub = {
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
  };
  const pathUtilId = require.resolve('src/path.util');
  require.cache[pathUtilId] = {
    id: pathUtilId,
    filename: pathUtilId,
    loaded: true,
    exports: pathStub,
  } as any;

  // --- модули проекта (только после заглушки) ---
  const { DataSource } = require('typeorm');
  const { CodeEntity } = require('src/code/code.entity');
  const { numberBoxETE } = require('src/NumberBoxETE/numberBoxETE.entity');
  const { NumberBoxETEService } = require('src/NumberBoxETE/numberBoxETE.service');
  const { CodeRepository } = require('src/code/code.repository');
  const { CodeHelperService } = require('src/code/code-helper.service');
  const { CodeService } = require('src/code/code.service');
  const { CodeTablesService } = require('src/code/helpers/code-tables.service');
  const { CodeCountsService } = require('src/code/helpers/code-counts.service');
  const { CodeSaveService } = require('src/code/helpers/code-save.service');
  const { CodeLabelsService } = require('src/code/helpers/code-labels.service');
  const { CodeReportsService } = require('src/code/helpers/code-reports.service');
  const { CodeScanService } = require('src/code/helpers/code-scan.service');
  const { CodeWeightsService } = require('src/code/helpers/code-weights.service');
  const { CodeRemoteService } = require('src/code/helpers/code-remote.service');
  const { CodeLayersService } = require('src/code/helpers/code-layers.service');

  const logger = {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: (...args: any[]) =>
      console.error(
        '  [app]',
        args.map((a) => (a instanceof Error ? a.message : a)).join(' '),
      ),
  };

  const gateway = {
    sendProductCount: () => undefined,
    sendLogData: () => undefined,
    sendRootMessage: () => undefined,
    sendRootMessage2: () => undefined,
    sendCoordinates: () => undefined,
  };
  const templateService = { getAll: async () => [] };
  const printerService = {
    printBoxLabel: async (...args: any[]) =>
      console.log(`  [принтер] printBoxLabel(${args.join(', ')})`),
    printPalletLabel: async (...args: any[]) =>
      console.log(`  [принтер] printPalletLabel(${args.join(', ')})`),
  };
  const eventEmitter = { emit: () => undefined };

  const GTIN = '04810272003892';
  const DATE_TASK = '01.01.2026';
  const LIMIT_PRODUCT_IN_BOX = 5;
  const LIMIT_BOX_IN_PALLET = 6;

  const globalMonVar: any = {
    task: {
      gtin: GTIN,
      codes: [],
      batch: 'test',
      date_manufacture: DATE_TASK,
      date_expiration: '01.01.2027',
      pieces_per_package: LIMIT_PRODUCT_IN_BOX,
      packaging_per_pallet: LIMIT_BOX_IN_PALLET,
    },
    taskName: 'test-task.json',
    tableName: TABLE,
    codeStatus: null,
    boxNumber: 0,
    palletNumber: 0,
    limitProductInBox: LIMIT_PRODUCT_IN_BOX,
    limitBoxInPallet: LIMIT_BOX_IN_PALLET,
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
    circuitResetDelayTime: 0,
    konturTime: 0,
  };

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [CodeEntity, numberBoxETE],
    synchronize: false,
  });
  await ds.initialize();
  await cleanupPreviousRuns(ds, GTIN, DATE_TASK);

  // --- реальный NumberBoxETEService с логом каждого вызова ---
  const eteRepository = new NumberBoxETEService(ds.getRepository(numberBoxETE));
  const readEte = async () => {
    const rows = await ds.query(
      `SELECT "BoxNumber", "PalletNumber" FROM number_box_ete WHERE gtin = $1 AND "DateTask" = $2`,
      [GTIN, DATE_TASK],
    );
    return rows[0];
  };

  const numberBoxEte = {
    AddNoteAndTook: (gtin: any, dateTask: any) =>
      eteRepository.AddNoteAndTook(gtin, dateTask),
    UpdateBoxNumber: async (gtin: any, boxNumber: any, dateTask: any) => {
      const before = await readEte();
      await eteRepository.UpdateBoxNumber(gtin, boxNumber, dateTask);
      const after = await readEte();

      if (!after) {
        console.log(
          `  [ETE] UpdateBoxNumber(box=${boxNumber}): строки нет — update молча обновил 0 строк (TypeORM ошибку не бросает)`,
        );
        return;
      }
      console.log(
        `  [ETE] UpdateBoxNumber(box=${boxNumber}): BoxNumber ${before?.BoxNumber} → ${after.BoxNumber}, PalletNumber ${before?.PalletNumber} → ${after.PalletNumber}`,
      );
    },
  };

  const repository = new CodeRepository(
    ds.manager,
    ds.getRepository(CodeEntity),
    logger,
  );
  const tables = new CodeTablesService(
    ds.manager,
    repository,
    globalMonVar,
    logger,
  );
  const layers = new CodeLayersService(globalMonVar, logger);

  const helper = new CodeHelperService(
    tables,
    new CodeCountsService(repository, gateway, tables, globalMonVar, logger),
    new CodeSaveService(repository, globalMonVar, logger),
    new CodeLabelsService(
      ds.manager,
      templateService,
      printerService,
      globalMonVar,
      logger,
    ),
    new CodeReportsService(
      ds.manager,
      repository,
      templateService,
      globalMonVar,
      logger,
    ),
    new CodeScanService(globalMonVar, logger),
    new CodeWeightsService(ds.manager, repository, globalMonVar, logger),
    new CodeRemoteService(logger),
    layers,
    gateway,
    globalMonVar,
    logger,
  );
  const service = new CodeService(
    repository,
    ds.manager,
    eventEmitter,
    gateway,
    helper,
    numberBoxEte,
    layers,
    globalMonVar,
    logger,
  );

  // initCamera делает ++lastUsedBoxNumber → 1
  (service as any).setLastUsedBoxNumber(0);
  // при flagInpallet=false initCamera делает ++lastUsedPalletNumber → 1
  (service as any).lastUsedPalletNumber = 0;
  (service as any).countBox = LIMIT_BOX_IN_PALLET;

  // --- коды ---
  const rawCodes = fs
    .readFileSync(CODES_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const codes: string[] = [];
  const malformed: string[] = [];
  for (const raw of rawCodes) {
    const normalized = normalize(raw);
    if (normalized) codes.push(normalized);
    else malformed.push(raw);
  }

  console.log('=== ПАРАМЕТРЫ ПРОГОНА ===');
  console.log(`таблица:                 ${TABLE}`);
  console.log(`файл кодов:              ${CODES_FILE}`);
  console.log(
    `кодов:                   ${rawCodes.length} (нормализовано ${codes.length}, битых ${malformed.length})`,
  );
  console.log(`limitProductInBox:       ${LIMIT_PRODUCT_IN_BOX}`);
  console.log(`limitBoxInPallet:        ${LIMIT_BOX_IN_PALLET}`);
  console.log(`countBox:                ${LIMIT_BOX_IN_PALLET}`);
  console.log(`стартовый box:           1`);
  console.log(`стартовая паллета:       зависит от flagInpallet в code.service.ts`);
  console.log(`вес (UpdateStateCamera): 0`);
  console.log('');

  globalMonVar.task.codes = codes;

  await helper.initializeTables();
  console.log(`=== ТАБЛИЦЫ ===\n${TABLE}, ${TABLE}_task\n`);

  // --- ETE: приложение не вызывает AddNoteAndTook, поэтому в тесте создаём строку явно ---
  console.log('=== NumberBoxETE ===');
  if (process.env.ETE_SEED === '0') {
    console.log('ETE_SEED=0: строку не создаём, update должен тихо обновить 0 строк');
  } else {
    const created = await numberBoxEte.AddNoteAndTook(GTIN, DATE_TASK);
    console.log(`AddNoteAndTook(${GTIN}, ${DATE_TASK}) → BoxNumber=${created}`);
  }
  console.log('');

  console.log('=== ПРОГОН ===');
  let accepted = 0;
  let rejected = 0;
  let failed = 0;
  let prevBox: number = null;
  let prevPallet: number = null;

  for (let i = 0; i < codes.length; i++) {
    let result: any;
    try {
      result = await quiet(() =>
        service.validateAndSaveCode(codes[i], 'Camera1'),
      );
    } catch (err: any) {
      failed++;
      console.error(`  #${i + 1}: ошибка ${err?.message ?? err}`);
      continue;
    }

    if (result) {
      accepted++;
    } else {
      rejected++;
      console.log(`  #${i + 1}: ОТКЛОНЁН (дубликат)`);
    }

    const state = (service as any).cameraStates?.Camera1;
    const box = (service as any).lastUsedBoxNumber;
    const pallet = state?.UsedPalletNumber;

    if (box !== prevBox || pallet !== prevPallet) {
      console.log(
        `  #${i + 1}: коробка ${prevBox ?? '—'} → ${box}, паллета ${prevPallet ?? '—'} → ${pallet}`,
      );
      prevBox = box;
      prevPallet = pallet;
    } else if ((i + 1) % 10 === 0) {
      console.log(
        `  #${i + 1}: коробка ${box}, паллета ${pallet}, кодов в коробке ${state?.currectProductInBox}`,
      );
    }
  }

  console.log(
    `\nИтог: принято ${accepted}, отклонено ${rejected}, ошибок ${failed}\n`,
  );

  console.log('=== СОСТОЯНИЕ В ПАМЯТИ ===');
  console.log('globalMonVar:', {
    productCount: globalMonVar.productCount,
    productsInCurrentBox: globalMonVar.productsInCurrentBox,
    boxCount: globalMonVar.boxCount,
    palletCount: globalMonVar.palletCount,
    currentBoxNumber: globalMonVar.currentBoxNumber,
    currentPalletNumber: globalMonVar.currentPalletNumber,
    boxesInCurrentPallet: globalMonVar.boxesInCurrentPallet,
  });
  console.log('lastUsedBoxNumber:', (service as any).lastUsedBoxNumber);
  console.log('cameraState:', (service as any).cameraStates?.Camera1);
  console.log('');

  console.log('=== БАЗА ===');
  const total = await ds.query(`SELECT count(*)::int AS c FROM "${TABLE}"`);
  const byBox = await ds.query(
    `SELECT box_number, pallet_number, count(*)::int AS codes FROM "${TABLE}" GROUP BY box_number, pallet_number ORDER BY box_number`,
  );
  const byPallet = await ds.query(
    `SELECT pallet_number, count(DISTINCT box_number)::int AS boxes, count(*)::int AS codes FROM "${TABLE}" GROUP BY pallet_number ORDER BY pallet_number`,
  );
  const codeEntity = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity`,
  );
  const sample = await ds.query(
    `SELECT id, box_number, pallet_number, camera_name FROM "${TABLE}" ORDER BY id LIMIT 5`,
  );

  console.log(`строк в "${TABLE}": ${total[0].c}`);
  console.table(byBox);
  console.log('по паллетам:');
  console.table(byPallet);
  console.table(sample);
  console.log('code_entity строк:', codeEntity[0].c);

  console.log('=== NumberBoxETE после прогона ===');
  console.table(await ds.query(`SELECT * FROM number_box_ete ORDER BY id`));

  await ds.destroy();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
