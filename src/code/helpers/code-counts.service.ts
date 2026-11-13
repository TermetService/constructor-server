import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { AppGateway } from 'src/app.gateway';
import { IAllCounts, IMonitoringVariables } from 'src/globalTypes';
import { getLastLogMessages } from 'src/logger-winston/winston.config';
import { CodeRepository } from '../code.repository';
import { IBox, IPallet } from '../types';
import { CodeTablesService } from './code-tables.service';

/**
 * Счётчики задания: чтение из in-memory состояния, отправка на фронт,
 * синхронизация с базой и сводка по таблице.
 */
@Injectable()
export class CodeCountsService {
  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly appGateway: AppGateway,
    private readonly tables: CodeTablesService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  getTableName(): string {
    return this.globalMonVar.tableName;
  }

  getCurrentCounts(): IAllCounts {
    return {
      productCount: this.globalMonVar.productCount,
      productsInCurrentBox: this.globalMonVar.productsInCurrentBox,
      boxesInCurrentPallet: this.globalMonVar.boxesInCurrentPallet,
      boxCount: this.globalMonVar.boxCount,
      palletCount: this.globalMonVar.palletCount,
      currentBoxNumber: this.globalMonVar.currentBoxNumber,
      currentPalletNumber: this.globalMonVar.currentPalletNumber,
    };
  }

  async sendCurrentStateToFrontend(allCounts: IAllCounts): Promise<void> {
    this.appGateway.sendProductCount(allCounts);
    this.appGateway.sendLogData(getLastLogMessages());
  }

  sendDataToFrontend(allCounts: IAllCounts): void {
    this.appGateway.sendProductCount(allCounts);
    this.appGateway.sendLogData(getLastLogMessages());
  }

  /** Пересчитывает счётчики из базы и отправляет их на фронт */
  async sendDBDataToFrontend(): Promise<void> {
    const startedAt = performance.now();

    try {
      await this.tables.checkTableExists(this.globalMonVar.tableName);

      const counts = await this.codeRepository.getDatabaseCounts(
        this.globalMonVar.tableName,
        this.globalMonVar.currentBoxNumber,
        this.globalMonVar.currentPalletNumber,
      );

      const allCounts: IAllCounts = {
        productCount: counts.productCount,
        productsInCurrentBox: counts.productsInCurrentBox,
        boxesInCurrentPallet: counts.boxesInCurrentPallet,
        boxCount: counts.boxCount,
        palletCount: counts.palletCount,
        currentBoxNumber: this.globalMonVar.currentBoxNumber,
        currentPalletNumber: this.globalMonVar.currentPalletNumber,
      };

      this.sendDataToFrontend(allCounts);
      await this.updateGlobalVariablesFromCounts(allCounts);

      const elapsed = Math.round(performance.now() - startedAt);
      this.logger.info(`Код: sendDBDataToFrontend выполнен за ${elapsed} мс`);
    } catch (err) {
      this.logger.error('Ошибка в sendDBDataToFrontend', err);
    }
  }

  /** Обновляет только те поля глобального состояния, которые пришли */
  async updateGlobalVariablesFromCounts(
    allCounts: Partial<IAllCounts>,
  ): Promise<void> {
    const fields: (keyof IAllCounts)[] = [
      'productCount',
      'productsInCurrentBox',
      'boxesInCurrentPallet',
      'boxCount',
      'palletCount',
      'currentBoxNumber',
      'currentPalletNumber',
    ];

    for (const field of fields) {
      if (allCounts[field] !== undefined) {
        (this.globalMonVar as any)[field] = allCounts[field];
      }
    }
  }

  /** Последняя коробка и паллета в таблице + перенос их в глобальное состояние */
  async getLastBoxAndPalletInfo(): Promise<{
    lastBoxNumber: number;
    lastPalletNumber: number;
    productsInLastBox: number;
    boxesInLastPallet: number;
  }> {
    const info = await this.codeRepository.getLastBoxAndPalletInfo(
      this.globalMonVar.tableName,
    );

    this.globalMonVar.currentBoxNumber = info.lastBoxNumber;
    this.globalMonVar.currentPalletNumber = info.lastPalletNumber;
    this.globalMonVar.productsInCurrentBox = info.productsInLastBox;
    this.globalMonVar.boxesInCurrentPallet = info.boxesInLastPallet;
    this.globalMonVar.productCount = info.allProductsCount;
    this.globalMonVar.boxCount = info.countBox;
    this.globalMonVar.palletCount = info.countPallet;
    this.logger.info(
      `Код: последняя коробка ${info.lastBoxNumber} (${info.productsInLastBox} кодов), последняя паллета ${info.lastPalletNumber} (${info.boxesInLastPallet} коробок)`,
    );

    const allCounts: IAllCounts = {
      productCount: info.allProductsCount,
      productsInCurrentBox: info.productsInLastBox,
      boxesInCurrentPallet: info.boxesInLastPallet,
      boxCount: info.countBox,
      palletCount: info.countPallet,
      currentBoxNumber: this.globalMonVar.currentBoxNumber,
      currentPalletNumber: this.globalMonVar.currentPalletNumber,
    };

    this.sendDataToFrontend(allCounts);
    return info;
  }

  /** Сводка по таблице задания: сколько всего, коробок, паллет и что последнее */
  async getSummary(): Promise<{
    productCount: number;
    boxCount: number;
    palletCount: number;
    lastBox: number | null;
    lastPallet: number | null;
    productsInLastBox: number;
    boxesInLastPallet: number;
  }> {
    const records = await this.codeRepository.getAllRecords(
      this.globalMonVar.tableName,
    );

    const boxesMap: Record<string, IBox> = {};
    const palletsMap: Record<string, IPallet> = {};

    for (const record of records) {
      const { code, box_number, pallet_number } = record;

      boxesMap[box_number] ??= { name: box_number, products: [] };
      boxesMap[box_number].products.push(code);

      palletsMap[pallet_number] ??= { name: pallet_number, boxes: [] };
      if (!palletsMap[pallet_number].boxes.includes(box_number)) {
        palletsMap[pallet_number].boxes.push(box_number);
      }
    }

    const boxes = Object.values(boxesMap).sort(
      (a, b) => Number(a.name) - Number(b.name),
    );
    const pallets = Object.values(palletsMap).sort(
      (a, b) => Number(a.name) - Number(b.name),
    );

    const lastBox = boxes.at(-1);
    const lastPallet = pallets.at(-1);

    return {
      productCount: records.length,
      boxCount: boxes.length,
      palletCount: pallets.length,
      lastBox: lastBox ? (lastBox.name as unknown as number) : null,
      lastPallet: lastPallet ? (lastPallet.name as unknown as number) : null,
      productsInLastBox: lastBox ? lastBox.products.length : 0,
      boxesInLastPallet: lastPallet ? lastPallet.boxes.length : 0,
    };
  }
}
