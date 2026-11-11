/**
 * Прямые тесты единственной точки проверки кода: isValidCode.
 * Проверка дубликата передаётся снаружи (deps.isDuplicate), поэтому БД не нужна.
 */
jest.mock('src/modbus/modbus.service', () => ({ ModbusService: class {} }));

import { CodeValidationReason, isValidCode } from './helper';

const GTIN = '04601234567890';
const VALID_CODE = '01' + GTIN + 'A'.repeat(17); // 33 символа

describe('isValidCode', () => {
  let logger: any;
  let previousCodeLength: string | undefined;

  beforeAll(() => {
    previousCodeLength = process.env.CODE_LENGTH;
    process.env.CODE_LENGTH = '31,33';
  });

  afterAll(() => {
    if (previousCodeLength === undefined) {
      delete process.env.CODE_LENGTH;
    } else {
      process.env.CODE_LENGTH = previousCodeLength;
    }
  });

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
  });

  it('отклоняет пустую строку', async () => {
    const result = await isValidCode('', GTIN, logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Empty,
      message: 'Пустой код',
    });
    expect(logger.error).toHaveBeenCalledWith('Код: Пустой код');
  });

  it('отклоняет undefined', async () => {
    const result = await isValidCode(undefined as any, GTIN, logger);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe(CodeValidationReason.Empty);
  });

  it('считает строку из пробелов пустым кодом', async () => {
    const result = await isValidCode('   ', GTIN, logger);

    expect(result.reason).toBe(CodeValidationReason.Empty);
  });

  it('отклоняет код недопустимой длины', async () => {
    const result = await isValidCode('01' + GTIN, GTIN, logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Length,
      message: 'Неверная длина кода: 16',
    });
  });

  it('отклоняет код без префикса 01', async () => {
    const result = await isValidCode('02' + GTIN + 'A'.repeat(17), GTIN, logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Prefix,
      message: 'Код должен начинаться с "01"',
    });
  });

  it('отклоняет код с чужим GTIN', async () => {
    const result = await isValidCode(
      '01' + '0'.repeat(14) + 'A'.repeat(17),
      GTIN,
      logger,
    );

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Gtin,
      message: 'Код не соответствует GTIN задания',
    });
  });

  it('принимает корректный код', async () => {
    const result = await isValidCode(VALID_CODE, GTIN, logger);

    expect(result).toEqual({ isValid: true });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('отклоняет дубликат и передаёт код в проверку', async () => {
    const isDuplicate = jest.fn().mockResolvedValue(true);

    const result = await isValidCode(VALID_CODE, GTIN, logger, { isDuplicate });

    expect(isDuplicate).toHaveBeenCalledWith(VALID_CODE);
    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Duplicate,
      message: `Найден дубликат кода ${VALID_CODE}`,
    });
  });

  it('пропускает код, если дубликата нет', async () => {
    const isDuplicate = jest.fn().mockResolvedValue(false);

    const result = await isValidCode(VALID_CODE, GTIN, logger, { isDuplicate });

    expect(result.isValid).toBe(true);
  });

  it('не ходит в БД, если формат кода уже неверный', async () => {
    const isDuplicate = jest.fn();

    const result = await isValidCode('bad', GTIN, logger, { isDuplicate });

    expect(result.isValid).toBe(false);
    expect(isDuplicate).not.toHaveBeenCalled();
  });

  it('пробрасывает ошибку проверки дубликата', async () => {
    const isDuplicate = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(
      isValidCode(VALID_CODE, GTIN, logger, { isDuplicate }),
    ).rejects.toThrow('db down');
  });
});
