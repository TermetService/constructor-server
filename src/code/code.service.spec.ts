/**
 * Unit-тесты для CodeService.
 *
 * Всё внешнее (репозиторий, EntityManager, шлюз сокетов, логгер, CodeHelperService)
 * заменено моками, поэтому тесты не требуют Postgres, принтера и камеры.
 *
 * Запуск: npx jest --runInBand src/code/code.service.spec.ts
 */
import {
  EventTypes,
  IAllCounts,
  IMonitoringVariables,
  MonitoringStatusActions,
  RootStatus,
} from 'src/globalTypes';

jest.mock('./code-helper.service', () => ({ CodeHelperService: class {} }));
jest.mock('src/app.gateway', () => ({ AppGateway: class {} }));
jest.mock('src/modbus/modbus.service', () => ({ ModbusService: class {} }));
jest.mock('src/monitoring/helper', () => {
  const actual = jest.requireActual('src/monitoring/helper');
  return { ...actual, isValidCode: jest.fn() };
});
jest.mock('src/logger-winston/winston.config', () => ({
  codeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getLastLogMessages: jest.fn(() => []),
  getLogMessages: jest.fn(() => []),
}));

import { CodeService } from './code.service';
import { isValidCode } from 'src/monitoring/helper';
import { getLogMessages } from 'src/logger-winston/winston.config';

const TABLE = '2026_11_10_12_00_00';
const CODE = '0104601234567890215AbCdEf';
const CODE_2 = '0104601234567890215AbCdEg';

const COUNTS: IAllCounts = {
  productCount: 0,
  productsInCurrentBox: 0,
  boxesInCurrentPallet: 0,
  boxCount: 0,
  palletCount: 0,
  currentBoxNumber: 0,
  currentPalletNumber: 0,
};

const makeGlobalMonVar = (
  overrides: Partial<IMonitoringVariables> = {},
): IMonitoringVariables => ({
  task: { gtin: '04601234567890' },
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

const mockInvalidCode = (message: string, reason?: string) =>
  (isValidCode as jest.Mock).mockResolvedValue({
    isValid: false,
    reason,
    message,
  });

describe('CodeService', () => {
  let service: CodeService;
  let globalMonVar: IMonitoringVariables;

  let codeRepository: any;
  let entityManager: any;
  let eventEmitter: any;
  let appGateway: any;
  let codeHelperService: any;
  let logger: any;

  beforeEach(() => {
    jest.resetAllMocks();

    (isValidCode as jest.Mock).mockResolvedValue({ isValid: true });
    (getLogMessages as jest.Mock).mockReturnValue([]);

    globalMonVar = makeGlobalMonVar({ productCount: 5, currentBoxNumber: 1 });

    codeRepository = {
      isDuplicateCode: jest.fn().mockResolvedValue(false),
      deleteCodesFromTables: jest.fn(),
      addCodeToTables: jest.fn(),
      getProductCountInBox: jest.fn().mockResolvedValue(1),
      getCodesByBoxNumber: jest.fn().mockResolvedValue([]),
      deleteBoxFromTables: jest.fn(),
      removeBoxFromPalletInTable: jest.fn(),
      getCodesByPalletNumber: jest.fn().mockResolvedValue([]),
      deletePalletFromTables: jest.fn(),
      moveBoxToPalletInTable: jest.fn(),
    };

    entityManager = { query: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    appGateway = {
      sendRootMessage: jest.fn(),
      sendLogData: jest.fn(),
      sendProductCount: jest.fn(),
    };
    codeHelperService = {
      initializeTables: jest.fn(),
      handleValidationError: jest.fn(),
      getCurrentCounts: jest.fn(() => COUNTS),
      saveCodeAndAdvanceState: jest.fn().mockResolvedValue(true),
      updateCodeStatus: jest.fn(),
      sendCurrentStateToFrontend: jest.fn(),
      sendDBDataToFrontend: jest.fn(),
      checkTableExists: jest.fn().mockResolvedValue(undefined),
      createCleanupMetadataTable: jest.fn().mockResolvedValue(undefined),
      deleteOldTablesIfNeeded: jest.fn().mockResolvedValue(undefined),
    };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    service = new CodeService(
      codeRepository,
      entityManager,
      eventEmitter,
      appGateway,
      codeHelperService,
      globalMonVar,
      logger,
    );
  });

  // ==========================================================================
  // validateAndSaveCode
  // ==========================================================================
  describe('validateAndSaveCode', () => {
    it('отклоняет пустой код и не трогает БД', async () => {
      mockInvalidCode('Пустой код', 'empty');

      const result = await service.validateAndSaveCode('');

      expect(result).toBeUndefined();
      expect(codeHelperService.handleValidationError).toHaveBeenCalledWith(
        'Пустой код',
        MonitoringStatusActions.Reject,
      );
      expect(codeRepository.isDuplicateCode).not.toHaveBeenCalled();
      expect(codeHelperService.saveCodeAndAdvanceState).not.toHaveBeenCalled();
    });

    it('отклоняет код, не прошедший isValidCode', async () => {
      mockInvalidCode(`Неверный код: ${CODE}`, 'gtin');

      const result = await service.validateAndSaveCode(CODE);

      expect(result).toBeUndefined();
      expect(codeHelperService.handleValidationError).toHaveBeenCalledWith(
        `Неверный код: ${CODE}`,
        MonitoringStatusActions.Reject,
      );
      expect(codeRepository.isDuplicateCode).not.toHaveBeenCalled();
    });

    it('создаёт таблицы, если это первый код задания', async () => {
      globalMonVar.productCount = 0;

      await service.validateAndSaveCode(CODE);

      expect(codeHelperService.initializeTables).toHaveBeenCalledTimes(1);
      expect(codeHelperService.saveCodeAndAdvanceState).toHaveBeenCalledWith(
        CODE,
      );
    });

    it('не создаёт таблицы, если в задании уже есть коды', async () => {
      globalMonVar.productCount = 3;

      await service.validateAndSaveCode(CODE);

      expect(codeHelperService.initializeTables).not.toHaveBeenCalled();
    });

    it('отклоняет дубликат до попытки записи', async () => {
      mockInvalidCode(`Найден дубликат кода ${CODE}`, 'duplicate');

      const result = await service.validateAndSaveCode(CODE);

      expect(codeHelperService.handleValidationError).toHaveBeenCalledWith(
        `Найден дубликат кода ${CODE}`,
        MonitoringStatusActions.Reject,
      );
      expect(codeHelperService.saveCodeAndAdvanceState).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('при успехе обновляет статус, шлёт событие и сообщение об успехе', async () => {
      const result = await service.validateAndSaveCode(CODE);

      expect(codeHelperService.saveCodeAndAdvanceState).toHaveBeenCalledWith(
        CODE,
      );
      expect(codeHelperService.updateCodeStatus).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EventTypes.CodeStatusUpdated,
      );
      expect(codeHelperService.sendCurrentStateToFrontend).toHaveBeenCalledWith(
        COUNTS,
      );
      expect(appGateway.sendRootMessage).toHaveBeenCalledWith({
        status: RootStatus.Success,
        message: 'Код сохранен',
      });
      expect(result).toBe(COUNTS);
    });

    it('считает код дубликатом, если INSERT не вставил строку (гонка на UNIQUE)', async () => {
      codeHelperService.saveCodeAndAdvanceState.mockResolvedValue(false);

      const result = await service.validateAndSaveCode(CODE);

      expect(codeHelperService.handleValidationError).toHaveBeenCalledWith(
        `Найден дубликат кода ${CODE}`,
        MonitoringStatusActions.Reject,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(appGateway.sendRootMessage).not.toHaveBeenCalled();
      expect(result).toBe(COUNTS);
    });

    it('логирует и пробрасывает ошибку БД', async () => {
      (isValidCode as jest.Mock).mockRejectedValueOnce(new Error('db down'));

      await expect(service.validateAndSaveCode(CODE)).rejects.toThrow('db down');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка при сохранении кода: db down'),
      );
    });

    it('очередь сериализует сохранения: второй код не пишется, пока не дописан первый', async () => {
      const order: string[] = [];
      let releaseFirst: () => void = () => undefined;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      codeHelperService.saveCodeAndAdvanceState
        .mockImplementationOnce(async () => {
          order.push('first:start');
          await firstGate;
          order.push('first:end');
          return true;
        })
        .mockImplementationOnce(async () => {
          order.push('second:start');
          order.push('second:end');
          return true;
        });

      const first = service.validateAndSaveCode(CODE);
      const second = service.validateAndSaveCode(CODE_2);

      await new Promise((resolve) => setImmediate(resolve));
      expect(order).toEqual(['first:start']);

      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual([
        'first:start',
        'first:end',
        'second:start',
        'second:end',
      ]);
    });

    it('после ошибки в одном сохранении очередь продолжает работать', async () => {
      (isValidCode as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await expect(service.validateAndSaveCode(CODE)).rejects.toThrow('boom');

      await expect(service.validateAndSaveCode(CODE_2)).resolves.toBe(COUNTS);
      expect(codeHelperService.saveCodeAndAdvanceState).toHaveBeenCalledWith(
        CODE_2,
      );
    });
  });

  // ==========================================================================
  // handValidateAndSaveCode
  // ==========================================================================
  describe('handValidateAndSaveCode', () => {
    it('на невалидном коде возвращает isAddCode=false и не пишет в БД', async () => {
      mockInvalidCode(`Неверный код: ${CODE}`, 'gtin');

      const result = await service.handValidateAndSaveCode(CODE);

      expect(result).toEqual({ isAddCode: false });
      expect(logger.warn).toHaveBeenCalledWith(
        `Код ручной: Неверный код: ${CODE}`,
      );
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
      expect(codeRepository.isDuplicateCode).not.toHaveBeenCalled();
    });

    it('создаёт таблицы для первого ручного кода', async () => {
      globalMonVar.productCount = 0;

      await service.handValidateAndSaveCode(CODE);

      expect(codeHelperService.initializeTables).toHaveBeenCalledTimes(1);
    });

    it('на дубликате возвращает isAddCode=false', async () => {
      mockInvalidCode(`Найден дубликат кода ${CODE}`, 'duplicate');

      const result = await service.handValidateAndSaveCode(CODE);

      expect(result).toEqual({ isAddCode: false });
      expect(codeHelperService.saveCodeAndAdvanceState).not.toHaveBeenCalled();
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('возвращает isAddCode=false, если saveCodeAndAdvanceState вернул false', async () => {
      codeHelperService.saveCodeAndAdvanceState.mockResolvedValue(false);

      const result = await service.handValidateAndSaveCode(CODE);

      expect(result).toEqual({ isAddCode: false });
      expect(logger.warn).toHaveBeenCalledWith(
        `Код ручной: Код ${CODE} уже существует`,
      );
    });

    it('при успехе возвращает номера коробки и паллеты', async () => {
      globalMonVar.currentBoxNumber = 2;
      globalMonVar.currentPalletNumber = 7;
      globalMonVar.productsInCurrentBox = 3;
      globalMonVar.limitProductInBox = 4;

      const result = await service.handValidateAndSaveCode(CODE);

      expect(result).toEqual({
        isAddCode: true,
        boxNumber: 2,
        palletNumber: 7,
        productsInBox: 3,
        limitProductsInBox: 4,
      });
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('логирует и пробрасывает ошибку сохранения', async () => {
      codeHelperService.saveCodeAndAdvanceState.mockRejectedValue(
        new Error('insert failed'),
      );

      await expect(service.handValidateAndSaveCode(CODE)).rejects.toThrow(
        'insert failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Код ручной: Ошибка при сохранении кода'),
      );
    });
  });

  // ==========================================================================
  // deleteCodes
  // ==========================================================================
  describe('deleteCodes', () => {
    it('на пустом массиве ничего не удаляет и возвращает текущие счётчики', async () => {
      const result = await service.deleteCodes([]);

      expect(result).toBe(COUNTS);
      expect(codeRepository.deleteCodesFromTables).not.toHaveBeenCalled();
    });

    it('уменьшает счётчики текущей коробки, закрывая её при обнулении', async () => {
      globalMonVar.productCount = 10;
      globalMonVar.productsInCurrentBox = 2;
      globalMonVar.boxCount = 3;
      globalMonVar.boxesInCurrentPallet = 2;
      globalMonVar.palletCount = 2;
      globalMonVar.currentBoxNumber = 3;

      await service.deleteCodes([
        { code: 'A', boxNumber: 3 },
        { code: 'B', boxNumber: 3 },
      ]);

      expect(codeRepository.deleteCodesFromTables).toHaveBeenCalledWith(TABLE, [
        'A',
        'B',
      ]);
      expect(globalMonVar.productCount).toBe(8);
      expect(globalMonVar.productsInCurrentBox).toBe(0);
      expect(globalMonVar.boxCount).toBe(2);
      expect(globalMonVar.boxesInCurrentPallet).toBe(1);
      expect(globalMonVar.palletCount).toBe(2);
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('уменьшает количество паллет, если удалили последнюю коробку паллеты', async () => {
      globalMonVar.productCount = 4;
      globalMonVar.productsInCurrentBox = 1;
      globalMonVar.boxCount = 1;
      globalMonVar.boxesInCurrentPallet = 1;
      globalMonVar.palletCount = 1;
      globalMonVar.currentBoxNumber = 1;

      await service.deleteCodes([{ code: 'A', boxNumber: 1 }]);

      expect(globalMonVar.productsInCurrentBox).toBe(0);
      expect(globalMonVar.boxCount).toBe(0);
      expect(globalMonVar.boxesInCurrentPallet).toBe(0);
      expect(globalMonVar.palletCount).toBe(0);
    });

    it('для чужой коробки правит только общий счётчик', async () => {
      globalMonVar.productCount = 10;
      globalMonVar.productsInCurrentBox = 2;
      globalMonVar.boxCount = 3;
      globalMonVar.currentBoxNumber = 5;

      await service.deleteCodes([{ code: 'A', boxNumber: 2 }]);

      expect(globalMonVar.productCount).toBe(9);
      expect(globalMonVar.productsInCurrentBox).toBe(2);
      expect(globalMonVar.boxCount).toBe(3);
    });

    it('не уводит счётчики в минус', async () => {
      globalMonVar.productCount = 1;
      globalMonVar.productsInCurrentBox = 1;
      globalMonVar.boxCount = 1;
      globalMonVar.boxesInCurrentPallet = 1;
      globalMonVar.palletCount = 1;
      globalMonVar.currentBoxNumber = 1;

      await service.deleteCodes([
        { code: 'A', boxNumber: 1 },
        { code: 'B', boxNumber: 1 },
        { code: 'C', boxNumber: 1 },
      ]);

      expect(globalMonVar.productCount).toBe(0);
      expect(globalMonVar.boxCount).toBe(0);
      expect(globalMonVar.boxesInCurrentPallet).toBe(0);
      expect(globalMonVar.palletCount).toBe(0);
    });

    it('пробрасывает ошибку удаления', async () => {
      codeRepository.deleteCodesFromTables.mockRejectedValue(
        new Error('delete failed'),
      );

      await expect(
        service.deleteCodes([{ code: 'A', boxNumber: 1 }]),
      ).rejects.toThrow('delete failed');
    });
  });

  // ==========================================================================
  // addCodeToBox
  // ==========================================================================
  describe('addCodeToBox', () => {
    it('проверяет существование таблицы перед работой', async () => {
      codeHelperService.checkTableExists.mockRejectedValue(
        new Error('Таблица не существует'),
      );

      await expect(service.addCodeToBox(CODE, 2, 1)).rejects.toThrow(
        'Таблица не существует',
      );
      expect(codeRepository.isDuplicateCode).not.toHaveBeenCalled();
    });

    it('отклоняет невалидный код и пишет статус Reject', async () => {
      mockInvalidCode(`Неверный код: ${CODE}`, 'gtin');

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ message: 'Невалидный код' });
      expect(globalMonVar.codeStatus).toBe(MonitoringStatusActions.Reject);
      expect(appGateway.sendLogData).toHaveBeenCalled();
    });

    it('отклоняет дубликат', async () => {
      mockInvalidCode(`Найден дубликат кода ${CODE}`, 'duplicate');

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ message: 'Код уже существует' });
      expect(codeHelperService.handleValidationError).toHaveBeenCalled();
      expect(codeRepository.addCodeToTables).not.toHaveBeenCalled();
    });

    it('сообщает, если коробки нет в базе', async () => {
      codeRepository.getProductCountInBox.mockResolvedValue(0);

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ message: 'Короб #2 не найден в базе' });
      expect(codeRepository.addCodeToTables).not.toHaveBeenCalled();
    });

    it('сообщает о достижении лимита коробки', async () => {
      codeRepository.getProductCountInBox.mockResolvedValue(4);

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ message: 'Достигнут лимит коробки' });
      expect(codeRepository.addCodeToTables).not.toHaveBeenCalled();
    });

    it('сообщает, если репозиторий не смог добавить код', async () => {
      codeRepository.addCodeToTables.mockResolvedValue(null);

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ message: 'Код не был добавлен' });
      expect(globalMonVar.productCount).toBe(5);
    });

    it('при успехе увеличивает счётчики текущей коробки', async () => {
      codeRepository.addCodeToTables.mockResolvedValue({
        id: 1,
        code: CODE,
      });
      globalMonVar.currentBoxNumber = 2;
      globalMonVar.productsInCurrentBox = 1;

      const result = await service.addCodeToBox(CODE, 2, 1);

      expect(result).toEqual({ id: 1, code: CODE });
      expect(globalMonVar.productCount).toBe(6);
      expect(globalMonVar.productsInCurrentBox).toBe(2);
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('не трогает счётчик текущей коробки для чужой коробки', async () => {
      codeRepository.addCodeToTables.mockResolvedValue({
        id: 1,
        code: CODE,
      });
      globalMonVar.currentBoxNumber = 5;
      globalMonVar.productsInCurrentBox = 1;

      await service.addCodeToBox(CODE, 2, 1);

      expect(globalMonVar.productCount).toBe(6);
      expect(globalMonVar.productsInCurrentBox).toBe(1);
    });

    it('логирует и пробрасывает ошибку добавления', async () => {
      codeRepository.addCodeToTables.mockRejectedValue(new Error('insert'));

      await expect(service.addCodeToBox(CODE, 2, 1)).rejects.toThrow('insert');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // deleteBox
  // ==========================================================================
  describe('deleteBox', () => {
    it('удаляет текущую коробку и обнуляет её счётчик', async () => {
      globalMonVar.boxCount = 3;
      globalMonVar.productCount = 10;
      globalMonVar.productsInCurrentBox = 4;
      globalMonVar.currentBoxNumber = 3;
      codeRepository.getCodesByBoxNumber.mockResolvedValue(['A', 'B']);

      await service.deleteBox(3);

      expect(codeRepository.deleteBoxFromTables).toHaveBeenCalledWith(
        TABLE,
        3,
        ['A', 'B'],
      );
      expect(globalMonVar.boxCount).toBe(2);
      expect(globalMonVar.productCount).toBe(6);
      expect(globalMonVar.productsInCurrentBox).toBe(0);
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('для чужой коробки вычитает лимит коробки', async () => {
      globalMonVar.boxCount = 3;
      globalMonVar.productCount = 10;
      globalMonVar.productsInCurrentBox = 4;
      globalMonVar.currentBoxNumber = 3;
      globalMonVar.limitProductInBox = 4;

      await service.deleteBox(2);

      expect(globalMonVar.boxCount).toBe(2);
      expect(globalMonVar.productCount).toBe(6);
      expect(globalMonVar.productsInCurrentBox).toBe(4);
    });

    it('сравнивает номер коробки без учёта типа (строка vs число)', async () => {
      globalMonVar.boxCount = 2;
      globalMonVar.productCount = 5;
      globalMonVar.productsInCurrentBox = 2;
      globalMonVar.currentBoxNumber = 3;

      await service.deleteBox('3' as any);

      expect(globalMonVar.productsInCurrentBox).toBe(0);
    });

    it('логирует и пробрасывает ошибку удаления', async () => {
      codeRepository.deleteBoxFromTables.mockRejectedValue(
        new Error('delete box'),
      );

      await expect(service.deleteBox(1)).rejects.toThrow('delete box');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // removeBoxFromPallet
  // ==========================================================================
  describe('removeBoxFromPallet', () => {
    it('уменьшает количество коробок в паллете', async () => {
      globalMonVar.boxesInCurrentPallet = 2;
      globalMonVar.palletCount = 2;
      globalMonVar.currentPalletNumber = 2;

      await service.removeBoxFromPallet(5);

      expect(
        codeRepository.removeBoxFromPalletInTable,
      ).toHaveBeenCalledWith(TABLE, 5);
      expect(globalMonVar.boxesInCurrentPallet).toBe(1);
      expect(globalMonVar.palletCount).toBe(2);
      expect(globalMonVar.currentPalletNumber).toBe(2);
    });

    it('закрывает паллету, если изъята последняя коробка, и восстанавливает лимит коробок', async () => {
      globalMonVar.boxesInCurrentPallet = 1;
      globalMonVar.palletCount = 2;
      globalMonVar.currentPalletNumber = 2;
      globalMonVar.limitBoxInPallet = 3;

      await service.removeBoxFromPallet(5);

      expect(globalMonVar.palletCount).toBe(1);
      expect(globalMonVar.currentPalletNumber).toBe(1);
      // текущая реализация: после обнуления сразу подставляет лимит
      expect(globalMonVar.boxesInCurrentPallet).toBe(3);
    });

    it('не закрывает паллету, если счётчик коробок уже нулевой (уходит в минус)', async () => {
      globalMonVar.boxesInCurrentPallet = 0;
      globalMonVar.palletCount = 2;
      globalMonVar.currentPalletNumber = 2;
      globalMonVar.limitBoxInPallet = 3;

      await service.removeBoxFromPallet(5);

      expect(globalMonVar.boxesInCurrentPallet).toBe(-1);
      expect(globalMonVar.palletCount).toBe(2);
      expect(globalMonVar.currentPalletNumber).toBe(2);
    });

    it('пробрасывает ошибку изъятия', async () => {
      codeRepository.removeBoxFromPalletInTable.mockRejectedValue(
        new Error('remove'),
      );

      await expect(service.removeBoxFromPallet(1)).rejects.toThrow('remove');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // deletePallet
  // ==========================================================================
  describe('deletePallet', () => {
    it('пересчитывает счётчики для текущей паллеты', async () => {
      globalMonVar.limitProductInBox = 4;
      globalMonVar.limitBoxInPallet = 3;
      globalMonVar.productCount = 10;
      globalMonVar.boxCount = 5;
      globalMonVar.palletCount = 3;
      globalMonVar.currentPalletNumber = 2;
      globalMonVar.boxesInCurrentPallet = 2;
      globalMonVar.productsInCurrentBox = 2;
      codeRepository.getCodesByPalletNumber.mockResolvedValue(['A']);

      await service.deletePallet(2);

      // productInLastPallet = 4 * (2 - 1) + 2 = 6
      expect(globalMonVar.productCount).toBe(4);
      expect(globalMonVar.palletCount).toBe(2);
      expect(globalMonVar.boxCount).toBe(3);
      expect(globalMonVar.productsInCurrentBox).toBe(4);
      expect(globalMonVar.boxesInCurrentPallet).toBe(4);
      expect(codeHelperService.sendDBDataToFrontend).toHaveBeenCalled();
    });

    it('не оставляет нулевые счётчики (подставляет 1)', async () => {
      globalMonVar.limitProductInBox = 4;
      globalMonVar.productCount = 6;
      globalMonVar.boxCount = 2;
      globalMonVar.palletCount = 2;
      globalMonVar.currentPalletNumber = 2;
      globalMonVar.boxesInCurrentPallet = 2;
      globalMonVar.productsInCurrentBox = 2;

      await service.deletePallet(2);

      expect(globalMonVar.productCount).toBe(0);
      expect(globalMonVar.productsInCurrentBox).toBe(1);
      expect(globalMonVar.boxesInCurrentPallet).toBe(1);
    });

    it('для чужой паллеты вычитает лимиты', async () => {
      globalMonVar.limitProductInBox = 4;
      globalMonVar.limitBoxInPallet = 3;
      globalMonVar.productCount = 20;
      globalMonVar.boxCount = 6;
      globalMonVar.palletCount = 3;
      globalMonVar.currentPalletNumber = 2;

      await service.deletePallet(1);

      expect(globalMonVar.palletCount).toBe(2);
      expect(globalMonVar.boxCount).toBe(3);
      expect(globalMonVar.productCount).toBe(8);
    });

    it('пробрасывает ошибку удаления', async () => {
      codeRepository.deletePalletFromTables.mockRejectedValue(
        new Error('delete pallet'),
      );

      await expect(service.deletePallet(1)).rejects.toThrow('delete pallet');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // moveBoxToPallet
  // ==========================================================================
  describe('moveBoxToPallet', () => {
    it('переносит коробку на другую паллету', async () => {
      await service.moveBoxToPallet(4, 9);

      expect(codeHelperService.checkTableExists).toHaveBeenCalledWith(TABLE);
      expect(codeRepository.moveBoxToPalletInTable).toHaveBeenCalledWith(
        TABLE,
        4,
        9,
      );
    });
  });

  // ==========================================================================
  // deleteTablesStartingWithNumber
  // ==========================================================================
  describe('deleteTablesStartingWithNumber', () => {
    it('удаляет только таблицы, имя которых начинается с цифры', async () => {
      entityManager.query.mockResolvedValueOnce([
        { table_name: '2026_11_10_12_00_00' },
        { table_name: 'code_entity' },
        { table_name: '1_task' },
      ]);

      await service.deleteTablesStartingWithNumber();

      expect(entityManager.query).toHaveBeenCalledTimes(3);
      expect(entityManager.query).toHaveBeenCalledWith(
        'DROP TABLE IF EXISTS "2026_11_10_12_00_00"',
      );
      expect(entityManager.query).toHaveBeenCalledWith(
        'DROP TABLE IF EXISTS "1_task"',
      );
      expect(entityManager.query).not.toHaveBeenCalledWith(
        'DROP TABLE IF EXISTS "code_entity"',
      );
    });

    it('ничего не удаляет, если таблиц нет', async () => {
      entityManager.query.mockResolvedValueOnce([]);

      await service.deleteTablesStartingWithNumber();

      expect(entityManager.query).toHaveBeenCalledTimes(1);
    });

    it('логирует и пробрасывает ошибку запроса', async () => {
      entityManager.query.mockRejectedValue(new Error('select failed'));

      await expect(service.deleteTablesStartingWithNumber()).rejects.toThrow(
        'select failed',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getLogs
  // ==========================================================================
  describe('getLogs', () => {
    const logs = Array.from({ length: 25 }, (_, i) => ({ message: `log-${i}` }));

    it('по умолчанию отдаёт первые 10 записей', async () => {
      (getLogMessages as jest.Mock).mockReturnValue(logs);

      const result = await service.getLogs();

      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(10);
      expect(result.data[0]).toEqual({ message: 'log-0' });
    });

    it('учитывает страницу и лимит', async () => {
      (getLogMessages as jest.Mock).mockReturnValue(logs);

      const result = await service.getLogs(2, 10);

      expect(result.data).toHaveLength(10);
      expect(result.data[0]).toEqual({ message: 'log-10' });
      expect(result.data[9]).toEqual({ message: 'log-19' });
    });

    it('на последней неполной странице отдаёт остаток', async () => {
      (getLogMessages as jest.Mock).mockReturnValue(logs);

      const result = await service.getLogs(3, 10);

      expect(result.data).toHaveLength(5);
      expect(result.data[0]).toEqual({ message: 'log-20' });
    });

    it('на пустом списке возвращает пустую страницу', async () => {
      (getLogMessages as jest.Mock).mockReturnValue([]);

      const result = await service.getLogs();

      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  // ==========================================================================
  // initializeCleanupSystem (сейчас вызов закомментирован в конструкторе)
  // ==========================================================================
  describe('initializeCleanupSystem', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('создаёт таблицу метаданных, чистит таблицы и ставит интервал', async () => {
      jest.useFakeTimers();

      await (service as any).initializeCleanupSystem();

      expect(codeHelperService.createCleanupMetadataTable).toHaveBeenCalledTimes(
        1,
      );
      expect(codeHelperService.deleteOldTablesIfNeeded).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('не падает, если инициализация очистки сломалась', async () => {
      jest.useFakeTimers();
      codeHelperService.createCleanupMetadataTable.mockRejectedValue(
        new Error('cleanup broken'),
      );

      await expect(
        (service as any).initializeCleanupSystem(),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Ошибка инициализации системы очистки таблиц',
        expect.any(Error),
      );
    });
  });
});
