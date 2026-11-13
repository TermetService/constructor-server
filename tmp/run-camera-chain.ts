/**
 * Прогон реальной цепочки камеры на наборе кодов.
 *
 *   handleMessage2(raw, Camera1)
 *     → cameraBuffers
 *     → processCameraBuffer
 *     → processCompleteMessage
 *     → CodeService.ParseLayer(lines, Camera1)
 *     → CodeService.validateAndSaveCode(code, Camera1)
 *     → запись в таблицу задания
 *
 * Два режима загрузки (по умолчанию оба):
 *   --mode=full     камера присылает сразу 15 кодов (коробка за одно сообщение)
 *   --mode=partial  камера присылает по 5 кодов (слой за сообщение, 3 сообщения на коробку)
 *
 * Задание: 3 слоя по 5 кодов, коробка 15.
 *
 * Используется настоящая БД из .env и настоящие сервисы: CameraService,
 * CodeService, CodeHelperService, CodeRepository, NumberBoxETEService.
 * Заглушены только внешние вещи: принтер, socket-gateway, шаблоны, EventEmitter
 * и src/path.util (в песочнице machineIdSync падает).
 *
 * Формат сообщения камеры: пробел + коды через "@@" + таб.
 *
 * Запуск:  npm run test:camera
 *          npm run test:camera:full
 *          npm run test:camera:partial
 * Настройки: CODES_FILE, CODES_LIMIT (по умолчанию 200), ETE_SEED=0, KEEP_DB=1.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const STAMP = new Date()
  .toISOString()
  .slice(0, 19)
  .replace('T', '_')
  .replace(/[-:]/g, '_');

const CODES_FILE =
  process.env.CODES_FILE || path.join(__dirname, 'codes-220.txt');
const CODES_LIMIT = Number(process.env.CODES_LIMIT) || 200;

const GTIN = '04810272003892';
const LAYERS = 3;
const CODES_PER_LAYER = 5;
const BOX_CAPACITY = LAYERS * CODES_PER_LAYER; // 15
const LIMIT_BOX_IN_PALLET = 6;

type Mode = 'full' | 'partial';

/** Шум самого приложения: отладочные console.log/console.time — гасим на время вызова */
function isAppNoise(args: any[]): boolean {
  if (args.length === 1 && typeof args[0] === 'number') return true;
  return args.some(
    (a) =>
      typeof a === 'string' &&
      (a === '3256587' ||
        a === '1422222222' ||
        a.startsWith('-------------handleMessage') ||
        a.startsWith('-------------processCompleteMessage') ||
        a.startsWith('==============extractProductCodesWithCoords') ||
        a.startsWith('productCodes') ||
        a.startsWith('productCoords') ||
        a.startsWith('duplicate_check_') ||
        a.startsWith('Детализация:')),
  );
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalTime = console.time;
  const originalTimeEnd = console.timeEnd;

  console.time = () => undefined;
  console.timeEnd = () => undefined;
  console.log = (...args: any[]) => {
    if (!isAppNoise(args)) originalLog(...args);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.time = originalTime;
    console.timeEnd = originalTimeEnd;
  }
}

function normalize(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (clean.includes('\x1D')) return clean;

  const head = clean.slice(0, 24);
  const mid = clean.slice(24, 30);
  const rest = clean.slice(30);
  if (mid !== '91FFD0' || !rest.startsWith('92')) return null;

  return `${head}\x1D${mid}\x1D${rest}`;
}

/** Сообщение камеры: ведущий пробел, коды через "@@", завершающий таб */
function cameraMessage(codes: string[]): string {
  return ` ${codes.join('@@')}\t`;
}

function parseMode(): Mode | 'both' {
  const arg = process.argv.find((value) => value.startsWith('--mode='));
  const fromArg = arg?.split('=')[1];
  const value = (fromArg || process.env.MODE || 'both').toLowerCase();

  if (value === 'full' || value === 'partial' || value === 'both') return value;

  throw new Error(`Неизвестный режим "${value}": ожидается full, partial или both`);
}

function modeTitle(mode: Mode): string {
  return mode === 'full' ? '15 из 15 (коробка одним сообщением)' : '5 из 15 (по слою)';
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * Убирает результаты прошлых прогонов: тестовые таблицы камеры, коды из
 * code_entity и строки number_box_ete для этого GTIN.
 * KEEP_DB=1 — не удалять (чтобы посмотреть предыдущий прогон).
 */
async function cleanupPreviousRuns(ds: any, gtin: string) {
  if (process.env.KEEP_DB === '1') {
    console.log('KEEP_DB=1: очистка пропущена, данные прошлого прогона остаются');
    return;
  }

  const testTables: { table_name: string }[] = await ds.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'test-camera-%'`,
  );

  const codePrefix = `01${gtin}`;
  const beforeRows = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity WHERE code LIKE $1`,
    [`${codePrefix}%`],
  );
  await ds.query(`DELETE FROM code_entity WHERE code LIKE $1`, [
    `${codePrefix}%`,
  ]);

  await ds.query(`DELETE FROM number_box_ete WHERE gtin = $1`, [gtin]);

  // сначала _task (у неё может быть FK на основную), потом основную
  for (const table of testTables.sort((a, b) =>
    b.table_name.localeCompare(a.table_name),
  )) {
    await ds.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
  }

  console.log('=== ОЧИСТКА ПРОШЛОГО ПРОГОНА ===');
  console.log(`удалено тестовых таблиц:        ${testTables.length}`);
  console.log(
    `удалено кодов из code_entity:   ${beforeRows?.[0]?.c ?? 0} (префикс ${codePrefix})`,
  );
  console.log(`удалены строки number_box_ete:  ${gtin}`);
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
  const { CameraService } = require('src/camera/camera.service');
  const { CameraNames } = require('src/camera/types');
  const { CodeTablesService } = require('src/code/helpers/code-tables.service');
  const { CodeCountsService } = require('src/code/helpers/code-counts.service');
  const { CodeSaveService } = require('src/code/helpers/code-save.service');
  const { CodeLabelsService } = require('src/code/helpers/code-labels.service');
  const { CodeReportsService } = require('src/code/helpers/code-reports.service');
  const { CodeScanService } = require('src/code/helpers/code-scan.service');
  const { CodeWeightsService } = require('src/code/helpers/code-weights.service');
  const { CodeRemoteService } = require('src/code/helpers/code-remote.service');
  const { CodeLayersService } = require('src/code/helpers/code-layers.service');

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
  await cleanupPreviousRuns(ds, GTIN);

  // --- коды ---
  const rawCodes = fs
    .readFileSync(CODES_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const normalized: string[] = [];
  const malformed: string[] = [];
  for (const raw of rawCodes) {
    const value = normalize(raw);
    if (value) normalized.push(value);
    else malformed.push(raw);
  }

  const unique = Array.from(new Set(normalized));

  if (unique.length < CODES_LIMIT) {
    throw new Error(
      `Нужно ${CODES_LIMIT} уникальных кодов в ${CODES_FILE}, найдено ${unique.length}`,
    );
  }

  const codes = unique.slice(0, CODES_LIMIT);
  const modes = parseMode();

  console.log('=== ПАРАМЕТРЫ ПРОГОНА ===');
  console.log(`файл кодов:              ${CODES_FILE}`);
  console.log(
    `кодов:                   ${rawCodes.length} (нормализовано ${normalized.length}, уникальных ${unique.length}, битых ${malformed.length})`,
  );
  console.log(`в прогоне:               ${codes.length}`);
  console.log(`камера:                  ${CameraNames.Camera1}`);
  console.log(`слоёв:                   ${LAYERS} (${JSON.stringify([CODES_PER_LAYER, CODES_PER_LAYER, CODES_PER_LAYER])})`);
  console.log(`в коробке:               ${BOX_CAPACITY}`);
  console.log(`limitBoxInPallet:        ${LIMIT_BOX_IN_PALLET}`);
  console.log(`стартовая паллета:       зависит от flagInpallet в code.service.ts`);
  console.log(`формат сообщения:        " коды через @@ \\t"`);
  console.log(`режимы:                  ${modes === 'both' ? 'full + partial' : modes}`);
  console.log('');

  const results: any[] = [];

  /** Один сценарий: свой tableName, своё состояние, свой набор сообщений */
  const runMode = async (mode: Mode, tableName: string, dateTask: string) => {
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: () => undefined,
    };

    const sendCoordinatesCalls: any[][] = [];
    const gateway = {
      sendCoordinates: (coords: any) => sendCoordinatesCalls.push(coords),
      sendProductCount: () => undefined,
      sendLogData: () => undefined,
      sendRootMessage: () => undefined,
      sendRootMessage2: () => undefined,
      sendCameraConnectionStatus: () => undefined,
    };
    const templateService = { getAll: async () => [] };
    const printerService = {
      printBoxLabel: async () => undefined,
      printPalletLabel: async () => undefined,
    };
    const eventEmitter = { emit: () => undefined };

    const globalMonVar: any = {
      task: {
        gtin: GTIN,
        layers: String(LAYERS),
        layer1: String(CODES_PER_LAYER),
        layer2: String(CODES_PER_LAYER),
        layer3: String(CODES_PER_LAYER),
        codesInLayer: CODES_PER_LAYER,
        codes: codes,
        batch: `test-camera-${mode}`,
        date_manufacture: dateTask,
        date_expiration: '01.01.2027',
        pieces_per_package: BOX_CAPACITY,
        packaging_per_pallet: LIMIT_BOX_IN_PALLET,
        startCorob: '1',
        startPallet: '1',
      },
      taskName: `test-camera-${mode}.json`,
      tableName,
      codeStatus: null,
      boxNumber: 0,
      palletNumber: 0,
      limitProductInBox: BOX_CAPACITY,
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

    // --- ETE ---
    const eteRepository = new NumberBoxETEService(
      ds.getRepository(numberBoxETE),
    );
    const readEte = async () => {
      const rows = await ds.query(
        `SELECT "BoxNumber", "PalletNumber" FROM number_box_ete WHERE gtin = $1 AND "DateTask" = $2`,
        [GTIN, dateTask],
      );
      return rows[0];
    };
    const numberBoxEte = {
      AddNoteAndTook: (gtin: any, value: any) =>
        eteRepository.AddNoteAndTook(gtin, value),
      UpdateBoxNumber: async (gtin: any, boxNumber: any, value: any) => {
        const before = await readEte();
        await eteRepository.UpdateBoxNumber(gtin, boxNumber, value);
        const after = await readEte();

        if (!after) {
          console.log(
            `  [ETE] UpdateBoxNumber(box=${boxNumber}): строки нет — update молча обновил 0 строк`,
          );
          return;
        }
        console.log(
          `  [ETE] UpdateBoxNumber(box=${boxNumber}): BoxNumber ${before?.BoxNumber} → ${after.BoxNumber}`,
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

    const service: any = new CodeService(
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

    service.setLastUsedBoxNumber(0);
    service.lastUsedPalletNumber = 0;
    service.countBox = LIMIT_BOX_IN_PALLET;

    const camera: any = new CameraService(
      { findOne: async () => undefined },
      gateway,
      service,
      { getClientPortByCamera: () => '3000' },
      logger,
      globalMonVar,
    );

    // --- перехват результатов цепочки ---
    const parseResults: any[] = [];
    const originalParse = service.ParseLayer.bind(service);
    service.ParseLayer = async (lines: string[], name: string) => {
      const result = await originalParse(lines, name);
      parseResults.push({
        camera: name,
        lines: lines.length,
        isValid: result?.isValid,
        accepted: result?.isValid ? (result.codes?.length ?? 0) : 0,
        rejected: result?.isValid === false ? result.codes.length : 0,
        coords: sendCoordinatesCalls.length,
      });
      return result;
    };

    const pendingSaves: Promise<any>[] = [];
    const originalValidate = service.validateAndSaveCode.bind(service);
    service.validateAndSaveCode = (code: string, name: string) => {
      const promise = originalValidate(code, name);
      pendingSaves.push(promise);
      return promise;
    };

    console.log(`\n${'='.repeat(70)}`);
    console.log(`РЕЖИМ ${mode}: ${modeTitle(mode)}`);
    console.log(`таблица: ${tableName}`);
    console.log(`${'='.repeat(70)}`);

    // коды из code_entity чистим, чтобы второй режим не считал их дубликатами
    await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
      codes,
    ]);

    await helper.initializeTables();

    if (process.env.ETE_SEED === '0') {
      console.log('ETE_SEED=0: строку не создаём');
    } else {
      const created = await numberBoxEte.AddNoteAndTook(GTIN, dateTask);
      console.log(`AddNoteAndTook(${GTIN}, ${dateTask}) → BoxNumber=${created}`);
    }

    const rowCount = async (): Promise<number> => {
      try {
        const result = await ds.query(
          `SELECT COUNT(*)::int AS c FROM "${tableName}"`,
        );
        return result[0].c;
      } catch {
        return 0;
      }
    };

    const size = mode === 'full' ? BOX_CAPACITY : CODES_PER_LAYER;
    const messages = chunk(codes, size);

    let accepted = 0;
    let rejected = 0;
    let failed = 0;
    let prevBox: number | null = null;

    console.log(`\n=== ПРОГОН (${messages.length} сообщений по ${size} кодов) ===`);

    for (let index = 0; index < messages.length; index++) {
      const batch = messages[index];
      sendCoordinatesCalls.length = 0;
      const before = await rowCount();
      const expectedParses = parseResults.length + 1;

      try {
        await quiet(async () => {
          camera.handleMessage2(cameraMessage(batch), CameraNames.Camera1);

          for (let attempt = 0; attempt < 200; attempt++) {
            if (parseResults.length >= expectedParses) break;
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          await Promise.all(pendingSaves.splice(0));
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      } catch (error: any) {
        failed++;
        console.error(`  #${index + 1}: ошибка ${error?.message ?? error}`);
        continue;
      }

      const after = await rowCount();
      const parsed = parseResults.at(-1);
      const state = service.cameraStates?.Camera1;
      const box = service.lastUsedBoxNumber;

      if (parsed?.isValid) accepted += parsed.accepted;
      else rejected += parsed?.rejected ?? 0;

      const boxChanged = box !== prevBox;
      prevBox = box;

      console.log(
        `  #${String(index + 1).padStart(2, '0')}: ${batch.length} кодов, ` +
          `isValid=${parsed?.isValid}, принято ${parsed?.accepted}, отклонено ${parsed?.rejected}, ` +
          `коорд: ${sendCoordinatesCalls.length ? sendCoordinatesCalls.at(-1)?.length : 0}, ` +
          `строк ${before} → ${after}, ` +
          `коробка ${box} (${state?.currectProductInBox}/${BOX_CAPACITY})` +
          (boxChanged ? ' ← новая коробка' : ''),
      );
    }

    const total = await rowCount();
    const boxes = await ds.query(
      `SELECT box_number, pallet_number, count(*)::int AS codes FROM "${tableName}" GROUP BY box_number, pallet_number ORDER BY box_number`,
    );
    const ete = await readEte();

    console.log(`\n=== ИТОГ РЕЖИМА ${mode} ===`);
    console.log(
      `сообщений ${messages.length}, принято ${accepted}, отклонено ${rejected}, ошибок ${failed}, строк ${total}`,
    );
    console.log(
      `коробок: ${boxes.length}, последняя: ${boxes.at(-1)?.box_number} (${boxes.at(-1)?.codes} кодов)`,
    );
    console.log(
      `состояние: productCount=${globalMonVar.productCount}, productsInCurrentBox=${globalMonVar.productsInCurrentBox}, boxCount=${globalMonVar.boxCount}, palletCount=${globalMonVar.palletCount}`,
    );
    console.log(
      `lastUsedBoxNumber=${service.lastUsedBoxNumber}, ETE BoxNumber=${ete?.BoxNumber}`,
    );
    console.table(boxes);

    results.push({
      mode,
      tableName,
      messages: messages.length,
      size,
      accepted,
      rejected,
      failed,
      rows: total,
      boxes: boxes.length,
      eteBox: ete?.BoxNumber,
    });
  };

  const modesToRun: Mode[] =
    modes === 'both' ? ['full', 'partial'] : [modes as Mode];

  const dates: Record<Mode, string> = {
    full: '01.02.2026',
    partial: '01.01.2026',
  };

  for (const mode of modesToRun) {
    const tableName = `test-camera-${STAMP}-${mode}`;
    await runMode(mode, tableName, dates[mode]);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('=== ОБЩИЙ ИТОГ ===');
  console.table(results);

  const eteRows = await ds.query(
    `SELECT gtin, "BoxNumber", "PalletNumber", "DateTask" FROM number_box_ete WHERE gtin = $1 ORDER BY "DateTask"`,
    [GTIN],
  );
  console.log('=== NumberBoxETE ===');
  console.table(eteRows);

  const codeEntity = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity WHERE code LIKE $1`,
    [`01${GTIN}%`],
  );
  console.log(`code_entity строк по этому GTIN: ${codeEntity[0].c}`);

  await ds.destroy();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
