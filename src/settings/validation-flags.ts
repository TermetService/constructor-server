/**
 * Флаги проверок: каждая проверка кода/этикетки может быть выключена
 * на странице «Конфигурация». Значения хранятся в config.json, по умолчанию
 * все включены.
 */

export enum ValidationFlag {
  // isValidCode
  CodeEmpty = 'codeEmpty',
  CodeLength = 'codeLength',
  CodePrefix = 'codePrefix',
  CodeGtin = 'codeGtin',
  CodeFormat = 'codeFormat',
  CodeDuplicate = 'codeDuplicate',
  CodeInTask = 'codeInTask',

  // BoxLabelCheckService.check
  BoxCodesRecognized = 'boxCodesRecognized',
  BoxHasProductCodes = 'boxHasProductCodes',
  BoxSingleLabel = 'boxSingleLabel',
  BoxLabelValid = 'boxLabelValid',
  BoxTableExists = 'boxTableExists',
  BoxLabelNotUsed = 'boxLabelNotUsed',
  BoxProductsExist = 'boxProductsExist',
  BoxSameBox = 'boxSameBox',
  BoxNumberDefined = 'boxNumberDefined',
  BoxLabelNotForBox = 'boxLabelNotForBox',
}

export type ValidationFlagGroup = 'code' | 'boxLabel';

export interface IValidationFlagMeta {
  key: ValidationFlag;
  group: ValidationFlagGroup;
  label: string;
  hint: string;
}

/** Метаданные для фронта: что за проверка и что она делает */
export const VALIDATION_FLAGS: IValidationFlagMeta[] = [
  {
    key: ValidationFlag.CodeEmpty,
    group: 'code',
    label: 'Пустой код',
    hint: 'Отклонять пустой скан.',
  },
  {
    key: ValidationFlag.CodeLength,
    group: 'code',
    label: 'Длина кода',
    hint: 'Проверять длину кода по списку CODE_LENGTH.',
  },
  {
    key: ValidationFlag.CodePrefix,
    group: 'code',
    label: 'Префикс «01»',
    hint: 'Код должен начинаться с 01.',
  },
  {
    key: ValidationFlag.CodeGtin,
    group: 'code',
    label: 'GTIN задания',
    hint: 'GTIN в коде должен совпадать с заданием.',
  },
  {
    key: ValidationFlag.CodeFormat,
    group: 'code',
    label: 'Формат кода',
    hint: 'Проверять структуру GS1 (01…21…91/92/93).',
  },
  {
    key: ValidationFlag.CodeDuplicate,
    group: 'code',
    label: 'Дубликат',
    hint: 'Искать код в базе перед сохранением.',
  },
  {
    key: ValidationFlag.CodeInTask,
    group: 'code',
    label: 'Код в списке задания',
    hint: 'Код должен быть в списке допустимых кодов задания.',
  },

  {
    key: ValidationFlag.BoxCodesRecognized,
    group: 'boxLabel',
    label: 'Коды распознаны',
    hint: 'Отклонять привязку, если есть нераспознанные коды.',
  },
  {
    key: ValidationFlag.BoxHasProductCodes,
    group: 'boxLabel',
    label: 'Есть коды продуктов',
    hint: 'Нужен хотя бы один код продукта.',
  },
  {
    key: ValidationFlag.BoxSingleLabel,
    group: 'boxLabel',
    label: 'Одна этикетка коробки',
    hint: 'В скане должна быть ровно одна этикетка коробки.',
  },
  {
    key: ValidationFlag.BoxLabelValid,
    group: 'boxLabel',
    label: 'Этикетка по заданию',
    hint: 'Этикетка коробки должна соответствовать заданию.',
  },
  {
    key: ValidationFlag.BoxTableExists,
    group: 'boxLabel',
    label: 'Таблица существует',
    hint: 'Проверять наличие таблицы задания в БД.',
  },
  {
    key: ValidationFlag.BoxLabelNotUsed,
    group: 'boxLabel',
    label: 'Этикетка не использована',
    hint: 'Этикетка не должна встречаться в таблице.',
  },
  {
    key: ValidationFlag.BoxProductsExist,
    group: 'boxLabel',
    label: 'Продукты в системе',
    hint: 'Все коды продуктов должны быть уже сохранены.',
  },
  {
    key: ValidationFlag.BoxSameBox,
    group: 'boxLabel',
    label: 'Одна коробка',
    hint: 'Коды продуктов должны быть из одной коробки.',
  },
  {
    key: ValidationFlag.BoxNumberDefined,
    group: 'boxLabel',
    label: 'Коробка определена',
    hint: 'У кодов продукта должен быть корректный box_number.',
  },
  {
    key: ValidationFlag.BoxLabelNotForBox,
    group: 'boxLabel',
    label: 'Этикетка не привязана к коробке',
    hint: 'Этикетка не должна быть уже привязана к этой коробке.',
  },
];

export const VALIDATION_FLAG_KEYS: ValidationFlag[] = VALIDATION_FLAGS.map(
  (flag) => flag.key,
);

/** Метаданные по ключу */
export const VALIDATION_FLAG_BY_KEY = new Map(
  VALIDATION_FLAGS.map((flag) => [flag.key, flag]),
);
