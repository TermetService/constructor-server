/**
 * Тесты методов, перенесённых из удалённого хелпера:
 * разбор скана (CodeScanService), веса (CodeWeightsService)
 * и HTTP-клиент сервиса кодов (CodeRemoteService).
 */
import { SearchFrom, SearchStatus } from '../types';
import { CodeScanService } from './code-scan.service';
import { CodeWeightsService } from './code-weights.service';
import { CodeRemoteService } from './code-remote.service';

const GTIN = '04810272003892';
const TABLE = 'test-2026_11_12_10_00_00';

const makeGlobalMonVar = (overrides: Record<string, unknown> = {}) =>
  ({
    task: {
      gtin: GTIN,
      ITF14: '14810272003899',
      batch: '123',
      date_manufacture: '01.02.2024',
      date_expiration: '01.02.2025',
      codes: [],
    },
    taskName: 'task.json',
    tableName: TABLE,
    ...overrides,
  }) as any;

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('CodeScanService', () => {
  let logger: any;

  beforeEach(() => {
    logger = makeLogger();
    delete process.env.IS_USING_API;
  });

  it('разбирает пару «баркод + QR» и достаёт веса', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);
    const barcode =
      '01' + GTIN + '21' + 'ABCDEF' + '\x1D' + '91' + 'X'.repeat(51);
    const qr = '(3103)1500(3303)1600';

    const result = service.ParseCode(`${barcode}@${qr}`);

    expect(result).toMatchObject({
      parse: true,
      barcod: barcode,
      qrCod: '1500',
      brutto_weight: '1600',
    });
  });

  it('без API требует ровно два кода', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);

    const result = service.ParseCode('010481027200389221');

    expect(result.parse).toBe(false);
    expect(result.message).toContain('Ожидается 2 кода');
  });

  it('отклоняет NoRead', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);

    expect(service.ParseCode('NoRead@(3103)10').parse).toBe(false);
  });

  it('при API принимает один обычный код', () => {
    process.env.IS_USING_API = 'true';
    const service = new CodeScanService(makeGlobalMonVar(), logger);
    const barcode =
      '01' + GTIN + '21' + 'ABCDEF' + '\x1D' + '91' + 'X'.repeat(51);

    expect(service.ParseCode(barcode)).toMatchObject({
      parse: true,
      barcod: barcode,
    });
  });

  it('extractQrValue: приоритет AI 3103/3303, иначе по точкам', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);

    expect(service.extractQrValue('(3103)1500(3303)1600')).toEqual({
      weight: '1500',
      brutto_weight: '1600',
    });
    expect(service.extractQrValue('0.25')).toEqual({
      weight: '25',
      brutto_weight: '0',
    });
  });

  it('определяет тип кода для поиска', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);

    expect(
      service.determineCodeType('01' + GTIN + '21' + 'A'.repeat(10)).type,
    ).toBe(SearchFrom.Code);
    expect(
      service.determineCodeType('01' + GTIN + '11' + 'A'.repeat(10)).type,
    ).toBe(SearchFrom.Box);
    expect(
      service.determineCodeType('02' + GTIN + '11' + 'A'.repeat(10)).type,
    ).toBe(SearchFrom.Pallet);
    expect(service.determineCodeType('short').reason).toContain('короткий');
  });

  it('extractCodeAfter21 достаёт серийник до GS', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);
    const code = '01' + GTIN + '21' + 'ABC123' + '\x1D' + '91xyz';

    expect(service.extractCodeAfter21(code)).toBe('ABC123');
    expect(service.extractCodeAfter21('bad')).toBeNull();
  });

  it('parseCodeForBezerba отделяет серийник и payload', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);
    const code = '01' + GTIN + '21' + 'ABC123' + '\x1D' + '92payload';

    expect(service.parseCodeForBezerba(code)).toEqual({
      serial: 'ABC123',
      payload: 'payload',
    });
  });

  it('simpleDetectCodeType различает баркод и QR', () => {
    const service = new CodeScanService(makeGlobalMonVar(), logger);

    expect(service.simpleDetectCodeType('01' + GTIN + '21' + 'A').type).toBe(
      'barcode',
    );
    expect(service.simpleDetectCodeType('(01)123').type).toBe('qr');
    expect(service.simpleDetectCodeType('').type).toBe('unknown');
  });
});

describe('CodeWeightsService', () => {
  let logger: any;
  let entityManager: any;
  let codeRepository: any;

  beforeEach(() => {
    logger = makeLogger();
    entityManager = { query: jest.fn() };
    codeRepository = { tableExists: jest.fn().mockResolvedValue(true) };
  });

  const makeService = (remoteDb?: any) =>
    new CodeWeightsService(
      entityManager,
      codeRepository,
      makeGlobalMonVar(),
      logger,
      remoteDb,
    );

  it('вес коробки считается по незакрытым коробкам', async () => {
    entityManager.query.mockResolvedValue([{ total_weight: '12.5' }]);

    const result = await makeService().getWeightOfCurrentBox();

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('box_label IS NULL AND pallet_label IS NULL'),
    );
    expect(result).toEqual({
      success: true,
      status: SearchStatus.SUCCESS,
      message: 'Вес коробки получен',
      data: { weight: 12.5, unit: 'kg' },
    });
  });

  it('вес паллеты считается по закрытым коробкам', async () => {
    entityManager.query.mockResolvedValue([{ total_weight: '30' }]);

    const result = await makeService().getWeightOfCurrentPallet();

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('pallet_label IS NULL AND box_label IS NOT NULL'),
    );
    expect(result.data).toEqual({ weight: 30, unit: 'kg' });
  });

  it('общий вес фасовки — сумма по всей таблице', async () => {
    entityManager.query.mockResolvedValue([{ total_weight: '100' }]);

    const result = await makeService().getCommonWeightOfCurrentPacking();

    expect(entityManager.query).toHaveBeenCalledWith(
      `SELECT SUM(CAST(weight AS DECIMAL)) AS total_weight FROM "${TABLE}" `,
    );
    expect(result.data).toEqual({ weight: 100, unit: 'kg' });
  });

  it('если таблицы нет — success=false', async () => {
    codeRepository.tableExists.mockResolvedValue(false);

    const result = await makeService().getWeightOfCurrentBox();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Таблица не создана');
    expect(entityManager.query).not.toHaveBeenCalled();
  });

  it('ошибка запроса возвращается как success=false', async () => {
    entityManager.query.mockRejectedValue(new Error('no column weight'));

    const result = await makeService().getWeightOfCurrentBox();

    expect(result.success).toBe(false);
    expect(result.error).toBe('no column weight');
  });

  it('вес из удалённой БД без адаптера — null и предупреждение', async () => {
    await expect(makeService().getWeightFromRemoteDb('CODE')).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('адаптер не подключён'),
    );
  });

  it('вес из удалённой БД через адаптер', async () => {
    const remoteDb = {
      findOne: jest.fn().mockResolvedValue({ weight: '1.41' }),
      executeQuery: jest.fn(),
      getRemoteWeightColumnName: () => 'weight',
      getRemoteTableName: () => 'codes',
      getRemoteCodeColumnName: () => 'code',
    };
    process.env.CODE_SEARCH_MODE = '93';

    const result = await makeService(remoteDb).getWeightFromRemoteDb(
      'PART93ABC',
    );

    expect(remoteDb.findOne).toHaveBeenCalledWith(
      'SELECT [weight] FROM [codes] WHERE [code] LIKE @code',
      { code: 'ABC%' },
    );
    expect(result).toBe('1.41');
  });

  it('проверка подключения к удалённой БД без адаптера бросает ошибку', async () => {
    await expect(makeService().checkRemoteDatabaseConnection()).rejects.toThrow(
      'адаптер не подключён',
    );
  });

  it('проверка подключения через адаптер', async () => {
    const remoteDb = {
      findOne: jest.fn(),
      executeQuery: jest.fn().mockResolvedValue([{ ok: 1 }]),
      getRemoteWeightColumnName: () => 'weight',
      getRemoteTableName: () => 'codes',
      getRemoteCodeColumnName: () => 'code',
    };

    await expect(
      makeService(remoteDb).checkRemoteDatabaseConnection(),
    ).resolves.toBeUndefined();
  });
});

describe('CodeRemoteService', () => {
  let logger: any;
  let client: any;

  beforeEach(() => {
    logger = makeLogger();
    client = { post: jest.fn(), delete: jest.fn() };
    process.env.IP_SERVER = '127.0.0.1';
  });

  it('saveCurrentCode отправляет код на /code/validate-code', async () => {
    client.post.mockResolvedValue({ data: { ok: true } });

    const result = await new CodeRemoteService(logger, client).saveCurrentCode(
      'CODE',
    );

    expect(client.post).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/code/validate-code',
      { code: 'CODE' },
    );
    expect(result).toEqual({ ok: true });
  });

  it('getDuplicatesCodes отправляет список кодов', async () => {
    client.post.mockResolvedValue({ data: [] });

    await new CodeRemoteService(logger, client).getDuplicatesCodes(['A', 'B']);

    expect(client.post).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/code/get-codes',
      { codes: ['A', 'B'] },
    );
  });

  it('deleteCode удаляет код через тело запроса', async () => {
    client.delete.mockResolvedValue({ data: {} });

    await new CodeRemoteService(logger, client).deleteCode('CODE');

    expect(client.delete).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/code/delete-code',
      { data: { code: 'CODE' } },
    );
  });

  it('без IP_SERVER бросает понятную ошибку', async () => {
    delete process.env.IP_SERVER;

    await expect(
      new CodeRemoteService(logger, client).saveCurrentCode('CODE'),
    ).rejects.toThrow('IP_SERVER не задан');
  });
});
