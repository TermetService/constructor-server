/* eslint-disable prettier/prettier */
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CodeEntity } from './code.entity';
import {
  Hierarchy,
  IBox,
  IPallet,
  IRecords,
  Pallet,
  SearchFrom,
} from './types';
import {
  IAllCounts,
  IMonitoringVariables,
  MonitoringStatusActions,
  RootStatus,
} from 'src/globalTypes';
import { Logger } from 'winston';
import {
  codeLogger,
  getLastLogMessages,
} from 'src/logger-winston/winston.config';
import { AppGateway } from 'src/app.gateway';
import { TemplateService } from 'src/template/template.service';
import { generateJSONTemplate, generatePasteckJSONTemplate } from './helper';
import { PrinterService } from 'src/printers/printer.service';
import * as dotenv from 'dotenv';
import {
  createTableIfNotExists,
  createTaskTable,
  getItemsCountInPallet,
} from 'src/monitoring/helper';
import { getRecordsTextFilesDirectory } from 'src/path.util';
import { join } from 'path';
import * as fs from 'fs';
import { CodeRepository } from './code.repository';

dotenv.config();
const isPrint = process.env.IS_PRINT === 'true';
const isTableRetentionEnabled = +process.env.IS_TABLE_RETENTION;
// const isSortingHistoryRetentionEnabled =
//   +process.env.IS_SORTING_HISTORY_RETENTION; // TODO

@Injectable()
export class CodeHelperService {
  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly entityManager: EntityManager,
    private readonly appGateway: AppGateway,
    private readonly templateService: TemplateService,
    private readonly printerService: PrinterService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  private readonly recordsJsonDirectory = getRecordsTextFilesDirectory();
  private readonly recordTXTFileDirectory =
    process.env.FILES_DIRECTORY_TXT_RECORD;

  getTableName(): string {
    this.logger.info('Код: Получение имени таблицы');
    return this.globalMonVar.tableName;
  }

  async sendCurrentStateToFrontend(allCounts: IAllCounts): Promise<void> {
    this.appGateway.sendProductCount(allCounts);
    this.appGateway.sendLogData(getLastLogMessages());
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

  handleValidationError(
    message: string,
    status: MonitoringStatusActions = MonitoringStatusActions.Reject,
  ): void {
    this.globalMonVar.codeStatus = status;
    this.logger.error(`Код: ${message}`);
    this.sendCurrentStateToFrontend(this.getCurrentCounts());
    this.appGateway.sendRootMessage({
      status: RootStatus.Error,
      message,
    });
  }

  async initializeTables(): Promise<void> {
    await createTableIfNotExists(
      this.entityManager,
      this.globalMonVar.tableName,
    );
    await createTaskTable(
      this.entityManager,
      this.globalMonVar.tableName,
      this.globalMonVar.taskName,
    );
    this.logger.info(`Код: Таблица ${this.globalMonVar.tableName} создана`);
  }

  sendDataToFrontend(allCounts: IAllCounts): void {
    this.appGateway.sendProductCount(allCounts);
    this.appGateway.sendLogData(getLastLogMessages());
  }

  async checkTableExists(tableName: string): Promise<void> {
    if (!(await this.codeRepository.tableExists(tableName))) {
      throw new Error(`Таблица "${tableName}" не существует`);
    }
  }
  async getFullBoxCode(boxNumber: number, countInBox: number): Promise<string> {
    try {
      const task = this.globalMonVar.task;

      // Получаем шаблон коробки
      const template = await this.templateService.getAll();
      const boxTemplate =
        template.find((el) => el.type === 'box')?.template || [];

      // const boxCode = await generateHandPeopleTemplate(
      //   boxTemplate,
      //   task,
      //   boxNumber,
      //   countInBox,
      // );
      const boxCode = 'close';

      return boxCode;
    } catch (err) {
      this.logger.error('Ошибка при получении кода коробки:', err);
      throw err;
    }
  }
  public async closeAutoBoxAndPrint(
    boxNumber: number,
    countInBox: number,
    cameraName: string,
  ): Promise<void> {
    try {
      const boxLabel = await this.getFullBoxCode(boxNumber, countInBox);

      await this.entityManager.query(
        `UPDATE "${this.globalMonVar.tableName}" SET box_label = $1 WHERE box_number = $2 AND box_label IS NULL`,
        [boxLabel, boxNumber],
      );

      this.logger.info(
        `Авто: коробка ${boxNumber} закрыта (${countInBox} кодов), label: ${boxLabel}`,
      );

      this.printerService.printBoxLabel(boxNumber, countInBox, cameraName);
    } catch (err) {
      this.logger.error(
        `Авто: ошибка при закрытии/печати коробки ${boxNumber}: ${err.message}`,
        err,
      );
    }
  }

  //метод для автоматического закрытия паллеты и печати её этикетки
  private async closeAutoPalletAndPrint(
    palletNumber: number,
    countInBoxesInPallet: number,
  ): Promise<void> {
    try {
      const productCountResult = await this.entityManager.query(
        `SELECT COUNT(*) as count FROM "${this.globalMonVar.tableName}" WHERE pallet_number = $1`,
        [palletNumber],
      );
      const productCountInPallet = +productCountResult[0]?.count || 0;

      const palletLabel = await this.getFullPalletCode(
        palletNumber,
        countInBoxesInPallet,
        productCountInPallet,
      );

      await this.entityManager.query(
        `UPDATE "${this.globalMonVar.tableName}" SET pallet_label = $1 WHERE pallet_number = $2 AND pallet_label IS NULL`,
        [palletLabel, palletNumber],
      );

      this.logger.info(
        `Авто: паллета ${palletNumber} закрыта (${countInBoxesInPallet} коробок, ${productCountInPallet} кодов), label: ${palletLabel}`,
      );

      await this.printerService.printPalletLabel(
        palletNumber,
        countInBoxesInPallet,
        productCountInPallet,
      );
    } catch (err) {
      this.logger.error(
        `Авто: ошибка при закрытии/печати паллеты ${palletNumber}: ${err.message}`,
        err,
      );
    }
  }
  isCodeTask(codes, code) {
    return codes.includes(code);
  }

  // async tableHandleBoxTransition() {
  //   this.globalMonVar.boxCount++;
  //   this.globalMonVar.currentBoxNumber++;
  //   this.globalMonVar.productsInCurrentBox =
  //     this.globalMonVar.limitProductInBox;
  //   this.globalMonVar.boxesInCurrentPallet++;
  // }

  // async tableHandlePalletTransition() {
  //   // console.log('======================================', this.globalMonVar.boxesInCurrentPallet, this.globalMonVar.limitBoxInPallet);

  //   if (
  //     this.globalMonVar.boxesInCurrentPallet ===
  //     this.globalMonVar.limitBoxInPallet
  //   ) {
  //     this.globalMonVar.palletCount++;
  //     this.globalMonVar.currentPalletNumber++;
  //     this.globalMonVar.boxesInCurrentPallet = 1;
  //   }
  // }

  async saveCodeAndAdvanceState(code: string): Promise<boolean> {
    const g = this.globalMonVar;

    // следующее состояние считаем локально: номера из него идут в INSERT
    let productCount = g.productCount + 1;
    let productsInCurrentBox = g.productsInCurrentBox + 1;
    let boxCount = g.boxCount;
    let palletCount = g.palletCount;
    let currentBoxNumber = g.currentBoxNumber;
    let currentPalletNumber = g.currentPalletNumber;
    let boxesInCurrentPallet = g.boxesInCurrentPallet;

    // первый код задания
    if (productCount === 1) {
      boxCount = 1;
      palletCount = 1;
      boxesInCurrentPallet = 1;
    }

    // переход на новую коробку
    if (productsInCurrentBox > g.limitProductInBox) {
      boxCount++;
      currentBoxNumber++;
      productsInCurrentBox = 1;
      boxesInCurrentPallet++;
    }

    // переход на новую паллету
    if (boxesInCurrentPallet > g.limitBoxInPallet) {
      palletCount++;
      currentPalletNumber++;
      boxesInCurrentPallet = 1;
    }

    const saved = await this.codeRepository.saveCodeToDatabase(
      g.tableName,
      code,
      currentBoxNumber,
      currentPalletNumber,
    );

    if (!saved) return false;

    // код уже в БД — применяем состояние
    g.productCount = productCount;
    g.productsInCurrentBox = productsInCurrentBox;
    g.boxCount = boxCount;
    g.palletCount = palletCount;
    g.currentBoxNumber = currentBoxNumber;
    g.currentPalletNumber = currentPalletNumber;
    g.boxesInCurrentPallet = boxesInCurrentPallet;

    // этикетки закрытых коробки/паллеты — в очередь, чтобы не тормозить запись
    this.enqueueLabelPrint(
      currentBoxNumber,
      currentPalletNumber,
      productsInCurrentBox === g.limitProductInBox,
      boxesInCurrentPallet === g.limitBoxInPallet &&
        productsInCurrentBox === g.limitProductInBox,
    );

    return true;
  }

  private printChain: Promise<void> = Promise.resolve();

  private enqueueLabelPrint(
    boxNumber: number,
    palletNumber: number,
    isBoxFilled: boolean,
    isPalletFilled: boolean,
  ): void {
    if (!isPrint) return;
    if (!isBoxFilled && !isPalletFilled) return;

    const tableName = this.globalMonVar.tableName;
    const limitProductInBox = this.globalMonVar.limitProductInBox;
    const limitBoxInPallet = this.globalMonVar.limitBoxInPallet;

    this.printChain = this.printChain
      .then(async () => {
        if (isBoxFilled) {
          await this.printerService.printBoxLabel(boxNumber, limitProductInBox);
        }
        if (isPalletFilled) {
          const productCountInPallet = await getItemsCountInPallet(
            this.entityManager,
            tableName,
            palletNumber,
          );
          await this.printerService.printPalletLabel(
            palletNumber,
            limitBoxInPallet,
            productCountInPallet,
          );
        }
      })
      .catch((err) => {
        this.logger.error('Код: Ошибка печати этикеток', err);
      });
  }

  updateCodeStatus() {
    if (this.globalMonVar.currentBoxNumber % 2 === 0) {
      this.globalMonVar.codeStatus = this.globalMonVar.isFirstBoxOdd
        ? MonitoringStatusActions.Right
        : MonitoringStatusActions.Left;
    } else {
      this.globalMonVar.codeStatus = this.globalMonVar.isFirstBoxOdd
        ? MonitoringStatusActions.Left
        : MonitoringStatusActions.Right;
    }
  }

  async createCleanupMetadataTable(): Promise<void> {
    try {
      await this.entityManager.query(`
        CREATE TABLE IF NOT EXISTS table_cleanup_metadata (
          id SERIAL PRIMARY KEY,
          last_cleanup_date DATE NOT NULL
        );
      `);

      // Инициализируем запись, если таблица пуста
      const result = await this.entityManager.query(`
        SELECT 1 FROM table_cleanup_metadata LIMIT 1
      `);

      if (result.length === 0) {
        await this.entityManager.query(`
          INSERT INTO table_cleanup_metadata (last_cleanup_date)
          VALUES (CURRENT_DATE - INTERVAL '31 day') -- Инициализируем так, чтобы при первом запуске точно выполнилась очистка
        `);
      }
    } catch (err) {
      this.logger.error('Ошибка при создании таблицы метаданных очистки', err);
      throw err;
    }
  }

  async deleteOldTablesIfNeeded(): Promise<void> {
    try {
      // Проверяем, нужно ли выполнять очистку сегодня
      const today = new Date().toISOString().split('T')[0];

      const lastCleanup = await this.entityManager.query(`
        SELECT last_cleanup_date FROM table_cleanup_metadata LIMIT 1
      `);

      if (
        lastCleanup[0]?.last_cleanup_date?.toISOString()?.split('T')[0] ===
        today
      ) {
        this.logger.info(
          'Очистка таблиц уже выполнялась сегодня___________________',
        );
        return;
      }

      // Выполняем очистку
      await this.deleteTablesOlderThan();

      // Обновляем дату последней очистки
      await this.entityManager.query(`
        UPDATE table_cleanup_metadata SET last_cleanup_date = CURRENT_DATE
      `);

      this.logger.info('Очистка таблиц выполнена успешно__________');
    } catch (err) {
      this.logger.error(
        'Ошибка при проверке необходимости очистки таблиц',
        err,
      );
      throw err;
    }
  }

  createReportHeaderDataby() {
    return {
      ExporterCode: 0,
      Code: 0,
      ClaimNumber: 0, // "14.08.25-0019" - теперь это параметр
      PartnerCode: null,
      MarkTemplateCode: 0,
      LineCode: 2,
      StartTime: '2025-08-13T09:27:10', // Эти даты нужно будет получать из БД
      CloseTime: '2025-08-14T01:11:27', // или вычислять based on the task
      Attributes: [
        { IsMarkReport: false, Code: 4, Value: this.globalMonVar.task.gtin }, // GTIN
        {
          IsMarkReport: false,
          Code: 5,
          Value:
            this.globalMonVar.task.ITF14 || this.globalMonVar.task.gtin || null,
        }, // ITF14 || gtin || null
        { IsMarkReport: false, Code: 1, Value: this.globalMonVar.task.batch }, // Номер партии/задания
        {
          IsMarkReport: false,
          Code: 2,
          Value: this.formatDate(this.globalMonVar.task.date_manufacture),
        }, // Дата производства
        {
          IsMarkReport: false,
          Code: 3,
          Value: this.formatDate(this.globalMonVar.task.date_expiration),
        }, // Срок годности
      ],
    };
  }

  formatDate(inputDate: string) {
    const parts = inputDate.split('.');
    if (parts.length !== 3) {
      throw new Error('Неверный формат даты. Ожидается: DD.MM.YYYY');
    }

    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];

    return `${year}-${month}-${day}`;
  }

  async deleteTablesOlderThan(): Promise<void> {
    this.logger.info(
      `Поиск таблиц старше ${isTableRetentionEnabled} дней______________`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - isTableRetentionEnabled);

    let deletedCount = 0;
    let errorCount = 0;

    try {
      const tables = await this.entityManager.query(`
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

          // Валидация даты
          if (year < 2000 || year > new Date().getFullYear()) continue;
          const tableDate = new Date(year, month, day);
          if (isNaN(tableDate.getTime())) continue;

          if (tableDate < cutoffDate) {
            await this.entityManager.query(
              `DROP TABLE IF EXISTS "${tableName}" CASCADE`,
            );
            deletedCount++;
            await new Promise((resolve) => setTimeout(resolve, 100)); // Пауза
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

  async sendDBDataToFrontend(): Promise<void> {
    const startTime = performance.now();
    try {
      await this.checkTableExists(this.globalMonVar.tableName);

      const counts = await this.codeRepository.getDatabaseCounts(
        this.globalMonVar.tableName,
        this.globalMonVar.currentBoxNumber,
        this.globalMonVar.currentPalletNumber,
      );

      // Формируем объект allCounts
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
      this.updateGlobalVariablesFromCounts(allCounts);

      const executionTime = Math.round(performance.now() - startTime);
      console.log(
        `Оптимизированный метод sendDBDataToFrontend выполнен за ${executionTime} мс`,
      );
    } catch (err) {
      console.error('Ошибка в sendDBDataToFrontend:', err);
    }
  }

  async updateGlobalVariablesFromCounts(
    allCounts: Partial<IAllCounts>,
  ): Promise<void> {
    this.logger.info('Обновление глобальных переменных на основе счетчиков');

    // Обновляем только те поля, которые есть в allCounts
    if (allCounts.productCount !== undefined) {
      this.globalMonVar.productCount = allCounts.productCount;
    }
    if (allCounts.productsInCurrentBox !== undefined) {
      this.globalMonVar.productsInCurrentBox = allCounts.productsInCurrentBox;
    }
    if (allCounts.boxesInCurrentPallet !== undefined) {
      this.globalMonVar.boxesInCurrentPallet = allCounts.boxesInCurrentPallet;
    }
    if (allCounts.boxCount !== undefined) {
      this.globalMonVar.boxCount = allCounts.boxCount;
    }
    if (allCounts.palletCount !== undefined) {
      this.globalMonVar.palletCount = allCounts.palletCount;
    }
    if (allCounts.currentBoxNumber !== undefined) {
      this.globalMonVar.currentBoxNumber = allCounts.currentBoxNumber;
    }
    if (allCounts.currentPalletNumber !== undefined) {
      this.globalMonVar.currentPalletNumber = allCounts.currentPalletNumber;
    }

    this.logger.info(
      'Глобальные переменные обновлены (частично или полностью)',
    );
  }

  async getLastBoxAndPalletInfo(): Promise<{
    lastBoxNumber: number;
    lastPalletNumber: number;
    productsInLastBox: number;
    boxesInLastPallet: number;
  }> {
    try {
      this.logger.info(
        'Код: Получение информации о последней коробке и паллете',
      );

      const info = await this.codeRepository.getLastBoxAndPalletInfo(
        this.globalMonVar.tableName,
      );

      this.logger.info(
        `Код: Информация о последней коробке и паллете получена: последняя коробка - ${info.lastBoxNumber}, последняя паллета - ${info.lastPalletNumber}, продуктов в последней коробке - ${info.productsInLastBox}, коробок в последней паллете - ${info.boxesInLastPallet}`,
      );

      this.globalMonVar.currentBoxNumber = info.lastBoxNumber;
      this.globalMonVar.currentPalletNumber = info.lastPalletNumber;
      this.globalMonVar.productsInCurrentBox = info.productsInLastBox;
      this.globalMonVar.boxesInCurrentPallet = info.boxesInLastPallet;

      return info;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  async getSummary(): Promise<any> {
    this.logger.info('Код: Получение записей');

    const records = await this.codeRepository.getAllRecords(
      this.globalMonVar.tableName,
    );

    const boxesMap: { [key: string]: IBox } = {};
    const palletsMap: { [key: string]: IPallet } = {};

    records.forEach((record) => {
      const { code, box_number, pallet_number } = record;

      if (!boxesMap[box_number]) {
        boxesMap[box_number] = { name: box_number, products: [] };
      }
      boxesMap[box_number].products.push(code);

      if (!palletsMap[pallet_number]) {
        palletsMap[pallet_number] = { name: pallet_number, boxes: [] };
      }
      if (!palletsMap[pallet_number].boxes.includes(box_number)) {
        palletsMap[pallet_number].boxes.push(box_number);
      }
    });

    const boxes = Object.values(boxesMap).sort(
      (a, b) => parseInt(a.name) - parseInt(b.name),
    );
    const pallets = Object.values(palletsMap).sort(
      (a, b) => parseInt(a.name) - parseInt(b.name),
    );

    const productCount = records.length;
    const boxCount = Object.keys(boxesMap).length;
    const palletCount = Object.keys(palletsMap).length;
    const lastBox = boxes[boxes.length - 1];
    const lastPallet = pallets[pallets.length - 1];
    const productsInLastBox = lastBox ? lastBox.products.length : 0;
    const boxesInLastPallet = lastPallet ? lastPallet.boxes.length : 0;

    this.logger.info('Код: Сводка успешно получена');

    return {
      productCount,
      boxCount,
      palletCount,
      lastBox: lastBox ? lastBox.name : null,
      lastPallet: lastPallet ? lastPallet.name : null,
      productsInLastBox,
      boxesInLastPallet,
    };
  }

  async getReportDataby() {
    const template = await this.templateService.getAll();
    let boxTemplate = [];
    let palletTemplate = [];

    const task = this.globalMonVar.task;

    if (template) {
      boxTemplate = template.find((el) => el.type === 'box')?.template || [];
      palletTemplate =
        template.find((el) => el.type === 'pallet')?.template || [];
    }

    const tableColumns: { column_name: string }[] =
      await this.entityManager.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
        [this.globalMonVar.tableName],
      );
    const columnNames = new Set(tableColumns.map((c) => c.column_name));
    const boxLabelColumn = columnNames.has('box_label')
      ? 'box_label'
      : 'NULL AS box_label';
    const palletLabelColumn = columnNames.has('pallet_label')
      ? 'pallet_label'
      : 'NULL AS pallet_label';

    const allCodes = await this.entityManager.query(
      `SELECT id, code, box_number, ${boxLabelColumn}, pallet_number, ${palletLabelColumn} FROM "${this.globalMonVar.tableName}"`,
    );

    const palletCountsQuery = `
      SELECT pallet_number, COUNT(*) as count
      FROM "${this.globalMonVar.tableName}"
      WHERE pallet_number IS NOT NULL
      GROUP BY pallet_number
    `;
    const palletCounts = await this.entityManager.query(palletCountsQuery);

    const palletCountMap = new Map();
    for (const pc of palletCounts) {
      palletCountMap.set(pc.pallet_number, Number(pc.count));
    }

    const hierarchy: Hierarchy = {};
    // console.log('-------allCodes', allCodes);

    try {
      const codes = allCodes.map((report) => report.code);
      // console.log('-----------codes', codes);

      await this.createCodesTextFile(codes);
    } catch (error) {
      this.logger.error(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        error,
      );
    }

    for (const report of allCodes) {
      const palletNum = report.pallet_number;
      const productCountInPallet = palletCountMap.get(palletNum) || 0;

      const generatePasteck1 = generatePasteckJSONTemplate(
        palletTemplate,
        task,
        palletNum,
        productCountInPallet,
      );

      if (!hierarchy[palletNum]) {
        hierarchy[palletNum] = {
          Barcode: report.pallet_label || generatePasteck1,
          Level: 2,
          NumberInTask: palletNum,
          Weight: null,
          ChildBarcodes: {},
        };
      }

      const boxNum = report.box_number;
      const generatePasteck2 = generatePasteckJSONTemplate(
        boxTemplate,
        task,
        boxNum,
        0,
      );

      if (!hierarchy[palletNum].ChildBarcodes[boxNum]) {
        hierarchy[palletNum].ChildBarcodes[boxNum] = {
          Barcode: report.box_label || generatePasteck2,
          Level: 1,
          NumberInTask: boxNum,
          Weight: null,
          ChildBarcodes: [],
        };
      }

      hierarchy[palletNum].ChildBarcodes[boxNum].ChildBarcodes.push({
        Barcode: report.code,
        Level: 0,
        NumberInTask: report.id,
        Weight: null,
        ChildBarcodes: [],
      });
    }
    // console.log('====================hierarchy', Object.values(hierarchy));

    // 4. Преобразуем в массив с правильными типами
    const barcodesArray = Object.values(hierarchy).map((pallet: Pallet) => ({
      Barcode: pallet.Barcode,
      Level: pallet.Level,
      NumberInTask: pallet.NumberInTask,
      Weight: pallet.Weight,
      ChildBarcodes: Object.values(pallet.ChildBarcodes),
    }));

    return barcodesArray;
  }

  async getReportTermet(isTrailEnd?: boolean): Promise<IRecords> {
    const template = await this.templateService.getAll();
    let boxTemplate = [];
    let palletTemplate = [];
    const task = this.globalMonVar.task;

    if (template) {
      boxTemplate = template.find((el) => el.type === 'box')?.template || [];
      palletTemplate =
        template.find((el) => el.type === 'pallet')?.template || [];
    }

    this.logger.info('Код: Получение записей для отчета');

    const records = await this.codeRepository.getAllRecords(
      this.globalMonVar.tableName,
    );

    // Создаем текстовый файл с кодами
    try {
      const codes = records.map((record) => record.code);
      if (!isTrailEnd) {
        await this.createCodesTextFile(codes);
      }
    } catch (error) {
      this.logger.error(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        error,
      );
    }

    const boxesMap: { [key: string]: IBox } = {};
    const palletsMap: { [key: string]: IPallet } = {};
    const palletCodeCounts: { [key: string]: number } = {};

    records.forEach((record) => {
      const { code, box_number, pallet_number } = record;

      // Обработка коробок
      if (!boxesMap[box_number]) {
        boxesMap[box_number] = {
          name: generateJSONTemplate(boxTemplate, task, box_number, 0),
          products: [],
        };
      }
      boxesMap[box_number].products.push(code);

      // Подсчет кодов в паллетах
      if (!palletCodeCounts[pallet_number]) {
        palletCodeCounts[pallet_number] = 0;
      }
      palletCodeCounts[pallet_number]++;

      // Инициализация паллеты
      if (!palletsMap[pallet_number]) {
        palletsMap[pallet_number] = {
          name: generateJSONTemplate(
            palletTemplate,
            task,
            pallet_number,
            palletCodeCounts[pallet_number],
          ),
          boxes: [],
        };
      }
    });

    // Обновляем name коробок с учетом количества кодов внутри
    for (const boxNumber in boxesMap) {
      const box = boxesMap[boxNumber];
      const countIn = box.products.length;
      box.name = generateJSONTemplate(boxTemplate, task, +boxNumber, countIn);

      // Добавляем коробку в соответствующую паллету
      const palletNumber = records.find(
        (r) => r.box_number === +boxNumber,
      )?.pallet_number;
      if (palletNumber && palletsMap[palletNumber]) {
        if (!palletsMap[palletNumber].boxes.includes(box.name)) {
          palletsMap[palletNumber].boxes.push(box.name);
          // Обновляем имя паллеты с актуальным количеством кодов
          palletsMap[palletNumber].name = generateJSONTemplate(
            palletTemplate,
            task,
            +palletNumber,
            palletCodeCounts[palletNumber],
          );
        }
      }
    }

    const boxes = Object.values(boxesMap).sort(
      (a, b) => parseInt(a.name) - parseInt(b.name),
    );
    const pallets = Object.values(palletsMap).sort(
      (a, b) => parseInt(a.name) - parseInt(b.name),
    );

    this.logger.info('Код: Записи успешно получены');
    return { boxes, pallets };
  }

  private async createCodesTextFile(codes: string[]): Promise<void> {
    try {
      if (!codes || codes.length === 0) {
        this.logger.warn('Код: Нет данных для записи в файл');
        return;
      }

      // Создаем директорию, если ее нет
      if (!fs.existsSync(this.recordsJsonDirectory)) {
        fs.mkdirSync(this.recordsJsonDirectory, { recursive: true });
        this.logger.info(
          `Код: Директория создана: ${this.recordsJsonDirectory}`,
        );
      }

      const fileName = `${this.globalMonVar.tableName}_codes.txt`;
      const filePath = join(this.recordsJsonDirectory, fileName);

      await fs.promises.writeFile(filePath, codes.join('\n'));
      this.logger.info(`Код: Файл с кодами успешно создан: ${filePath}`);
    } catch (error) {
      this.logger.error('Код: Ошибка при создании файла с кодами', error);
      throw error;
    }
  }

  getSearchType(code: string): SearchFrom {
    const sufix = code.substring(16, 18);
    const startSufix = code.substring(0, 2);
    console.log('-----sufix', sufix, startSufix);
    if (sufix === '21') {
      return SearchFrom.Code;
    }
    if (startSufix === '01') {
      return SearchFrom.Box;
    } else if (startSufix === '02') {
      return SearchFrom.Pallet;
    }
  }
}
