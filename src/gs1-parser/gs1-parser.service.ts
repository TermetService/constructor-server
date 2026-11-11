import { Inject, Injectable } from '@nestjs/common';
import {
  SearchFrom,
  Gs1ParseResult,
  Gs1Template,
  Gs1ValidationResult,
  FIXED_LENGTH_AI,
  TemplateItem,
} from './interfaces/gs1.types';
import { Logger } from 'winston';
import { loggerGS1 } from 'src/logger-winston/winston.config';
import { IMonitoringVariables, TemplateTypes } from 'src/globalTypes';
import { TemplateService } from 'src/template/template.service';

@Injectable()
export class Gs1ParserService {
  private readonly GS = '\x1D'; // Group Separator (ASCII 29)

  constructor(
    private readonly templateService: TemplateService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = loggerGS1,
  ) {}

  async getSearchType(code: string): Promise<SearchFrom> {
    const { type } = await this.getContainerNumber(code);
    return type;
  }

  // Основной метод для определения типа и парсинга этикетки
  async parseLabel(
    code: string,
    boxTemplate?: Gs1Template,
    palletTemplate?: Gs1Template,
  ): Promise<Gs1ParseResult> {
    console.log('\n=== Парсинг GS1 этикетки ===');
    console.log(`Код: ${this.escapeString(code)}`);

    try {
      // Базовая валидация
      if (!code || code.length === 0) {
        console.log('❌ Ошибка: Пустой код');
        return {
          type: SearchFrom.Unknown,
          error: 'Пустой код',
          rawCode: code,
        };
      }

      // 1. Проверка на код продукта (простой код с суффиксом 21)
      if (this.isProductCode(code)) {
        console.log('✅ Определен как продукт (code)');
        return {
          type: SearchFrom.Code,
          data: { code },
          rawCode: code,
        };
      }

      // 2. Проверяем коробку, если есть шаблон
      if (boxTemplate) {
        console.log('\n--- Проверка шаблона коробки ---');
        const validation = this.validateAgainstTemplate(
          code,
          boxTemplate.template,
        );

        if (validation.isValid) {
          console.log('✅ Соответствует шаблону коробки');
          const data = this.parseByTemplate(code, boxTemplate.template);
          const semantic = this.getSemanticMap(boxTemplate.template);
          console.log(
            '📦 Распарсенные данные коробки:',
            this.formatParsedData(data),
          );
          return {
            type: SearchFrom.Box,
            data,
            semantic,
            rawCode: code,
          };
        } else {
          console.log(`❌ Не соответствует: ${validation.error}`);
        }
      }

      // 3. Проверяем паллету, если есть шаблон
      if (palletTemplate) {
        console.log('\n--- Проверка шаблона паллеты ---');
        const validation = this.validateAgainstTemplate(
          code,
          palletTemplate.template,
        );

        if (validation.isValid) {
          console.log('✅ Соответствует шаблону паллеты');
          const data = this.parseByTemplate(code, palletTemplate.template);
          const semantic = this.getSemanticMap(palletTemplate.template);
          console.log(
            '📦 Распарсенные данные паллеты:',
            this.formatParsedData(data),
          );
          return {
            type: SearchFrom.Pallet,
            data,
            semantic,
            rawCode: code,
          };
        } else {
          console.log(`❌ Не соответствует: ${validation.error}`);
        }
      }

      // 4. Если ничего не подошло
      console.log('\n❌ Код не соответствует ни одному шаблону');
      return {
        type: SearchFrom.Unknown,
        error: 'Код не соответствует ни одному из шаблонов',
        rawCode: code,
      };
    } catch (error) {
      console.error(`❌ Ошибка: ${error.message}`);
      return {
        type: SearchFrom.Unknown,
        error: `Внутренняя ошибка: ${error.message}`,
        rawCode: code,
      };
    }
  }

  // Проверка, является ли код продуктом (простой код с 21 в конце)
  private isProductCode(code: string): boolean {
    return code.length >= 18 && code.substring(16, 18) === '21';
  }

  // Проверка, имеет ли AI фиксированную длину
  private isFixedLength(ai: string): boolean {
    return ai in FIXED_LENGTH_AI;
  }

  // Определение типа без парсинга
  determineType(
    code: string,
    boxTemplate?: Gs1Template,
    palletTemplate?: Gs1Template,
  ): SearchFrom {
    // Проверка на код продукта
    if (this.isProductCode(code)) {
      return SearchFrom.Code;
    }

    // Проверка на коробку
    if (
      boxTemplate &&
      this.validateAgainstTemplate(code, boxTemplate.template).isValid
    ) {
      return SearchFrom.Box;
    }

    // Проверка на паллету
    if (
      palletTemplate &&
      this.validateAgainstTemplate(code, palletTemplate.template).isValid
    ) {
      return SearchFrom.Pallet;
    }

    return SearchFrom.Unknown;
  }

  // Нормализация шаблона - преобразует строки типа "01 gtin" в объект TemplateItem
  private normalizeTemplate(template: string[]): TemplateItem[] {
    return template.map((item) => {
      // Если строка пустая или только пробелы
      if (!item || item.trim() === '') {
        return {
          ai: '',
          fullString: '',
        };
      }

      // Разделяем на AI и семантику
      const parts = item.trim().split(/\s+/);
      const ai = parts[0];
      const semantic = parts.slice(1).join(' ');

      return {
        ai: ai,
        semantic: semantic || undefined,
        fullString: item,
      };
    });
  }

  // Получение семантической карты из шаблона
  private getSemanticMap(rawTemplate: string[]): Record<string, string> {
    const template = this.normalizeTemplate(rawTemplate);
    const semanticMap: Record<string, string> = {};

    for (const item of template) {
      if (item.ai && item.semantic) {
        semanticMap[item.ai] = item.semantic;
      }
    }

    return semanticMap;
  }

  // Вспомогательные методы для форматирования вывода
  private formatParsedData(data: Record<string, string>): string {
    return (
      '\n' +
      Object.entries(data)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join('\n')
    );
  }

  // Обновленный метод getContainerNumber
  async getContainerNumber(code: string): Promise<{
    type: SearchFrom;
    containerNumber: string | null;
    isValid?: boolean;
    validationMessage?: string;
  }> {
    console.log('\n=== Получение номера тары ===');
    console.log(`Код: ${this.escapeString(code)}`);

    try {
      // 1. Проверка на код продукта
      if (this.isProductCode(code)) {
        console.log('✅ Это код продукта, номер тары не требуется');
        return { type: SearchFrom.Code, containerNumber: null };
      }

      const templates = await this.templateService.getAll();

      const boxTemplate = templates.find((t) => t.type === TemplateTypes.Box);
      const palletTemplate = templates.find(
        (t) => t.type === TemplateTypes.Pallet,
      );

      // 2. Проверяем коробку
      if (boxTemplate) {
        const validation = this.validateAgainstTemplate(
          code,
          boxTemplate.template,
        );
        if (validation.isValid) {
          console.log('✅ Определена как коробка');
          const parsed = this.parseByTemplate(code, boxTemplate.template);
          const semantic = this.getSemanticMap(boxTemplate.template);

          // Валидация соответствия заданию
          const taskValidation = this.validateAgainstTask(
            parsed,
            semantic,
            SearchFrom.Box,
          );
          if (!taskValidation.isValid) {
            console.log(
              `❌ Коробка не соответствует заданию: ${taskValidation.message}`,
            );
            return {
              type: SearchFrom.Box,
              containerNumber: null,
              isValid: false,
              validationMessage: taskValidation.message,
            };
          }

          const containerNumber = this.extractContainerNumber(parsed);
          console.log(`📦 Номер коробки: ${containerNumber}`);
          return {
            type: SearchFrom.Box,
            containerNumber,
            isValid: true,
          };
        }
      }

      // 3. Проверяем паллету
      if (palletTemplate) {
        const validation = this.validateAgainstTemplate(
          code,
          palletTemplate.template,
        );
        if (validation.isValid) {
          console.log('✅ Определена как паллета');
          const parsed = this.parseByTemplate(code, palletTemplate.template);
          const semantic = this.getSemanticMap(palletTemplate.template);

          // Валидация соответствия заданию
          const taskValidation = this.validateAgainstTask(
            parsed,
            semantic,
            SearchFrom.Pallet,
          );
          if (!taskValidation.isValid) {
            console.log(
              `❌ Паллета не соответствует заданию: ${taskValidation.message}`,
            );
            return {
              type: SearchFrom.Pallet,
              containerNumber: null,
              isValid: false,
              validationMessage: taskValidation.message,
            };
          }

          const containerNumber = this.extractContainerNumber(parsed);
          console.log(`📦 Номер паллеты: ${containerNumber}`);
          return {
            type: SearchFrom.Pallet,
            containerNumber,
            isValid: true,
          };
        }
      }

      // 4. Если ничего не подошло
      console.log('❌ Неизвестный тип кода');
      return {
        type: SearchFrom.Unknown,
        containerNumber: null,
        isValid: false,
        validationMessage: 'Неизвестный тип кода',
      };
    } catch (error) {
      console.error('Ошибка при получении номера тары:', error);
      return {
        type: SearchFrom.Unknown,
        containerNumber: null,
        isValid: false,
        validationMessage: error.message,
      };
    }
  }

  // Вспомогательный метод для извлечения номера из AI 21
  private extractContainerNumber(
    parsedData: Record<string, string>,
  ): string | null {
    // Ищем AI 21 в распарсенных данных
    const containerNumber = parsedData['21'];

    if (!containerNumber) {
      console.log('⚠️ AI 21 не найден в распарсенных данных');
      return null;
    }

    // Убираем возможные разделители в начале/конце
    return containerNumber.replace(/^\x1D+|\x1D+$/g, '');
  }

  // Метод для быстрого получения только номера (если тип уже известен)
  getContainerNumberByType(
    code: string,
    type: SearchFrom.Box | SearchFrom.Pallet,
    template: Gs1Template,
  ): string | null {
    try {
      const validation = this.validateAgainstTemplate(code, template.template);
      if (!validation.isValid) {
        console.log(`❌ Код не соответствует шаблону ${type}`);
        return null;
      }

      const parsed = this.parseByTemplate(code, template.template);
      const containerNumber = this.extractContainerNumber(parsed);

      if (!containerNumber) {
        console.log(`❌ Не удалось извлечь номер для ${type}`);
        return null;
      }

      return containerNumber;
    } catch (error) {
      console.error(`Ошибка при извлечении номера ${type}:`, error);
      return null;
    }
  }

  // Валидация этикетки по шаблону
  validateAgainstTemplate(
    code: string,
    rawTemplate: string[],
  ): Gs1ValidationResult {
    // Нормализуем код
    const normalizedCode = this.normalizeGS(code);
    const template = this.normalizeTemplate(rawTemplate);
    let position = 0;

    console.log('Нормализованный код:', this.escapeString(normalizedCode));

    for (let i = 0; i < template.length; i++) {
      const item = template[i];

      // Пропускаем пустые элементы в шаблоне
      if (!item.ai || item.ai === '') {
        console.log(`Пропускаем пустой элемент шаблона на позиции ${i}`);
        continue;
      }
      
      const ai = item.ai;

      // Проверяем наличие AI на текущей позиции
      const actualAI = normalizedCode.substr(position, ai.length);
      if (actualAI !== ai) {
        return {
          isValid: false,
          error: `Ожидался AI ${ai} на позиции ${position}, найден ${actualAI}`,
          position,
          expected: ai,
          found: actualAI,
        };
      }
      console.log(actualAI);
      position += ai.length;

      // Обрабатываем данные для этого AI
      if (this.isFixedLength(ai)) {
        const fixedLength = FIXED_LENGTH_AI[ai];

        if (position + fixedLength > normalizedCode.length) {
          return {
            isValid: false,
            error: `Недостаточно данных для AI ${ai}. Ожидается ${fixedLength} символов`,
            position,
          };
        }

        position += fixedLength;
      } else {
        // Переменная длина - ищем разделитель в данных
        let nextGSPos = -1;
        for (let j = position; j < normalizedCode.length; j++) {
          if (normalizedCode.charCodeAt(j) === 29) {
            // ASCII 29 = \x1D
            nextGSPos = j;
            break;
          }
        }

        console.log(
          `AI ${ai}: ищем GS с позиции ${position} (начало данных), найден на ${nextGSPos}`,
        );

        if (nextGSPos === -1) {
          // Если это последний элемент в шаблоне - можно дочитать до конца
          if (i === template.length - 1) {
            position = normalizedCode.length;
          } else {
            return {
              isValid: false,
              error: `Ожидался разделитель после данных AI ${ai}, но он не найден`,
              position,
            };
          }
        } else {
          // Проверяем, что после разделителя идет следующий AI (кроме последнего)
          if (i < template.length - 1) {
            const nextItem = template[i + 1];
            if (nextItem.ai) {
              const nextAI = nextItem.ai;
              const nextAIPos = nextGSPos + 1;

              if (nextAIPos + nextAI.length > normalizedCode.length) {
                return {
                  isValid: false,
                  error: `После разделителя недостаточно данных для следующего AI ${nextAI}`,
                  position: nextAIPos,
                };
              }

              const nextAIActual = normalizedCode.substr(
                nextAIPos,
                nextAI.length,
              );

              if (nextAIActual !== nextAI) {
                return {
                  isValid: false,
                  error: `После разделителя ожидался AI ${nextAI}, но найден ${nextAIActual}`,
                  position: nextAIPos,
                };
              }
            }
          }

          // Пропускаем данные и разделитель
          position = nextGSPos + 1;
        }
      }
    }

    // Проверяем, что после полного прохода шаблона не осталось данных
    if (position !== normalizedCode.length) {
      return {
        isValid: false,
        error: `После шаблона остались необработанные данные. Позиция: ${position}, осталось: "${normalizedCode.substr(position)}"`,
        position,
      };
    }

    return { isValid: true };
  }

  // Парсинг этикетки по шаблону
  parseByTemplate(code: string, rawTemplate: string[]): Record<string, string> {
    // Нормализуем код
    const normalizedCode = this.normalizeGS(code);
    const template = this.normalizeTemplate(rawTemplate);
    const result: Record<string, string> = {};
    let position = 0;

    console.log('Парсинг кода:', this.escapeString(normalizedCode));
    console.log(
      'Шаблон:',
      template.map((t) => t.fullString),
    );

    for (let i = 0; i < template.length; i++) {
      const item = template[i];

      // Пропускаем пустые элементы в шаблоне
      if (!item.ai || item.ai === '') {
        console.log(`Пропускаем пустой элемент шаблона на позиции ${i}`);
        continue;
      }

      const ai = item.ai;
      console.log(
        `\nПарсинг AI ${ai} (${item.semantic || ''}) на позиции ${position}`,
      );

      // Проверяем наличие AI
      const actualAI = normalizedCode.substr(position, ai.length);
      if (actualAI !== ai) {
        throw new Error(
          `Ожидался AI ${ai} на позиции ${position}, найден ${actualAI}`,
        );
      }

      // Пропускаем AI
      position += ai.length;
      console.log(`  Позиция после AI: ${position}`);

      if (this.isFixedLength(ai)) {
        // Читаем фиксированное количество символов
        const fixedLength = FIXED_LENGTH_AI[ai];

        if (position + fixedLength > normalizedCode.length) {
          throw new Error(
            `Недостаточно данных для AI ${ai}. Ожидается ${fixedLength} символов`,
          );
        }

        result[ai] = normalizedCode.substr(position, fixedLength);
        console.log(`  Фикс. данные (${fixedLength}): ${result[ai]}`);
        position += fixedLength;
      } else {
        // Переменная длина - ищем разделитель в данных
        let nextGSPos = -1;
        for (let j = position; j < normalizedCode.length; j++) {
          if (normalizedCode.charCodeAt(j) === 29) {
            nextGSPos = j;
            break;
          }
        }

        console.log(
          `  Поиск GS с позиции ${position} (начало данных), найден на ${nextGSPos}`,
        );

        if (nextGSPos === -1) {
          // Последний элемент - читаем до конца
          result[ai] = normalizedCode.substr(position);
          console.log(`  Перем. данные (до конца): ${result[ai]}`);
          position = normalizedCode.length;
        } else {
          // Читаем данные от position до nextGSPos
          result[ai] = normalizedCode.substr(position, nextGSPos - position);
          console.log(`  Перем. данные (до GS): ${result[ai]}`);
          position = nextGSPos + 1; // Пропускаем GS
          console.log(`  Позиция после GS: ${position}`);
        }
      }
    }

    console.log('\nРезультат парсинга:', result);
    return result;
  }

  // Вспомогательный метод для нормализации GS
  private normalizeGS(code: string): string {
    if (!code) return code;

    // Проверяем, есть ли уже символ GS (ASCII 29)
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 29) {
        console.log('Найден символ GS с кодом 29 на позиции', i);
        return code;
      }
    }

    // Заменяем строковое представление \x1D на реальный символ
    let normalized = code;
    if (code.includes('\\x1D')) {
      normalized = code.replace(/\\x1D/g, String.fromCharCode(29));
      console.log('Заменено \\x1D на символ GS');
    } else if (code.includes('\u001D')) {
      normalized = code.replace(/\u001D/g, String.fromCharCode(29));
      console.log('Заменено \\u001D на символ GS');
    }

    return normalized;
  }

  // Вспомогательный метод для экранирования при выводе
  private escapeString(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code === 29) {
        result += '\\x1D';
      } else {
        result += str[i];
      }
    }
    return result;
  }

  // Метод для сравнения партии с учетом четности длины
  private compareBatchValue(
    valueFromLabel: string,
    expectedBatch: string,
  ): boolean {
    if (!valueFromLabel || !expectedBatch) return false;

    // Прямое сравнение
    if (valueFromLabel === expectedBatch) return true;

    const expectedLength = expectedBatch.length;
    const isExpectedLengthEven = expectedLength % 2 === 0;

    // Если длина ожидаемого значения четная - должно быть точное совпадение
    if (isExpectedLengthEven) {
      return false;
    }

    // Для нечетной длины: пробуем добавить или убрать ведущий ноль

    // Вариант 1: в этикетке с ведущим нулем, в задании без
    if (
      valueFromLabel.length === expectedLength + 1 &&
      valueFromLabel.startsWith('0') &&
      valueFromLabel.substring(1) === expectedBatch
    ) {
      return true;
    }

    // Вариант 2: в этикетке без ведущего нуля, в задании с
    if (
      valueFromLabel.length === expectedLength - 1 &&
      expectedBatch.startsWith('0') &&
      valueFromLabel === expectedBatch.substring(1)
    ) {
      return true;
    }

    return false;
  }

  // Обновленный метод validateAgainstTask с учетом семантики
  private validateAgainstTask(
    parsedData: Record<string, string>,
    semanticMap: Record<string, string>,
    type: SearchFrom.Box | SearchFrom.Pallet,
  ): { isValid: boolean; message?: string } {
    const task = this.globalMonVar.task;
    if (!task) {
      return { isValid: false, message: 'Нет активного задания' };
    }

    // Форматируем даты из задания в формат этикетки (YYMMDD)
    const formatDateForLabel = (date: string) => {
      const [day, month, year] = date.split('.');
      return `${year.slice(2)}${month}${day}`;
    };

    // Проверяем GTIN или ITF14 в зависимости от семантики
    let gtinFromLabel: string | undefined;
    let expectedGtin: string | undefined;
    let gtinType: string = '';

    // Ищем в распарсенных данных AI, у которого семантика 'gtin' или 'itf14'
    for (const [ai, value] of Object.entries(parsedData)) {
      const semantic = semanticMap[ai];

      if (semantic === 'gtin') {
        // Это GTIN
        gtinFromLabel = value;
        expectedGtin = task.gtin;
        gtinType = 'GTIN';
        break;
      } else if (semantic === 'itf14') {
        // Это ITF14
        gtinFromLabel = value;
        expectedGtin = task.ITF14;
        gtinType = 'ITF14';
        break;
      }
    }

    // Если не нашли по семантике, пробуем найти любой AI с кодом 01 или 02
    if (!gtinFromLabel) {
      // Пробуем AI 01 или 02
      const possibleGtinAi = parsedData['01'] || parsedData['02'];
      if (possibleGtinAi) {
        gtinFromLabel = possibleGtinAi;
        // Пробуем определить тип по значению
        if (task.gtin && task.gtin === possibleGtinAi) {
          expectedGtin = task.gtin;
          gtinType = 'GTIN';
        } else if (task.ITF14 && task.ITF14 === possibleGtinAi) {
          expectedGtin = task.ITF14;
          gtinType = 'ITF14';
        } else {
          // Не можем определить, но продолжаем с проверкой
          expectedGtin = task.gtin || task.ITF14;
          gtinType = 'неопределенный тип';
        }
      }
    }

    if (!gtinFromLabel) {
      return {
        isValid: false,
        message: `В этикетке отсутствует GTIN/ITF14 (не найден AI с семантикой 'gtin' или 'itf14')`,
      };
    }

    if (gtinFromLabel !== expectedGtin) {
      return {
        isValid: false,
        message: `${gtinType} не совпадает. Ожидалось: ${expectedGtin}, получено: ${gtinFromLabel}`,
      };
    }

    // Проверяем дату производства (AI 11) - по семантике
    let prodDateFromLabel: string | undefined;
    for (const [ai, value] of Object.entries(parsedData)) {
      const semantic = semanticMap[ai];
      if (semantic === 'production_date') {
        prodDateFromLabel = value;
        break;
      }
    }

    if (prodDateFromLabel) {
      const expectedProdDate = formatDateForLabel(task.date_manufacture);
      if (prodDateFromLabel !== expectedProdDate) {
        return {
          isValid: false,
          message: `Дата производства не совпадает. Ожидалось: ${expectedProdDate}, получено: ${prodDateFromLabel}`,
        };
      }
    } else if (parsedData['11']) {
      // Fallback на AI 11
      const expectedProdDate = formatDateForLabel(task.date_manufacture);
      if (parsedData['11'] !== expectedProdDate) {
        return {
          isValid: false,
          message: `Дата производства не совпадает. Ожидалось: ${expectedProdDate}, получено: ${parsedData['11']}`,
        };
      }
    }

    // Проверяем срок годности (AI 17) - по семантике
    let expDateFromLabel: string | undefined;
    for (const [ai, value] of Object.entries(parsedData)) {
      const semantic = semanticMap[ai];
      if (semantic === 'expiration_date') {
        expDateFromLabel = value;
        break;
      }
    }

    if (expDateFromLabel) {
      const expectedExpDate = formatDateForLabel(task.date_expiration);
      if (expDateFromLabel !== expectedExpDate) {
        return {
          isValid: false,
          message: `Срок годности не совпадает. Ожидалось: ${expectedExpDate}, получено: ${expDateFromLabel}`,
        };
      }
    } else if (parsedData['17']) {
      // Fallback на AI 17
      const expectedExpDate = formatDateForLabel(task.date_expiration);
      if (parsedData['17'] !== expectedExpDate) {
        return {
          isValid: false,
          message: `Срок годности не совпадает. Ожидалось: ${expectedExpDate}, получено: ${parsedData['17']}`,
        };
      }
    }

    // Проверяем партию (AI 10) - по семантике
    let batchFromLabel: string | undefined;
    for (const [ai, value] of Object.entries(parsedData)) {
      const semantic = semanticMap[ai];
      if (semantic === 'batch' || semantic === 'lot') {
        batchFromLabel = value;
        break;
      }
    }

    if (!batchFromLabel && parsedData['10']) {
      batchFromLabel = parsedData['10'];
    }

    if (batchFromLabel && task.batch) {
      if (!this.compareBatchValue(batchFromLabel, task.batch)) {
        return {
          isValid: false,
          message: `Партия не совпадает. Ожидалось: ${task.batch}, получено: ${batchFromLabel}`,
        };
      }
    }

    return { isValid: true };
  }

  // Для отладки - вызывать только когда нужно
  debugCodeStructure(code: string): string {
    const parts: string[] = [];
    let position = 0;

    while (position < code.length) {
      const ai = code.substr(position, 2);
      parts.push(`AI:${ai}`);
      position += 2;

      if (this.isFixedLength(ai)) {
        const length = FIXED_LENGTH_AI[ai];
        const value = code.substr(position, length);
        parts.push(`[${value}]`);
        position += length;
      } else {
        const nextGSPos = code.indexOf(this.GS, position);
        if (nextGSPos === -1) {
          const value = code.substr(position);
          parts.push(`[${value}]`);
          position = code.length;
        } else {
          const value = code.substr(position, nextGSPos - position);
          parts.push(`[${value}]`);
          parts.push('GS');
          position = nextGSPos + 1;
        }
      }
    }

    return parts.join(' ');
  }
}
