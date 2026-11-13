/**
 * Тесты хелпера кодов: фасад + пять сервисов в `helpers/`.
 *
 * Внешнее окружение замокано: path.util (machineIdSync), monitoring.helper,
 * принтер, шаблоны, gateway, winston и файловая система.
 */
import {
  IAllCounts,
  IMonitoringVariables,
  MonitoringStatusActions,
  RootStatus,
} from 'src/globalTypes';
import { SearchFrom } from './types';

jest.mock('src/path.util', () => ({
  getRecordsTextFilesDirectory: () => 'tmp-records-dir',
  sha: 'test-sha',
}));
jest.mock('src/monitoring/helper', () => ({
  createTableIfNotExists: jest.fn(),
  createTaskTable: jest.fn(),
  getItemsCountInPallet: jest.fn(),
}));
jest.mock('src/printers/printer.service', () => ({ PrinterService: class {} }));
jest.mock('src/template/template.service', () => ({ TemplateService: class {} }));
jest.mock('src/app.gateway', () => ({ AppGateway: class {} }));
jest.mock('src/logger-winston/winston.config', () => ({
  codeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getLastLogMessages: jest.fn(() => []),
}));

import * as fs from 'fs';
import {
  createTableIfNotExists,
  createTaskTable,
} from 'src/monitoring/helper';
import { getLastLogMessages } from 'src/logger-winston/winston.config';
import { CodeHelperService } from './code-helper.service';
import { CodeCountsService } from './helpers/code-counts.service';
import { CodeLabelsService } from './helpers/code-labels.service';
import { CodeLayersService } from './helpers/code-layers.service';
import { CodeRemoteService } from './helpers/code-remote.service';
import { CodeReportsService } from './helpers/code-reports.service';
import { CodeSaveService } from './helpers/code-save.service';
import { CodeScanService } from './helpers/code-scan.service';
import { CodeTablesService } from './helpers/code-tables.service';
import { CodeWeightsService } from './helpers/code-weights.service';

const TABLE = 'test-2026_11_12_10_00_00';

const COUNTS: IAllCounts = {
  productCount: 10,
  productsInCurrentBox: 2,
  boxesInCurrentPallet: 1,
  boxCount: 3,
  palletCount: 2,
  currentBoxNumber: 3,
  currentPalletNumber: 2,
};

const makeGlobalMonVar = (
  overrides: Partial<IMonitoringVariables> = {},
): IMonitoringVariables => ({
  task: {
    gtin: '04810272003892',
    ITF14: '14810272003899',
    batch: '123',
    date_manufacture: '01.02.2024',
    date_expiration: '01.02.2025',
    pieces_per_package: 5,
    packaging_per_pallet: 6,
  },
  taskName: 'task.json',
  tableName: TABLE,
  codeStatus: null,
  boxNumber: 0,
  palletNumber: 0,
  limitProductInBox: 5,
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
  circuitResetDelayTime: 0,
  konturTime: 0,
  ...overrides,
});

const makeDeps = () => {
  const globalMonVar = makeGlobalMonVar();
  const codeRepository: any = {
    tableExists: jest.fn().mockResolvedValue(true),
    saveCodeToDatabase: jest.fn().mockResolvedValue(true),
    getDatabaseCounts: jest.fn().mockResolvedValue({
      productCount: 10,
      boxCount: 3,
      palletCount: 2,
      productsInCurrentBox: 2,
      boxesInCurrentPallet: 1,
    }),
    getLastBoxAndPalletInfo: jest.fn().mockResolvedValue({
      lastBoxNumber: 3,
      lastPalletNumber: 2,
      productsInLastBox: 2,
      boxesInLastPallet: 1,
    }),
    getAllRecords: jest.fn().mockResolvedValue([]),
  };
  const entityManager: any = { query: jest.fn() };
  const appGateway: any = {
    sendProductCount: jest.fn(),
    sendLogData: jest.fn(),
    sendRootMessage: jest.fn(),
  };
  const templateService: any = { getAll: jest.fn().mockResolvedValue([]) };
  const printerService: any = {
    printBoxLabel: jest.fn().mockResolvedValue(undefined),
    printPalletLabel: jest.fn().mockResolvedValue(undefined),
  };
  const logger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  return {
    globalMonVar,
    codeRepository,
    entityManager,
    appGateway,
    templateService,
    printerService,
    logger,
  };
};

describe('CodeHelperService (фасад)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: CodeHelperService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    (getLastLogMessages as jest.Mock).mockReturnValue([{ message: 'last' }]);

    deps = makeDeps();

    const tables = new CodeTablesService(
      deps.entityManager,
      deps.codeRepository,
      deps.globalMonVar,
      deps.logger,
    );

    service = new CodeHelperService(
      tables,
      new CodeCountsService(
        deps.codeRepository,
        deps.appGateway,
        tables,
        deps.globalMonVar,
        deps.logger,
      ),
      new CodeSaveService(
        deps.codeRepository,
        deps.globalMonVar,
        deps.logger,
      ),
      new CodeLabelsService(
        deps.entityManager,
        deps.templateService,
        deps.printerService,
        deps.globalMonVar,
        deps.logger,
      ),
      new CodeReportsService(
        deps.entityManager,
        deps.codeRepository,
        deps.templateService,
        deps.globalMonVar,
        deps.logger,
      ),
      new CodeScanService(deps.globalMonVar, deps.logger),
      new CodeWeightsService(
        deps.entityManager,
        deps.codeRepository,
        deps.globalMonVar,
        deps.logger,
      ),
      new CodeRemoteService(deps.logger),
      new CodeLayersService(deps.globalMonVar, deps.logger),
      deps.appGateway,
      deps.globalMonVar,
      deps.logger,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('создаётся с зависимостями', () => {
    expect(service).toBeDefined();
  });

  it('handleValidationError: статус, лог, счётчики и сообщение', () => {
    service.handleValidationError('Плохой код');

    expect(deps.globalMonVar.codeStatus).toBe(MonitoringStatusActions.Reject);
    expect(deps.logger.error).toHaveBeenCalledWith('Код: Плохой код');
    expect(deps.appGateway.sendProductCount).toHaveBeenCalled();
    expect(deps.appGateway.sendRootMessage).toHaveBeenCalledWith({
      status: RootStatus.Error,
      message: 'Плохой код',
    });
  });

  it('handleValidationError: можно передать свой статус', () => {
    service.handleValidationError('Код слева', MonitoringStatusActions.Left);

    expect(deps.globalMonVar.codeStatus).toBe(MonitoringStatusActions.Left);
  });

  it('делегирует initializeTables в сервис таблиц', async () => {
    await service.initializeTables();

    expect(createTableIfNotExists).toHaveBeenCalledWith(
      deps.entityManager,
      TABLE,
    );
    expect(createTaskTable).toHaveBeenCalledWith(
      deps.entityManager,
      TABLE,
      'task.json',
    );
  });

  it('делегирует saveCode в сервис записи', async () => {
    await service.saveCode(TABLE, 'CODE', 3, 'Camera1', 2);

    expect(deps.codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
      TABLE,
      'CODE',
      3,
      'Camera1',
      2,
    );
  });

  it('отдаёт текущие счётчики', () => {
    Object.assign(deps.globalMonVar, COUNTS);

    expect(service.getCurrentCounts()).toEqual(COUNTS);
  });
});

describe('CodeTablesService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: CodeTablesService;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeDeps();
    service = new CodeTablesService(
      deps.entityManager,
      deps.codeRepository,
      deps.globalMonVar,
      deps.logger,
    );
  });

  it('создаёт таблицу кодов и таблицу-метку', async () => {
    await service.initializeTables();

    expect(createTableIfNotExists).toHaveBeenCalledWith(
      deps.entityManager,
      TABLE,
    );
    expect(createTaskTable).toHaveBeenCalledWith(
      deps.entityManager,
      TABLE,
      'task.json',
    );
  });

  it('checkTableExists проходит, если таблица есть', async () => {
    await expect(service.checkTableExists(TABLE)).resolves.toBeUndefined();
  });

  it('checkTableExists бросает ошибку, если таблицы нет', async () => {
    deps.codeRepository.tableExists.mockResolvedValue(false);

    await expect(service.checkTableExists(TABLE)).rejects.toThrow(
      `Таблица "${TABLE}" не существует`,
    );
  });

  describe('createCleanupMetadataTable', () => {
    it('создаёт таблицу и заполняет дату, если запись пуста', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined);

      await service.createCleanupMetadataTable();

      expect(deps.entityManager.query).toHaveBeenCalledTimes(3);
      expect(deps.entityManager.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO table_cleanup_metadata'),
      );
    });

    it('не заполняет дату, если запись уже есть', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ id: 1 }]);

      await service.createCleanupMetadataTable();

      expect(deps.entityManager.query).toHaveBeenCalledTimes(2);
    });

    it('логирует и пробрасывает ошибку', async () => {
      deps.entityManager.query.mockRejectedValue(new Error('no table'));

      await expect(service.createCleanupMetadataTable()).rejects.toThrow(
        'no table',
      );
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteOldTablesIfNeeded', () => {
    it('пропускает очистку, если она уже была сегодня', async () => {
      deps.entityManager.query.mockResolvedValue([
        { last_cleanup_date: new Date() },
      ]);
      const cleanup = jest.spyOn(service, 'deleteTablesOlderThan');

      await service.deleteOldTablesIfNeeded();

      expect(cleanup).not.toHaveBeenCalled();
      expect(deps.entityManager.query).toHaveBeenCalledTimes(1);
    });

    it('запускает очистку и обновляет дату', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce([{ last_cleanup_date: new Date('2020-01-01') }])
        .mockResolvedValueOnce(undefined);
      const cleanup = jest
        .spyOn(service, 'deleteTablesOlderThan')
        .mockResolvedValue(undefined);

      await service.deleteOldTablesIfNeeded();

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(deps.entityManager.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE table_cleanup_metadata'),
      );
    });

    it('пробрасывает ошибку проверки', async () => {
      deps.entityManager.query.mockRejectedValue(new Error('metadata gone'));

      await expect(service.deleteOldTablesIfNeeded()).rejects.toThrow(
        'metadata gone',
      );
    });
  });

  describe('deleteTablesOlderThan', () => {
    it('удаляет только старые таблицы с датой в имени', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce([
          { table_name: '2000_01_01_10_00_00' },
          { table_name: 'code_entity' },
          { table_name: '2099_01_01_10_00_00' },
        ])
        .mockResolvedValue(undefined);

      await service.deleteTablesOlderThan();

      expect(deps.entityManager.query).toHaveBeenCalledTimes(2);
      expect(deps.entityManager.query).toHaveBeenLastCalledWith(
        'DROP TABLE IF EXISTS "2000_01_01_10_00_00" CASCADE',
      );
    });

    it('на пустом списке ничего не удаляет', async () => {
      deps.entityManager.query.mockResolvedValueOnce([]);

      await service.deleteTablesOlderThan();

      expect(deps.entityManager.query).toHaveBeenCalledTimes(1);
      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Удалено таблиц: 0'),
      );
    });

    it('ошибка удаления одной таблицы не валит весь процесс', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce([{ table_name: '2000_01_01_10_00_00' }])
        .mockRejectedValueOnce(new Error('cannot drop'));

      await expect(service.deleteTablesOlderThan()).resolves.toBeUndefined();
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Ошибка обработки таблицы 2000_01_01_10_00_00',
        expect.any(Error),
      );
    });

    it('пробрасывает ошибку получения списка таблиц', async () => {
      deps.entityManager.query.mockRejectedValue(new Error('select failed'));

      await expect(service.deleteTablesOlderThan()).rejects.toThrow(
        'select failed',
      );
    });
  });
});

describe('CodeCountsService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let tables: any;
  let service: CodeCountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getLastLogMessages as jest.Mock).mockReturnValue([{ message: 'last' }]);
    deps = makeDeps();
    tables = { checkTableExists: jest.fn().mockResolvedValue(undefined) };
    service = new CodeCountsService(
      deps.codeRepository,
      deps.appGateway,
      tables,
      deps.globalMonVar,
      deps.logger,
    );
  });

  it('возвращает имя таблицы задания', () => {
    expect(service.getTableName()).toBe(TABLE);
  });

  it('собирает текущие счётчики', () => {
    Object.assign(deps.globalMonVar, COUNTS);

    expect(service.getCurrentCounts()).toEqual(COUNTS);
  });

  it('sendCurrentStateToFrontend шлёт счётчики и последние логи', async () => {
    await service.sendCurrentStateToFrontend(COUNTS);

    expect(deps.appGateway.sendProductCount).toHaveBeenCalledWith(COUNTS);
    expect(deps.appGateway.sendLogData).toHaveBeenCalledWith([
      { message: 'last' },
    ]);
  });

  it('sendDataToFrontend шлёт счётчики и логи', () => {
    service.sendDataToFrontend(COUNTS);

    expect(deps.appGateway.sendProductCount).toHaveBeenCalledWith(COUNTS);
  });

  it('sendDBDataToFrontend пересчитывает и синхронизирует состояние', async () => {
    await service.sendDBDataToFrontend();

    expect(tables.checkTableExists).toHaveBeenCalledWith(TABLE);
    expect(deps.appGateway.sendProductCount).toHaveBeenCalledWith({
      productCount: 10,
      productsInCurrentBox: 2,
      boxesInCurrentPallet: 1,
      boxCount: 3,
      palletCount: 2,
      currentBoxNumber: deps.globalMonVar.currentBoxNumber,
      currentPalletNumber: deps.globalMonVar.currentPalletNumber,
    });
    expect(deps.globalMonVar.productCount).toBe(10);
    expect(deps.globalMonVar.boxCount).toBe(3);
  });

  it('sendDBDataToFrontend глотает ошибку отсутствующей таблицы', async () => {
    tables.checkTableExists.mockRejectedValue(new Error('no table'));

    await expect(service.sendDBDataToFrontend()).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('updateGlobalVariablesFromCounts обновляет только переданные поля', async () => {
    Object.assign(deps.globalMonVar, COUNTS);

    await service.updateGlobalVariablesFromCounts({ productCount: 42 });

    expect(deps.globalMonVar.productCount).toBe(42);
    expect(deps.globalMonVar.boxCount).toBe(COUNTS.boxCount);
  });

  it('getLastBoxAndPalletInfo переносит номера в глобальное состояние', async () => {
    const info = await service.getLastBoxAndPalletInfo();

    expect(info.lastBoxNumber).toBe(3);
    expect(deps.globalMonVar.currentBoxNumber).toBe(3);
    expect(deps.globalMonVar.currentPalletNumber).toBe(2);
    expect(deps.globalMonVar.productsInCurrentBox).toBe(2);
    expect(deps.globalMonVar.boxesInCurrentPallet).toBe(1);
  });

  it('getSummary группирует коды по коробкам и паллетам', async () => {
    deps.codeRepository.getAllRecords.mockResolvedValue([
      { code: 'A', box_number: 1, pallet_number: 1 },
      { code: 'B', box_number: 1, pallet_number: 1 },
      { code: 'C', box_number: 2, pallet_number: 1 },
    ]);

    await expect(service.getSummary()).resolves.toEqual({
      productCount: 3,
      boxCount: 2,
      palletCount: 1,
      lastBox: 2,
      lastPallet: 1,
      productsInLastBox: 1,
      boxesInLastPallet: 2,
    });
  });

  it('getSummary на пустой таблице отдаёт нули и null', async () => {
    deps.codeRepository.getAllRecords.mockResolvedValue([]);

    await expect(service.getSummary()).resolves.toEqual({
      productCount: 0,
      boxCount: 0,
      palletCount: 0,
      lastBox: null,
      lastPallet: null,
      productsInLastBox: 0,
      boxesInLastPallet: 0,
    });
  });
});

describe('CodeSaveService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: CodeSaveService;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeDeps();
    service = new CodeSaveService(
      deps.codeRepository,
      deps.globalMonVar,
      deps.logger,
    );
  });

  it('isCodeTask: код есть в списке', () => {
    expect(service.isCodeTask(['A', 'B'], 'B')).toBe(true);
    expect(service.isCodeTask(['A', 'B'], 'C')).toBe(false);
    expect(service.isCodeTask(undefined as any, 'C')).toBe(false);
  });

  it('saveCode передаёт все аргументы в репозиторий', async () => {
    await expect(
      service.saveCode(TABLE, 'CODE', 3, 'Camera1', 2),
    ).resolves.toBe(true);

    expect(deps.codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
      TABLE,
      'CODE',
      3,
      'Camera1',
      2,
    );
  });

  it('saveCodeAndAdvanceState сохраняет код и не трогает счётчики', async () => {
    await expect(
      service.saveCodeAndAdvanceState(TABLE, 'CODE', 3),
    ).resolves.toBe(true);

    expect(deps.codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
      TABLE,
      'CODE',
      3,
    );
    expect(deps.globalMonVar.productCount).toBe(0);
  });

  it('saveCodeAndAdvanceState возвращает false, если вставки не было', async () => {
    deps.codeRepository.saveCodeToDatabase.mockResolvedValue(false);

    await expect(
      service.saveCodeAndAdvanceState(TABLE, 'CODE', 3),
    ).resolves.toBe(false);
  });

  describe('updateCodeStatus', () => {
    it.each([
      { box: 2, firstOdd: true, expected: MonitoringStatusActions.Right },
      { box: 2, firstOdd: false, expected: MonitoringStatusActions.Left },
      { box: 3, firstOdd: true, expected: MonitoringStatusActions.Left },
      { box: 3, firstOdd: false, expected: MonitoringStatusActions.Right },
    ])(
      'коробка $box, первая нечётная=$firstOdd → $expected',
      ({ box, firstOdd, expected }) => {
        deps.globalMonVar.currentBoxNumber = box;
        deps.globalMonVar.isFirstBoxOdd = firstOdd;

        service.updateCodeStatus();

        expect(deps.globalMonVar.codeStatus).toBe(expected);
      },
    );
  });
});

describe('CodeLabelsService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: CodeLabelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeDeps();
    service = new CodeLabelsService(
      deps.entityManager,
      deps.templateService,
      deps.printerService,
      deps.globalMonVar,
      deps.logger,
    );
  });

  it('getFullBoxCode возвращает код этикетки', async () => {
    await expect(service.getFullBoxCode(3, 5)).resolves.toBe('close');
  });

  it('getFullPalletCode возвращает код этикетки', async () => {
    await expect(service.getFullPalletCode(1, 6, 30)).resolves.toBe('ss');
  });

  it('closeAutoBoxAndPrint пишет label и печатает', async () => {
    await service.closeAutoBoxAndPrint(3, 5, 'Camera1');

    expect(deps.entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('SET box_label'),
      ['close', 3],
    );
    expect(deps.printerService.printBoxLabel).toHaveBeenCalledWith(
      3,
      5,
      'Camera1',
    );
  });

  it('closeAutoBoxAndPrint глотает ошибку', async () => {
    deps.entityManager.query.mockRejectedValue(new Error('no column'));

    await expect(
      service.closeAutoBoxAndPrint(3, 5, 'Camera1'),
    ).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('closeAutoPalletAndPrint считает коды, пишет label и печатает', async () => {
    deps.entityManager.query
      .mockResolvedValueOnce([{ count: '30' }])
      .mockResolvedValueOnce(undefined);

    await service.closeAutoPalletAndPrint(1, 6);

    expect(deps.printerService.printPalletLabel).toHaveBeenCalledWith(1, 6, 30);
    expect(deps.entityManager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('SET pallet_label'),
      ['ss', 1],
    );
  });

  it('closeAutoPalletAndPrint глотает ошибку', async () => {
    deps.entityManager.query.mockRejectedValue(new Error('no column'));

    await expect(service.closeAutoPalletAndPrint(1, 6)).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('CodeReportsService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: CodeReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeDeps();
    deps.templateService.getAll.mockResolvedValue(null);
    service = new CodeReportsService(
      deps.entityManager,
      deps.codeRepository,
      deps.templateService,
      deps.globalMonVar,
      deps.logger,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('createReportHeaderDataby собирает атрибуты задания', () => {
    const header = service.createReportHeaderDataby();

    expect(header.Attributes).toEqual([
      { IsMarkReport: false, Code: 4, Value: '04810272003892' },
      { IsMarkReport: false, Code: 5, Value: '14810272003899' },
      { IsMarkReport: false, Code: 1, Value: '123' },
      { IsMarkReport: false, Code: 2, Value: '2024-02-01' },
      { IsMarkReport: false, Code: 3, Value: '2025-02-01' },
    ]);
  });

  it('createReportHeaderDataby подставляет GTIN, если нет ITF14', () => {
    deps.globalMonVar.task = { ...deps.globalMonVar.task, ITF14: undefined };

    const header = service.createReportHeaderDataby();

    expect(header.Attributes[1].Value).toBe('04810272003892');
  });

  it('formatDate переводит DD.MM.YYYY в YYYY-MM-DD', () => {
    expect(service.formatDate('01.02.2024')).toBe('2024-02-01');
    expect(service.formatDate('1.2.2024')).toBe('2024-02-01');
  });

  it('formatDate бросает ошибку на неверном формате', () => {
    expect(() => service.formatDate('01-02-2024')).toThrow(
      'Неверный формат даты',
    );
  });

  describe('getReportDataby', () => {
    it('строит иерархию паллета → коробка → коды', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce([{ column_name: 'id' }])
        .mockResolvedValueOnce([
          { id: 1, code: 'CODE_A', box_number: 1, pallet_number: 1 },
          { id: 2, code: 'CODE_B', box_number: 1, pallet_number: 1 },
        ])
        .mockResolvedValueOnce([{ pallet_number: 1, count: '2' }]);
      jest.spyOn(service, 'createCodesTextFile').mockResolvedValue(undefined);

      const result = await service.getReportDataby();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        Barcode: '',
        Level: 2,
        NumberInTask: 1,
        Weight: null,
      });
      expect(result[0].ChildBarcodes).toHaveLength(1);
      expect(result[0].ChildBarcodes[0].ChildBarcodes).toEqual([
        {
          Barcode: 'CODE_A',
          Level: 0,
          NumberInTask: 1,
          Weight: null,
          ChildBarcodes: [],
        },
        {
          Barcode: 'CODE_B',
          Level: 0,
          NumberInTask: 2,
          Weight: null,
          ChildBarcodes: [],
        },
      ]);
    });

    it('продолжает работу, если txt с кодами создать не удалось', async () => {
      deps.entityManager.query
        .mockResolvedValueOnce([{ column_name: 'id' }])
        .mockResolvedValueOnce([
          { id: 1, code: 'CODE_A', box_number: 1, pallet_number: 1 },
        ])
        .mockResolvedValueOnce([{ pallet_number: 1, count: '1' }]);
      jest
        .spyOn(service, 'createCodesTextFile')
        .mockRejectedValue(new Error('disk full'));

      await expect(service.getReportDataby()).resolves.toHaveLength(1);
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        expect.any(Error),
      );
    });
  });

  describe('getReportTermet', () => {
    it('собирает коробки и паллеты по шаблонам', async () => {
      deps.templateService.getAll.mockResolvedValue([
        { type: 'box', template: ['21'] },
        { type: 'pallet', template: ['21'] },
      ]);
      deps.codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
        { code: 'B', box_number: 1, pallet_number: 1 },
      ]);
      jest.spyOn(service, 'createCodesTextFile').mockResolvedValue(undefined);

      const result = await service.getReportTermet();

      expect(result.boxes).toHaveLength(1);
      expect(result.boxes[0].products).toEqual(['A', 'B']);
      expect(result.pallets).toHaveLength(1);
      expect(result.pallets[0].boxes).toEqual(['211']);
    });

    it('не пишет txt-файл при isTrailEnd=true', async () => {
      deps.codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
      ]);
      const write = jest
        .spyOn(service, 'createCodesTextFile')
        .mockResolvedValue(undefined);

      await service.getReportTermet(true);

      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('createCodesTextFile', () => {
    it('ничего не делает на пустом списке', async () => {
      const write = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined as any);

      await service.createCodesTextFile([]);

      expect(write).not.toHaveBeenCalled();
      expect(deps.logger.warn).toHaveBeenCalledWith(
        'Код: Нет данных для записи в файл',
      );
    });

    it('пишет коды по одному в строке', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const write = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined as any);

      await service.createCodesTextFile(['A', 'B']);

      expect(write).toHaveBeenCalledWith(
        expect.stringContaining(`${TABLE}_codes.txt`),
        'A\nB',
      );
    });

    it('логирует и пробрасывает ошибку записи', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest
        .spyOn(fs.promises, 'writeFile')
        .mockRejectedValue(new Error('disk full'));

      await expect(service.createCodesTextFile(['A'])).rejects.toThrow(
        'disk full',
      );
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Код: Ошибка при создании файла с кодами',
        expect.any(Error),
      );
    });
  });

  describe('getSearchType', () => {
    it('код с суффиксом 21 — поиск по коду', () => {
      expect(service.getSearchType('X'.repeat(16) + '21')).toBe(SearchFrom.Code);
    });

    it('начинается с 01 — поиск по коробке', () => {
      expect(service.getSearchType('01' + 'X'.repeat(14) + 'AB')).toBe(
        SearchFrom.Box,
      );
    });

    it('начинается с 02 — поиск по паллете', () => {
      expect(service.getSearchType('02' + 'X'.repeat(14) + 'AB')).toBe(
        SearchFrom.Pallet,
      );
    });

    it('неизвестный формат — undefined', () => {
      expect(
        service.getSearchType('99' + 'X'.repeat(14) + 'AB'),
      ).toBeUndefined();
    });
  });
});

