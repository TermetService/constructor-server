import { GenerateOptions, LABEL_FORMATS, PrintersTypes } from 'src/printers/types';

export const formatDate = (date: string) => {
  const [day, month, year] = date.split('.');
  return `${year.slice(2)}${month}${day}`;
};

export const getBoxNetto = (productNetto: number, count: number) => {
  return productNetto * count;
};

export const getNettoUnitKG = (productNetto: number) => {
  return productNetto / 1000;
};

export const getBoxNettoKG = (productNetto: number, count: number) => {
  return (productNetto * count) / 1000;
};

// ============ КОНФИГУРАЦИЯ ============
const GS = '\x1D';

// AI конфигурация
const AI_CONFIG = {
  '01 gtin': { ai: '01', label: '(01)', fixedLength: 14 },
  '01 itf14': { ai: '01', label: '(01)', fixedLength: 14 },
  '02 gtin': { ai: '02', label: '(02)', fixedLength: 14 },
  '02 itf14': { ai: '02', label: '(02)', fixedLength: 14 },
  '10': { ai: '10', label: '(10)', fixedLength: null },
  '11': { ai: '11', label: '(11)', fixedLength: 6 },
  '17': { ai: '17', label: '(17)', fixedLength: 6 },
  '21': { ai: '21', label: '(21)', fixedLength: null },
  '30': { ai: '30', label: '(30)', fixedLength: null },
  '37': { ai: '37', label: '(37)', fixedLength: null },
  '3103': { ai: '3103', label: '(3103)', fixedLength: 6, type: 'netto', unit: 'kg' },
  '3303': { ai: '3303', label: '(3303)', fixedLength: 6, type: 'gross', unit: 'kg' },
};

// Блоки с переменной длиной (требуют паддинга и суффиксов)
const VARIABLE_LENGTH_BLOCKS = ['10', '21', '30', '37'];

// Разделители для разных форматов
const DELIMITERS = {
  TSC: '!102',
  JSON: GS,
  ZPL: '>8',
  DMZPL: '$d029',
  DMTSC: '~1',
};

// ============ УТИЛИТЫ ============

const padEven = (value: string, isZPL: boolean) =>
  isZPL && value.length % 2 !== 0 ? `0${value}` : value;

const hasNextNonEmpty = (arr: string[], index: number) =>
  arr.slice(index + 1).some(item => item?.trim());

// Форматирование веса (6 символов: 3 целых + 3 десятичных)
const formatWeight = (weight: number | string): string => {
  const num = typeof weight === 'string' ? parseFloat(weight) : weight;
  if (isNaN(num) || num < 0) return '000000';

  // Умножаем на 1000 для 3 десятичных знаков
  const rounded = Math.round(num * 1000);
  return String(rounded).padStart(6, '0');
};

// ============ БАЗОВЫЙ ГЕНЕРАТОР ============
const generate = (options: GenerateOptions) => {
  const {
    template,
    task,
    packagingNumber,
    productCount,
    boxCount,
    nettoWeight,
    bruttoWeight,
    formatOptions = {},
    isZPL = false,
    prefix = '',
    useSuffixes = true,
    padOddLength = false,
  } = options;

  const blocks = template.filter(item => item?.trim());

  const result = blocks
    .map((block, index) => {
      const config = AI_CONFIG[block];
      if (!config) return '';

      let value = getBlockValue(
        block,
        task,
        packagingNumber,
        productCount,
        boxCount,
        nettoWeight,
        bruttoWeight
      );

      // Для фиксированных блоков проверяем длину
      if (config.fixedLength) {
        if (value.length !== config.fixedLength) {
          console.warn(`⚠️ Блок ${block} имеет длину ${value.length}, ожидается ${config.fixedLength}`);
          value = value.padStart(config.fixedLength, '0');
        }
      }

      // Применяем паддинг для ZPL только для блоков с переменной длиной
      if (padOddLength && VARIABLE_LENGTH_BLOCKS.includes(block)) {
        value = padEven(value, isZPL);
      }

      let result = `${formatOptions[block] || config.ai}${value}`;

      // Добавляем суффикс только для блоков с переменной длиной
      if (useSuffixes &&
        VARIABLE_LENGTH_BLOCKS.includes(block) &&
        hasNextNonEmpty(blocks, index)) {
        result += formatOptions[`${config.ai}_suffix`] || '';
      }

      return result;
    })
    .join('');

  return prefix + result;
};

// ============ ПОЛУЧЕНИЕ ЗНАЧЕНИЙ БЛОКОВ ============
const getBlockValue = (
  block: string,
  task: any,
  packagingNumber: number,
  productCount?: number,
  boxCount?: number,
  nettoWeight?: number,
  bruttoWeight?: number
): string => {
  const getValue = (key: string, fallback?: any) => {
    const val = task[key] || fallback;
    return val !== undefined ? String(val) : '';
  };

  const map: Record<string, () => string> = {
    '01 gtin': () => getValue('gtin'),
    '01 itf14': () => getValue('ITF14'),
    '02 gtin': () => getValue('gtin'),
    '02 itf14': () => getValue('ITF14'),
    '10': () => getValue('batch'),
    '11': () => formatDate(task.date_manufacture),
    '17': () => formatDate(task.date_expiration),
    '21': () => String(packagingNumber),

    // Количество коробок (AI 30)
    '30': () => {
      const count = boxCount !== undefined ? boxCount : task.boxCount;
      return count !== undefined ? String(count) : '';
    },

    // Количество продуктов (AI 37)
    '37': () => {
      const count = productCount !== undefined ? productCount : task.product_count;
      return count !== undefined ? String(count) : '';
    },

    // Вес нетто в кг (AI 3103)
    '3103': () => {
      const weight = nettoWeight !== undefined ? nettoWeight : task.weight_kg;
      return weight !== undefined ? formatWeight(weight) : '000000';
    },

    // Вес брутто в кг (AI 3303)
    '3303': () => {
      const weight = bruttoWeight !== undefined ? bruttoWeight : task.brutto_weight_kg;
      return weight !== undefined ? formatWeight(weight) : '000000';
    },
  };

  return map[block]?.() || '';
};

// ============ ОЖИДАЕМЫЕ ЗНАЧЕНИЯ ДЛЯ ВАЛИДАЦИИ ============
export const getExpectedBlockValue = (
  task: any,
  block: string,
  productCount?: number,
  boxCount?: number,
  nettoWeight?: number,
  bruttoWeight?: number
): string => {
  const value = getBlockValue(block, task, 0, productCount, boxCount, nettoWeight, bruttoWeight);
  const config = AI_CONFIG[block];

  // Для фиксированных блоков паддим до нужной длины
  if (config?.fixedLength) {
    return value.padStart(config.fixedLength, '0');
  }

  // Для переменных блоков с ZPL
  if (VARIABLE_LENGTH_BLOCKS.includes(block)) {
    return padEven(value, true);
  }

  return value;
};

export const getBlockLength = (
  task: any,
  block: string,
  productCount?: number,
  boxCount?: number,
  nettoWeight?: number,
  bruttoWeight?: number
): number => {
  const config = AI_CONFIG[block];
  if (config?.fixedLength) {
    return config.fixedLength;
  }
  return getExpectedBlockValue(task, block, productCount, boxCount, nettoWeight, bruttoWeight).length;
};

// ============ БАЗОВЫЙ createGenerator ============
const createGenerator = (config: {
  delimiter?: string;
  prefix?: string;
  useLabel?: boolean;
  padOddLength?: boolean;
  isZPL?: boolean;
}) => {
  return (
    template: string[],
    task: any,
    packagingNumber: number,
    productCount?: number,
    boxCount?: number,
    nettoWeight?: number,
    bruttoWeight?: number
  ) => {
    const formatOptions: Record<string, string> = {};

    Object.entries(AI_CONFIG).forEach(([key, val]) => {
      formatOptions[key] = config.useLabel ? val.label : val.ai;
    });

    // Добавляем суффиксы только для блоков с переменной длиной
    if (config.delimiter) {
      VARIABLE_LENGTH_BLOCKS.forEach(block => {
        const ai = AI_CONFIG[block]?.ai;
        if (ai) {
          formatOptions[`${ai}_suffix`] = config.delimiter;
        }
      });
    }

    return generate({
      template,
      task,
      packagingNumber,
      productCount,
      boxCount,
      nettoWeight,
      bruttoWeight,
      formatOptions,
      prefix: config.prefix || '',
      isZPL: config.isZPL || false,
      useSuffixes: !!config.delimiter,
      padOddLength: config.padOddLength || false,
    });
  };
};

// ============ ФОРМАТЫ ДЛЯ УНИВЕРСАЛЬНОГО ГЕНЕРАТОРА ============
export type LabelFormat = typeof LABEL_FORMATS[keyof typeof LABEL_FORMATS];

// ============ УНИВЕРСАЛЬНЫЙ ГЕНЕРАТОР ============
export const generateLabel = (
  template: string[],
  task: any,
  packagingNumber: number,
  format: LabelFormat = 'zpl',
  productCount?: number,
  boxCount?: number,
  nettoWeight?: number,
  bruttoWeight?: number
): string => {
  // Конфигурации форматов
  const FORMAT_CONFIGS: Record<LabelFormat, any> = {
    json: { delimiter: DELIMITERS.JSON, isZPL: false, padOddLength: false },
    json_zpl: { delimiter: DELIMITERS.JSON, isZPL: true, padOddLength: true },
    zpl: { delimiter: DELIMITERS.ZPL, prefix: '>;>8', isZPL: true, padOddLength: true },
    tsc: { delimiter: DELIMITERS.TSC, isZPL: false, padOddLength: false },
    dm_zpl: { delimiter: DELIMITERS.DMZPL, prefix: '$1', isZPL: true, padOddLength: true },
    dm_tsc: { delimiter: DELIMITERS.DMTSC, isZPL: false, padOddLength: false },
    people: { useLabel: true, isZPL: false, padOddLength: false },
    people_zpl: { useLabel: true, isZPL: true, padOddLength: true },
  };

  const config = FORMAT_CONFIGS[format];
  if (!config) {
    throw new Error(`Неизвестный формат: ${format}`);
  }

  const generator = createGenerator(config);
  return generator(
    template,
    task,
    packagingNumber,
    productCount,
    boxCount,
    nettoWeight,
    bruttoWeight
  );
};

// ============ ГЕНЕРАТОР ДЛЯ БАЗЫ ДАННЫХ ============
export const generateDatabaseCipher = (
  template: string[],
  task: any,
  packagingNumber: number,
  productCount?: number,
  boxCount?: number,
  nettoWeight?: number,
  bruttoWeight?: number
): string => {
  const isZPL = process.env.PRINTER_TYPE === PrintersTypes.ZPL;
  const blocks = template.filter(item => item?.trim());

  const formatOptions: Record<string, string> = {};
  Object.entries(AI_CONFIG).forEach(([key, val]) => {
    formatOptions[key] = val.ai;
  });

  // Добавляем GS разделитель только для блоков с переменной длиной
  VARIABLE_LENGTH_BLOCKS.forEach(block => {
    const ai = AI_CONFIG[block]?.ai;
    if (ai) {
      formatOptions[`${ai}_suffix`] = GS;
    }
  });

  return generate({
    template: blocks,
    task,
    packagingNumber,
    productCount,
    boxCount,
    nettoWeight,
    bruttoWeight,
    formatOptions,
    isZPL,
    useSuffixes: true,
    padOddLength: true,
  });
};