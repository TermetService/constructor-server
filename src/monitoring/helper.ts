/* eslint-disable prettier/prettier */
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import * as dotenv from 'dotenv';
import { ModbusService } from 'src/modbus/modbus.service';
import { allAddresses } from 'src/addresses';

dotenv.config();

export const createTableIfNotExists = async (
  entityManager: EntityManager,
  tableName: string,
): Promise<void> => {
  try {
    if (
      !tableName ||
      typeof tableName !== 'string' ||
      tableName.trim() === ''
    ) {
      throw new Error('Invalid table name: tableName cannot be empty');
    }

    // Создаем безопасное имя для индексов
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

    // Создаем таблицу
    await entityManager.query(`
  CREATE TABLE IF NOT EXISTS "${tableName}" (
    "id" SERIAL PRIMARY KEY,
    "code" VARCHAR NOT NULL,
    "box_number" INTEGER,
    "box_label" VARCHAR,
    "pallet_label" VARCHAR,
    "pallet_number" INTEGER,
    "camera_name" VARCHAR,
    "weight" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_${tableName}_code" UNIQUE ("code")
  );

  CREATE INDEX IF NOT EXISTS "IDX_${tableName}_code" ON "${tableName}" ("code");
`);

    // Создаем индексы с обработкой ошибок
    try {
      await entityManager.query(`
          CREATE INDEX IF NOT EXISTS idx_${safeTableName}_code
          ON "${tableName}" (code)
        `);
    } catch (indexError) {
      console.error(`Error creating index for code:`, indexError);
    }

    try {
      await entityManager.query(`
          CREATE INDEX IF NOT EXISTS idx_${safeTableName}_box_number
          ON "${tableName}" (box_number)
        `);
    } catch (indexError) {
      console.error(`Error creating index for box_number:`, indexError);
    }

    try {
      await entityManager.query(`
          CREATE INDEX IF NOT EXISTS idx_${safeTableName}_pallet_number
          ON "${tableName}" (pallet_number)
        `);
    } catch (indexError) {
      console.error(`Error creating index for pallet_number:`, indexError);
    }
  } catch (error) {
    console.error(`Error creating table ${tableName}:`, error);
    throw error;
  }
};

export const getCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
};

export const filenameWithoutExtension = (filename: string) =>
  filename.replace('.json', '');

export enum CodeValidationReason {
  Empty = 'empty',
  Length = 'length',
  Prefix = 'prefix',
  Gtin = 'gtin',
  Duplicate = 'duplicate',
  CodeIsCode = 'CodeIsCode',
}

export interface ICodeValidationResult {
  isValid: boolean;
  reason?: CodeValidationReason;
  /** Готовая причина для оператора и лога */
  message?: string;
}

export interface ICodeValidationDeps {
  /**
   * Проверка дубликата в БД. Передаётся вызывающим кодом, чтобы функция
   * не зависела от репозитория и оставалась тестируемой.
   * Если не передана — проверка дубликата пропускается.
   */
  isDuplicate?: (code: string) => Promise<boolean> | boolean;
  isCodeTask?: any;
}

/**
 * Единственная точка проверки кода: пустой, длина, префикс, GTIN, дубликат.
 * Возвращает причину отказа готовым текстом, чтобы вызывающий код не
 * придумывал сообщения заново.
 */
export const isValidCode = async (
  code: string,
  task: any,
  logger: Logger,
  deps: ICodeValidationDeps = {},
): Promise<ICodeValidationResult> => {
  if (typeof code !== 'string' || code.trim().length === 0) {
    logger?.error?.('Код: Пустой код');
    return {
      isValid: false,
      reason: CodeValidationReason.Empty,
      message: 'Пустой код',
    };
  }

  const codeLengths =
    process.env.CODE_LENGTH?.split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value)) || [];

  if (!codeLengths.includes(code.length)) {
    logger?.error?.(
      `Код: Неверная длина кода ${code.length}, допустимые: ${codeLengths.join(', ')}`,
    );
    return {
      isValid: false,
      reason: CodeValidationReason.Length,
      message: `Неверная длина кода: ${code.length}`,
    };
  }

  if (!code.startsWith('01')) {
    logger?.error?.('Код: Код не начинается с "01"');
    return {
      isValid: false,
      reason: CodeValidationReason.Prefix,
      message: 'Код должен начинаться с "01"',
    };
  }

  const numericPart = code.slice(2, 16);
  if (numericPart !== task?.gtin) {
    logger?.error?.('Код: Числовая часть кода не совпадает с GTIN задания');
    return {
      isValid: false,
      reason: CodeValidationReason.Gtin,
      message: 'Код не соответствует GTIN задания',
    };
  }

  const codeIsCode = /^01\d{14}21(?:.{8}|.{6})[\x1D]9[123]/.test(code);

  if (!codeIsCode) {
    logger?.error?.(`Код не соответствует формату кода`);
    return {
      isValid: false,
      reason: CodeValidationReason.CodeIsCode,
      message: 'Код не соответствует формату кода',
    };
  }

  if (deps.isDuplicate) {
    const duplicated = await deps.isDuplicate(code);

    if (duplicated) {
      logger?.error?.(`Код: Найден дубликат кода ${code}`);
      return {
        isValid: false,
        reason: CodeValidationReason.Duplicate,
        message: `Найден дубликат кода ${code}`,
      };
    }
  }
  if (deps.isCodeTask) {
    const inTask = deps.isCodeTask(task?.codes, code);
    if (!inTask) {
      logger?.error?.(`Код: код ${code} не найден в списке допустимых кодов`);
      return {
        isValid: false,
        reason: CodeValidationReason.Duplicate,
        message: `Код: код ${code} не найден в списке допустимых кодов`,
      };
    }
  }

  return { isValid: true };
};

export const createTaskTable = async (
  entityManager: EntityManager,
  tableName: string,
  taskFileName: string, // Название файла задания
): Promise<void> => {
  const taskTableName = `${tableName}_task`;
  const query = `
        CREATE TABLE IF NOT EXISTS "${taskTableName}" (
            id SERIAL PRIMARY KEY,
            task_file_name TEXT NOT NULL
        )
    `;
  await entityManager.query(query);

  // Сохраняем название файла задания в таблицу
  const insertQuery = `
        INSERT INTO "${taskTableName}" (task_file_name)
        VALUES ('${taskFileName}')
    `;
  await entityManager.query(insertQuery);
  // console.log(`Таблица задания ${taskTableName} создана и данные сохранены`);
};

export const deleteTaskTable = async (
  entityManager: EntityManager,
  tableName: string,
): Promise<void> => {
  const taskTableName = `${tableName}_task`;
  const query = `DROP TABLE IF EXISTS "${taskTableName}"`;
  await entityManager.query(query);
  // console.log(`Таблица задания ${taskTableName} удалена`);
};

export const checkUnfinishedTask = async (
  entityManager: EntityManager,
): Promise<{ tableName: string; taskFileName: string } | null> => {
  // Получаем список всех таблиц заданий
  const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name LIKE '%_task'
    `;
  const result = await entityManager.query(query);

  if (result.length > 0) {
    // Берем последнюю таблицу задания
    const taskTableName = result[result.length - 1].table_name;
    const tableName = taskTableName.replace('_task', '');

    // Получаем название файла задания
    const taskFileNameQuery = `SELECT task_file_name FROM "${taskTableName}" LIMIT 1`;
    const taskFileNameResult = await entityManager.query(taskFileNameQuery);

    if (taskFileNameResult.length > 0) {
      const taskFileName = taskFileNameResult[0].task_file_name;
      console.log(
        `Найдена незавершенная фасовка: ${tableName}, файл задания: ${taskFileName}`,
      );
      return { tableName, taskFileName };
    }
  }

  console.log('Незавершенных фасовок не найдено');
  return null;
};

export const isCodeExists = async (
  entityManager: EntityManager,
  tableName: string,
  code: string,
): Promise<boolean> => {
  const exists = await entityManager.query(
    `SELECT 1 FROM "${tableName}" WHERE code = $1`,
    [code],
  );
  if (exists.length > 0) {
    console.error(`Ошибка: код ${code} уже существует в базе данных`);
    return true;
  }
  return false;
};

export const getItemsCountInPallet = async (
  entityManager: EntityManager,
  tableName: string,
  palletNumber: number,
): Promise<number> => {
  try {
    const countQuery = `SELECT COUNT(*) as count FROM "${tableName}" WHERE pallet_number = $1`;
    const countResult = await entityManager.query(countQuery, [palletNumber]);
    return Number(countResult[0]?.count) || 0;
  } catch (error) {
    console.error('Error getting items count in pallet:', error);
    return 0;
  }
};
