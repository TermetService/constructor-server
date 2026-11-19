import { config } from 'src/config/config';
// ftp-upload.service.ts
import { Inject, Injectable } from '@nestjs/common';
import * as ftp from 'basic-ftp';
import { loggerFTP } from 'src/logger-winston/winston.config';
import * as stream from 'stream';
import { Logger } from 'winston';

@Injectable()
export class FTPService {
  constructor(
    @Inject('winston') private readonly logger: Logger = loggerFTP,
  ) { }

  async uploadFile(data: any, filename: string): Promise<void> {
    const client = new ftp.Client();

    try {
      // Подключаемся
      await client.access({
        host: config.FTP_HOST,
        user: config.FTP_USER,
        password: config.FTP_PASSWORD,
        port: parseInt(config.FTP_PORT) || 21,
      });

      // Преобразуем данные в поток
      const jsonData = JSON.stringify(data, null, 2);
      const buffer = Buffer.from(jsonData, 'utf-8');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);

      // Загружаем в корень (без перехода в другие папки)
      await client.uploadFrom(bufferStream, filename);

      this.logger.info(`Файл ${filename} загружен на FTP`);

    } catch (error) {
      this.logger.error(`Ошибка FTP: ${error.message}`);
      throw error;
    } finally {
      client.close();
    }
  }
}