import { EntityManager } from 'typeorm';

const formatDate = (date: string) => {
  const [day, month, year] = date.split('.');
  return `${year.slice(2)}${month}${day}`;
};

const generateTemplateZPL = (
  template: string[],
  task: any,
  packagingNumber: number,
  formatOptions: { [key: string]: string },
  countIn?: number,
  // isItfMini?: boolean
) => {
  // Фильтруем пустые элементы
  const filteredTemplate = template.filter(item => item && item.trim() !== '');

  const generatedStringt = filteredTemplate
    .map((num, index) => {
      let result = '';
      switch (num) {
        case '01 gtin':
          result = `${formatOptions['01 gtin']}${task.gtin}`;
          break;
        case '01 itf14':
          result = `${formatOptions['01 itf14']}${task.ITF14}`;
          break;
        case '02 gtin':
          result = `${formatOptions['02 gtin']}${task.gtin}`;
          break;
        case '02 itf14':
          result = `${formatOptions['02 itf14']}${task.ITF14}`;
          break;
        case '10':
          result = `${formatOptions['10']}${task.batch.length % 2 !== 0 ? '0' + task.batch : task.batch}`;
          break;
        case '11':
          result = `${formatOptions['11']}${formatDate(task.date_manufacture)}`;
          break;
        case '17':
          result = `${formatOptions['17']}${formatDate(task.date_expiration)}`;
          break;
        case '21':
          result = `${formatOptions['21']}${packagingNumber.toString().length % 2 !== 0 ? '0' + packagingNumber : packagingNumber}`;
          break;
        case '30':
          const countInValue30 = countIn !== undefined ? countIn : task.packaging_per_pallet;
          result = `${formatOptions['30']}${countInValue30.toString().length % 2 !== 0 ? '0' + countInValue30 : countInValue30}`;
          break;
        case '37':
          const countInValue37 = countIn !== undefined ? countIn : task.pieces_per_package;
          result = `${formatOptions['37']}${countInValue37.toString().length % 2 !== 0 ? '0' + countInValue37 : countInValue37}`;
          break;
        default:
          result = '';
      }

      if (result && ['10', '30', '37', '21'].includes(num) && formatOptions[`${num}_suffix`]) {
        const hasNextNonEmpty = filteredTemplate.slice(index + 1).some(item => item && item.trim() !== '');
        if (hasNextNonEmpty) {
          result += formatOptions[`${num}_suffix`];
        }
      }

      return result;
    })
    .join('');

  return generatedStringt;
};

const generateTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  formatOptions: { [key: string]: string },
  countIn?: number,
  // isItfMini?: boolean
) => {
  // Фильтруем пустые элементы
  const filteredTemplate = template.filter(item => item && item.trim() !== '');

  const generatedString = filteredTemplate
    .map((num, index) => {
      let result = '';
      switch (num) {
        case '01 gtin':
          result = `${formatOptions['01 gtin']}${task.gtin}`;
          break;
        case '01 itf14':
          result = `${formatOptions['01 itf14']}${task.ITF14}`;
          break;
        case '02 gtin':
          result = `${formatOptions['02 gtin']}${task.gtin}`;
          break;
        case '02 itf14':
          result = `${formatOptions['02 itf14']}${task.ITF14}`;
          break;
        case '10':
          result = `${formatOptions['10']}${task.batch}`;
          break;
        case '11':
          result = `${formatOptions['11']}${formatDate(task.date_manufacture)}`;
          break;
        case '17':
          result = `${formatOptions['17']}${formatDate(task.date_expiration)}`;
          break;
        case '21':
          result = `${formatOptions['21']}${packagingNumber}`;
          break;
        case '30':
          result = `${formatOptions['30']}${countIn || task.packaging_per_pallet}`;
          break;
        case '37':
          result = `${formatOptions['37']}${countIn || task.pieces_per_package}`;
          break;
        default:
          result = '';
      }

      // Добавляем суффикс только если есть следующий непустой элемент
      if (result && ['10', '30', '37', '21'].includes(num) && formatOptions[`${num}_suffix`]) {
        const hasNextNonEmpty = filteredTemplate.slice(index + 1).some(item => item && item.trim() !== '');
        if (hasNextNonEmpty) {
          result += formatOptions[`${num}_suffix`];
        }
      }

      return result;
    })
    .join('');
  return generatedString;
};

export const generateJSONTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn?: number,
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '\u001d',
    '30_suffix': '\u001d',
    '37_suffix': '\u001d',
    '21_suffix': '\u001d', // Добавляем суффикс для 21
  };
  return generateTemplate(
    template,
    task,
    packagingNumber,
    formatOptions,
    countIn,
  );
};

export const generatePasteckJSONTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn?: number,
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '\u001d',
    '30_suffix': '\u001d',
    '37_suffix': '\u001d',
    '21_suffix': '\u001d', // Добавляем суффикс для 21
  };
  return generateTemplateZPL(
    template,
    task,
    packagingNumber,
    formatOptions,
    countIn,
  );
};

export const generateHandTSCTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn?: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '!102',
    '30_suffix': '!102',
    '37_suffix': '!102',
    '21_suffix': '!102',
  };
  return generateTemplate(
    template,
    task,
    packagingNumber,
    formatOptions,
    countIn,
    // isItfMini
  );
};

export const generateHandPasteckTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn?: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '>8',
    '30_suffix': '>8',
    '37_suffix': '>8',
    '21_suffix': '>8',
  };
  return (
    '>;>8' +
    generateTemplateZPL(template, task, packagingNumber, formatOptions, countIn)
  );
};

export const generateDataMatrixPasteckTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '$d029',
    '30_suffix': '$d029',
    '37_suffix': '$d029',
    '21_suffix': '$d029',
  };
  return (
    '$1' +
    generateTemplateZPL(template, task, packagingNumber, formatOptions, countIn)
  );
};

export const generateDataMatrixTSCTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '01',
    '01 itf14': '01',
    '02 gtin': '02',
    '02 itf14': '02',
    '10': '10',
    '11': '11',
    '17': '17',
    '21': '21',
    '30': '30',
    '37': '37',
    '10_suffix': '~1',
    '30_suffix': '~1',
    '37_suffix': '~1',
    '21_suffix': '~1',
  };
  return generateTemplate(
    template,
    task,
    packagingNumber,
    formatOptions,
    countIn,
    // isItfMini
  );
};

export const generateHandPeopleTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '(01)',
    '01 itf14': '(01)',
    '02 gtin': '(02)',
    '02 itf14': '(02)',
    '10': '(10)',
    '11': '(11)',
    '17': '(17)',
    '21': '(21)',
    '30': '(30)',
    '37': '(37)',
  };
  return generateTemplate(
    template,
    task,
    packagingNumber,
    formatOptions,
    countIn,
    // isItfMini
  );
};

export const generateHandPasteckPeopleTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
  countIn: number,
  // isItfMini?: boolean
) => {
  const formatOptions = {
    '01 gtin': '(01)',
    '01 itf14': '(01)',
    '02 gtin': '(02)',
    '02 itf14': '(02)',
    '10': '(10)',
    '11': '(11)',
    '17': '(17)',
    '21': '(21)',
    '30': '(30)',
    '37': '(37)',
  };
  return generateTemplateZPL(template, task, packagingNumber, formatOptions, countIn);
};

export const generatePeopleTemplate = (
  template: string[],
  task: any,
  packagingNumber: number,
) => {
  const formatOptions = {
    '01 gtin': '(01)',
    '01 itf14': '(01)',
    '02 gtin': '(02)',
    '02 itf14': '(02)',
    '10': '(10)',
    '11': '(11)',
    '17': '(17)',
    '21': '(21)',
    '30': '(30)',
    '37': '(37)',
  };
  return generateTemplate(template, task, packagingNumber, formatOptions);
};

export const getExpectedBlockValue = (task: any, block: string): string => {
  switch (block) {
    case '01 gtin':
      return task.gtin;
    case '01 itf14':
      return task.ITF14;
    case '02 gtin':
      return task.gtin;
    case '02 itf14':
      return task.ITF14;
    case '10':
      return task.batch.toString().length % 2 !== 0
        ? '0' + task.batch.toString()
        : task.batch;
    case '11':
      return formatDate(task.date_manufacture);
    case '17':
      return formatDate(task.date_expiration);
    case '21':
    case '30':
    case '37':
      return '';
    default:
      throw new Error(`Неизвестный блок: ${block}`);
  }
};

export const getBlockLengthFromTask = (task: any, block: string): number => {
  switch (block) {
    case '01 gtin':
      return task.gtin.length;
    case '01 itf14':
      return task.ITF14.length;
    case '02 gtin':
      return task.gtin.length;
    case '02 itf14':
      return task.ITF14.length;
    case '10':
      return task.batch.length % 2 !== 0
        ? task.batch.length + 1
        : task.batch.length;
    case '11':
      return formatDate(task.date_manufacture).length;
    case '17':
      return formatDate(task.date_expiration).length;
    case '21':
    case '30':
    case '37':
      return 0;
    default:
      throw new Error(`Неизвестный блок: ${block}`);
  }
};

export const extractLabelBlocks = (
  boxLabel: string,
  template: string[],
  task: any,
): { [key: string]: string } => {
  const blocks: { [key: string]: string } = {};
  let currentIndex = 0;

  for (const block of template) {
    console.log('------------', block);
    const blockLength = getBlockLengthFromTask(task, block);

    const blockValue = boxLabel.substring(
      currentIndex + 2,
      currentIndex + 2 + blockLength,
    );

    blocks[block] = blockValue;
    currentIndex += blockLength + 2;
  }
  console.log('extractLabelBlocks------------', blocks);

  return blocks;
};

export const validateBoxLabel = (
  boxLabel: string,
  boxTemplate: any[],
  task: any,
): boolean => {
  const extractedBlocks = extractLabelBlocks(boxLabel, boxTemplate, task);
  for (const block of boxTemplate) {
    const expectedValue = getExpectedBlockValue(task, block);
    const extractedValue = extractedBlocks[block];
    console.log(
      '$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$',
      `Блок: ${block}, Ожидалось: ${expectedValue}, Получено: ${extractedValue}`,
    );

    if (expectedValue !== extractedValue) {
      console.error(
        `Этикетка не соответствует шаблону и заданию. Блок: ${block}, Ожидалось: ${expectedValue}, Получено: ${extractedValue}`,
      );
      return false;
    }
  }
  return true;
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
  }
  return exists.length > 0;
};

// export const generateDatabaseCipher = (
//   template: string[],
//   task: any,
//   packagingNumber: number,
//   countIn?: number,
// ): string => {
//   const isPasteck = printerType === PrintersTypes.Pasteck;

//   const formatOptions = {
//     '01 gtin': '01',
//     '01 itf14': '01',
//     '02 gtin': '02',
//     '02 itf14': '02',
//     '10': '10',
//     '11': '11',
//     '17': '17',
//     '21': '21',
//     '30': '30',
//     '37': '37',
//   };

//   const filteredTemplate = template.filter(item => item && item.trim() !== '');

//   const generatedString = filteredTemplate
//     .map((num, index) => {
//       let value = '';
//       let result = '';

//       switch (num) {
//         case '01 gtin':
//           value = task.gtin;
//           result = `${formatOptions['01 gtin']}${value}`;
//           break;
//         case '01 itf14':
//           value = task.ITF14;
//           result = `${formatOptions['01 itf14']}${value}`;
//           break;
//         case '02 gtin':
//           value = task.gtin;
//           result = `${formatOptions['02 gtin']}${value}`;
//           break;
//         case '02 itf14':
//           value = task.ITF14;
//           result = `${formatOptions['02 itf14']}${value}`;
//           break;
//         case '10':
//           value = task.batch.toString();
//           // Добавляем ведущий ноль если длина нечетная и принтер Pasteck
//           if (isPasteck && value.length % 2 !== 0) {
//             value = '0' + value;
//           }
//           result = `${formatOptions['10']}${value}`;
//           break;
//         case '11':
//           value = formatDate(task.date_manufacture);
//           result = `${formatOptions['11']}${value}`;
//           break;
//         case '17':
//           value = formatDate(task.date_expiration);
//           result = `${formatOptions['17']}${value}`;
//           break;
//         case '21':
//           value = packagingNumber.toString();
//           // Добавляем ведущий ноль если длина нечетная и принтер Pasteck
//           if (isPasteck && value.length % 2 !== 0) {
//             value = '0' + value;
//           }
//           result = `${formatOptions['21']}${value}`;
//           break;
//         case '30':
//           value = (countIn || task.packaging_per_pallet).toString();
//           // Добавляем ведущий ноль если длина нечетная и принтер Pasteck
//           if (isPasteck && value.length % 2 !== 0) {
//             value = '0' + value;
//           }
//           result = `${formatOptions['30']}${value}`;
//           break;
//         case '37':
//           value = (countIn || task.pieces_per_package).toString();
//           // Добавляем ведущий ноль если длина нечетная и принтер Pasteck
//           if (isPasteck && value.length % 2 !== 0) {
//             value = '0' + value;
//           }
//           result = `${formatOptions['37']}${value}`;
//           break;
//         default:
//           value = '';
//           result = '';
//       }

//       // Добавляем разделитель \x1D после блоков 10, 21, 30, 37 если есть следующий НЕПУСТОЙ элемент
//       if (result && ['10', '21', '30', '37'].includes(num)) {
//         // Проверяем есть ли следующий непустой элемент
//         const hasNextNonEmpty = filteredTemplate.slice(index + 1).some(item => item && item.trim() !== '');
//         if (hasNextNonEmpty) {
//           result += '\x1D'; // GS разделитель
//         }
//       }

//       return result;
//     })
//     .join('');

//   return generatedString;
// };