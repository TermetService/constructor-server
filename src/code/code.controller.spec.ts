/**
 * Unit-тесты CodeController: проверяем только проксирование в сервисы
 * и обработку ответов (реальные сервисы замоканы).
 *
 * Запуск: npx jest --runInBand src/code/code.controller.spec.ts
 */
jest.mock('./code.service', () => ({ CodeService: class {} }));
jest.mock('./hand-operation.service', () => ({ HandOperation: class {} }));
jest.mock('./code-helper.service', () => ({ CodeHelperService: class {} }));
jest.mock('./code-search.service', () => ({ CodeSearchService: class {} }));
jest.mock('./code-migration.service', () => ({
  CodeMigrationService: class {},
}));

import { CodeController } from './code.controller';

describe('CodeController', () => {
  let controller: CodeController;
  let codeService: any;
  let handOper: any;
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
      validateAndSaveCode: jest.fn(),
      deleteCodes: jest.fn(),
      deleteTablesStartingWithNumber: jest.fn(),
      getLogs: jest.fn(),
    };
    handOper = {
      addCodeToBox: jest.fn(),
      deleteBox: jest.fn(),
      removeBoxFromPallet: jest.fn(),
      deletePallet: jest.fn(),
      moveBoxToPallet: jest.fn(),
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
      handOper,
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
      codeService.validateAndSaveCode.mockResolvedValue({ isAddCode: true });
      const res = makeRes();

      await controller.handSaveCode({ code: 'a@b', name: 'Camera1' }, res);

      expect(codeService.validateAndSaveCode).toHaveBeenCalledWith(
        'a\x1Db',
        'Camera1',
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('отдаёт success=false, если код не добавлен', async () => {
      codeService.validateAndSaveCode.mockResolvedValue({ isAddCode: false });
      const res = makeRes();

      await controller.handSaveCode({ code: 'a' }, res);

      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('отвечает 500 при ошибке сервиса', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      codeService.validateAndSaveCode.mockRejectedValue(new Error('boom'));
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

  it('addCodeToBox проксирует в HandOperation', async () => {
    handOper.addCodeToBox.mockResolvedValue({ id: 1 });

    const result = await controller.addCodeToBox({
      code: 'CODE',
      boxNumber: 2,
      palletNumber: 1,
    });

    expect(handOper.addCodeToBox).toHaveBeenCalledWith('CODE', 2, 1);
    expect(result).toEqual({ id: 1 });
  });

  it('moveBoxToPallet проксирует в HandOperation', async () => {
    handOper.moveBoxToPallet.mockResolvedValue(undefined);
    const res = makeRes();

    await controller.moveBoxToPallet(4, 9, res);

    expect(handOper.moveBoxToPallet).toHaveBeenCalledWith(4, 9);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Коробка 4 успешно перемещена на паллету 9',
    });
  });
});
