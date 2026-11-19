import { setConfigPath } from 'src/config/app-config';
import { config } from 'src/config/config';
/**
 * Рантайм-флаги читаются и пишутся в config.json (не в .env).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RuntimeFlagsService } from './runtime-flags.service';
import { ValidationFlag } from './validation-flags';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('RuntimeFlagsService (config.json)', () => {
  let dir: string;

  const writeJson = (data: any) =>
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(data));

  const readJson = () =>
    JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-config-'));
    setConfigPath(path.join(dir, 'config.json'));
    writeJson({});
    jest.clearAllMocks();
  });

  afterEach(() => {
    setConfigPath(null);
            fs.rmSync(dir, { recursive: true, force: true });
  });

  it('по умолчанию: паллета не общая, label включён', () => {
    const service = new RuntimeFlagsService(logger as any);

    expect(service.isPalletShared()).toBe(false);
    expect(service.isBoxLabel()).toBe(true);
  });

  it('читает флаги из config.json', () => {
    writeJson({ flagInpallet: true, flagInBoxLable: false });
    const service = new RuntimeFlagsService(logger as any);

    service.onModuleInit();

    expect(service.isPalletShared()).toBe(true);
    expect(service.isBoxLabel()).toBe(false);
  });

  it('понимает строки "true"/"false" из JSON', () => {
    writeJson({ flagInpallet: 'true', flagInBoxLable: 'false' });
    const service = new RuntimeFlagsService(logger as any);

    service.onModuleInit();

    expect(service.isPalletShared()).toBe(true);
    expect(service.isBoxLabel()).toBe(false);
  });

  it('setFlags пишет в config.json и применяет сразу', async () => {
    const service = new RuntimeFlagsService(logger as any);

    const flags = await service.setFlags({
      flagInpallet: true,
      flagInBoxLable: false,
    });

    expect(flags).toEqual({ flagInpallet: true, flagInBoxLable: false });
    expect(service.isPalletShared()).toBe(true);
    expect(readJson()).toEqual({ flagInpallet: true, flagInBoxLable: false });
  });

  it('setFlags сохраняет остальные ключи файла', async () => {
    writeJson({ IS_PRINT: true, DB_PORT: 5432 });
    const service = new RuntimeFlagsService(logger as any);

    await service.setFlags({ flagInpallet: true });

    expect(readJson()).toMatchObject({
      IS_PRINT: true,
      DB_PORT: 5432,
      flagInpallet: true,
    });
  });

  it('игнорирует неизвестные ключи и не-булевы значения', async () => {
    const service = new RuntimeFlagsService(logger as any);

    await service.setFlags({ unknown: true, flagInpallet: 'yes' } as any);

    expect(readJson()).toEqual({});
    expect(service.isPalletShared()).toBe(false);
  });

  it('getSettings отдаёт флаги, путь и настройки с маской секретов', () => {
    writeJson({ IS_PRINT: true, DB_PASSWORD: 'secret' });
    const service = new RuntimeFlagsService(logger as any);

    const settings = service.getSettings();

    expect(settings.flags).toEqual({
      flagInpallet: false,
      flagInBoxLable: true,
    });
    expect(settings.configPath).toContain('config.json');
    expect(settings.settings).toEqual(
      expect.arrayContaining([
        { key: 'IS_PRINT', value: 'true' },
        { key: 'DB_PASSWORD', value: '***' },
      ]),
    );
  });

  it('отсутствующий файл не ломает сервис', () => {
    fs.rmSync(path.join(dir, 'config.json'), { force: true });
    const service = new RuntimeFlagsService(logger as any);

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.isPalletShared()).toBe(false);
  });

  describe('флаги проверок', () => {
    it('по умолчанию все проверки включены', () => {
      const service = new RuntimeFlagsService(logger as any);

      expect(service.isValidationEnabled(ValidationFlag.CodeLength)).toBe(true);
      expect(service.isValidationEnabled(ValidationFlag.BoxSameBox)).toBe(true);
    });

    it('читает выключенную проверку из config.json', () => {
      writeJson({
        [ValidationFlag.CodeLength]: false,
        [ValidationFlag.BoxSameBox]: 'false',
      });
      const service = new RuntimeFlagsService(logger as any);

      service.onModuleInit();

      expect(service.isValidationEnabled(ValidationFlag.CodeLength)).toBe(false);
      expect(service.isValidationEnabled(ValidationFlag.BoxSameBox)).toBe(false);
      expect(service.isValidationEnabled(ValidationFlag.CodeGtin)).toBe(true);
    });

    it('setValidationFlags сохраняет и применяет сразу', async () => {
      const service = new RuntimeFlagsService(logger as any);

      const flags = await service.setValidationFlags({
        [ValidationFlag.BoxProductsExist]: false,
      });

      expect(flags[ValidationFlag.BoxProductsExist]).toBe(false);
      expect(readJson()[ValidationFlag.BoxProductsExist]).toBe(false);
      expect(
        service.isValidationEnabled(ValidationFlag.BoxProductsExist),
      ).toBe(false);
    });

    it('getSettings отдаёт флаги проверок и их описание', () => {
      const service = new RuntimeFlagsService(logger as any);

      const settings = service.getSettings();

      expect(settings.validationFlags[ValidationFlag.CodeGtin]).toBe(true);
      expect(settings.validationFlagsMeta).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: ValidationFlag.CodeGtin,
            group: 'code',
            label: 'GTIN задания',
          }),
          expect.objectContaining({
            key: ValidationFlag.BoxSameBox,
            group: 'boxLabel',
            label: 'Одна коробка',
          }),
        ]),
      );
    });
  });
});
