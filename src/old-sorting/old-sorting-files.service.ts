import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { oldSortingLogger } from 'src/logger-winston/winston.config';
import { getStartTaskJsonDirectory } from 'src/path.util';
import { Logger } from 'winston';

@Injectable()
export class OldSortingFilesService {
  constructor(
    @Inject('winston') private readonly logger: Logger = oldSortingLogger,
  ) {}

  private readonly startTaskJsonDirectory = getStartTaskJsonDirectory();

  async getFiles(): Promise<string[]> {
    this.logger.info('История сортировок: Получение списка файлов');
    return new Promise((resolve, reject) => {
      fs.readdir(this.startTaskJsonDirectory, async (err, files) => {
        if (err) {
          this.logger.error(
            'История сортировок: Ошибка при чтении директории:',
            err,
          );
          return reject(err);
        }

        try {
          // Получаем информацию о каждом файле
          const filesWithStats = await Promise.all(
            files.map(async (file) => {
              const filePath = path.join(this.startTaskJsonDirectory, file);
              const stats = await fs.promises.stat(filePath);
              return {
                name: file,
                birthtime: stats.birthtime, // время создания файла
              };
            }),
          );

          // Сортируем файлы по дате создания (от новых к старым)
          const sortedFiles = filesWithStats
            .sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime())
            .map((file) => file.name);

          this.logger.info(
            'История сортировок: Список файлов успешно получен и отсортирован',
          );
          resolve(sortedFiles);
        } catch (error) {
          this.logger.error(
            'История сортировок: Ошибка при получении информации о файлах:',
            error,
          );
          reject(error);
        }
      });
    });
  }

  async getFile(filename: string): Promise<string> {
    const filePath = path.join(this.startTaskJsonDirectory, filename);
    this.logger.info(`История сортировок: Получение файла: ${filename}`);
    console.info(`filePath`, filePath);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.error(
            'История сортировок: Ошибка при чтении файла:',
            err,
          );
          return reject(err);
        }
        this.logger.info(
          `История сортировок: Файл ${filename} успешно получен`,
        );
        resolve(data);
      });
    });
  }

  async createFile(rootName: string, data: any): Promise<string> {
    const jsonFilePath = path.join(
      this.startTaskJsonDirectory,
      `${rootName}.json`,
    );
    this.logger.info(`История сортировок: Создание файла: ${rootName}.json`);
    return new Promise((resolve, reject) => {
      fs.writeFile(jsonFilePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
          this.logger.error(
            'История сортировок: Ошибка при создании файла:',
            err,
          );
          return reject(err);
        }
        this.logger.info(
          `История сортировок: Файл ${rootName}.json успешно создан`,
        );
        resolve(jsonFilePath);
      });
    });
  }

  async readTaskFile(taskName: string): Promise<any> {
    if (taskName) {
      const filePath = path.join(this.startTaskJsonDirectory, taskName);
      try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const task = JSON.parse(data);

        return task;
      } catch (err) {
        this.logger.error('История: Ошибка при чтении файла:', err);
        throw err;
      }
    } else {
      this.logger.info('История: taskName не задано');
      return null;
    }
  }
}
