import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import * as dotenv from 'dotenv';
import { IMonitoringVariables } from 'src/globalTypes';
import {
  createTableIfNotExists,
  createTaskTable,
} from 'src/monitoring/helper';
import { CodeRepository } from '../code.repository';

dotenv.config();

const tableRetentionDays = +process.env.IS_TABLE_RETENTION;

/**
 * Всё, что связано с таблицами задания: создание, проверка существования
 * и удаление старых таблиц.
 */
@Injectable()
export class CodeTablesService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly codeRepository: CodeRepository,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** Создаёт таблицу кодов задания и таблицу-метку `<table>_task` */
  async initializeTables(): Promise<void> {
    const tableName = this.globalMonVar.tableName;

    await createTableIfNotExists(this.entityManager, tableName);
    await createTaskTable(
      this.entityManager,
      tableName,
      this.globalMonVar.taskName,
    );

    this.logger.info(`Код: Таблица ${tableName} создана`);
  }

  async checkTableExists(tableName: string): Promise<void> {
    if (!(await this.codeRepository.tableExists(tableName))) {
      throw new Error(`Таблица "${tableName}" не существует`);
    }
  }

  /** Служебная таблица с датой последней очистки старых таблиц */
  async createCleanupMetadataTable(): Promise<void> {
    try {
      await this.entityManager.query(`
        CREATE TABLE IF NOT EXISTS table_cleanup_metadata (
          id SERIAL PRIMARY KEY,
          last_cleanup_date DATE NOT NULL
        );
      `);

      const existing = await this.entityManager.query(`
        SELECT 1 FROM table_cleanup_metadata LIMIT 1
      `);

      if (existing.length === 0) {
        // дата в прошлом, чтобы первая очистка точно выполнилась
        await this.entityManager.query(`
          INSERT INTO table_cleanup_metadata (last_cleanup_date)
          VALUES (CURRENT_DATE - INTERVAL '31 day')
        `);
      }
    } catch (err) {
      this.logger.error('Ошибка при создании таблицы метаданных очистки', err);
      throw err;
    }
  }

  /** Запускает очистку не чаще одного раза в сутки */
  async deleteOldTablesIfNeeded(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const lastCleanup = await this.entityManager.query(`
        SELECT last_cleanup_date FROM table_cleanup_metadata LIMIT 1
      `);

      const lastCleanupDate = lastCleanup[0]?.last_cleanup_date
        ?.toISOString()
        ?.split('T')[0];

      if (lastCleanupDate === today) {
        this.logger.info('Очистка таблиц уже выполнялась сегодня');
        return;
      }

      await this.deleteTablesOlderThan();

      await this.entityManager.query(`
        UPDATE table_cleanup_metadata SET last_cleanup_date = CURRENT_DATE
      `);

      this.logger.info('Очистка таблиц выполнена успешно');
    } catch (err) {
      this.logger.error('Ошибка при проверке необходимости очистки таблиц', err);
      throw err;
    }
  }

  /**
   * Удаляет таблицы, в имени которых есть дата старше tableRetentionDays.
   * Имена вида `<задание>-2024_01_01_10_00_00`.
   */
  async deleteTablesOlderThan(): Promise<void> {
    this.logger.info(
      `Поиск таблиц старше ${tableRetentionDays} дней`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - tableRetentionDays);

    let deletedCount = 0;
    let errorCount = 0;

    try {
      const tables: { table_name: string }[] = await this.entityManager.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name ~ '^\\d'
      `);

      for (const table of tables) {
        const tableName = table.table_name;

        try {
          const dateMatch = tableName.match(/(\d{4})_(\d{2})_(\d{2})/);
          if (!dateMatch) continue;

          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const day = parseInt(dateMatch[3], 10);

          if (year < 2000 || year > new Date().getFullYear()) continue;

          const tableDate = new Date(year, month, day);
          if (isNaN(tableDate.getTime())) continue;

          if (tableDate < cutoffDate) {
            await this.entityManager.query(
              `DROP TABLE IF EXISTS "${tableName}" CASCADE`,
            );
            deletedCount++;
            // пауза, чтобы не нагружать базу серией DROP
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (err) {
          errorCount++;
          this.logger.error(`Ошибка обработки таблицы ${tableName}`, err);
        }
      }

      this.logger.info(
        `Удаление завершено. Удалено таблиц: ${deletedCount}, ошибок: ${errorCount}`,
      );
    } catch (err) {
      this.logger.error('Ошибка в основном цикле удаления таблиц', err);
      throw err;
    }
  }
}
