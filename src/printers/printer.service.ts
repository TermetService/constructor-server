/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { PrinterConfigRepository } from './printer-config.repository';
import { AppGateway } from 'src/app.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from 'winston';
import { printer } from 'node-thermal-printer';
import {
  IMonitoringVariables,
  MonitoringStatusActions,
  Status,
} from 'src/globalTypes';
import { printLabelBox, printLabelPallet } from './printer.utils';
import { TemplateService } from 'src/template/template.service';
import * as net from 'net';
import * as ping from 'ping';
import { printerLogger } from 'src/logger-winston/winston.config';
import { PrinterNames } from './types';
import { EntityManager } from 'typeorm';

@Injectable()
@Injectable()
export class PrinterService implements OnModuleDestroy {
  constructor(
    @Inject('PrinterConfigRepository')
    private printerConfigRepo: PrinterConfigRepository,
    private readonly entityManager: EntityManager,
    private readonly appGateway: AppGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly templateService: TemplateService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = printerLogger,
  ) {}

  private isConnected = false;
  private printer: any;
  private newPrinter: any;
  private connectionInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 3000;
  private host: string = '172.16.16.140'; // IP-адрес принтера
  private port: number = 9100; // порт принтера
  private lastStatus: Status | null = null;
  private statusChangeTimeout: NodeJS.Timeout | null = null;
  private globalPrinterStatus = Status.Connected;

  async onModuleInit() {
    await this.connectPrinter();
    setInterval(() => this.pingPrinter(), 1000); // Пинг принтера каждые 1 секунду
  }

  private async updateConnectionStatus(newStatus: Status) {
    if (newStatus === Status.Disconnected) {
      this.globalPrinterStatus = Status.Disconnected;
    } else {
      this.globalPrinterStatus = Status.Connected;
    }

    if (this.globalPrinterStatus !== this.lastStatus) {
      this.lastStatus = this.globalPrinterStatus;
      if (this.statusChangeTimeout) {
        clearTimeout(this.statusChangeTimeout);
      }
      this.statusChangeTimeout = setTimeout(() => {
        this.appGateway.sendPrinterConnectionStatus(this.globalPrinterStatus);
      }, this.CHECK_INTERVAL);
    }
  }

  private async pingPrinter() {
    try {
      const res = await ping.promise.probe(this.host);
      const newStatus = res.alive ? Status.Connected : Status.Disconnected;
      await this.updateConnectionStatus(newStatus);
    } catch (error) {
      this.logger.error(`Printer ping error: ${error.message}`);
    }
  }

  onModuleDestroy() {
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }
  }

  async getConfigByName(name: string): Promise<any> {
    return this.printerConfigRepo.findOne({ where: { name } });
  }

  async updatePrinterConfig(
    name: string,
    type: string,
    host: string,
    port: number,
    enabled?: boolean,
  ): Promise<any> {
    let config = await this.printerConfigRepo.findOne({ where: { name } });
    if (!config) {
      config = this.printerConfigRepo.create({
        name,
        host,
        enabled,
        type,
        port,
      });
    } else {
      config.host = host;
      config.port = port;
      config.type = type;
      config.enabled = enabled;
    }
    await this.printerConfigRepo.save(config);
    await this.connectPrinter();
  }

  public async connectPrinter(): Promise<any> {
    this.logger.info('Принтер: Подключение к принтеру...');
    try {
      const config = await this.getConfigByName(PrinterNames.Printer1);
      if (!config) {
        this.logger.warn(
          `Принтер: Конфигурация для ${PrinterNames.Printer1} не найдена`,
        );
        return;
      }
      this.host = config.host || '192.168.100.141';
      this.port = config.port || 9100;
      this.printer = new printer({
        interface: `tcp://${this.host}:${this.port}`,
      });
      this.newPrinter = { host: this.host, port: this.port };
      this.isConnected = true;
      this.logger.info('Принтер: Подключено к принтеру');
    } catch (err) {
      this.logger.error('Принтер: Ошибка подключения:', err);
      this.isConnected = false;
    }
  }

  public async printBoxLabel(
    boxNumber: number,
    countInBox: number,
    cameraName?: string,
  ): Promise<any> {
    try {
      const template = await this.templateService.getAll();
      let boxTemplate = [];
      if (template) {
        boxTemplate = template.find((el) => el.type === 'box')?.template || [];
      }
      const printerName1 = process.env.PRINTER_NAME_1 || '';
      const printerName2 = process.env.PRINTER_NAME_1 || '';

      let goTo = MonitoringStatusActions.Right;
      if (boxNumber % 2 === 0) {
        goTo = this.globalMonVar.isFirstBoxOdd
          ? MonitoringStatusActions.Right
          : MonitoringStatusActions.Left;
      } else {
        goTo = this.globalMonVar.isFirstBoxOdd
          ? MonitoringStatusActions.Left
          : MonitoringStatusActions.Right;
      }
      const printerName =
        goTo === MonitoringStatusActions.Right ? printerName2 : printerName1;

      if (boxTemplate.length) {
        await printLabelBox(
          boxNumber,
          countInBox,
          this.printer,
          boxTemplate,
          this.globalMonVar,
          this.logger,
          printerName,
        );
      }
    } catch (err) {
      this.logger.error('Ошибка печати этикетки коробки:', err);
    }
  }

  public async printPalletLabel(
    palletNumber: number,
    countInPallet: number,
    productCountInPallet: number,
  ): Promise<any> {
    try {
      const template = await this.templateService.getAll();
      let palletTemplate = [];
      if (template) {
        palletTemplate =
          template.find((el) => el.type === 'pallet')?.template || [];
      }
      if (palletTemplate.length) {
        await printLabelPallet(
          palletNumber,
          countInPallet,
          this.printer,
          palletTemplate,
          this.globalMonVar,
          this.logger,
          productCountInPallet,
        );
      }
    } catch (err) {
      this.logger.error('Ошибка печати этикетки паллеты:', err);
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async getPrinterStatus(): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.connect(this.port, this.host, () => {
        client.write('~HS'); // Команда для получения статуса принтера
      });
      client.on('data', (data) => {
        client.destroy();
        // if (compareArrays(status.split(''))) {
        //   resolve('true');
        // } else {
        //   resolve('false');
        // }
      });
      client.on('error', (err) => {
        reject(`Ошибка подключения к принтеру: ${err.message}`);
      });
    });
  }
}
