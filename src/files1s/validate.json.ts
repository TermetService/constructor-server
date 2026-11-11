import * as fs from 'fs';
import * as path from 'path';
import {
  getJsonDirectory1STemplate,
  getTemplateDirectory,
} from 'src/path.util';
import { TASK } from './sample';

export async function validateJson(
  jsonData: any,
): Promise<{ errors: string[]; items: string[] }> {
  const errors: string[] = [];
  const items: string[] = [];

  // 1. Проверяем и загружаем шаблон
  const templateDir = getJsonDirectory1STemplate();
  let templateFields: string[] = [];

  try {
    const templateFiles = (await fs.promises.readdir(templateDir)).filter((f) =>
      f.endsWith('.json'),
    );

    if (templateFiles.length === 0) {
      console.error('[VALIDATION] В директории шаблонов нет JSON файлов');
      return {
        errors: ['Не найден файл шаблона'],
        items: ['В директории шаблонов нет JSON файлов'],
      };
    }

    if (templateFiles.length > 1) {
      console.warn(
        `[VALIDATION] Найдено несколько JSON файлов в директории шаблонов. Будет использован первый: ${templateFiles[0]}`,
      );
    }

    const templatePath = path.join(templateDir, templateFiles[0]);
    const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
    templateFields = Object.keys(JSON.parse(templateContent));

    // Дополнительная проверка структуры шаблона
    if (templateFields.length === 0) {
      console.error('[VALIDATION] Шаблонный файл не содержит полей');
      return {
        errors: ['Шаблонный файл пустой'],
        items: ['Шаблонный файл не содержит полей'],
      };
    }
  } catch (err) {
    console.error('[VALIDATION] Ошибка загрузки шаблона:', err.message);
    return {
      errors: ['Ошибка загрузки шаблона'],
      items: ['Ошибка загрузки шаблона'],
    };
  }

  // 2. Фильтруем TASK, оставляя только поля из шаблона
  const activeFields = TASK.filter((field) =>
    templateFields.includes(field.name),
  );

  // 3. Проверяем наличие всех полей из шаблона в JSON
  for (const fieldName of templateFields) {
    if (!(fieldName in jsonData)) {
      const fieldInfo = TASK.find((f) => f.name === fieldName);
      const fieldLabel = fieldInfo?.label || fieldName;
      errors.push(`Отсутствует обязательное поле: ${fieldLabel}`);
      items.push(fieldName);
    }
  }

  // 4. Проверяем значения полей
  for (const field of activeFields) {
    const value = jsonData[field.name];

    // Пропускаем если поле не в шаблоне или разрешен пробел
    if (
      !templateFields.includes(field.name) ||
      (field.allowSpace && value === ' ')
    ) {
      continue;
    }

    // Проверка обязательных полей
    if (field.required) {
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        value === ' '
      ) {
        errors.push(`Обязательное поле ${field.label} не может быть пустым`);
        items.push(field.name);
        continue;
      }
    }

    // Специфические проверки
    switch (field.name) {
      case 'gtin':
      case 'ITF14':
        if (!/^\d{14}$/.test(value)) {
          errors.push(`${field.label} требует ровно 14 цифр`);
          items.push(field.name);
        }
        break;

      case 'date_manufacture':
      case 'date_expiration':
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
          errors.push(`${field.label} должен быть в формате ДД.ММ.ГГГГ`);
          items.push(field.name);
        }
        break;

      case 'startCorob':
      case 'startPallet':
      case 'pieces_per_package':
      case 'packaging_per_pallet':
      case 'workSH':
        if (!/^\d+$/.test(value) || parseInt(value, 10) <= 0) {
          errors.push(`${field.label} должно быть целым числом > 0`);
          items.push(field.name);
        }
        break;

      case 'nettoUnit':
      case 'bruttoUnit':
      case 'bruttoBox':
        if (!/^\d+(\.\d+)?$/.test(value) || parseFloat(value) <= 0) {
          errors.push(`${field.label} должно быть положительным числом`);
          items.push(field.name);
        }
        break;

      case 'labelBox':
      case 'labelPallet':
        const templateDirectory = getTemplateDirectory();
        const templateFilePath = `${templateDirectory}/${value}.prn`;
        try {
          await fs.promises.access(templateFilePath);
        } catch {
          errors.push(`Шаблон ${field.label} не найден: ${value}.prn`);
          items.push(field.name);
        }
        break;
    }
  }

  return { errors, items };
}
