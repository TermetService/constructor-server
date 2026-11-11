/**
 * Unit-тесты для CodeController: проверяем только проксирование в сервисы
 * и обработку ответов (реальные сервисы замоканы).
 *
 * Запуск: npx jest --runInBand src/code/code.controller.spec.ts
 */
jest.mock('./code.service', () => ({ CodeService: class {} }));
jest.mock('./code-helper.service', () => ({ CodeHelperService: class {} }));
jest.mock('./code-search.service', () => ({ CodeSearchService: class {} }));
jest.mock('./code-migration.service', () => ({ CodeMigrationService: class {} }));

import { CodeController } from './code.controller';

describe('CodeController', () => {
  let controller: CodeController;
  let codeService: any;
  let codeHelperService: any;
  let codeSearchService: any;
  let codeMigrationService: any;

  const makeRes = () => ({
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.resetAllMocks();

    codeService = {
      handValidateAndSaveCode: jest.fn(),
      validateAndSaveCode: jest.fn(),
      deleteCodes: jest.fn(),
      addCodeToBox: jest.fn(),
      deleteBox: jest.fn(),
      removeBoxFromPallet: jest.fn(),
      deletePallet: jest.fn(),
      deleteTablesStartingWithNumber: jest.fn(),
      moveBoxToPallet: jest.fn(),
      getLogs: jest.fn(),
    };
    codeHelperService = { sendDBDataToFrontend: jest.fn() };
    codeSearchService = {
      search: jest.fn(),
      searchWithPageNumber: jest.fn(),
      searchByBoxNumber: jest.fn(),
      getAllBoxes: jest.fn(),
      getAllPallets: jest.fn(),
      getProductCountInPallet: jest.fn(),
    };
    codeMigrationService = { quickMigrateAll: jest.fn() };

    controller = new CodeController(
      codeService,
      codeHelperService,
      codeMigrationService,
      codeSearchService,
    );
  });

  it('ping отвечает ok', () => {
    expect(controller.ping()).toMatchObject({ status: 'ok', message: 'pong' });
  });

  describe('handSaveCode', () => {
    it('заменяет @ на GS и отдаёт success=true', async () => {
      codeService.handValidateAndSaveCode.mockResolvedValue({
        isAddCode: true,
      });
      const res = makeRes();

      await controller.handSaveCode({ code: 'a@b' }, res);

      expect(codeService.handValidateAndSaveCode).toHaveBeenCalledWith('a\x1Db');
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('отдаёт success=false, если код не добавлен', async () => {
      codeService.handValidateAndSaveCode.mockResolvedValue({
        isAddCode: false,
      });
      const res = makeRes();

      await controller.handSaveCode({ code: 'a' }, res);

      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('отвечает 500 при ошибке сервиса', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      codeService.handValidateAndSaveCode.mockRejectedValue(new Error('boom'));
      const res = makeRes();

      await controller.handSaveCode({ code: 'a' }, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });
  });

  it('deleteCodes проксирует массив кодов и отвечает успехом', async () => {
    codeService.deleteCodes.mockResolvedValue(undefined);
    const res = makeRes();
    const codes = [{ code: 'A', boxNumber: 1 }];

    await controller.deleteCodes({ codes }, res);

    expect(codeService.deleteCodes).toHaveBeenCalledWith(codes);
    expect(res.send).toHaveBeenCalledWith('Коды успешно удалены');
  });

  it('deleteTables не ждёт завершения удаления таблиц', async () => {
    codeService.deleteTablesStartingWithNumber.mockResolvedValue(undefined);

    await controller.deleteTables();

    expect(codeService.deleteTablesStartingWithNumber).toHaveBeenCalledTimes(1);
  });
});
