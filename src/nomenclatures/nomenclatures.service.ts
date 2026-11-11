import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { nomenclaturesLogger } from 'src/logger-winston/winston.config';
import { getNomenclatureJsonDirectory } from 'src/path.util';
import { Logger } from 'winston';

@Injectable()
export class NomenclaturesService {
  constructor(
    @Inject('winston') private readonly logger: Logger = nomenclaturesLogger,
  ) {}

  private readonly nomenclatureJsonDirectory = getNomenclatureJsonDirectory();

  async getFiles(): Promise<string[]> {
    this.logger.info('Номенклатура: Получение списка файлов');
    return new Promise((resolve, reject) => {
      fs.readdir(this.nomenclatureJsonDirectory, (err, files) => {
        if (err) {
          this.logger.error('Номенклатура: Ошибка при чтении директории:', err);
          return reject(err);
        }
        this.logger.info('Номенклатура: Список файлов успешно получен');
        resolve(files);
      });
    });
  }

  async getFile(filename: string): Promise<string> {
    const filePath = path.join(this.nomenclatureJsonDirectory, filename);
    this.logger.info(`Номенклатура: Получение файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.error('Номенклатура: Ошибка при чтении файла:', err);
          return reject(err);
        }
        this.logger.info(`Номенклатура: Файл ${filename} успешно получен`);
        resolve(data);
      });
    });
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.nomenclatureJsonDirectory, filename);
    this.logger.info(`Номенклатура: Удаление файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          this.logger.error('Номенклатура: Ошибка при удалении файла:', err);
          return reject(err);
        }
        this.logger.info(`Номенклатура: Файл ${filename} успешно удален`);
        resolve();
      });
    });
  }

  async createFile(rootName: string, data: any): Promise<string> {
    const jsonFilePath = path.join(
      this.nomenclatureJsonDirectory,
      `${rootName}.json`,
    );
    this.logger.info(`Номенклатура: Создание файла: ${rootName}.json`);
    return new Promise((resolve, reject) => {
      fs.writeFile(jsonFilePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
          this.logger.error('Номенклатура: Ошибка при создании файла:', err);
          return reject(err);
        }
        this.logger.info(`Номенклатура: Файл ${rootName}.json успешно создан`);
        resolve(jsonFilePath);
      });
    });
  }
}
