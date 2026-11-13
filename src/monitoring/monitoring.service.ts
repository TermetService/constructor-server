/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ModbusService } from 'src/modbus/modbus.service';
import { IIsUnfinishedTask, IMonitoringStatus, ReportType } from './types';
import {
  checkUnfinishedTask,
  deleteTaskTable,
  filenameWithoutExtension,
  getCurrentDateTime,
} from './helper';
import { OnEvent } from '@nestjs/event-emitter';
import { allAddresses, konturAddresses } from 'src/addresses';
import {
  getRecordsJsonDirectory,
  getReserveFilesDirectory,
  getStartTaskJsonDirectory,
  getTaskJsonDirectory,
} from 'src/path.util';
import * as path from 'path';
import * as fs from 'fs';
import {
  EventTypes,
  IMonitoringVariables,
  MonitoringStatusActions,
} from 'src/globalTypes';
import { Logger } from 'winston';
import {
  monitoringLogger,
  resetLogMessages,
} from 'src/logger-winston/winston.config';
import { PrinterService } from 'src/printers/printer.service';
import { CodeHelperService } from 'src/code/code-helper.service';
import * as dotenv from 'dotenv';
import { EntityManager } from 'typeorm';
import { TasksService } from 'src/tasks/tasks.service';
import { CodeRepository } from 'src/code/code.repository';
import { MonitoringHelperService } from './monitoring-helper.service';
import { TrialPeriodService } from 'src/trail-period/trial-period.service';
import { FTPService } from 'src/ftp/ftp.service';
import { CodeService } from 'src/code/code.service';

dotenv.config();

let konturArray: { kontyp: number; timestamp: number }[] = [];
let lastKontur: number | null = null;
const isPrint = process.env.IS_PRINT === 'true';
const isPrintZero = process.env.IS_PRINT_ZERO === 'true';
const isDeleteTask = process.env.IS_DELETE_TASK === 'true';
const reportType = process.env.REPORT_TYPE;
const isFTP = process.env.IS_FTP === 'true';

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private currentDateTime: string | null = null; // используется для нэйминга
  private statusCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly entityManager: EntityManager,
    private readonly modbusService: ModbusService,
    private readonly monitoringHelperService: MonitoringHelperService,
    private readonly ftpService: FTPService,
    private readonly printerService: PrinterService,
    private readonly tasksService: TasksService,
    private readonly codeService: CodeService,
    private readonly codeHelperService: CodeHelperService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = monitoringLogger,
  ) {}

  private readonly recordsJsonDirectory = getRecordsJsonDirectory();
  private readonly reserveJsonDirectory = getReserveFilesDirectory();
  private readonly record1SFileDirectory =
    process.env.FILES_DIRECTORY_1S_RECORD;
  private readonly oldTaskJsonDirectory = getStartTaskJsonDirectory();
  private readonly taskJsonDirectory = getTaskJsonDirectory();

  private isUnfinishedTask = false;
  private unfinishedtableName = '';
  private startMonitoringDate = new Date().toLocaleString();

  async onModuleInit() {
    // await this.modbusService.connectModbus();
    await this.printerService.connectPrinter();
    this.startStatusCheck();
    await this.modbusService.writeCoil(allAddresses.greenLamp2, false);
  }

  onModuleDestroy() {
    this.stopMonitoring();
    this.stopStatusCheck();
  }

  async checkIsUnfinishedTask(): Promise<IIsUnfinishedTask> {
    // Проверяем наличие незавершенной фасовки
    const unfinishedTask = await checkUnfinishedTask(this.entityManager);
    if (unfinishedTask) {
      const { tableName, taskFileName } = unfinishedTask;
      console.info(
        `Найдена незавершенная фасовка ________________________: ${tableName}`,
        taskFileName,
      );
      this.isUnfinishedTask = true;
      this.unfinishedtableName = tableName;
      return { isUnfinishedTask: true, taskFileName };
    }
    return { isUnfinishedTask: false, taskFileName: '' };
  }

  private startStatusCheck() {
    this.statusCheckInterval = setInterval(() => {
      this.monitoringHelperService.sendRootStatuses();
    }, 2000);
  }

  private stopStatusCheck() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }

  async startMonitoring(taskName: string) {
    this.codeService.setLastUsedBoxNumber(0);
    if (!this.globalMonVar.isMonitoring) {
      this.globalMonVar.isMonitoring = true;
      this.startMonitoringDate = new Date().toLocaleString();
      this.currentDateTime = getCurrentDateTime();
      //если продолжение фасовки
      this.globalMonVar.tableName = this.isUnfinishedTask
        ? this.unfinishedtableName
        : `${filenameWithoutExtension(taskName)}-${this.currentDateTime}`;
      const task = await this.readTaskFile(taskName, this.taskJsonDirectory);
      this.logger.info('Старт мониторинга');
      this.globalMonVar.taskName = taskName;
      if (task) {
        this.globalMonVar.task = task;
        this.globalMonVar.currentBoxNumber = +task.startCorob || 1;
        this.globalMonVar.isFirstBoxOdd = +task.startCorob % 2 !== 0;
        this.globalMonVar.currentPalletNumber = +task.startPallet || 1;
        this.globalMonVar.limitProductInBox = +task.pieces_per_package;
        this.globalMonVar.limitBoxInPallet = +task.packaging_per_pallet;

        if (!this.isUnfinishedTask) {
          this.globalMonVar.productCount = 0;
          this.globalMonVar.boxCount = 0;
          this.globalMonVar.palletCount = 0;
          this.globalMonVar.productsInCurrentBox = 0;
          this.globalMonVar.boxesInCurrentPallet = 0;
        }

        // таблица задания должна существовать до первого кода
        await this.codeHelperService.initializeTables();
      }
      if (isPrintZero) {
        this.printerService.printBoxLabel(0, 0);
      }
      // Запрос задержек ПЛК для сброса контуров
      await this.monitoringHelperService.addPLCDelay();

      if (this.isUnfinishedTask) {
        await this.codeHelperService.sendDBDataToFrontend();
        // назначение правильных последних коробок и паллет
        await this.codeHelperService.getLastBoxAndPalletInfo();
      }
      await this.modbusService.writeCoil(allAddresses.greenLamp2, true);
      this.monitorKontur();
      return this.globalMonVar.tableName;
    }
  }

  async readTaskFile(taskName: string, directory: string): Promise<any> {
    if (taskName) {
      const filePath = path.join(directory, taskName);
      try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const task = JSON.parse(data);
        return task;
      } catch (err) {
        this.logger.error('Мониторинг: Ошибка при чтении файла:', err);
        throw err;
      }
    } else {
      this.logger.info('Мониторинг: taskName не задано');
      return null;
    }
  }

  async stopMonitoring() {
    try {
      const endMonitoringDate = new Date().toLocaleString();
      const tableExists = await this.codeRepository.tableExists(
        this.globalMonVar.tableName,
      );
      const task = this.globalMonVar.task;

      if (tableExists) {
        if (this.currentDateTime && !this.globalMonVar.isOldSorting) {
          try {
            const newFileName = `${filenameWithoutExtension(this.globalMonVar.taskName)}-${this.currentDateTime}.json`;
            const newFilePath = path.join(
              this.oldTaskJsonDirectory,
              newFileName,
            );
            task.db = this.globalMonVar.tableName;

            await fs.promises.writeFile(
              newFilePath,
              JSON.stringify(task, null, 2),
              'utf8',
            );
          } catch (err) {
            this.logger.error(
              `Мониторинг: не удалось сохранить файл задания: ${err.message}`,
            );
          }
        }

        try {
          let units = undefined;
          let header = undefined;

          if (reportType === ReportType.Databy) {
            const res = await this.generateFullReport();
            header = this.codeHelperService.createReportHeaderDataby();
            units = res;
          } else {
            const res = await this.codeHelperService.getReportTermet();
            header = {
              docId: task.docId ? task.docId : '20240724-2401',
              StartDate: this.startMonitoringDate,
              lavel: task.lavel,
              EndDate: endMonitoringDate,
              gtin: task.gtin,
              ManufactureDate: task.date_manufacture || '',
              BBD: task.date_expiration || '',
              Batch: task.batch || '',
              description: task.description,
            };
            units = task?.lavel === '1' ? res.boxes : res;
          }

          this.logger.info(task);

          const finalReport = {
            ...header,
            units,
          };
          this.logger.info(finalReport);

          console.log(
            '===+++===',
            this.recordsJsonDirectory,
            '-',
            this.record1SFileDirectory,
            this.reserveJsonDirectory,
          );

          const filePath1 = path.join(
            this.recordsJsonDirectory[0],
            `${this.globalMonVar.tableName}_records.json`,
          );
          const filePath2 = path.join(
            this.recordsJsonDirectory[1],
            `${this.globalMonVar.tableName}_records.json`,
          );

          const filePath1S = path.join(
            this.record1SFileDirectory,
            `${this.globalMonVar.tableName}_records.json`,
          );
          const filePathReserve = path.join(
            this.reserveJsonDirectory,
            `${this.globalMonVar.tableName}_records.json`,
          );
          await this.writeRecordsSafe(finalReport, filePath1);
          await this.writeRecordsSafe(finalReport, filePath2);
          try {
            if (isFTP) {
              console.log(`Сохраняем на FTP сервер`);
              await this.ftpService.uploadFile(
                finalReport,
                `${this.globalMonVar.tableName}_records.json`,
              );
            } else {
              console.log(`Сохраняем в папку ${filePath1S}`);
              // пишем напрямую: если папка 1С недоступна, сработает резервная
              await this.writeToRecordsFile(finalReport, filePath1S);
            }
          } catch (err) {
            console.log(`Нет доступа к ${filePath1S}`);
            console.log(`Сохраняем в резервную папку ${filePathReserve}`);
            await this.writeRecordsSafe(finalReport, filePathReserve);
          }
        } catch (err) {
          this.logger.error(
            `Мониторинг: ошибка формирования отчёта: ${err.message}`,
          );
        }
      }

      return { message: 'Мониторинг остановлен' };
    } catch (err) {
      this.logger.error('Мониторинг: stopMonitoring error', err);
      console.log(err);
    } finally {
      await this.finalizeMonitoringStop();
    }
  }

  private async writeRecordsSafe(
    finalReport: any,
    filePath: string,
  ): Promise<void> {
    try {
      await this.writeToRecordsFile(finalReport, filePath);
    } catch (err) {
      this.logger.error(
        `Мониторинг: не удалось записать файл ${filePath}: ${err.message}`,
      );
    }
  }

  private async finalizeMonitoringStop(): Promise<void> {
    try {
      await deleteTaskTable(this.entityManager, this.globalMonVar.tableName);
    } catch (err) {
      this.logger.error(
        `Мониторинг: не удалось удалить таблицу-метку задания: ${err.message}`,
      );
    }

    if (isDeleteTask && !this.globalMonVar.isOldSorting) {
      try {
        await this.tasksService.deleteFile(this.globalMonVar.taskName);
        this.logger.info(`Файл задачи ${this.globalMonVar.taskName} удален`);
      } catch (err) {
        this.logger.error(
          `Ошибка при удалении файла задачи ${this.globalMonVar.taskName}`,
          err,
        );
      }
    } else {
      this.logger.warn(
        `Файл задачи ${this.globalMonVar.taskName} не удален (isDeleteTask=false или isOldSorting)`,
      );
    }

    this.globalMonVar.isPaused = false;
    this.globalMonVar.isMonitoring = false;
    this.globalMonVar.isOldSorting = false;
    this.resetMonitoringState();
    this.stopStatusCheck();
    resetLogMessages();

    try {
      await this.modbusService.writeCoil(allAddresses.dividerControl, true);
      setTimeout(async () => {
        try {
          await this.modbusService.writeCoil(
            allAddresses.dividerControl,
            false,
          );
        } catch (err) {
          this.logger.error(
            `Мониторинг: не удалось снять импульс делителя: ${err.message}`,
          );
        }
      }, 200);
      await this.modbusService.writeCoil(allAddresses.greenLamp2, false);
    } catch (err) {
      this.logger.error(
        `Мониторинг: не удалось переключить лампы/делитель: ${err.message}`,
      );
    }

    this.logger.info('Мониторинг: Мониторинг остановлен');
  }

  async generateFullReport() {
    const barcodesArray = await this.codeHelperService.getReportDataby();
    console.log('--barcodesArray', barcodesArray);

    const finalReport = {
      TaskMarks: [
        {
          Barcodes: barcodesArray,
        },
      ],
    };

    return finalReport;
  }

  async startOldSorting(oldTaskName: string): Promise<string | null> {
    if (this.globalMonVar.isMonitoring) {
      this.logger.warn(
        'Мониторинг: Уже идет процесс мониторинга. Невозможно продолжить.',
      );
      return null;
    }
    this.globalMonVar.taskName = oldTaskName;
    this.globalMonVar.isMonitoring = true;
    this.globalMonVar.isOldSorting = true;
    this.currentDateTime = getCurrentDateTime();

    const task = await this.readTaskFile(
      oldTaskName,
      this.oldTaskJsonDirectory,
    );
    if (!task) {
      this.logger.error('Мониторинг: Не удалось загрузить старое задание.');
      this.globalMonVar.isMonitoring = false;
      return null;
    }

    this.globalMonVar.tableName = task.db;

    const tableExists = await this.codeRepository.tableExists(
      this.globalMonVar.tableName,
    );
    if (!tableExists) {
      this.logger.error(
        `Мониторинг: Таблица ${this.globalMonVar.tableName} не существует.`,
      );
      this.globalMonVar.isMonitoring = false;
      return null;
    }
    // this.globalMonVar.isFirstBoxOdd = +task.startCorob % 2 !== 0;
    this.globalMonVar.task = task;
    this.globalMonVar.limitProductInBox = +task.pieces_per_package;
    this.globalMonVar.limitBoxInPallet = +task.packaging_per_pallet;

    const records = await this.codeHelperService.getSummary(); // Получаем записи из таблицы
    // const isFullCurentBox = +records.productsInLastBox === +this.globalMonVar.task.pieces_per_package
    // const isFullCurentPallet = +records.boxesInLastPallet === +this.globalMonVar.task.packaging_per_pallet

    this.globalMonVar.productCount = +records.productCount;
    this.globalMonVar.boxCount = +records.boxCount;
    this.globalMonVar.palletCount = +records.palletCount;
    this.globalMonVar.productsInCurrentBox = +records.productsInLastBox;
    this.globalMonVar.currentBoxNumber = +records.lastBox;
    this.globalMonVar.boxesInCurrentPallet = +records.boxesInLastPallet;
    this.globalMonVar.currentPalletNumber = +records.lastPallet;

    this.logger.info('Мониторинг: Продолжение сортировки начато.');
    // Запрос задержок ПЛК для сброса контуров
    await this.monitoringHelperService.addPLCDelay();

    this.monitorKontur(); // Запускаем мониторинг

    return this.globalMonVar.tableName;
  }

  async pauseMonitoring() {
    try {
      if (this.globalMonVar.isMonitoring && !this.globalMonVar.isPaused) {
        this.globalMonVar.isPaused = true;
        this.logger.info('Мониторинг: Мониторинг приостановлен');
      }
    } catch (err) {
      this.logger.error('Мониторинг: pauseMonitoring error', err);
    }
  }

  async continuedMonitoring() {
    try {
      if (this.globalMonVar.isMonitoring && this.globalMonVar.isPaused) {
        this.globalMonVar.isPaused = false;
        this.logger.info('Мониторинг: Продолжение мониторинга');
        this.monitorKontur();
      }
    } catch (err) {
      this.logger.error('Мониторинг: continuedMonitoring error', err);
    }
  }

  async writeToRecordsFile(data: any, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  @OnEvent(EventTypes.ConnectionRestored)
  handleConnectionRestored() {
    this.logger.info(
      'Мониторинг: Соединение восстановлено, перезапуск мониторинга',
    );
    this.monitorKontur();
  }

  private async handleKontur(currentKontur: number): Promise<void> {
    const currentAddress = konturAddresses[currentKontur];
    if (currentAddress) {
      await this.processKonturAddress(currentAddress);
    }
  }

  async monitorKontur(): Promise<void> {
    if (!this.globalMonVar.isMonitoring || this.globalMonVar.isPaused) return;
    if (!this.modbusService.getConnectionStatus()) {
      this.logger.info(
        'Мониторинг: Мониторинг приостановлен из-за потери соединения',
      );
      return;
    }
    try {
      const plc = await this.modbusService.readRegistersEnron(
        allAddresses.controlWord1,
      );
      const currentKontur = plc.data[0];
      if (lastKontur !== currentKontur) {
        this.updateKontur(currentKontur);
      }
      // this.filterOldKonturData();
      setTimeout(() => this.monitorKontur(), 10);
    } catch (error) {
      this.logger.error('Мониторинг: Ошибка при чтении данных:', error);
      setTimeout(() => this.monitorKontur(), 500);
    }
  }

  getMonitoringStatus(): IMonitoringStatus {
    return {
      status: this.globalMonVar.isMonitoring,
      taskName: this.globalMonVar.taskName,
    };
  }

  getIsUnfinishedTask() {
    return this.isUnfinishedTask;
  }

  private resetMonitoringState() {
    this.unfinishedtableName = '';
    this.isUnfinishedTask = false;
    this.globalMonVar.taskName = '';
    this.globalMonVar.task = null;
    this.globalMonVar.tableName = '';
    this.globalMonVar.productCount = 0;
    this.globalMonVar.boxCount = 0;
    this.globalMonVar.palletCount = 0;
    this.globalMonVar.currentBoxNumber = 1;
    this.globalMonVar.currentPalletNumber = 1;
    this.globalMonVar.productsInCurrentBox = 0;
    this.globalMonVar.boxesInCurrentPallet = 0;
  }

  private async processKonturAddress(currentAddress: any) {
    if (
      this.globalMonVar.codeStatus &&
      this.globalMonVar.codeStatus !== MonitoringStatusActions.Reject
    ) {
      console.info(
        'Мониторинг: ~~~~~^^^^^^^^^^^^^^^^^^~~~~~~~~~~~~^^^^^^^^^^^^^^^^^1',
        this.globalMonVar.codeStatus,
      );
      if (this.globalMonVar.codeStatus === MonitoringStatusActions.Left) {
        await this.modbusService.writeCoil(currentAddress['skipLeft'], true);
      } else {
        await this.modbusService.writeCoil(currentAddress['skipRight'], true);
      }
      await this.modbusService.writeCoil(allAddresses.greenLamp1, true);
    } else {
      console.log(
        'Мониторинг: ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2',
        this.globalMonVar.codeStatus,
        this.globalMonVar.task.gtin,
      );
    }
    this.globalMonVar.codeStatus = null;
  }

  private async updateKontur(currentKontur: number) {
    this.logger.info(`Мониторинг: Контур изменился: ${currentKontur}`);
    const konturData = { kontyp: currentKontur, timestamp: Date.now() };

    konturArray.push(konturData);
    lastKontur = currentKontur;

    // Запускаем таймер для сброса контура
    this.startResetTimer(currentKontur);

    if (this.globalMonVar.codeStatus) {
      this.handleKontur(currentKontur);
    }

    // Добавляем временную метку
    const konturChangeTime = Date.now();
    this.logger.info(
      `Мониторинг: Время изменения контура: ${konturChangeTime}`,
    );
    this.globalMonVar.konturTime = konturChangeTime;
  }

  private startResetTimer(konturNumber: number) {
    setTimeout(async () => {
      await this.resetKontur(konturNumber);
    }, this.globalMonVar.circuitResetDelayTime);
  }

  private async resetKontur(konturNumber: number) {
    const resetAddress =
      this.monitoringHelperService.getResetAddress(konturNumber);

    if (resetAddress) {
      try {
        await this.modbusService.writeCoil(resetAddress, false);
        this.logger.info(`Мониторинг: Контур ${konturNumber} сброшен`);
      } catch (err) {
        this.logger.error(
          `Мониторинг: Ошибка при сбросе контура ${konturNumber}`,
          err,
        );
      }
    }
  }

  // private async updateKontur(currentKontur: number) {
  //     this.logger.info(`Мониторинг: Контур изменился: ${currentKontur}`);
  //     const konturData = { kontyp: currentKontur, timestamp: Date.now() };
  //     try {
  //         const client = this.modbusService.getClient();
  //         console.log(`--------------------- ${client}`);
  //         // await client.writeCoil(parseInt(allAddresses.dividerControl, 16), true); resetContour1
  //     } catch (err) {
  //         this.logger.error(`Мониторинг: Ошибка при обнулении контура ${currentKontur}`);
  //     }

  //     konturArray.push(konturData);
  //     lastKontur = currentKontur;
  //     if (this.globalMonVar.codeStatus) {
  //         this.handleKontur(currentKontur);
  //     }
  //     // this.appGateway.sendConturNumber(currentKontur);
  //     // Добавляем временную метку
  //     const konturChangeTime = Date.now();
  //     this.logger.info(`Мониторинг: Время изменения контура: ${konturChangeTime}`);
  //     global.konturChangeTime = konturChangeTime;
  //     this.globalMonVar.konturTime = konturChangeTime;
  // }

  @OnEvent(EventTypes.CodeStatusUpdated)
  handleCodeStatusUpdated() {
    if (this.globalMonVar.codeStatus) {
      this.handleKontur(lastKontur);
    }
    // if (isPrint) {
    //   this.printerService.printBoxLabel(
    //     this.globalMonVar.currentBoxNumber,
    //     this.globalMonVar.limitProductInBox,
    //   );
    // }
    // Добавляем временную метку
    const codeStatusUpdateTime = Date.now();
    const timeDifference = codeStatusUpdateTime - this.globalMonVar.konturTime;
    this.logger.info(
      `Мониторинг: Время, прошедшее с момента изменения контура до обновления статуса кода: ${timeDifference} мс`,
    );
  }

  // private filterOldKonturData() {
  //     const currentTime = Date.now();
  //     konturArray = konturArray.filter(item => currentTime - item.timestamp < 500);
  // }
}
