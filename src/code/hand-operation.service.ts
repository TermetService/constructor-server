import { Inject, Injectable } from '@nestjs/common';
import { CodeHelperService } from './code-helper.service';
import { Logger } from 'winston';
import {
  codeLogger,
  getLastLogMessages,
} from 'src/logger-winston/winston.config';
import { CodeRepository } from './code.repository';
import { IMonitoringVariables, MonitoringStatusActions } from 'src/globalTypes';
import { CodeService } from './code.service';
import { CodeValidationReason } from 'src/monitoring/helper';
import { AppGateway } from 'src/app.gateway';

@Injectable()
export class HandOperation {
  constructor(
    private readonly codeHelperService: CodeHelperService,
    private readonly codeRepository: CodeRepository,
    private readonly codeService: CodeService,
    private readonly appGateway: AppGateway,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  async addCodeToBox(
    code: string,
    boxNumber: number,
    palletNumber: number,
  ): Promise<any> {
    this.logger.info(`Код: Добавление кода ${code} в короб ${boxNumber}`);
    const startT = performance.now();

    await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

    const validation = await this.codeService.validateCode(code);

    if (!validation.isValid) {
      if (validation.reason === CodeValidationReason.Duplicate) {
        this.codeHelperService.handleValidationError(
          validation.message,
          MonitoringStatusActions.Reject,
        );
        this.appGateway.sendLogData(getLastLogMessages());
        return { message: 'Код уже существует' };
      }

      this.globalMonVar.codeStatus = MonitoringStatusActions.Reject;
      this.logger.warn(`Код: ${validation.message}`);
      console.warn(`Код: ${validation.message}`);
      this.appGateway.sendLogData(getLastLogMessages());
      return { message: 'Невалидный код' };
    }

    // Проверка лимита продуктов в коробке
    const productCountInBox = await this.codeRepository.getProductCountInBox(
      this.globalMonVar.tableName,
      boxNumber,
    );

    if (productCountInBox === 0) {
      return { message: `Короб #${boxNumber} не найден в базе` };
    }

    if (productCountInBox >= this.globalMonVar.limitProductInBox) {
      return { message: 'Достигнут лимит коробки' };
    }

    try {
      const result = await this.codeRepository.addCodeToTables(
        this.globalMonVar.tableName,
        code,
        boxNumber,
        palletNumber,
      );

      if (!result) {
        return { message: 'Код не был добавлен' };
      }

      // Обновляем глобальные переменные
      this.globalMonVar.productCount++;
      if (boxNumber === this.globalMonVar.currentBoxNumber) {
        this.globalMonVar.productsInCurrentBox++;
      }

      this.logger.info(`Код: Код ${code} добавлен в короб ${boxNumber}`);
      const endT = performance.now();
      const delta = endT - startT;
      console.log('delta ------------ addCodeToBox', delta);
      await this.codeHelperService.sendDBDataToFrontend();

      return result;
    } catch (err) {
      this.logger.error('Код: Ошибка при добавлении кода в короб', err);
      throw err;
    }
  }

  async deleteBox(boxNumber: number): Promise<void> {
    this.logger.info(`Код: Удаление короба: ${boxNumber}`);
    const startT = performance.now();

    await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

    try {
      // Получаем все коды из коробки
      const codes = await this.codeRepository.getCodesByBoxNumber(
        this.globalMonVar.tableName,
        boxNumber,
      );

      // Удаляем коробку и коды из обеих таблиц
      await this.codeRepository.deleteBoxFromTables(
        this.globalMonVar.tableName,
        boxNumber,
        codes,
      );

      this.logger.info(`Код: Короб ${boxNumber} и все коды в нем удалены`);

      // Обновляем глобальные переменные
      if (+boxNumber === +this.globalMonVar.currentBoxNumber) {
        this.globalMonVar.boxCount--;
        this.globalMonVar.productCount -=
          this.globalMonVar.productsInCurrentBox;
        this.globalMonVar.productsInCurrentBox = 0;
      } else {
        this.globalMonVar.boxCount--;
        this.globalMonVar.productCount -= this.globalMonVar.limitProductInBox;
      }

      const endT = performance.now();
      const delta = endT - startT;
      console.log('delta ------------ deleteBox', delta);

      await this.codeHelperService.sendDBDataToFrontend();
    } catch (err) {
      this.logger.error('Код: Ошибка при удалении короба', err);
      throw err;
    }
  }

  async removeBoxFromPallet(boxNumber: number): Promise<void> {
    this.logger.info(`Код: Изъятие короба ${boxNumber} из паллеты`);

    await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

    try {
      // Извлекаем коробку из паллеты
      await this.codeRepository.removeBoxFromPalletInTable(
        this.globalMonVar.tableName,
        boxNumber,
      );

      this.logger.info(`Код: Короб ${boxNumber} изъят из паллеты`);

      // Обновляем глобальные переменные
      this.globalMonVar.boxesInCurrentPallet--;

      // Если удаляемая коробка была последней в паллете, обновляем переменные паллет
      if (this.globalMonVar.boxesInCurrentPallet === 0) {
        this.globalMonVar.palletCount--;
        this.globalMonVar.currentPalletNumber--;
        this.globalMonVar.boxesInCurrentPallet =
          this.globalMonVar.limitBoxInPallet;
      }

      await this.codeHelperService.sendDBDataToFrontend();
    } catch (err) {
      this.logger.error('Код: Ошибка при изъятии короба из паллеты', err);
      throw err;
    }
  }

  async deletePallet(palletNumber: number): Promise<void> {
    this.logger.info(`Код: Удаление паллеты: ${palletNumber}`);
    const startT = performance.now();

    await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

    try {
      // Получаем все коды из паллеты
      const codes = await this.codeRepository.getCodesByPalletNumber(
        this.globalMonVar.tableName,
        palletNumber,
      );

      // Удаляем паллету и коды из обеих таблиц
      await this.codeRepository.deletePalletFromTables(
        this.globalMonVar.tableName,
        palletNumber,
        codes,
      );

      this.logger.info(
        `Код: Паллета ${palletNumber} и все короба и коды в ней удалены`,
      );

      // Обновляем глобальные переменные
      if (+palletNumber === +this.globalMonVar.currentPalletNumber) {
        const productInLastPallet =
          this.globalMonVar.limitProductInBox *
            (this.globalMonVar.boxesInCurrentPallet - 1) +
          this.globalMonVar.productsInCurrentBox;
        this.globalMonVar.palletCount--;
        this.globalMonVar.boxCount -= this.globalMonVar.boxesInCurrentPallet;
        this.globalMonVar.productCount -= productInLastPallet;
        this.globalMonVar.productsInCurrentBox =
          this.globalMonVar.productCount || 1;
        this.globalMonVar.boxesInCurrentPallet =
          this.globalMonVar.productCount || 1;
      } else {
        this.globalMonVar.palletCount--;
        this.globalMonVar.boxCount -= this.globalMonVar.limitBoxInPallet;
        this.globalMonVar.productCount -=
          this.globalMonVar.limitBoxInPallet *
          this.globalMonVar.limitProductInBox;
      }

      await this.codeHelperService.sendDBDataToFrontend();

      const endT = performance.now();
      const delta = endT - startT;
      console.log('delta ------------ deletePallet', delta);
    } catch (err) {
      this.logger.error('Код: Ошибка при удалении паллеты', err);
      throw err;
    }
  }

  async moveBoxToPallet(
    boxNumber: number,
    newPalletNumber: number,
  ): Promise<void> {
    const startT = performance.now();
    this.logger.info(
      `Код: Перемещение коробки ${boxNumber} на паллету ${newPalletNumber}`,
    );

    // Проверяем, существует ли таблица
    await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

    // Обновляем записи в базе данных для всех кодов в указанной коробке
    await this.codeRepository.moveBoxToPalletInTable(
      this.globalMonVar.tableName,
      boxNumber,
      newPalletNumber,
    );

    const endT = performance.now();
    const delta = endT - startT;
    console.log('delta ------------ moveBoxToPallet', delta);

    this.logger.info(
      `Код: Коробка ${boxNumber} успешно перемещена на паллету ${newPalletNumber}`,
    );
  }
}
