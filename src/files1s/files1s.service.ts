import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getJsonDirectory1S, getTaskJsonDirectory } from 'src/path.util';
import { validateJson } from './validate.json';
import * as dotenv from 'dotenv';
import { log } from 'console';
import { logger1S } from 'src/logger-winston/winston.config';
import { Logger } from 'winston';

dotenv.config();
const interval = +process.env.CHECK_1S_INTERVAL || 60000;

@Injectable()
export class FileService1S implements OnModuleInit {
  private files: string[] = [];
  private filesIn: string[] = [];
  private checkInterval: NodeJS.Timeout;
  constructor(@Inject('winston') private readonly logger: Logger = logger1S) { }

  onModuleInit() {
    // Первая проверка сразу при старте
    this.checkFilesInDirectory();

    // Затем проверка каждую минуту (60000 мс)
    this.checkInterval = setInterval(
      () => this.checkFilesInDirectory(),
      interval,
    );
  }

  async onApplicationShutdown() {
    // Очищаем интервал при остановке приложения
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  async checkFilesInDirectory() {
    const directoryPath = getJsonDirectory1S();
    const taskDirectoryPath = getTaskJsonDirectory();
    const results: { success: boolean; message: string }[] = [];

    console.log(results, 'checkFilesInDirectory');

    try {
      // Создаем папку для заданий если ее нет
      await fs.promises.mkdir(taskDirectoryPath, { recursive: true });
      console.log('------------start 1S check');

      // Получаем списки файлов
      const allFiles = await fs.promises.readdir(directoryPath);
      this.files = allFiles.filter((file) => file.endsWith('.json'));
      this.filesIn = allFiles.filter((file) => file.endsWith('.in'));

      // Проверяем наличие файлов заданий
      if (this.filesIn.length === 0) {
        return {
          success: false,
          message: 'Нет файлов заданий от 1С (.in файлов)',
          details: [],
        };
      }

      // Проверяем наличие соответствующих json файлов
      const validInFiles = this.filesIn.filter((fileIn) =>
        this.files.includes(fileIn.replace('.in', '.json')),
      );

      if (validInFiles.length === 0) {
        return {
          success: false,
          message: 'Нет соответствующих JSON файлов для обработки',
          details: this.filesIn.map((fileIn) => ({
            file: fileIn,
            message: `Отсутствует JSON файл для ${fileIn}`,
          })),
        };
      }

      // Обрабатываем все валидные пары файлов
      for (const fileIn of validInFiles) {
        const jsonFileName = fileIn.replace('.in', '.json');
        const jsonFilePath = path.join(directoryPath, jsonFileName);
        const inFilePath = path.join(directoryPath, fileIn);

        try {
          // Чтение и валидация JSON
          const jsonData = await fs.promises.readFile(jsonFilePath, 'utf-8');
          let jsonParsed = null;

          try {
            jsonParsed = JSON.parse(jsonData.trim());
          } catch (err) {
            const errorMessage = `Ошибка парсинга JSON файла ${jsonFileName}: ${err.message}`;
            this.logger.warn(errorMessage, { error: err });

            // Добавляем ошибку в массив результатов
            results.push({
              success: false,
              message: errorMessage,
            });
          }

          console.log(results, 'sadsadadsa108');

          const { errors, items } = await validateJson(jsonParsed);

          // Запись результата валидации в .in файл
          await fs.promises.writeFile(
            inFilePath,
            JSON.stringify(
              {
                errors: [{ status: errors.length > 0 }],
                items: errors.length > 0 ? items : undefined,
              },
              null,
              2,
            ),
          );

          // Переименование .in в .out
          const outFilePath = inFilePath.replace('.in', '.out');
          await fs.promises.rename(inFilePath, outFilePath);

          // Если ошибок нет - копируем JSON в папку заданий с новым именем
          if (errors.length === 0) {
            const newFileName = this.generateFilename(jsonParsed);
            const taskFilePath = path.join(taskDirectoryPath, newFileName);

            const cleanedJsonData = JSON.stringify(jsonParsed, null, 2).trim();
            await fs.promises.writeFile(taskFilePath, cleanedJsonData);

            // УБРАНА СТРОКА: await fs.promises.unlink(jsonFilePath);
            // Теперь исходный JSON файл остается на месте

            const message = `Файл ${jsonFileName} успешно обработан и скопирован как ${newFileName} (исходный файл сохранен)`;
            results.push({ success: true, message });
          } else {
            results.push({
              success: false,
              message: `Файл ${jsonFileName} содержит ошибки валидации (исходный файл сохранен)`,
            });
          }
        } catch (error) {
          results.push({
            success: false,
            message: `Ошибка обработки файла ${fileIn}: ${error.message}`,
          });
        }
      }
      console.log(results, 'sadsadadsa155');

      return {
        success: results.some((r) => r.success),
        message: results.some((r) => r.success)
          ? 'Обработка файлов завершена'
          : 'Все файлы содержат ошибки',
        details: results,
        processedCount: results.length,
      };
    } catch (err) {
      return {
        success: false,
        message: `Системная ошибка: ${err.message}`,
        details: [],
      };
    }
  }

  private generateFilename(jsonData: any): string {
    const gtin = jsonData.gtin || '';
    const itf14 = jsonData.ITF14 ? `_${jsonData.ITF14}` : '';
    const batch = jsonData.batch || '';

    const cleanGtin = gtin.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanItf14 = itf14.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanBatch = batch.replace(/[^a-zA-Z0-9_-]/g, '');
    const id = Date.now()

    return `${cleanGtin}${cleanItf14}_${cleanBatch}_${id}.json`;
  }

  public async getFiles(): Promise<string[]> {
    return this.files;
  }

  public async refreshFiles(): Promise<string[]> {
    await this.checkFilesInDirectory();
    return this.files;
  }
}