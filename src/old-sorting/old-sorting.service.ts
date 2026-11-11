import { Inject, Injectable } from '@nestjs/common';
import { IBoxResponse, IPalletResponse } from 'src/code/types';
import { oldSortingLogger } from 'src/logger-winston/winston.config';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import { OldSortingFilesService } from './old-sorting-files.service';
import { IMonitoringVariables } from 'src/globalTypes';
import { getItemsCountInPallet } from 'src/monitoring/helper';

@Injectable()
export class OldSortingService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly oldSortingFilesService: OldSortingFilesService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = oldSortingLogger,
  ) {}

  private nameDB = '';
  private isOldLabel = false;

  setNameDB(name: string) {
    this.nameDB = name;
    // this.oldSortingFilesService.updateNameDB(name);
  }

  async startLabel(fileName: string): Promise<any> {
    this.logger.info('История: Старт раздела печати этикеток');
    // console.log(fileName);

    this.isOldLabel = true;
    const task = await this.oldSortingFilesService.readTaskFile(fileName);
    if (task) {
      // console.log('task__________task', task);
      this.globalMonVar.task = task;
    }
    this.setNameDB(task.db);
    return { isOldLabel: this.isOldLabel };
  }

  async stopLabel(): Promise<any> {
    this.logger.info('История: Окончание раздела печати этикеток');
    this.isOldLabel = false;
    this.globalMonVar.task = null;
    this.setNameDB('');
    return { isOldLabel: this.isOldLabel };
  }

  async tableExists(nameDB: string): Promise<boolean> {
    this.logger.info(`Код: Проверка существования таблицы ${nameDB}`);
    const query = `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`;
    const res = await this.entityManager.query(query, [nameDB]);
    this.logger.info(
      res[0].exists
        ? `История: Таблица ${nameDB} существует`
        : `Код: Таблица ${nameDB} не существует`,
    );
    return res[0].exists;
  }

  private async checkTableExists(nameDB: string): Promise<void> {
    if (!(await this.tableExists(nameDB))) {
      throw new Error(`Таблица "${nameDB}" не существует`);
    }
  }

  async getAllBoxes(
    page: number,
    limit: number,
  ): Promise<{ data: IBoxResponse; total: number } | any> {
    this.logger.info('История: Получение всех коробов');

    await this.checkTableExists(this.nameDB);

    const offset = (page - 1) * limit;
    const res = await this.entityManager.query(
      `SELECT box_number, COUNT(code) as code_count FROM "${this.nameDB}" GROUP BY box_number ORDER BY box_number LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const total = await this.entityManager.query(
      `SELECT COUNT(DISTINCT box_number) FROM "${this.nameDB}"`,
    );
    this.logger.info(`История: Все короба получены: ${JSON.stringify(res)}`);
    return { data: res, total: parseInt(total[0].count, 10) };
  }

  async getAllPallets(
    page: number,
    limit: number,
  ): Promise<{ data: IPalletResponse; total: number } | any> {
    this.logger.info('История: Получение всех паллет');

    await this.checkTableExists(this.nameDB);

    const offset = (page - 1) * limit;
    const res = await this.entityManager.query(
      `SELECT pallet_number, COUNT(DISTINCT box_number) as box_count
        FROM "${this.nameDB}"
        WHERE pallet_number IS NOT NULL
        GROUP BY pallet_number
        ORDER BY pallet_number
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const total = await this.entityManager.query(
      `SELECT COUNT(DISTINCT pallet_number)
        FROM "${this.nameDB}"
        WHERE pallet_number IS NOT NULL`,
    );

    this.logger.info(`История: Все паллеты получены: ${JSON.stringify(res)}`);
    return { data: res, total: parseInt(total[0].count, 10) };
  }

  async getProductCountInPallet(palletNumber: number): Promise<number> {
    await this.checkTableExists(this.nameDB);
    const count = await getItemsCountInPallet(
      this.entityManager,
      this.nameDB,
      palletNumber,
    );

    return count;
  }
}
