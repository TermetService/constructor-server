import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { tasksLogger } from 'src/logger-winston/winston.config';
import {
  getNomenclatureJsonDirectory,
  getTaskJsonDirectory,
} from 'src/path.util';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';

@Injectable()
export class TasksService {
  constructor(
    @Inject('winston') private readonly logger: Logger = tasksLogger,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) {}

  private readonly taskJsonDirectory = getTaskJsonDirectory();
  private readonly nomenclatureJsonDirectory = getNomenclatureJsonDirectory();

  async getFiles(): Promise<string[]> {
    this.logger.info('Задание: Получение списка файлов');

    return new Promise((resolve, reject) => {
      fs.readdir(this.taskJsonDirectory, async (err, files) => {
        if (err) {
          this.logger.error('Задание: Ошибка при получении списка файлов', err);
          return reject(err);
        }

        try {
          // Получаем информацию о каждом файле
          const filesWithStats = await Promise.all(
            files.map(async (file) => {
              const filePath = path.join(this.taskJsonDirectory, file);
              const stats = await fs.promises.stat(filePath);
              return {
                name: file,
                ctime: stats.ctime, // время последнего изменения статуса файла
                // или используйте birthtime для времени создания, если доступно
              };
            }),
          );

          // Сортируем по дате (новые сначала)
          const sortedFiles = filesWithStats
            .sort((a, b) => b.ctime.getTime() - a.ctime.getTime())
            .map((file) => file.name);

          this.logger.info(
            `Задание: Получено ${sortedFiles.length} файлов, отсортированных по дате`,
          );
          resolve(sortedFiles);
        } catch (error) {
          this.logger.error('Задание: Ошибка при сортировке файлов', error);
          reject(error);
        }
      });
    });
  }

  async getFile(filename: string): Promise<string> {
    const filePath = path.join(this.taskJsonDirectory, filename);
    this.logger.info(`Задание: Получение файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.error(
            `Задание: Ошибка при чтении файла1: ${filename}`,
            err,
          );
          return reject(err);
        }
        this.logger.info(`Задание: Файл ${filename} успешно прочитан`);
        resolve(data);
      });
    });
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.taskJsonDirectory, filename);
    this.logger.info(`Задание: Удаление файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          this.logger.error(
            `Задание: Ошибка при удалении файла: ${filename}`,
            err,
          );
          return reject(err);
        }
        this.logger.info(`Задание: Файл ${filename} успешно удален`);
        resolve();
      });
    });
  }

  async createFile(rootName: string, data: any): Promise<string> {
    const nomenclatureFilePath = path.join(
      this.nomenclatureJsonDirectory,
      rootName,
    );
    this.logger.info(`Задание: Создание файла на основе: ${rootName}`);
    return new Promise((resolve, reject) => {
      fs.readFile(nomenclatureFilePath, 'utf8', (err, existingData) => {
        let mergedData;
        if (err) {
          if (err.code === 'ENOENT') {
            this.logger.warn(
              `Задание: Файл ${rootName} не найден, будет создан новый`,
            );
            mergedData = data;
          } else {
            this.logger.error(
              `Задание: Ошибка при чтении файла2: ${rootName}`,
              err,
            );
            return reject(new Error(`Ошибка при чтении файла: ${rootName}`));
          }
        } else {
          this.logger.info(`Задание: Файл ${rootName} успешно прочитан`);
          mergedData = { ...JSON.parse(existingData), ...data };
        }
        const p = rootName.split('.')[0];
        const newFileName = `${p}_${data.batch}.json`;
        const taskJsonFilePath = path.join(this.taskJsonDirectory, newFileName);

        fs.writeFile(
          taskJsonFilePath,
          JSON.stringify(mergedData, null, 2),
          (err) => {
            if (err) {
              this.logger.error(
                `Задание: Ошибка при создании файла: ${newFileName}`,
                err,
              );
              return reject(new Error('Error creating JSON file'));
            }
            this.logger.info(`Задание: Файл ${newFileName} успешно создан`);
            resolve(taskJsonFilePath);
          },
        );
      });
    });
  }
}
