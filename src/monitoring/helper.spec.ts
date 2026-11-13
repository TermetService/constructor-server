/**
 * Прямые тесты единственной точки проверки кода: isValidCode.
 * Проверка дубликата и списка задания передаётся снаружи (deps), БД не нужна.
 */
jest.mock('src/modbus/modbus.service', () => ({ ModbusService: class {} }));

import { CodeValidationReason, isValidCode } from './helper';

const GTIN = '04810272003892';
const VALID_CODE =
  '01' + GTIN + '21' + 'ABCDEF' + '\x1D' + '91' + 'X'.repeat(51); // 78 символов

const task = (overrides: Record<string, unknown> = {}) => ({
  gtin: GTIN,
  codes: [VALID_CODE],
  ...overrides,
});

describe('isValidCode', () => {
  let logger: any;
  let previousCodeLength: string | undefined;

  beforeAll(() => {
    previousCodeLength = process.env.CODE_LENGTH;
    process.env.CODE_LENGTH = '78';
  });

  afterAll(() => {
    if (previousCodeLength === undefined) delete process.env.CODE_LENGTH;
    else process.env.CODE_LENGTH = previousCodeLength;
  });

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
  });

  it('отклоняет пустую строку', async () => {
    const result = await isValidCode('', task(), logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Empty,
      message: 'Пустой код',
    });
    expect(logger.error).toHaveBeenCalledWith('Код: Пустой код');
  });

  it('отклоняет undefined', async () => {
    const result = await isValidCode(undefined as any, task(), logger);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe(CodeValidationReason.Empty);
  });

  it('считает строку из пробелов пустым кодом', async () => {
    const result = await isValidCode('   ', task(), logger);

    expect(result.reason).toBe(CodeValidationReason.Empty);
  });

  it('отклоняет код недопустимой длины', async () => {
    const result = await isValidCode('01' + GTIN, task(), logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Length,
      message: 'Неверная длина кода: 16',
    });
  });

  it('отклоняет код без префикса 01', async () => {
    const code = '02' + GTIN + '21' + 'ABCDEF' + '\x1D' + '91' + 'X'.repeat(51);
    const result = await isValidCode(code, task(), logger);

    expect(result.reason).toBe(CodeValidationReason.Prefix);
  });

  it('отклоняет код с чужим GTIN', async () => {
    const code =
      '01' + '0'.repeat(14) + '21' + 'ABCDEF' + '\x1D' + '91' + 'X'.repeat(51);
    const result = await isValidCode(code, task(), logger);

    expect(result.reason).toBe(CodeValidationReason.Gtin);
  });

  it('отклоняет код, не прошедший проверку формата', async () => {
    const code = '01' + GTIN + '21' + 'Z'.repeat(60); // 78 символов, но не тот формат
    const result = await isValidCode(code, task(), logger);

    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.CodeIsCode,
      message: 'Код не соответствует формату кода',
    });
  });

  it('принимает корректный код', async () => {
    const result = await isValidCode(VALID_CODE, task(), logger);

    expect(result).toEqual({ isValid: true });
  });

  it('отклоняет дубликат и передаёт код в проверку', async () => {
    const isDuplicate = jest.fn().mockResolvedValue(true);

    const result = await isValidCode(VALID_CODE, task(), logger, {
      isDuplicate,
    });

    expect(isDuplicate).toHaveBeenCalledWith(VALID_CODE);
    expect(result).toEqual({
      isValid: false,
      reason: CodeValidationReason.Duplicate,
      message: `Найден дубликат кода ${VALID_CODE}`,
    });
  });

  it('пропускает код, если дубликата нет', async () => {
    const isDuplicate = jest.fn().mockResolvedValue(false);

    const result = await isValidCode(VALID_CODE, task(), logger, {
      isDuplicate,
    });

    expect(result.isValid).toBe(true);
  });

  it('не ходит в БД, если формат кода уже неверный', async () => {
    const isDuplicate = jest.fn();

    const result = await isValidCode('bad', task(), logger, { isDuplicate });

    expect(result.isValid).toBe(false);
    expect(isDuplicate).not.toHaveBeenCalled();
  });

  it('пробрасывает ошибку проверки дубликата', async () => {
    const isDuplicate = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(
      isValidCode(VALID_CODE, task(), logger, { isDuplicate }),
    ).rejects.toThrow('db down');
  });

  it('пропускает код, который есть в списке задания', async () => {
    const result = await isValidCode(VALID_CODE, task(), logger, {
      isCodeTask: (codes: string[], code: string) => codes.includes(code),
    });

    expect(result.isValid).toBe(true);
  });

  it('отклоняет код, которого нет в списке задания', async () => {
    const result = await isValidCode(VALID_CODE, task(), logger, {
      isCodeTask: () => false,
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain('не найден в списке допустимых кодов');
  });
});
