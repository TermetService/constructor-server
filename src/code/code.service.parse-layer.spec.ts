/**
 * Тесты CodeService.ParseLayer: разбор кодов по слоям с камеры.
 *
 * Конфигурация задания: 3 слоя по 5 кодов, в коробке 15.
 * Камера — Camera1.
 */
jest.mock('src/monitoring/helper', () => ({
  isValidCode: jest.fn(),
  isCodeExists: jest.fn(),
  CodeValidationReason: {
    Empty: 'empty',
    Length: 'length',
    Prefix: 'prefix',
    Gtin: 'gtin',
    Duplicate: 'duplicate',
    CodeIsCode: 'CodeIsCode',
  },
}));
jest.mock('src/app.gateway', () => ({ AppGateway: class {} }));
jest.mock('src/path.util', () => ({
  getRecordsTextFilesDirectory: () => 'tmp-records',
  sha: 'stub',
}));
jest.mock('src/template/template.service', () => ({ TemplateService: class {} }));
jest.mock('src/printers/printer.service', () => ({ PrinterService: class {} }));
jest.mock('src/NumberBoxETE/numberBoxETE.service', () => ({
  NumberBoxETEService: class {},
}));
jest.mock('src/logger-winston/winston.config', () => ({
  codeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getLastLogMessages: jest.fn(() => []),
}));

import { CodeService } from './code.service';
import { CodeLayersService } from './helpers/code-layers.service';
import { isValidCode } from 'src/monitoring/helper';

const GTIN = '04810272003892';
const CAMERA = 'Camera1';
const LAYER_CODES = 5;

/** Валидный код длиной 78 (01 + GTIN + 21 + серийник + GS + 91 + хвост) */
const makeCode = (serial: string): string =>
  '01' +
  GTIN +
  '21' +
  serial.padEnd(6, 'X').slice(0, 6) +
  '\x1D' +
  '91' +
  'X'.repeat(51);

const makeGlobalMonVar = (overrides: Record<string, any> = {}) => ({
  task: {
    gtin: GTIN,
    codesInLayer: LAYER_CODES,
    layers: '3',
    layer1: '5',
    layer2: '5',
    layer3: '5',
    codes: [],
    ...(overrides.task || {}),
  },
  taskName: 'task.json',
  tableName: 'test-2026_11_13_10_00_00',
  productCount: 0,
  boxCount: 0,
  palletCount: 0,
  currentBoxNumber: 1,
  currentPalletNumber: 1,
  productsInCurrentBox: 0,
  boxesInCurrentPallet: 0,
  limitProductInBox: 15,
  limitBoxInPallet: 6,
  isFirstBoxOdd: true,
  isMonitoring: true,
  isOldSorting: false,
  isPaused: false,
  codeStatus: null,
  circuitResetDelayTime: 0,
  konturTime: 0,
  ...overrides,
});

describe('CodeService.ParseLayer (Camera1, 3 слоя по 5, коробка 15)', () => {
  let service: CodeService;
  let globalMonVar: any;
  let appGateway: any;
  let logger: any;
  let layersService: CodeLayersService;

  const fiveCodes = () => [
    makeCode('AAAAAA'),
    makeCode('BBBBBB'),
    makeCode('CCCCCC'),
    makeCode('DDDDDD'),
    makeCode('EEEEEE'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (isValidCode as jest.Mock).mockResolvedValue({ isValid: true });

    globalMonVar = makeGlobalMonVar();
    appGateway = { sendCoordinates: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    layersService = new CodeLayersService(globalMonVar, logger);

    service = new CodeService(
      {} as any, // CodeRepository
      {} as any, // EntityManager
      {} as any, // EventEmitter2
      appGateway,
      { check: jest.fn() } as any, // BoxLabelCheckService
      {} as any, // CodeTablesService
      {} as any, // CodeSaveService
      {} as any, // CodeLabelsService
      {} as any, // CodeCountsService
      {} as any, // CodeCameraStateService
      { isPalletShared: () => false, isBoxLabel: () => true, isValidationEnabled: () => true } as any, // RuntimeFlagsService
      {} as any, // NumberBoxETEService
      layersService,
      globalMonVar,
      logger,
    );
  });

  it('5 кодов при codesInLayer = 5 — полный слой, координаты не отправляются', async () => {
    const codes = fiveCodes();

    const result = await service.ParseLayer(codes, CAMERA);

    expect(result).toEqual({ isValid: true, codes });
    expect(appGateway.sendCoordinates).not.toHaveBeenCalled();
  });

  it('3 кода из 5 — слой неполный, координаты отправляются, isValid=false', async () => {
    const codes = fiveCodes().slice(0, 3);

    const result = await service.ParseLayer(codes, CAMERA);

    expect(result).toEqual({ isValid: false, codes: [] });
    expect(appGateway.sendCoordinates).toHaveBeenCalledTimes(1);
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([[], [], []]);
  });

  it('один невалидный код из 5 — isValid=false, координаты не отправляются', async () => {
    const codes = fiveCodes();
    (isValidCode as jest.Mock)
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: false, message: 'Неверный код' });

    const result = await service.ParseLayer(codes, CAMERA);

    expect(result.isValid).toBe(false);
    expect(result.codes).toEqual([
      { code: codes[4], reason: 'Неверный код' },
    ]);
    expect(appGateway.sendCoordinates).not.toHaveBeenCalled();
  });

  it('неполный слой с невалидным кодом — и ошибка, и координаты', async () => {
    const codes = fiveCodes().slice(0, 3);
    (isValidCode as jest.Mock)
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: false, message: 'Дубликат' })
      .mockResolvedValueOnce({ isValid: true });

    const result = await service.ParseLayer(codes, CAMERA);

    expect(result.isValid).toBe(false);
    expect(result.codes).toEqual([{ code: codes[1], reason: 'Дубликат' }]);
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([[], [], []]);
  });

  it('разбирает новый формат координат: "(x,y)@КОД"', async () => {
    const code1 = makeCode('AAAAAA');
    const code2 = makeCode('BBBBBB');

    const result = await service.ParseLayer(
      [`(10,20)@${code1}`, `(30,40)@${code2}`],
      CAMERA,
    );

    // кодов меньше, чем в слое — слой неполный
    expect(result).toEqual({ isValid: false, codes: [] });
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([
      ['10,20'],
      ['30,40'],
    ]);
  });

  it('разбирает старый формат координат: "(x,y)КОД"', async () => {
    const code = makeCode('AAAAAA');

    const result = await service.ParseLayer([`(10,20)${code}`], CAMERA);

    expect(result).toEqual({ isValid: false, codes: [] });
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([['10,20']]);
  });

  it('неподходящая длина не отбрасывается при разборе — её отсеивает validateCode', async () => {
    const codes = fiveCodes().slice(0, 4);

    const result = await service.ParseLayer([...codes, 'short'], CAMERA);

    // извлечение кодов больше не фильтрует по длине (нужно для привязки коробки),
    // невалидный код отсеивается на этапе validateCode
    expect(result.codes).toHaveLength(5);
  });

  it('пустой скан — слой неполный, координаты отправляются', async () => {
    const result = await service.ParseLayer([], CAMERA);

    expect(result).toEqual({ isValid: false, codes: [] });
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([]);
  });

  it('пустой скан с пятибуквенным "NoRead" не ломает разбор', async () => {
    const result = await service.ParseLayer(['NoRead'], CAMERA);

    expect(result).toEqual({ isValid: false, codes: [] });
    expect(appGateway.sendCoordinates).toHaveBeenCalledWith([[]]);
  });

  it('имя камеры не влияет на результат', async () => {
    const codes = fiveCodes();

    const result = await service.ParseLayer(codes, CAMERA);

    expect(result.isValid).toBe(true);
    expect(result.codes).toHaveLength(5);
  });

  it('codesInLayer строкой "5" приводится к числу и не шлёт координаты', async () => {
    // из 1С значения приходят строками, ParseLayer приводит их через +
    globalMonVar.task.codesInLayer = '5';

    const result = await service.ParseLayer(fiveCodes(), CAMERA);

    expect(result.isValid).toBe(true);
    expect(appGateway.sendCoordinates).not.toHaveBeenCalled();
  });

  it('знание слоёв: конфигурация и общая вместимость коробки', () => {
    expect(layersService.getLayersConfig()).toEqual([5, 5, 5]);
    expect(layersService.calculateTotalExpectedProducts()).toBe(15);
    expect(layersService.getExpectedCodesForLayer(0)).toBe(5);
    expect(layersService.getExpectedCodesForLayer(2)).toBe(5);
  });
});
