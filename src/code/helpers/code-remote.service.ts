import { Inject, Injectable, Optional } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

/**
 * HTTP-клиент к сервису валидации кодов (порт 4001).
 * Используется, когда линия работает с внешней проверкой/удалённой БД.
 */
@Injectable()
export class CodeRemoteService {
  constructor(
    @Inject('winston') private readonly logger: Logger,
    @Optional()
    @Inject('HTTP_CLIENT')
    private readonly client: AxiosInstance = axios,
  ) {}

  /** Валидация/сохранение кода на внешнем сервисе */
  async saveCurrentCode(code: string): Promise<any> {
    try {
      const { data } = await this.client.post(this.url('/code/validate-code'), {
        code,
      });
      return data;
    } catch (error) {
      this.logger.error(
        `Ошибка saveCurrentCode для кода ${code}: ${error.message}`,
      );
      throw error;
    }
  }

  /** Поиск дубликатов среди переданных кодов */
  async getDuplicatesCodes(codes: string[]): Promise<any> {
    try {
      const { data } = await this.client.post(this.url('/code/get-codes'), {
        codes,
      });
      return data;
    } catch (error) {
      this.logger.error(`Ошибка getDuplicatesCodes: ${error.message}`);
      throw error;
    }
  }

  /** Удаление кода на внешнем сервисе */
  async deleteCode(code: string): Promise<void> {
    try {
      await this.client.delete(this.url('/code/delete-code'), {
        data: { code },
      });
    } catch (error) {
      this.logger.error(`Ошибка deleteCode для кода ${code}: ${error.message}`);
      throw error;
    }
  }

  /** Удаление лазерных кодов из общего реестра на внешнем сервисе */
  async removeLaserCodesPresentInCodeEntity(code: string): Promise<void> {
    try {
      await this.client.delete(this.url('/code/delete-laser-codes'), {
        data: { code },
      });
    } catch (error) {
      this.logger.error(
        `Ошибка removeLaserCodesPresentInCodeEntity для кода ${code}: ${error.message}`,
      );
      throw error;
    }
  }

  private url(path: string): string {
    const host = process.env.IP_SERVER;
    if (!host) {
      throw new Error(
        'IP_SERVER не задан в .env — внешний сервис кодов недоступен',
      );
    }

    return `http://${host}:4001${path}`;
  }
}
