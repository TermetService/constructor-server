/**
 * Unit-тесты для CodeHelperService.
 *
 * Мокаются: репозиторий, EntityManager, шлюз сокетов, принтер, шаблоны,
 * winston и модуль src/monitoring/helper. Postgres, принтер и машина не нужны.
 *
 * Запуск: npx jest --runInBand src/code/code-helper.service.spec.ts
 */
import * as fs from 'fs';
import { IAllCounts, IMonitoringVariables, MonitoringStatusActions, RootStatus } from 'src/globalTypes';
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

jest.mock('src/logger-winston/winston.config', () => ({
  codeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getLastLogMessages: jest.fn(() => []),
}));

jest.mock('src/printers/printer.service', () => ({
  PrinterService: class {
    printBoxLabel = jest.fn();
    printPalletLabel = jest.fn();
  },
}));

jest.mock('src/template/template.service', () => ({ TemplateService: class {} }));
jest.mock('src/app.gateway', () => ({ AppGateway: class {} }));

import {
  createTableIfNotExists,
  createTaskTable,
  getItemsCountInPallet,
} from 'src/monitoring/helper';
import { getLastLogMessages } from 'src/logger-winston/winston.config';

const TABLE = '2026_11_10_12_00_00';
const CODE = '0104601234567890215AbCdEf';

const COUNTS: IAllCounts = {
  productCount: 10,
  productsInCurrentBox: 2,
  boxesInCurrentPallet: 1,
  boxCount: 3,
  palletCount: 2,
  currentBoxNumber: 3,
  currentPalletNumber: 2,
};

const TASK = {
  gtin: '04601234567890',
  ITF14: '1234567890123',
  batch: '123',
  date_manufacture: '01.02.2024',
  date_expiration: '01.02.2025',
  packaging_per_pallet: 4,
  pieces_per_package: 5,
};

const makeGlobalMonVar = (
  overrides: Partial<IMonitoringVariables> = {},
): IMonitoringVariables => ({
  task: { ...TASK },
  taskName: 'task.json',
  tableName: TABLE,
  codeStatus: null,
  boxNumber: 0,
  palletNumber: 0,
  limitProductInBox: 4,
  limitBoxInPallet: 3,
  productCount: 0,
  boxCount: 0,
  palletCount: 0,
  currentBoxNumber: 0,
  currentPalletNumber: 0,
  productsInCurrentBox: 0,
  boxesInCurrentPallet: 0,
  isFirstBoxOdd: false,
  isMonitoring: true,
  isOldSorting: false,
  isPaused: false,
  circuitResetDelayTime: 0,
  konturTime: 0,
  ...overrides,
});

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

let CodeHelperService: typeof import('./code-helper.service').CodeHelperService;

beforeAll(() => {
  // Модульные константы isPrint/isTableRetentionEnabled читаются при импорте,
  // поэтому переменные окружения выставляем до require.
  process.env.IS_PRINT = 'false';
  process.env.IS_TABLE_RETENTION = '1';
  process.env.FILES_DIRECTORY_TXT_RECORD = 'tmp-txt-dir';
  CodeHelperService = require('./code-helper.service').CodeHelperService;
});

describe('CodeHelperService', () => {
  let service: any;
  let globalMonVar: IMonitoringVariables;
  let codeRepository: any;
  let entityManager: any;
  let appGateway: any;
  let templateService: any;
  let printerService: any;
  let logger: any;

  beforeEach(() => {
    jest.resetAllMocks();
    (getLastLogMessages as jest.Mock).mockReturnValue([{ message: 'last' }]);

    globalMonVar = makeGlobalMonVar();
    codeRepository = {
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
    entityManager = { query: jest.fn() };
    appGateway = {
      sendProductCount: jest.fn(),
      sendLogData: jest.fn(),
      sendRootMessage: jest.fn(),
    };
    templateService = { getAll: jest.fn().mockResolvedValue(null) };
    printerService = {
      printBoxLabel: jest.fn().mockResolvedValue(undefined),
      printPalletLabel: jest.fn().mockResolvedValue(undefined),
    };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    service = new CodeHelperService(
      codeRepository,
      entityManager,
      appGateway,
      templateService,
      printerService,
      globalMonVar,
      logger,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // Простые геттеры и отправка на фронтенд
  // ==========================================================================
  describe('getTableName', () => {
    it('возвращает имя таблицы текущего задания', () => {
      expect(service.getTableName()).toBe(TABLE);
    });
  });

  describe('getCurrentCounts', () => {
    it('собирает все счётчики из глобальных переменных', () => {
      globalMonVar.productCount = 10;
      globalMonVar.productsInCurrentBox = 2;
      globalMonVar.boxesInCurrentPallet = 1;
      globalMonVar.boxCount = 3;
      globalMonVar.palletCount = 2;
      globalMonVar.currentBoxNumber = 3;
      globalMonVar.currentPalletNumber = 2;

      expect(service.getCurrentCounts()).toEqual(COUNTS);
    });
  });

  describe('sendCurrentStateToFrontend', () => {
    it('шлёт счётчики и последние логи', async () => {
      await service.sendCurrentStateToFrontend(COUNTS);

      expect(appGateway.sendProductCount).toHaveBeenCalledWith(COUNTS);
      expect(appGateway.sendLogData).toHaveBeenCalledWith([{ message: 'last' }]);
    });
  });

  describe('sendDataToFrontend', () => {
    it('шлёт счётчики и последние логи', () => {
      service.sendDataToFrontend(COUNTS);

      expect(appGateway.sendProductCount).toHaveBeenCalledWith(COUNTS);
      expect(appGateway.sendLogData).toHaveBeenCalledWith([{ message: 'last' }]);
    });
  });

  describe('handleValidationError', () => {
    it('по умолчанию ставит статус Reject и шлёт ошибку', () => {
      service.handleValidationError('Плохой код');

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Reject);
      expect(logger.error).toHaveBeenCalledWith('Код: Плохой код');
      expect(appGateway.sendProductCount).toHaveBeenCalled();
      expect(appGateway.sendRootMessage).toHaveBeenCalledWith({
        status: RootStatus.Error,
        message: 'Плохой код',
      });
    });

    it('позволяет передать свой статус', () => {
      service.handleValidationError('Код слева', MonitoringStatusActions.Left);

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Left);
    });
  });

  // ==========================================================================
  // Таблицы
  // ==========================================================================
  describe('initializeTables', () => {
    it('создаёт таблицу кодов и таблицу задания', async () => {
      await service.initializeTables();

      expect(createTableIfNotExists).toHaveBeenCalledWith(entityManager, TABLE);
      expect(createTaskTable).toHaveBeenCalledWith(
        entityManager,
        TABLE,
        'task.json',
      );
    });
  });

  describe('checkTableExists', () => {
    it('молча проходит, если таблица есть', async () => {
      await expect(service.checkTableExists(TABLE)).resolves.toBeUndefined();
    });

    it('бросает ошибку, если таблицы нет', async () => {
      codeRepository.tableExists.mockResolvedValue(false);

      await expect(service.checkTableExists(TABLE)).rejects.toThrow(
        `Таблица "${TABLE}" не существует`,
      );
    });
  });

  // ==========================================================================
  // saveCodeAndAdvanceState
  // ==========================================================================
  describe('saveCodeAndAdvanceState', () => {
    it('первый код: инициализирует счётчики задания и пишет в коробку 0', async () => {
      const saved = await service.saveCodeAndAdvanceState(CODE);

      expect(saved).toBe(true);
      expect(codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
        TABLE,
        CODE,
        0,
        0,
      );
      expect(globalMonVar).toMatchObject({
        productCount: 1,
        productsInCurrentBox: 1,
        boxCount: 1,
        palletCount: 1,
        currentBoxNumber: 0,
        currentPalletNumber: 0,
        boxesInCurrentPallet: 1,
      });
    });

    it('обычный код: увеличивает счётчики без перехода на новую коробку', async () => {
      globalMonVar = makeGlobalMonVar({
        productCount: 5,
        productsInCurrentBox: 2,
        boxCount: 1,
        palletCount: 1,
        currentBoxNumber: 1,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 1,
      });
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );

      const saved = await service.saveCodeAndAdvanceState(CODE);

      expect(saved).toBe(true);
      expect(codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
        TABLE,
        CODE,
        1,
        1,
      );
      expect(globalMonVar).toMatchObject({
        productCount: 6,
        productsInCurrentBox: 3,
        boxCount: 1,
        currentBoxNumber: 1,
        boxesInCurrentPallet: 1,
      });
    });

    it('переход на новую коробку при переполнении', async () => {
      globalMonVar = makeGlobalMonVar({
        productCount: 8,
        productsInCurrentBox: 4,
        boxCount: 2,
        palletCount: 1,
        currentBoxNumber: 2,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 2,
      });
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );

      await service.saveCodeAndAdvanceState(CODE);

      expect(codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
        TABLE,
        CODE,
        3,
        1,
      );
      expect(globalMonVar).toMatchObject({
        productCount: 9,
        productsInCurrentBox: 1,
        boxCount: 3,
        currentBoxNumber: 3,
        boxesInCurrentPallet: 3,
        palletCount: 1,
        currentPalletNumber: 1,
      });
    });

    it('переход на новую паллету при переполнении коробок', async () => {
      globalMonVar = makeGlobalMonVar({
        productCount: 11,
        productsInCurrentBox: 4,
        boxCount: 3,
        palletCount: 1,
        currentBoxNumber: 3,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 3,
      });
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );

      await service.saveCodeAndAdvanceState(CODE);

      expect(codeRepository.saveCodeToDatabase).toHaveBeenCalledWith(
        TABLE,
        CODE,
        4,
        2,
      );
      expect(globalMonVar).toMatchObject({
        productCount: 12,
        productsInCurrentBox: 1,
        boxCount: 4,
        currentBoxNumber: 4,
        boxesInCurrentPallet: 1,
        palletCount: 2,
        currentPalletNumber: 2,
      });
    });

    it('если INSERT не вставил строку — состояние не меняется', async () => {
      globalMonVar = makeGlobalMonVar({
        productCount: 5,
        productsInCurrentBox: 2,
        boxCount: 1,
        palletCount: 1,
        currentBoxNumber: 1,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 1,
      });
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );
      codeRepository.saveCodeToDatabase.mockResolvedValue(false);

      const saved = await service.saveCodeAndAdvanceState(CODE);

      expect(saved).toBe(false);
      expect(globalMonVar).toMatchObject({
        productCount: 5,
        productsInCurrentBox: 2,
        boxCount: 1,
        currentBoxNumber: 1,
        boxesInCurrentPallet: 1,
      });
    });

    it('при выключенной печати не трогает принтер', async () => {
      globalMonVar = makeGlobalMonVar({
        productCount: 7,
        productsInCurrentBox: 3,
        boxCount: 2,
        palletCount: 1,
        currentBoxNumber: 2,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 2,
      });
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );

      await service.saveCodeAndAdvanceState(CODE);
      await flushPromises();

      expect(printerService.printBoxLabel).not.toHaveBeenCalled();
      expect(printerService.printPalletLabel).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Печать этикеток (IS_PRINT=true, отдельный экземпляр модуля)
  // ==========================================================================
  describe('печать этикеток при IS_PRINT=true', () => {
    const buildServiceWithPrinting = (
      state: Partial<IMonitoringVariables>,
    ): { svc: any; printer: any; palletCount: jest.Mock } => {
      const previous = process.env.IS_PRINT;
      process.env.IS_PRINT = 'true';
      let svc: any;
      let printer: any;
      let palletCountMock: jest.Mock;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CodeHelperService: IsolatedService } = require('./code-helper.service');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PrinterService: IsolatedPrinter } = require('src/printers/printer.service');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const monitoringHelper = require('src/monitoring/helper');
        printer = new IsolatedPrinter();
        palletCountMock = monitoringHelper.getItemsCountInPallet;
        svc = new IsolatedService(
          codeRepository,
          entityManager,
          appGateway,
          templateService,
          printer,
          makeGlobalMonVar(state),
          logger,
        );
      });
      process.env.IS_PRINT = previous;
      return { svc, printer, palletCount: palletCountMock };
    };

    it('печатает этикетку заполненной коробки', async () => {
      const { svc, printer } = buildServiceWithPrinting({
        productCount: 3,
        productsInCurrentBox: 3,
        boxCount: 1,
        palletCount: 1,
        currentBoxNumber: 1,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 1,
      });

      await svc.saveCodeAndAdvanceState(CODE);
      await flushPromises();

      expect(printer.printBoxLabel).toHaveBeenCalledWith(1, 4);
      expect(printer.printPalletLabel).not.toHaveBeenCalled();
    });

    it('печатает этикетку коробки и паллеты, когда закрывается последняя коробка паллеты', async () => {
      const { svc, printer, palletCount } = buildServiceWithPrinting({
        productCount: 11,
        productsInCurrentBox: 3,
        boxCount: 3,
        palletCount: 1,
        currentBoxNumber: 3,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 3,
      });
      palletCount.mockResolvedValue(12);

      await svc.saveCodeAndAdvanceState(CODE);
      await flushPromises();

      expect(printer.printBoxLabel).toHaveBeenCalledWith(3, 4);
      expect(palletCount).toHaveBeenCalledWith(entityManager, TABLE, 1);
      expect(printer.printPalletLabel).toHaveBeenCalledWith(1, 3, 12);
    });

    it('ошибка печати не ломает сохранение кода', async () => {
      const { svc, printer } = buildServiceWithPrinting({
        productCount: 3,
        productsInCurrentBox: 3,
        boxCount: 1,
        palletCount: 1,
        currentBoxNumber: 1,
        currentPalletNumber: 1,
        boxesInCurrentPallet: 1,
      });
      printer.printBoxLabel.mockRejectedValue(new Error('printer offline'));

      await expect(svc.saveCodeAndAdvanceState(CODE)).resolves.toBe(true);
      await flushPromises();

      expect(logger.error).toHaveBeenCalledWith(
        'Код: Ошибка печати этикеток',
        expect.any(Error),
      );
    });
  });

  // ==========================================================================
  // updateCodeStatus
  // ==========================================================================
  describe('updateCodeStatus', () => {
    it('чётная коробка, первая коробка чётная → Left', () => {
      globalMonVar.currentBoxNumber = 2;
      globalMonVar.isFirstBoxOdd = false;

      service.updateCodeStatus();

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Left);
    });

    it('чётная коробка, первая коробка нечётная → Right', () => {
      globalMonVar.currentBoxNumber = 2;
      globalMonVar.isFirstBoxOdd = true;

      service.updateCodeStatus();

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Right);
    });

    it('нечётная коробка, первая коробка нечётная → Left', () => {
      globalMonVar.currentBoxNumber = 3;
      globalMonVar.isFirstBoxOdd = true;

      service.updateCodeStatus();

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Left);
    });

    it('нечётная коробка, первая коробка чётная → Right', () => {
      globalMonVar.currentBoxNumber = 3;
      globalMonVar.isFirstBoxOdd = false;

      service.updateCodeStatus();

      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Right);
    });
  });

  // ==========================================================================
  // Очистка старых таблиц
  // ==========================================================================
  describe('createCleanupMetadataTable', () => {
    it('создаёт таблицу и заполняет дату, если она пуста', async () => {
      entityManager.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined);

      await service.createCleanupMetadataTable();

      expect(entityManager.query).toHaveBeenCalledTimes(3);
      expect(entityManager.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO table_cleanup_metadata'),
      );
    });

    it('не заполняет дату, если запись уже есть', async () => {
      entityManager.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ id: 1 }]);

      await service.createCleanupMetadataTable();

      expect(entityManager.query).toHaveBeenCalledTimes(2);
    });

    it('логирует и пробрасывает ошибку', async () => {
      entityManager.query.mockRejectedValue(new Error('no table'));

      await expect(service.createCleanupMetadataTable()).rejects.toThrow(
        'no table',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteOldTablesIfNeeded', () => {
    it('пропускает очистку, если она уже была сегодня', async () => {
      entityManager.query.mockResolvedValue([{ last_cleanup_date: new Date() }]);
      const cleanupSpy = jest
        .spyOn(service, 'deleteTablesOlderThan')
        .mockResolvedValue(undefined);

      await service.deleteOldTablesIfNeeded();

      expect(cleanupSpy).not.toHaveBeenCalled();
      expect(entityManager.query).toHaveBeenCalledTimes(1);
    });

    it('запускает очистку и обновляет дату, если очистки не было', async () => {
      entityManager.query
        .mockResolvedValueOnce([{ last_cleanup_date: new Date('2020-01-01') }])
        .mockResolvedValueOnce(undefined);
      const cleanupSpy = jest
        .spyOn(service, 'deleteTablesOlderThan')
        .mockResolvedValue(undefined);

      await service.deleteOldTablesIfNeeded();

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(entityManager.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE table_cleanup_metadata'),
      );
    });

    it('пробрасывает ошибку проверки', async () => {
      entityManager.query.mockRejectedValue(new Error('metadata gone'));

      await expect(service.deleteOldTablesIfNeeded()).rejects.toThrow(
        'metadata gone',
      );
    });
  });

  describe('deleteTablesOlderThan', () => {
    it('удаляет только старые таблицы с датой в имени', async () => {
      entityManager.query
        .mockResolvedValueOnce([
          { table_name: '2024_01_01_10_00_00' },
          { table_name: 'code_entity' },
          { table_name: '2099_01_01_10_00_00' },
        ])
        .mockResolvedValue(undefined);

      await service.deleteTablesOlderThan();

      expect(entityManager.query).toHaveBeenCalledTimes(2);
      expect(entityManager.query).toHaveBeenLastCalledWith(
        'DROP TABLE IF EXISTS "2024_01_01_10_00_00" CASCADE',
      );
    });

    it('на пустом списке ничего не удаляет', async () => {
      entityManager.query.mockResolvedValueOnce([]);

      await service.deleteTablesOlderThan();

      expect(entityManager.query).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Удаление завершено. Удалено таблиц: 0'),
      );
    });

    it('ошибка удаления одной таблицы не валит весь процесс', async () => {
      entityManager.query
        .mockResolvedValueOnce([{ table_name: '2024_01_01_10_00_00' }])
        .mockRejectedValueOnce(new Error('cannot drop'));

      await expect(service.deleteTablesOlderThan()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Ошибка обработки таблицы 2024_01_01_10_00_00',
        expect.any(Error),
      );
    });

    it('пробрасывает ошибку получения списка таблиц', async () => {
      entityManager.query.mockRejectedValue(new Error('select failed'));

      await expect(service.deleteTablesOlderThan()).rejects.toThrow(
        'select failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Ошибка в основном цикле удаления таблиц',
        expect.any(Error),
      );
    });
  });

  // ==========================================================================
  // Отчёты и форматирование дат
  // ==========================================================================
  describe('formatDate', () => {
    it('переводит DD.MM.YYYY в YYYY-MM-DD', () => {
      expect(service.formatDate('01.02.2024')).toBe('2024-02-01');
    });

    it('дополняет однозначные день и месяц нулями', () => {
      expect(service.formatDate('1.2.2024')).toBe('2024-02-01');
    });

    it('бросает ошибку на неверном формате', () => {
      expect(() => service.formatDate('01-02-2024')).toThrow(
        'Неверный формат даты',
      );
    });
  });

  describe('createReportHeaderDataby', () => {
    it('собирает атрибуты из задания', () => {
      const header = service.createReportHeaderDataby();

      expect(header.Attributes).toEqual([
        { IsMarkReport: false, Code: 4, Value: TASK.gtin },
        { IsMarkReport: false, Code: 5, Value: TASK.ITF14 },
        { IsMarkReport: false, Code: 1, Value: TASK.batch },
        { IsMarkReport: false, Code: 2, Value: '2024-02-01' },
        { IsMarkReport: false, Code: 3, Value: '2025-02-01' },
      ]);
      expect(header.LineCode).toBe(2);
    });

    it('подставляет GTIN, если ITF14 не задан', () => {
      globalMonVar.task = { ...TASK, ITF14: undefined };
      service = new CodeHelperService(
        codeRepository,
        entityManager,
        appGateway,
        templateService,
        printerService,
        globalMonVar,
        logger,
      );

      const header = service.createReportHeaderDataby();

      expect(header.Attributes[1].Value).toBe(TASK.gtin);
    });
  });

  // ==========================================================================
  // sendDBDataToFrontend / updateGlobalVariablesFromCounts
  // ==========================================================================
  describe('sendDBDataToFrontend', () => {
    it('шлёт счётчики из БД и синхронизирует глобальные переменные', async () => {
      await service.sendDBDataToFrontend();

      expect(appGateway.sendProductCount).toHaveBeenCalledWith({
        productCount: 10,
        productsInCurrentBox: 2,
        boxesInCurrentPallet: 1,
        boxCount: 3,
        palletCount: 2,
        currentBoxNumber: globalMonVar.currentBoxNumber,
        currentPalletNumber: globalMonVar.currentPalletNumber,
      });
      expect(globalMonVar.productCount).toBe(10);
      expect(globalMonVar.boxCount).toBe(3);
    });

    it('глотает ошибку, если таблицы нет', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      codeRepository.tableExists.mockResolvedValue(false);

      await expect(service.sendDBDataToFrontend()).resolves.toBeUndefined();
      expect(appGateway.sendProductCount).not.toHaveBeenCalled();
    });
  });

  describe('updateGlobalVariablesFromCounts', () => {
    it('обновляет только переданные поля', async () => {
      const before = service.getCurrentCounts();

      await service.updateGlobalVariablesFromCounts({ productCount: 42 });

      expect(globalMonVar.productCount).toBe(42);
      expect(globalMonVar.boxCount).toBe(before.boxCount);
      expect(globalMonVar.currentBoxNumber).toBe(before.currentBoxNumber);
    });
  });

  // ==========================================================================
  // getLastBoxAndPalletInfo / getSummary
  // ==========================================================================
  describe('getLastBoxAndPalletInfo', () => {
    it('обновляет глобальные номера последней коробки и паллеты', async () => {
      const info = await service.getLastBoxAndPalletInfo();

      expect(info).toEqual({
        lastBoxNumber: 3,
        lastPalletNumber: 2,
        productsInLastBox: 2,
        boxesInLastPallet: 1,
      });
      expect(globalMonVar.currentBoxNumber).toBe(3);
      expect(globalMonVar.currentPalletNumber).toBe(2);
      expect(globalMonVar.productsInCurrentBox).toBe(2);
      expect(globalMonVar.boxesInCurrentPallet).toBe(1);
    });

    it('пробрасывает ошибку репозитория', async () => {
      codeRepository.getLastBoxAndPalletInfo.mockRejectedValue(
        new Error('no data'),
      );

      await expect(service.getLastBoxAndPalletInfo()).rejects.toThrow('no data');
    });
  });

  describe('getSummary', () => {
    it('группирует коды по коробкам и паллетам', async () => {
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
        { code: 'B', box_number: 1, pallet_number: 1 },
        { code: 'C', box_number: 2, pallet_number: 1 },
      ]);

      const summary = await service.getSummary();

      expect(summary).toEqual({
        productCount: 3,
        boxCount: 2,
        palletCount: 1,
        lastBox: 2,
        lastPallet: 1,
        productsInLastBox: 1,
        boxesInLastPallet: 2,
      });
    });

    it('возвращает нули и null на пустой таблице', async () => {
      codeRepository.getAllRecords.mockResolvedValue([]);

      const summary = await service.getSummary();

      expect(summary).toEqual({
        productCount: 0,
        boxCount: 0,
        palletCount: 0,
        lastBox: null,
        lastPallet: null,
        productsInLastBox: 0,
        boxesInLastPallet: 0,
      });
    });

    it('сортирует коробки и паллеты по номеру', async () => {
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 3, pallet_number: 2 },
        { code: 'B', box_number: 1, pallet_number: 1 },
      ]);

      const summary = await service.getSummary();

      expect(summary.lastBox).toBe(3);
      expect(summary.lastPallet).toBe(2);
      expect(summary.boxCount).toBe(2);
      expect(summary.palletCount).toBe(2);
    });
  });

  // ==========================================================================
  // Отчёты
  // ==========================================================================
  describe('getReportDataby', () => {
    it('строит иерархию паллета → коробка → коды', async () => {
      entityManager.query
        .mockResolvedValueOnce([
          { column_name: 'id' },
          { column_name: 'code' },
          { column_name: 'box_number' },
          { column_name: 'pallet_number' },
        ])
        .mockResolvedValueOnce([
          { id: 1, code: 'CODE_A', box_number: 1, pallet_number: 1 },
          { id: 2, code: 'CODE_B', box_number: 1, pallet_number: 1 },
        ])
        .mockResolvedValueOnce([{ pallet_number: 1, count: '2' }]);
      (service as any).createCodesTextFile = jest.fn();

      const result = await service.getReportDataby();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        Barcode: '',
        Level: 2,
        NumberInTask: 1,
        Weight: null,
      });
      expect(result[0].ChildBarcodes).toHaveLength(1);
      expect(result[0].ChildBarcodes[0]).toMatchObject({
        Barcode: '',
        Level: 1,
        NumberInTask: 1,
      });
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

    it('продолжает работу, если файл с кодами создать не удалось', async () => {
      entityManager.query
        .mockResolvedValueOnce([{ column_name: 'id' }])
        .mockResolvedValueOnce([
          { id: 1, code: 'CODE_A', box_number: 1, pallet_number: 1 },
        ])
        .mockResolvedValueOnce([{ pallet_number: 1, count: '1' }]);
      (service as any).createCodesTextFile = jest
        .fn()
        .mockRejectedValue(new Error('disk full'));

      await expect(service.getReportDataby()).resolves.toHaveLength(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        expect.any(Error),
      );
    });

    it('берёт шаблоны коробки и паллеты, если они настроены', async () => {
      templateService.getAll.mockResolvedValue([
        { type: 'box', template: ['21'] },
        { type: 'pallet', template: ['21'] },
      ]);
      entityManager.query
        .mockResolvedValueOnce([{ column_name: 'id' }])
        .mockResolvedValueOnce([
          { id: 1, code: 'CODE_A', box_number: 1, pallet_number: 1 },
        ])
        .mockResolvedValueOnce([{ pallet_number: 1, count: '1' }]);
      (service as any).createCodesTextFile = jest.fn();

      const result = await service.getReportDataby();

      expect(result[0].Barcode).toBe('2101');
      expect(result[0].ChildBarcodes[0].Barcode).toBe('2101');
    });
  });

  describe('getReportTermet', () => {
    it('собирает коробки и паллеты по шаблонам', async () => {
      templateService.getAll.mockResolvedValue([
        { type: 'box', template: ['21'] },
        { type: 'pallet', template: ['21'] },
      ]);
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
        { code: 'B', box_number: 1, pallet_number: 1 },
      ]);
      (service as any).createCodesTextFile = jest.fn();

      const result = await service.getReportTermet();

      expect(result.boxes).toHaveLength(1);
      expect(result.boxes[0].name).toBe('211');
      expect(result.boxes[0].products).toEqual(['A', 'B']);
      expect(result.pallets).toHaveLength(1);
      expect(result.pallets[0].name).toBe('211');
      expect(result.pallets[0].boxes).toEqual(['211']);
      expect((service as any).createCodesTextFile).toHaveBeenCalledWith([
        'A',
        'B',
      ]);
    });

    it('не пишет txt-файл при isTrailEnd=true', async () => {
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
      ]);
      (service as any).createCodesTextFile = jest.fn();

      await service.getReportTermet(true);

      expect((service as any).createCodesTextFile).not.toHaveBeenCalled();
    });

    it('не падает, если txt-файл с кодами создать не удалось', async () => {
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
      ]);
      (service as any).createCodesTextFile = jest
        .fn()
        .mockRejectedValue(new Error('disk full'));

      await expect(service.getReportTermet()).resolves.toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        expect.any(Error),
      );
    });

    it('раскладывает несколько коробок по разным паллетам', async () => {
      codeRepository.getAllRecords.mockResolvedValue([
        { code: 'A', box_number: 1, pallet_number: 1 },
        { code: 'B', box_number: 2, pallet_number: 1 },
        { code: 'C', box_number: 3, pallet_number: 2 },
      ]);
      (service as any).createCodesTextFile = jest.fn();

      const result = await service.getReportTermet();

      expect(result.boxes).toHaveLength(3);
      expect(result.pallets).toHaveLength(2);
    });
  });

  // ==========================================================================
  // createCodesTextFile
  // ==========================================================================
  describe('createCodesTextFile', () => {
    it('ничего не делает на пустом списке кодов', async () => {
      const writeSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined as any);

      await service.createCodesTextFile([]);

      expect(writeSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Код: Нет данных для записи в файл');
    });

    it('пишет коды в файл по одному в строке', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const writeSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined as any);

      await service.createCodesTextFile(['A', 'B']);

      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${TABLE}_codes.txt`),
        'A\nB',
      );
    });

    it('создаёт директорию, если её нет', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

      await service.createCodesTextFile(['A']);

      expect(mkdirSpy).toHaveBeenCalledWith('tmp-records-dir', {
        recursive: true,
      });
    });

    it('логирует и пробрасывает ошибку записи', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest
        .spyOn(fs.promises, 'writeFile')
        .mockRejectedValue(new Error('disk full'));

      await expect(service.createCodesTextFile(['A'])).rejects.toThrow(
        'disk full',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Код: Ошибка при создании файла с кодами',
        expect.any(Error),
      );
    });
  });

  // ==========================================================================
  // getSearchType
  // ==========================================================================
  describe('getSearchType', () => {
    it('код с суффиксом 21 — поиск по коду', () => {
      const code = 'X'.repeat(16) + '21';

      expect(service.getSearchType(code)).toBe(SearchFrom.Code);
    });

    it('код, начинающийся с 01 — поиск по коробке', () => {
      const code = '01' + 'X'.repeat(14) + 'AB';

      expect(service.getSearchType(code)).toBe(SearchFrom.Box);
    });

    it('код, начинающийся с 02 — поиск по паллете', () => {
      const code = '02' + 'X'.repeat(14) + 'AB';

      expect(service.getSearchType(code)).toBe(SearchFrom.Pallet);
    });

    it('неизвестный формат — undefined', () => {
      const code = '99' + 'X'.repeat(14) + 'AB';

      expect(service.getSearchType(code)).toBeUndefined();
    });
  });
});
