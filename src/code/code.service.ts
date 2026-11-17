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
import { CodeRepository } from './code.repository';
import { NumberBoxETEService } from 'src/NumberBoxETE/numberBoxETE.service';
import { CodeLayersService } from './helpers/code-layers.service';
import { CodeTablesService } from './helpers/code-tables.service';
import { CodeSaveService } from './helpers/code-save.service';
import { CodeLabelsService } from './helpers/code-labels.service';
import { CodeCountsService } from './helpers/code-counts.service';
import { CodeCameraStateService } from './helpers/code-camera-state.service';
import { CameraNames } from 'src/camera/types';
import { BoxLabelCheckService } from './bind/box-label-check.service';

type cameraData = {
  currectProductInBox: number;
  currectBoxInPallet: number;
  UsedBoxNumber: number;
  UsedPalletNumber: number;
  WeightBox: number;
  WeightPallet: number;
};

const flagInpallet = false; //флаг кторый будет отвечать за фасуем в общую паллету или в разные false - в разные true в общую

const flagInBoxLable = true; //флаг кторый будет отвечать за коробоки идет с label и закртыая или нет

@Injectable()
export class CodeService {
  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
    private readonly appGateway: AppGateway,
    private readonly boxLabelCheckService: BoxLabelCheckService,
    private readonly tables: CodeTablesService,
    private readonly saveService: CodeSaveService,
    private readonly labels: CodeLabelsService,
    private readonly counts: CodeCountsService,
    private readonly cameraState: CodeCameraStateService,
    private readonly numberBoxETEService: NumberBoxETEService,
    private readonly codeLayersService: CodeLayersService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {
    // this.initializeCleanupSystem();
  }

  /** Таблица, для которой уже выполнено создание (по имени) */
  private initializedTableName: string | null = null;

  private saveQueue: Promise<any> = Promise.resolve();

  private pending = 0;

  /** Состояние камер хранится в общем реестре (его читает и CodeCountsService) */
  private get cameraStates(): Record<string, cameraData> {
    return this.cameraState.all() as Record<string, cameraData>;
  }

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

  // сеттер паллеты — с валидацией
  setLastUsedPalletNumber(value: number): void {
    if (value < 0) {
      throw new Error('Pallet number must be non-negative');
    }
    this.lastUsedPalletNumber = value;
  }

  /**
   * Начало смены/задания: сбрасывает состояние камер и выставляет номера так,
   * чтобы первый код попал в коробку boxNumber и паллету palletNumber
   * (initCamera сделает ++).
   */
  startSession(boxNumber: number, palletNumber: number): void {
    this.cameraState.reset();
    this.lastUsedBoxNumber = Math.max(0, boxNumber - 1);
    this.lastUsedPalletNumber = Math.max(0, palletNumber - 1);
    this.countBox = Number(this.globalMonVar.task?.packaging_per_pallet) || 6;
  }

  private enqueueSave<T>(task: () => Promise<T>): Promise<T> {
    this.pending++;
    const run = this.saveQueue.then(task, task);
    this.saveQueue = run.then(
      () => {
        this.pending--;
        this.resetIfIdle();
      },
      () => {
        this.pending--;
        this.resetIfIdle();
      },
    );
    return run;
  }

  private resetIfIdle() {
    if (this.pending === 0) {
      this.saveQueue = Promise.resolve(); // ← рвём ссылку на историю
    }
  }

  async UpdateStateCamera(name, weigth) {
    this.globalMonVar.productCount++;
    this.cameraStates[name].currectProductInBox++;
    this.cameraStates[name].WeightBox += +weigth;
    if (
      this.cameraStates[name].currectProductInBox >
      this.globalMonVar.limitProductInBox
    ) {
      if (!flagInpallet) {
        this.cameraStates[name].WeightPallet +=
          +this.cameraStates[name].WeightBox;
      }
      this.cameraStates[name].WeightBox = +weigth;

      this.lastUsedBoxNumber++;

      this.cameraStates[name].currectProductInBox = 1;

      const boxNum = this.lastUsedBoxNumber;

      this.globalMonVar.boxCount++;

      this.cameraStates[name].UsedBoxNumber = boxNum;

      if (!flagInpallet) this.cameraStates[name].currectBoxInPallet++;
      else {
        this.currectBoxInPalletGlobal++;
      }
      await this.numberBoxETEService.UpdateBoxNumber(
        this.globalMonVar.task.gtin,
        boxNum,
        this.globalMonVar.task.date_manufacture,
      );
    }
    console.log(this.cameraStates[name].currectBoxInPallet);
    if (
      this.cameraStates[name].currectBoxInPallet === this.countBox + 1 &&
      !flagInpallet
    ) {
      this.cameraStates[name].UsedPalletNumber++;
      this.cameraStates[name].currectBoxInPallet = 1;
    }
  }

  async closeBox(name) {
    console.log(
      '1422222222',
      this.cameraStates[name].currectProductInBox,
      this.globalMonVar.limitProductInBox,
    );
    if (
      this.cameraStates[name].currectProductInBox ===
      this.globalMonVar.limitProductInBox
    ) {
      await this.labels.closeAutoBoxAndPrint(
        this.cameraStates[name].UsedBoxNumber,
        this.globalMonVar.limitProductInBox,
        name,
      );
    }
  }

  async initCamera(name) {
    // защита от неинициализированных счётчиков: иначе ++undefined = NaN,
    // и в таблицу уходит pallet_number = NaN
    if (!Number.isFinite(this.lastUsedBoxNumber)) this.lastUsedBoxNumber = 0;
    if (!Number.isFinite(this.lastUsedPalletNumber)) {
      this.lastUsedPalletNumber = 0;
    }
    if (!Number.isFinite(this.countBox)) {
      this.countBox = Number(this.globalMonVar.task?.packaging_per_pallet) || 6;
    }

    let cameraState = this.cameraStates[name];
    console.log(!cameraState, '3256587', this.cameraStates[name]);

    if (!cameraState) {
      const b = ++this.lastUsedBoxNumber;
      let p;
      if (!flagInpallet) p = ++this.lastUsedPalletNumber;
      else p = this.lastUsedPalletNumber;
      this.cameraStates[name] = {
        currectProductInBox: 0,
        UsedBoxNumber: b,
        UsedPalletNumber: p,
        WeightBox: 0,
        WeightPallet: 0,
        currectBoxInPallet: 1,
      };
      cameraState = this.cameraStates[name];

      await this.numberBoxETEService.UpdateBoxNumber(
        this.globalMonVar.task.gtin,
        b,
        this.globalMonVar.task.date_manufacture,
      );
    }

    return cameraState;
  }

  /**
   * Восстанавливает состояние камеры из БД (продолжение фасовки):
   * последняя коробка/паллета и сколько в них уже лежит.
   */
  syncCameraState(
    name: string,
    info: {
      lastBoxNumber: number;
      lastPalletNumber: number;
      productsInLastBox: number;
      boxesInLastPallet: number;
    },
  ): void {
    this.countBox = Number(this.globalMonVar.task?.packaging_per_pallet) || 6;
    this.lastUsedBoxNumber = Math.max(0, (info.lastBoxNumber || 1) - 1);
    this.lastUsedPalletNumber = Math.max(0, (info.lastPalletNumber || 1) - 1);

    this.cameraState.set(name, {
      currectProductInBox: info.productsInLastBox || 0,
      currectBoxInPallet: info.boxesInLastPallet || 0,
      UsedBoxNumber: info.lastBoxNumber || 1,
      UsedPalletNumber: info.lastPalletNumber || 1,
      WeightBox: 0,
      WeightPallet: 0,
    });
  }

  hasValidCoordinates(productCoords: string[][]): boolean {
    return (
      productCoords.length > 0 &&
      productCoords.some((coords) => coords.length > 0)
    );
  }

  async ParseLayer(codes: string[], name: string): Promise<any> {
    const startParse = performance.now();
    const UnValidateCodes = [];
    const valideCodes = [];
    // TODO: разбор кодов по слоям для камеры
    const { productCodes, productCoords } =
      this.codeLayersService.extractProductCodesWithCoords(codes);
    for (let i = 0; i < productCodes.length; i++) {
      const element = productCodes[i];
      const validation = await this.validateCode(element);
      if (!validation.isValid) {
        UnValidateCodes.push({
          reason: validation.message,
          code: element,
        });
      } else {
        valideCodes.push(element);
      }
    }

    if (productCodes.length !== +this.globalMonVar.task.codesInLayer) {
      this.appGateway.sendCoordinates(productCoords);
      return {
        isValid: false,
        codes: UnValidateCodes,
      };
    }

    if (UnValidateCodes.length > 0) {
      return {
        isValid: false,
        codes: UnValidateCodes,
      };
    }

    const tValEnd = performance.now();
    console.log(tValEnd - startParse, '254534522 ms');
    return {
      isValid: true,
      codes: valideCodes,
    };
  }

  async validateAndSaveCode(code: string, name: string): Promise<any> {
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
          this.counts.handleValidationError(
            validation.message,
            MonitoringStatusActions.Reject,
          );
          return;
        }

        // Таблица создаётся при первом коде для конкретного задания,
        // даже если счётчик productCount остался с прошлого задания.
        if (this.initializedTableName !== this.globalMonVar.tableName) {
          await this.tables.initializeTables();
          this.initializedTableName = this.globalMonVar.tableName;
        }
        //insert code
        await this.initCamera('Camera1');
        await this.UpdateStateCamera('Camera1', 0);
        await this.saveCode(code);
        if (flagInBoxLable) await this.closeBox('Camera1');

        const codeStatusUpdateTime2 = Date.now();
        const timeDifference2 =
          codeStatusUpdateTime2 - this.globalMonVar.konturTime;
        this.logger.info(
          `Код: Время, прошедшее с момента изменения контура до начала валидации 2: ${timeDifference2} мс`,
        );
        this.counts.getCurrentCounts();
        const result = { isAddCode: true };
        return result;
      });
    } catch (err) {
      this.logger.error(`Код: Ошибка при сохранении кода: ${err.message}`);
      throw err;
    }
  }

  /** Все проверки кода собраны в isValidCode, здесь только передаём зависимости */
  validateCode(code: string): Promise<ICodeValidationResult> {
    return isValidCode(code, this.globalMonVar.task, this.logger, {
      isDuplicate: (candidate) =>
        this.codeRepository.isDuplicateCode(candidate),
      isCodeTask: (codes, code) => this.saveService.isCodeTask(codes, code),
    });
  }
  private a = /^01\d{14}21(?:.{8}|.{6})[\x1D]9[123]/;

  async BindAgregateCode(codes, name) {
    const { ok, productCodes, boxLabel, boxNumber } =
      await this.boxLabelCheckService.check(codes);

    if (ok) await this.labels.bindBoxLabel(boxNumber, boxLabel);
  }

  /**
   * Пакетное сохранение кодов камеры: создаёт таблицу при необходимости,
   * инициализирует состояние камеры, двигает счётчики, пишет коды и
   * отправляет счётчики на панель этой камеры.
   * При ошибке состояние и счётчики откатываются.
   */
  async saveCodes(codes: string[], name = 'Camera1') {
    const key = this.cameraKey(name);

    return await this.enqueueSave(async () => {
      if (this.initializedTableName !== this.globalMonVar.tableName) {
        await this.tables.initializeTables();
        this.initializedTableName = this.globalMonVar.tableName;
      }

      const prevState = await this.initCamera(key);

      const snapshot = {
        camera: { ...prevState },
        lastUsedBoxNumber: this.lastUsedBoxNumber,
        lastUsedPalletNumber: this.lastUsedPalletNumber,
        productCount: this.globalMonVar.productCount,
        boxCount: this.globalMonVar.boxCount,
        palletCount: this.globalMonVar.palletCount,
      };

      try {
        for (let i = 0; i < codes.length; i++) {
          await this.UpdateStateCamera(key, 0);
        }

        await this.saveService.saveCodess(
          this.globalMonVar.tableName,
          codes,
          this.lastUsedBoxNumber,
          key,
          flagInpallet ? null : this.cameraStates[key].UsedPalletNumber,
        );

        await this.counts.sendCurrentStateToFrontend(
          this.counts.getCurrentCounts(key),
          key,
        );
      } catch (err) {
        this.cameraState.set(key, snapshot.camera);
        this.lastUsedBoxNumber = snapshot.lastUsedBoxNumber;
        this.lastUsedPalletNumber = snapshot.lastUsedPalletNumber;
        this.globalMonVar.productCount = snapshot.productCount;
        this.globalMonVar.boxCount = snapshot.boxCount;
        this.globalMonVar.palletCount = snapshot.palletCount;

        this.logger.error(
          `Код: ошибка пакетного сохранения (${codes.length} кодов), откат: ${err?.message ?? err}`,
        );
        this.counts.handleValidationError(
          `Ошибка сохранения кодов: ${err?.message ?? err}`,
          MonitoringStatusActions.Reject,
        );
      }
    });
  }

  /** Имя состояния камеры: 'Camera1' для «Камера 1» / 'Camera1' */
  private cameraKey(name: string): string {
    if (!name) return 'Camera1';
    if (name.startsWith('Camera')) return name;

    const digits = name.replace(/\D/g, '');

    return digits ? `Camera${digits}` : 'Camera1';
  }

  private async saveCode(code: string): Promise<void> {
    const saved = await this.saveService.saveCode(
      this.globalMonVar.tableName,
      code,
      this.lastUsedBoxNumber,
      'Camera1',
      flagInpallet ? null : this.cameraStates['Camera1'].UsedPalletNumber,
    );

    if (!saved) {
      this.counts.handleValidationError(
        `Найден дубликат кода ${code}`,
        MonitoringStatusActions.Reject,
      );
      return;
    }

    this.saveService.updateCodeStatus();
    this.eventEmitter.emit(EventTypes.CodeStatusUpdated);
    this.logger.info(`Код: Статус кода обновлен для кода: ${code}`);

    const counts = this.counts.getCurrentCounts('Camera1');
    this.counts.sendCurrentStateToFrontend(counts, 'Camera1');
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
  //         this.counts.sendDBDataToFrontend();
  //         return { isAddCode: false };
  //       }

  //       if (this.globalMonVar.productCount === 0) {
  //         await this.tables.initializeTables();
  //         this.isDatabaseInitialized = true;
  //       }

  //       const saved =
  //         await this.saveService.saveCodeAndAdvanceState(code);

  //       if (!saved) {
  //         this.logger.warn(`Код ручной: Код ${code} уже существует`);
  //         this.counts.sendDBDataToFrontend();
  //         return { isAddCode: false };
  //       }

  //       this.logger.info(`Код ручной: Код ${code} сохранен`);

  //       this.counts.sendDBDataToFrontend();
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
      return this.counts.getCurrentCounts();
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

    await this.counts.sendDBDataToFrontend();
    const endT = performance.now();
    const delta = endT - startT;
    console.log('delta ------------ deleteCodes', delta);

    return this.counts.getCurrentCounts();
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
      await this.tables.createCleanupMetadataTable();

      // Проверяем при старте приложения
      await this.tables.deleteOldTablesIfNeeded();

      // Также можно добавить периодическую проверку на случай, если сервер работает долго
      setInterval(
        async () => {
          await this.tables.deleteOldTablesIfNeeded();
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
