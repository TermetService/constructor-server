import { Inject, Injectable, Optional } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';
import { CodeRepository } from '../code.repository';
import { SearchStatus } from '../types';

/**
 * Адаптер к «удалённой» базе (MSSQL/1С-сервис), откуда берётся вес.
 * В проекте такого сервиса нет, поэтому он передаётся снаружи.
 * Если адаптер не передан — методы веса из удалённой БД возвращают null.
 */
export interface IRemoteDbAdapter {
  findOne(
    query: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  executeQuery(query: string): Promise<unknown>;
  getRemoteWeightColumnName(): string;
  getRemoteTableName(): string;
  getRemoteCodeColumnName(): string;
}

export interface IWeightResponse {
  success: boolean;
  status: SearchStatus;
  message: string;
  data: { weight: number; unit: string } | null;
  error?: string | null;
}

/**
 * Вес текущей коробки/паллеты/фасовки из таблицы задания
 * и вес кода из удалённой БД.
 */
@Injectable()
export class CodeWeightsService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly codeRepository: CodeRepository,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
    @Optional()
    @Inject('REMOTE_DB_ADAPTER')
    private readonly remoteDb?: IRemoteDbAdapter,
  ) {}

  async getWeightOfCurrentBox(): Promise<IWeightResponse> {
    return this.sumWeight(
      'WHERE box_label IS NULL AND pallet_label IS NULL',
      'Вес коробки получен',
      'Ошибка при получении веса коробки',
    );
  }

  async getWeightOfCurrentPallet(): Promise<IWeightResponse> {
    return this.sumWeight(
      'WHERE pallet_label IS NULL AND box_label IS NOT NULL',
      'Вес паллеты получен',
      'Ошибка при получении веса паллеты',
    );
  }

  async getCommonWeightOfCurrentPacking(): Promise<IWeightResponse> {
    return this.sumWeight(
      '',
      'Вес фасовки получен',
      'Ошибка при получении веса фасовки',
    );
  }

  /**
   * Вес кода из удалённой БД.
   *
   * Код ищется по части после разделителя (по умолчанию 93, для длинных — 92),
   * режим задаётся CODE_SEARCH_MODE (21/91/92/93).
   */
  async getWeightFromRemoteDb(code: string): Promise<string | null> {
    if (!this.remoteDb) {
      this.logger.warn(
        'Вес из удалённой БД недоступен: адаптер не подключён (IRemoteDbAdapter)',
      );
      return null;
    }

    try {
      const column = this.remoteDb.getRemoteWeightColumnName();
      const table = this.remoteDb.getRemoteTableName();
      const codeColumn = this.remoteDb.getRemoteCodeColumnName();

      const isSafeName = (name: string) =>
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);

      if (!isSafeName(table) || !isSafeName(column) || !isSafeName(codeColumn)) {
        this.logger.error('Некорректное имя таблицы или колонки удалённой БД');
        return null;
      }

      const GS = '\x1D';
      const searchMode = process.env.CODE_SEARCH_MODE || '93';

      const extractAfterDivider = (
        source: string,
        divider: string,
      ): string | null => {
        const pos = source.lastIndexOf(divider);
        if (pos === -1) return null;

        let value = source.substring(pos + divider.length);
        const gsPos = value.indexOf(GS);
        if (gsPos !== -1) value = value.substring(0, gsPos);

        return value;
      };

      let searchCode: string;

      if (searchMode === '21') {
        const extracted = extractAfterDivider(code, '21');
        if (extracted === null) {
          this.logger.warn(`Разделитель 21 не найден в коде ${code}`);
          return null;
        }
        searchCode = extracted;
      } else if (['91', '92', '93'].includes(searchMode)) {
        searchCode = extractAfterDivider(code, searchMode) ?? code;
      } else {
        const divider = code.length > 60 ? '92' : '93';
        searchCode = extractAfterDivider(code, divider) ?? code;
      }

      this.logger.info(`Код для поиска веса: ${searchCode}`);

      const query = `SELECT [${column}] FROM [${table}] WHERE [${codeColumn}] LIKE @code`;
      const result = await this.remoteDb.findOne(query, {
        code: `${searchCode}%`,
      });

      const usingOwnDb = process.env.IS_USING_OWN_DB === 'true';
      if (!result && usingOwnDb) return '1.41';

      if (result && result[column] !== undefined) {
        return result[column];
      }

      this.logger.warn(`Вес не найден для кода ${code} в удалённой БД`);
      return null;
    } catch (error) {
      this.logger.error(
        `Ошибка при получении веса для кода ${code} из удалённой БД: ${error.message}`,
      );
      return null;
    }
  }

  async checkRemoteDatabaseConnection(): Promise<void> {
    if (!this.remoteDb) {
      throw new Error(
        'Нет подключения к удалённой базе данных: адаптер не подключён',
      );
    }

    try {
      await this.remoteDb.executeQuery('SELECT 1');
      this.logger.info('Тестовое подключение к удалённой БД успешно');
    } catch (error) {
      this.logger.error('Ошибка подключения к удалённой БД', error);
      throw new Error(
        'Нет подключения к удалённой базе данных. Попробуйте ещё раз.',
      );
    }
  }

  private async sumWeight(
    whereClause: string,
    successMessage: string,
    errorMessage: string,
  ): Promise<IWeightResponse> {
    const tableName = this.globalMonVar.tableName;

    if (!tableName) {
      return {
        success: false,
        status: SearchStatus.ERROR,
        message: 'Таблица не найдена',
        data: null,
      };
    }

    if (!(await this.codeRepository.tableExists(tableName))) {
      return {
        success: false,
        status: SearchStatus.ERROR,
        message: 'Таблица не создана',
        data: null,
      };
    }

    try {
      const result = await this.entityManager.query(
        `SELECT SUM(CAST(weight AS DECIMAL)) AS total_weight FROM "${tableName}" ${whereClause}`,
      );
      const totalWeight = Number(result[0]?.total_weight) || 0;

      return {
        success: true,
        status: SearchStatus.SUCCESS,
        message: successMessage,
        data: { weight: totalWeight, unit: 'kg' },
      };
    } catch (error) {
      this.logger.error(errorMessage, error);
      return {
        success: false,
        status: SearchStatus.ERROR,
        message: errorMessage,
        data: null,
        error: error.message,
      };
    }
  }
}
