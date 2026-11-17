/**
 * Послойный прогон через реальный вход камеры — с трассировкой вызовов.
 *
 *   handleMessage2(raw, Camera1)
 *     → cameraBuffers → processCameraBuffer → processCompleteMessage
 *     → ParseLayer(lines, "Камера 1")          — только разбор, БЕЗ записи
 *     → validateAndSaveCode(code, camera)      — вот здесь сохранение:
 *         initCamera → UpdateStateCamera → saveCode →
 *         CodeHelperService.saveCode → CodeRepository.saveCodeToDatabase → INSERT
 *
 * Режимы (как в test:camera):
 *   --mode=full     по 15 кодов в сообщении (коробка 15 из 15)
 *   --mode=partial  по 5 кодов в сообщении (слой 5 из 15)
 *   --mode=both     оба режима (по умолчанию)
 *
 * Подробная цепочка печатается для первого сообщения режима,
 * дальше — одна строка на сообщение, чтобы 116 кодов не утонули в логе.
 *
 * Запуск: npm run test:layers
 *          npm run test:layers -- --mode=full
 *          npm run test:layers -- --mode=partial
 * Настройки: CODES_FILE, CODES_LIMIT=116, ETE_SEED=0, KEEP_DB=1.
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
const CODES_LIMIT = Number(process.env.CODES_LIMIT) || 116;

const GTIN = '04810272003892';
const LAYERS = 3;
const CODES_PER_LAYER = 5;
const BOX_CAPACITY = LAYERS * CODES_PER_LAYER; // 15
const LIMIT_BOX_IN_PALLET = 6;
const CAMERA = 'Camera1';

const DATES = { full: '01.02.2026', partial: '01.01.2026' };

type Mode = 'full' | 'partial';

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

const short = (code: string) => `${code.slice(0, 16)}…${code.slice(-6)}`;

const step = (indent: number, message: string) =>
  console.log(`${'  '.repeat(indent)}${message}`);

/** Сообщение камеры: ведущий пробел, коды через "@@", завершающий таб */
const cameraMessage = (codes: string[]) => ` ${codes.join('@@')}\t`;

function parseMode(): Mode | 'both' {
  const arg = process.argv.find((value) => value.startsWith('--mode='));
  const value = (arg?.split('=')[1] || process.env.MODE || 'both').toLowerCase();

  if (value === 'full' || value === 'partial' || value === 'both') return value;

  throw new Error(`Неизвестный режим "${value}": full, partial или both`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function cleanupPreviousRuns(ds: any, gtin: string) {
  if (process.env.KEEP_DB === '1') {
    console.log('KEEP_DB=1: очистка пропущена');
    return;
  }

  const tables: { table_name: string }[] = await ds.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'test-layer-%'`,
  );

  const codePrefix = `01${gtin}`;
  const before = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity WHERE code LIKE $1`,
    [`${codePrefix}%`],
  );
  await ds.query(`DELETE FROM code_entity WHERE code LIKE $1`, [
    `${codePrefix}%`,
  ]);
  await ds.query(`DELETE FROM number_box_ete WHERE gtin = $1`, [gtin]);

  for (const table of tables.sort((a, b) =>
    b.table_name.localeCompare(a.table_name),
  )) {
    await ds.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
  }

  console.log('=== ОЧИСТКА ПРОШЛОГО ПРОГОНА ===');
  console.log(`удалено таблиц: ${tables.length}`);
  console.log(
    `удалено кодов из code_entity: ${before?.[0]?.c ?? 0} (префикс ${codePrefix})`,
  );
  console.log(`удалены строки number_box_ete: ${gtin}`);
  console.log('');
}

async function main() {
  // --- заглушка path.util ---
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

  const { DataSource } = require('typeorm');
  const { CodeEntity } = require('src/code/code.entity');
  const { numberBoxETE } = require('src/NumberBoxETE/numberBoxETE.entity');
  const { NumberBoxETEService } = require('src/NumberBoxETE/numberBoxETE.service');
  const { CodeRepository } = require('src/code/code.repository');
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
  const { CodeCameraStateService } = require('src/code/helpers/code-camera-state.service');

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

  const normalized = rawCodes
    .map((raw) => normalize(raw))
    .filter((code): code is string => Boolean(code));
  const unique = Array.from(new Set(normalized));

  if (unique.length < CODES_LIMIT) {
    throw new Error(
      `Нужно ${CODES_LIMIT} уникальных кодов, найдено ${unique.length}`,
    );
  }

  const codes = unique.slice(0, CODES_LIMIT);
  const modes = parseMode();
  const modesToRun: Mode[] = modes === 'both' ? ['full', 'partial'] : [modes];

  console.log('=== ПАРАМЕТРЫ ===');
  console.log(`файл кодов:      ${CODES_FILE}`);
  console.log(`кодов в прогоне: ${codes.length}`);
  console.log(`камера:          ${CameraNames.Camera1}`);
  console.log(`слоёв:           ${LAYERS} по ${CODES_PER_LAYER}`);
  console.log(`в коробке:       ${BOX_CAPACITY}`);
  console.log(`режимы:          ${modes === 'both' ? 'full + partial' : modes}`);
  console.log(`формат:          " коды через @@ \\t"`);
  console.log('');

  const results: any[] = [];

  const runScenario = async (mode: Mode) => {
    const table = `test-layer-${STAMP}-${mode}`;
    const dateTask = DATES[mode];
    const size = mode === 'full' ? BOX_CAPACITY : CODES_PER_LAYER;

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
        codes,
        batch: `test-layer-${mode}`,
        date_manufacture: dateTask,
        date_expiration: '01.01.2027',
        pieces_per_package: BOX_CAPACITY,
        packaging_per_pallet: LIMIT_BOX_IN_PALLET,
        startCorob: '1',
        startPallet: '1',
      },
      taskName: `test-layer-${mode}.json`,
      tableName: table,
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

    const rowCount = async (): Promise<number> => {
      const result = await ds.query(
        `SELECT count(*)::int AS c FROM "${table}"`,
      );
      return result[0].c;
    };

    const byBox = async () =>
      ds.query(
        `SELECT box_number, pallet_number, count(*)::int AS codes FROM "${table}" GROUP BY box_number, pallet_number ORDER BY box_number`,
      );

    const readEte = async () => {
      const rows = await ds.query(
        `SELECT "BoxNumber" FROM number_box_ete WHERE gtin = $1 AND "DateTask" = $2`,
        [GTIN, dateTask],
      );
      return rows[0];
    };

    const eteRepository = new NumberBoxETEService(
      ds.getRepository(numberBoxETE),
    );
    const numberBoxEte = {
      AddNoteAndTook: (gtin: any, value: any) =>
        eteRepository.AddNoteAndTook(gtin, value),
      UpdateBoxNumber: async (gtin: any, boxNumber: any, value: any) => {
        const before = await readEte();
        await eteRepository.UpdateBoxNumber(gtin, boxNumber, value);
        const after = await readEte();
        log(
          4,
          `[ETE] BoxNumber ${before?.BoxNumber ?? '—'} → ${after?.BoxNumber ?? '—'}`,
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

    const cameraState = new CodeCameraStateService();
    const counts = new CodeCountsService(
      repository,
      gateway,
      tables,
      cameraState,
      globalMonVar,
      logger,
    );
    const saveCodes = new CodeSaveService(repository, globalMonVar, logger);
    const labels = new CodeLabelsService(
      ds.manager,
      templateService,
      printerService,
      globalMonVar,
      logger,
    );

    const service: any = new CodeService(
      repository,
      ds.manager,
      eventEmitter,
      gateway,
      { check: async () => ({ ok: true }) } as any,
      tables,
      saveCodes,
      labels,
      counts,
      cameraState,
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

    // --- трассировка: подробно только там, где нужно ---
    let verbose = false;
    const log = (indent: number, message: string) => {
      if (verbose) step(indent, message);
    };

    const parseResults: any[] = [];
    const originalParse = service.ParseLayer.bind(service);
    service.ParseLayer = async (lines: string[], name: string) => {
      log(2, `ParseLayer([${lines.length} кодов], "${name}")`);
      const result = await originalParse(lines, name);

      log(
        3,
        `← isValid=${result?.isValid}, кодов ${result?.codes?.length ?? 0}, координаты ${sendCoordinatesCalls.length ? 'отправлены' : 'нет'}`,
      );
      log(
        3,
        `строк в таблице после ParseLayer: ${await rowCount()} (без записи)`,
      );

      parseResults.push({
        isValid: result?.isValid,
        accepted: result?.isValid ? (result.codes?.length ?? 0) : 0,
        rejected: result?.isValid === false ? result.codes.length : 0,
      });
      return result;
    };

    const pendingSaves: Promise<any>[] = [];
    const originalValidate = service.validateAndSaveCode.bind(service);
    service.validateAndSaveCode = (code: string, name: string) => {
      const promise = (async () => {
        const result = await originalValidate(code, name);
        log(
          3,
          `← validateAndSaveCode(${short(code)}) → ${JSON.stringify(result)}`,
        );
        return result;
      })();
      pendingSaves.push(promise);
      return promise;
    };

    const originalInitCamera = service.initCamera.bind(service);
    service.initCamera = async (name: string) => {
      log(3, `→ initCamera("${name}")`);
      const result = await originalInitCamera(name);
      const state = service.cameraStates?.[name];
      log(
        4,
        `← камера: box=${state?.UsedBoxNumber}, pallet=${state?.UsedPalletNumber}`,
      );
      return result;
    };

    const originalUpdateState = service.UpdateStateCamera.bind(service);
    service.UpdateStateCamera = async (name: string, weight: number) => {
      const before = service.cameraStates?.[name]?.currectProductInBox;
      const result = await originalUpdateState(name, weight);
      const state = service.cameraStates?.[name];
      log(
        4,
        `→ UpdateStateCamera("${name}", ${weight}): в коробке ${before} → ${state?.currectProductInBox}`,
      );
      return result;
    };

    const originalSaveCode = service.saveCode.bind(service);
    service.saveCode = async (code: string) => {
      log(
        4,
        `→ saveCode(${short(code)}): box=${service.lastUsedBoxNumber}, pallet=${service.cameraStates?.[CAMERA]?.UsedPalletNumber}`,
      );
      const result = await originalSaveCode(code);
      log(4, '← saveCode завершён');
      return result;
    };

    const originalHelperSave = saveCodes.saveCode.bind(saveCodes);
    saveCodes.saveCode = async (
      tableName: string,
      code: string,
      boxNumber: number,
      cameraName?: string,
      palletNumber?: number,
    ) => {
      log(
        5,
        `→ CodeSaveService.saveCode("${tableName}", ${short(code)}, box=${boxNumber}, camera=${cameraName}, pallet=${palletNumber})`,
      );
      const result = await originalHelperSave(
        tableName,
        code,
        boxNumber,
        cameraName,
        palletNumber,
      );
      log(5, `← CodeSaveService.saveCode: ${result}`);
      return result;
    };

    const originalInsert = repository.saveCodeToDatabase.bind(repository);
    repository.saveCodeToDatabase = async (
      tableName: string,
      code: string,
      boxNumber: number,
      cameraName?: string,
      palletNumber?: number,
    ) => {
      log(
        6,
        `→ INSERT INTO "${tableName}" (code, box_number, pallet_number, camera_name) VALUES (${short(code)}, ${boxNumber}, ${palletNumber}, '${cameraName ?? 'Camera1'}')`,
      );
      const result = await originalInsert(
        tableName,
        code,
        boxNumber,
        cameraName,
        palletNumber,
      );
      log(6, '← INSERT выполнен');
      return result;
    };

    const originalUpdateStatus = saveCodes.updateCodeStatus.bind(saveCodes);
    saveCodes.updateCodeStatus = (...args: any[]) => {
      log(4, '→ updateCodeStatus()');
      return originalUpdateStatus(...args);
    };

    console.log(`\n${'='.repeat(72)}`);
    console.log(
      `РЕЖИМ ${mode}: ${mode === 'full' ? '15 из 15 (коробка одним сообщением)' : '5 из 15 (по слою)'}`,
    );
    console.log(`таблица: ${table}, ETE: ${dateTask}, сообщение: по ${size}`);
    console.log(`${'='.repeat(72)}`);

    // коды из реестра убираем, чтобы второй режим не видел дубликатов
    await ds.query(`DELETE FROM code_entity WHERE code = ANY($1::text[])`, [
      codes,
    ]);
    await tables.initializeTables();

    if (process.env.ETE_SEED === '0') {
      console.log('ETE_SEED=0: строку ETE не создаём');
    } else {
      const created = await numberBoxEte.AddNoteAndTook(GTIN, dateTask);
      console.log(`ETE: AddNoteAndTook(${GTIN}, ${dateTask}) → ${created}`);
    }

    const messages = chunk(codes, size);
    console.log(
      `\n=== ПРОГОН (${messages.length} сообщений по ${size}) ===`,
    );

    let accepted = 0;
    let rejected = 0;
    let prevBox: number | null = null;

    for (let index = 0; index < messages.length; index++) {
      const batch = messages[index];
      verbose = index === 0;
      sendCoordinatesCalls.length = 0;
      const before = await rowCount();
      const expected = parseResults.length + 1;

      if (verbose) {
        console.log(`\n--- сообщение #1 (подробно) ---`);
        step(
          1,
          `handleMessage2(" ${batch.map((c) => short(c)).join('@@')} \\t", "${CameraNames.Camera1}")`,
        );
      }

      await quiet(async () => {
        camera.handleMessage2(cameraMessage(batch), CameraNames.Camera1);

        for (let attempt = 0; attempt < 200; attempt++) {
          if (parseResults.length >= expected) break;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        await Promise.all(pendingSaves.splice(0));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const parsed = parseResults.at(-1);
      const after = await rowCount();
      const box = service.lastUsedBoxNumber;
      const inBox = service.cameraStates?.[CAMERA]?.currectProductInBox;
      const boxChanged = box !== prevBox;
      prevBox = box;

      if (parsed?.isValid) accepted += parsed.accepted;
      else rejected += parsed?.rejected ?? 0;

      console.log(
        `  #${String(index + 1).padStart(2, '0')}/${messages.length}: ` +
          `${batch.length} кодов, isValid=${parsed?.isValid}, ` +
          `принято ${parsed?.accepted}, отклонено ${parsed?.rejected}, ` +
          `строк ${before} → ${after}, ` +
          `коробка ${box} (${inBox}/${BOX_CAPACITY}), ` +
          `координаты ${sendCoordinatesCalls.length ? sendCoordinatesCalls.at(-1)?.length : 0}` +
          (boxChanged ? ' ← новая коробка' : ''),
      );
    }

    const rows = await rowCount();
    const boxes = await byBox();

    console.log(`\n=== ИТОГ РЕЖИМА ${mode} ===`);
    console.log(
      `сообщений ${messages.length}, принято ${accepted}, отклонено ${rejected}, строк ${rows}`,
    );
    console.log(
      `коробок: ${boxes.length}, последняя: ${boxes.at(-1)?.box_number} (${boxes.at(-1)?.codes})`,
    );
    console.log(
      `в памяти: productCount=${globalMonVar.productCount}, boxCount=${globalMonVar.boxCount}, lastUsedBoxNumber=${service.lastUsedBoxNumber}`,
    );
    console.log(`ETE: ${JSON.stringify(await readEte())}`);
    console.table(boxes);

    results.push({
      mode,
      table,
      size,
      messages: messages.length,
      accepted,
      rejected,
      rows,
      boxes: boxes.length,
      ete: (await readEte())?.BoxNumber ?? null,
    });
  };

  for (const mode of modesToRun) {
    await runScenario(mode);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('=== ОБЩИЙ ИТОГ ===');
  console.table(results);

  const codeEntity = await ds.query(
    `SELECT count(*)::int AS c FROM code_entity WHERE code LIKE $1`,
    [`01${GTIN}%`],
  );
  console.log('code_entity строк:', codeEntity[0].c);

  await ds.destroy();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
