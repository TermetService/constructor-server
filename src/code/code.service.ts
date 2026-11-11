import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CodeValidationReason,
  ICodeValidationResult,
  isValidCode,
} from 'src/monitoring/helper';
import {
  EventTypes,
  IAllCounts,
  IMonitoringVariables,
  MonitoringStatusActions,
  RootStatus,
} from 'src/globalTypes';
import { Logger } from 'winston';
import {
  codeLogger,
  getLastLogMessages,
  getLogMessages,
} from 'src/logger-winston/winston.config';
import { AppGateway } from 'src/app.gateway';
import { CodeHelperService } from './code-helper.service';
import { CodeRepository } from './code.repository';
import { NumberBoxETEService } from 'src/NumberBoxETE/numberBoxETE.service';

type cameraData = {
  currectProductInBox: number;
  currectBoxInPallet: number;
  UsedBoxNumber: number;
  UsedPalletNumber: number;
  WeightBox: number;
  WeightPallet: number;
};

const flagInpallet = true; //флаг кторый будет отвечать за фасуем в общую паллету или в разные true - в разные

@Injectable()
export class CodeService {
  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
    private readonly appGateway: AppGateway,
    private readonly codeHelperService: CodeHelperService,
    private readonly numberBoxETEService: NumberBoxETEService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {
    // this.initializeCleanupSystem();
  }

  private isDatabaseInitialized = false;

  private saveQueue: Promise<any> = Promise.resolve();

  private cameraStates = {} as Record<string, cameraData>;

  private lastUsedBoxNumber;

  private lastUsedPalletNumber;

  private countBox;

  private currectBoxInPalletGlobal;
  private WeightInPalletGlobal;

  getLastUsedBoxNumber(): number | null {
    return this.lastUsedBoxNumber;
  }

  // сеттер — с валидацией
  setLastUsedBoxNumber(value: number): void {
    if (value < 0) {
      throw new Error('Box number must be non-negative');
    }
    this.lastUsedBoxNumber = value;
  }

  private enqueueSave<T>(task: () => Promise<T>): Promise<T> {
    const run = this.saveQueue.then(task, task);
    this.saveQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async UpdateStateCamera(name, weigth) {
    this.globalMonVar.productCount++;
    this.globalMonVar.productsInCurrentBox++;
    this.cameraStates[name].currectProductInBox++;
    this.cameraStates[name].WeightBox += +weigth;
    if (
      this.cameraStates[name].currectProductInBox >
      this.globalMonVar.limitProductInBox
    ) {
      if (flagInpallet) {
        this.cameraStates[name].WeightPallet +=
          +this.cameraStates[name].WeightBox;
      }
      this.cameraStates[name].WeightBox = +weigth;

      this.lastUsedBoxNumber++;

      this.cameraStates[name].currectProductInBox = 1;

      const boxNum = this.lastUsedBoxNumber;

      this.globalMonVar.boxCount++;

      this.cameraStates[name].UsedBoxNumber = boxNum;

      if (flagInpallet) this.cameraStates[name].currectBoxInPallet++;
      else {
        this.currectBoxInPalletGlobal++;
      }
      await this.numberBoxETEService.UpdateBoxNumber(
        this.globalMonVar.task.gtin,
        boxNum,
        this.globalMonVar.task.date_manufacture,
      );
    }
    if (
      this.cameraStates[name].currectBoxInPallet === this.countBox + 1 &&
      flagInpallet
    ) {
      this.cameraStates[name].UsedPalletNumber++;
      this.cameraStates[name].currectBoxInPallet = 1;
    }
  }

  async closeBox(name) {
    if (
      this.cameraStates[name].currectProductInBox ===
      this.globalMonVar.limitProductInBox
    ) {
      await this.codeHelperService.closeAutoBoxAndPrint(
        this.cameraStates[name].UsedBoxNumber,
        this.globalMonVar.limitProductInBox,
        name,
      );
    }
  }

  async initCamera(name) {
    let cameraState = this.cameraStates[name];
    console.log(!cameraState, '3256587', this.cameraStates[name]);

    if (!cameraState) {
      const b = ++this.lastUsedBoxNumber;
      let p;
      if (flagInpallet) p = ++this.lastUsedPalletNumber;
      else p = this.lastUsedPalletNumber;
      this.cameraStates[name] = {
        currectProductInBox: 0,
        UsedBoxNumber: b,
        UsedPalletNumber: p,
        WeightBox: 0,
        WeightPallet: 0,
        currectBoxInPallet: 0,
      };

      await this.numberBoxETEService.UpdateBoxNumber(
        this.globalMonVar.task.gtin,
        b,
        this.globalMonVar.task.date_manufacture,
      );
    }
  }

  async validateAndSaveCode(code: string, name: string): Promise<IAllCounts> {
    this.logger.info(`Код: Валидация и сохранение кода: ${code}`);
    const codeStatusUpdateTime = Date.now();
    const timeDifference = codeStatusUpdateTime - this.globalMonVar.konturTime;
    this.logger.info(
      `Код: Время, прошедшее с момента изменения контура до начала валидации: ${timeDifference} мс`,
    );

    try {
      // Проверки и запись идут в одной очереди: проверка дубликата должна быть
      // атомарна относительно вставки, иначе два скана пройдут её одновременно.
      return await this.enqueueSave(async () => {
        const validation = await this.validateCode(code);

        if (!validation.isValid) {
          this.codeHelperService.handleValidationError(
            validation.message,
            MonitoringStatusActions.Reject,
          );
          return;
        }

        if (this.globalMonVar.productCount === 0) {
          await this.codeHelperService.initializeTables();
          this.isDatabaseInitialized = true;
        }

        await this.saveCodeAndUpdateState(code);
        const codeStatusUpdateTime2 = Date.now();
        const timeDifference2 =
          codeStatusUpdateTime2 - this.globalMonVar.konturTime;
        this.logger.info(
          `Код: Время, прошедшее с момента изменения контура до начала валидации 2: ${timeDifference2} мс`,
        );
        return this.codeHelperService.getCurrentCounts();
      });
    } catch (err) {
      this.logger.error(`Код: Ошибка при сохранении кода: ${err.message}`);
      throw err;
    }
  }

  /** Все проверки кода собраны в isValidCode, здесь только передаём зависимости */
  private validateCode(code: string): Promise<ICodeValidationResult> {
    return isValidCode(code, this.globalMonVar.task, this.logger, {
      isDuplicate: (candidate) =>
        this.codeRepository.isDuplicateCode(candidate),
      isCodeTask: (codes, code) =>
        this.codeHelperService.isCodeTask(codes, code),
    });
  }

  private async saveCodeAndUpdateState(code: string): Promise<void> {
    const saved = await this.codeHelperService.saveCodeAndAdvanceState(code);

    if (!saved) {
      this.codeHelperService.handleValidationError(
        `Найден дубликат кода ${code}`,
        MonitoringStatusActions.Reject,
      );
      return;
    }

    this.codeHelperService.updateCodeStatus();
    this.eventEmitter.emit(EventTypes.CodeStatusUpdated);
    this.logger.info(`Код: Статус кода обновлен для кода: ${code}`);

    const counts = this.codeHelperService.getCurrentCounts();
    this.codeHelperService.sendCurrentStateToFrontend(counts);
    this.appGateway.sendRootMessage({
      status: RootStatus.Success,
      message: 'Код сохранен',
    });
  }

  // async handValidateAndSaveCode(code: string): Promise<any> {
  //   this.logger.info(`Код ручной: Валидация и сохранение кода: ${code}`);

  //   try {
  //     return await this.enqueueSave(async () => {
  //       const validation = await this.validateCode(code);

  //       if (!validation.isValid) {
  //         this.logger.warn(`Код ручной: ${validation.message}`);
  //         this.codeHelperService.sendDBDataToFrontend();
  //         return { isAddCode: false };
  //       }

  //       if (this.globalMonVar.productCount === 0) {
  //         await this.codeHelperService.initializeTables();
  //         this.isDatabaseInitialized = true;
  //       }

  //       const saved =
  //         await this.codeHelperService.saveCodeAndAdvanceState(code);

  //       if (!saved) {
  //         this.logger.warn(`Код ручной: Код ${code} уже существует`);
  //         this.codeHelperService.sendDBDataToFrontend();
  //         return { isAddCode: false };
  //       }

  //       this.logger.info(`Код ручной: Код ${code} сохранен`);

  //       this.codeHelperService.sendDBDataToFrontend();
  //       return {
  //         isAddCode: true,
  //         boxNumber: this.globalMonVar.currentBoxNumber,
  //         palletNumber: this.globalMonVar.currentPalletNumber,
  //         productsInBox: this.globalMonVar.productsInCurrentBox,
  //         limitProductsInBox: this.globalMonVar.limitProductInBox,
  //       };
  //     });
  //   } catch (err) {
  //     this.logger.error(
  //       `Код ручной: Ошибка при сохранении кода: ${err.message}`,
  //     );
  //     throw err;
  //   }
  // }

  async deleteCodes(
    codes: { code: string; boxNumber: number }[],
  ): Promise<IAllCounts> {
    const startT = performance.now();

    if (!codes?.length) {
      this.logger.info('Код: Пустой массив кодов для удаления - пропускаем');
      return this.codeHelperService.getCurrentCounts();
    }

    const { boxNumber } = codes[0];
    const codeStrings = codes.map((c) => c.code);

    this.logger.info(
      `Код: Удаление ${codes.length} кодов из коробки ${boxNumber}`,
    );

    await this.codeRepository.deleteCodesFromTables(
      this.globalMonVar.tableName,
      codeStrings,
    );

    this.logger.info(
      `Код: Успешно удалено ${codeStrings.length} кодов из обеих таблиц`,
    );

    const deletedCount = codes.length;
    this.globalMonVar.productCount = Math.max(
      0,
      this.globalMonVar.productCount - deletedCount,
    );

    if (boxNumber === this.globalMonVar.currentBoxNumber) {
      this.globalMonVar.productsInCurrentBox = Math.max(
        0,
        this.globalMonVar.productsInCurrentBox - deletedCount,
      );

      if (this.globalMonVar.productsInCurrentBox === 0) {
        this.globalMonVar.boxCount = Math.max(
          0,
          this.globalMonVar.boxCount - 1,
        );
        this.globalMonVar.boxesInCurrentPallet = Math.max(
          0,
          this.globalMonVar.boxesInCurrentPallet - 1,
        );

        if (this.globalMonVar.boxesInCurrentPallet === 0) {
          this.globalMonVar.palletCount = Math.max(
            0,
            this.globalMonVar.palletCount - 1,
          );
        }
      }
    }

    await this.codeHelperService.sendDBDataToFrontend();
    const endT = performance.now();
    const delta = endT - startT;
    console.log('delta ------------ deleteCodes', delta);

    return this.codeHelperService.getCurrentCounts();
  }

  async deleteTablesStartingWithNumber(): Promise<void> {
    this.logger.info('Код: Получение всех таблиц в базе данных');
    try {
      const tables = await this.entityManager.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
        `);

      this.logger.info('Код: Таблицы в базе данных:', tables);

      for (const table of tables) {
        const tableName = table.table_name;
        if (/^\d/.test(tableName)) {
          this.logger.info(`Код: Удаление таблицы: ${tableName}`);
          await this.entityManager.query(`DROP TABLE IF EXISTS "${tableName}"`);
          this.logger.info(`Код: Таблица ${tableName} удалена`);
        }
      }
    } catch (err) {
      this.logger.error('Код: Ошибка при удалении таблиц', err);
      throw err;
    }
  }

  private async initializeCleanupSystem(): Promise<void> {
    try {
      await this.codeHelperService.createCleanupMetadataTable();

      // Проверяем при старте приложения
      await this.codeHelperService.deleteOldTablesIfNeeded();

      // Также можно добавить периодическую проверку на случай, если сервер работает долго
      setInterval(
        async () => {
          await this.codeHelperService.deleteOldTablesIfNeeded();
        },
        12 * 60 * 60 * 1000,
      ); // Проверять каждые 12 часов
    } catch (err) {
      this.logger.error('Ошибка инициализации системы очистки таблиц', err);
    }
  }

  async getLogs(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: any[]; total: number }> {
    const logs = getLogMessages();
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);
    return {
      data: paginatedLogs,
      total: logs.length,
    };
  }
}
