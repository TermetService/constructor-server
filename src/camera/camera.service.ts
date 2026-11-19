import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as net from 'net';
import * as ping from 'ping';
import { Logger } from 'winston';
import { cameraLogger } from 'src/logger-winston/winston.config';
import { IMonitoringVariables, RootStatus, Status } from 'src/globalTypes';
import { AppGateway } from 'src/app.gateway';
import { CameraConfig } from './camera-config.entity';
import { CodeService } from 'src/code/code.service';
import { CameraConnection, CameraNames } from './types';
import { CameraConfigService } from './camera-config.service';
import { getCameraConfigName } from './helper';
import { getCameraHandler, normalizeCameraType } from './camera-types';

interface CameraBuffer {
  buffer: string;
  timeout: NodeJS.Timeout | null;
  lastReceived: number;
}
@Injectable()
export class CameraService implements OnModuleInit {
  constructor(
    @InjectRepository(CameraConfig)
    private cameraConfigRepo: Repository<CameraConfig>,
    private readonly appGateway: AppGateway,
    private readonly codeService: CodeService,
    private readonly cameraConfigService: CameraConfigService,
    @Inject('winston') private readonly logger: Logger = cameraLogger,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) {}

  private isConnected = false;
  private clients: Record<string, net.Socket> = {};

  private client: net.Socket;
  private ip = '172.16.16.16';
  private port = 2002;

  private cameras: Record<CameraNames, CameraConnection> = {
    [CameraNames.Camera1]: undefined,
    [CameraNames.Camera2]: undefined,
    [CameraNames.Camera3]: undefined,
    [CameraNames.Camera4]: undefined,
  };
  // private camerasStatus: CamerasStatus = {};
  private cameraBuffers: Record<CameraNames, CameraBuffer> = {
    [CameraNames.Camera1]: { buffer: '', timeout: null, lastReceived: 0 },
    [CameraNames.Camera2]: { buffer: '', timeout: null, lastReceived: 0 },
    [CameraNames.Camera3]: { buffer: '', timeout: null, lastReceived: 0 },
    [CameraNames.Camera4]: { buffer: '', timeout: null, lastReceived: 0 },
  };

  onModuleInit() {
    this.connectToCamera('camera1');
    setInterval(() => this.pingCamera(), 1000); // Пинг камеры каждые 1 секунду
    setInterval(() => this.sendConnectionStatus(), 3000); // Отправка состояния каждые 3 секунды
  }

  private async connectToCamera(name) {
    const config = await this.getConfigByName(
      getCameraConfigName(CameraNames.Camera1),
    );
    if (this.clients[name]) {
      this.clients.name.removeAllListeners();
    }
    if (!config) {
      this.logger.warn('Камера: Конфигурация для Камара 1 не найдена');
      return;
    } else {
      this.ip = config.host;
      this.port = +config.port;
    }
    this.clients['Camera1'] = new net.Socket();
    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      this.logger.info(`Connected to the camera at ${this.ip}:${this.port}`);
    });

    // this.client.on('data', (data) => {
    //   this.handleMessage(data.toString());
    // });
    this.client.on('data', (data) => {
      void this.routeMessage(data.toString());
    });

    this.client.on('error', (error) => {
      this.logger.error(`TCP error: ${error.message}`);
      // this.isConnected = false;
      this.appGateway.sendCameraConnectionStatus(Status.Disconnected);
    });

    this.client.on('close', () => {
      // this.logger.warn('Connection to the camera closed');
      // Optionally, you can try to reconnect after a delay
      setTimeout(() => this.connectToCamera(name), 5000);
    });
  }

  /**
   * Выбор обработчика по типу камеры из настроек устройств:
   * aggregation / pallet_adding — пакетный handleMessage2,
   * box_binding — привязка этикетки handleMessageBind,
   * serialization (и пусто) — поштучный handleMessage.
   */
  private async routeMessage(message: string): Promise<void> {
    const cameraName = CameraNames.Camera1;

    try {
      const config = await this.cameraConfigRepo.findOne({
        where: { name: getCameraConfigName(cameraName) },
      });

      const handler = getCameraHandler(config?.type);
      console.log(config, handler);
      if (handler === 'batch') {
        this.handleMessage2(message, cameraName);
      } else if (handler === 'boxbinding') {
        this.handleMessageBind(message, cameraName);
      } else {
        this.handleMessage(message, cameraName);
      }
    } catch (error) {
      this.logger.error(
        `Камера: ошибка выбора обработчика: ${error?.message ?? error}`,
      );
      this.handleMessage(message, cameraName);
    }
  }

  private handleMessage(message: string, name) {
    console.log('handleMessage--_____________2', message);
    if (!this.globalMonVar.isMonitoring) {
      this.logger.warn('Камера: мониторинг не запущен');
      return;
    }
    if (this.globalMonVar.isPaused) {
      this.logger.warn('Камера: мониторинг на паузе');
      return;
    }
    // console.log('handleMessage--_____________2', message);
    const lines = message.split('@').filter((el) => el.length);
    // console.log('handleMessage--_____________', lines);
    const codeStatusUpdateTime = Date.now();
    const timeDifference = codeStatusUpdateTime - this.globalMonVar.konturTime;
    this.logger.info(
      `Камера: Время -----------------: ${timeDifference}, для кодов ${lines}`,
    );
    this.codeService.validateAndSaveCode(lines[0], name).catch((err) => {
      this.logger.error(
        `Камера: ошибка сохранения кода ${lines[0]}: ${err?.message ?? err}`,
      );
    });
  }

  private async handleMessageBind(message: string, name: string) {
    console.log('handleMessage--_____________2', message, '124234');
    if (!this.globalMonVar.isMonitoring) {
      this.logger.warn('Камера: мониторинг не запущен');
      return;
    }
    if (this.globalMonVar.isPaused) {
      this.logger.warn('Камера: мониторинг на паузе');
      return;
    }
    // console.log('handleMessage--_____________2', message);
    // const lines = message.split('@').filter((el) => el.length);
    // // console.log('handleMessage--_____________', lines);
    // const codeStatusUpdateTime = Date.now();
    // const timeDifference = codeStatusUpdateTime - this.globalMonVar.konturTime;
    // this.logger.info(
    //   `Камера: Время -----------------: ${timeDifference}, для кодов ${lines}`,
    // );
    const cleanMessage = message.trim();
    const lines = cleanMessage.split('@@').filter((el) => el.length);

    if (
      name === CameraNames.Camera1 ||
      name === CameraNames.Camera2 ||
      name === CameraNames.Camera3 ||
      name === CameraNames.Camera4
    ) {
      const start = performance.now();
      const objCodes = await this.codeService.ParseLayer(lines, name, true);

      // if (objCodes.isValid) {
      //   // for (let i = 0; i < objCodes.codes.length; i++) {
      //   //   const element = objCodes.codes[i];
      //   //   await this.codeService.validateAndSaveCode(element, cameraName);
      //   // }
      //   await this.codeService.saveCodes(objCodes.codes, cameraName);
      // }

      this.codeService
        .BindAgregateCodeBox(objCodes.codes, name)
        .catch((err) => {
          this.logger.error(
            `Камера: ошибка сохранения кода ${lines[0]}: ${err?.message ?? err}`,
          );
        });
      const end = performance.now();
      console.log(start - end, ';;;;;;;;;');
    }
    console.log(lines);
  }

  private async pingCamera() {
    try {
      const res = await ping.promise.probe(this.ip);
      if (res.alive) {
        this.isConnected = true;
      } else {
        this.isConnected = false;
      }
    } catch (error) {
      this.logger.error(`Camera ping error: ${error.message}`);
    }
  }

  private sendConnectionStatus() {
    this.appGateway.sendCameraConnectionStatus(
      this.isConnected ? Status.Connected : Status.Disconnected,
    );
  }

  async getConfigByName(name: string): Promise<CameraConfig | undefined> {
    return this.cameraConfigRepo.findOne({ where: { name } });
  }

  async updateCameraConfig(
    name: string,
    type: string,
    host: string,
    port: number,
  ): Promise<void> {
    // храним одно каноническое имя: «Камера 1», «Камера 2», …
    const configName = getCameraConfigName(name);
    // и тип в английской нотации (старые русские значения приводим)
    const cameraType = normalizeCameraType(type) ?? type;

    let config = await this.cameraConfigRepo.findOne({
      where: { name: configName },
    });
    if (!config) {
      config = this.cameraConfigRepo.create({
        name: configName,
        host,
        type: cameraType,
        port,
      });
    } else {
      config.host = host;
      config.port = port;
      config.type = cameraType;
    }
    await this.cameraConfigRepo.save(config);
    this.connectToCamera(name);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private handleMessage2(message: string, cameraName: CameraNames) {
    // console.log('-------------handleMessage raw:', message, cameraName);

    const buffer = this.cameraBuffers[cameraName];
    buffer.buffer += message;
    buffer.lastReceived = Date.now();

    // Проверяем, есть ли у нас полное сообщение
    this.processCameraBuffer(cameraName);
  }

  private processCameraBuffer(cameraName: CameraNames) {
    const buffer = this.cameraBuffers[cameraName];

    // Очищаем предыдущий таймаут
    if (buffer.timeout) {
      clearTimeout(buffer.timeout);
      buffer.timeout = null;
    }

    // Проверяем, начинается ли буфер с пробела и заканчивается ли табом
    const startsWithSpace = buffer.buffer.startsWith(' ');
    const endsWithTab = buffer.buffer.endsWith('\t');

    if (startsWithSpace && endsWithTab) {
      // Полное сообщение - обрабатываем
      this.processCompleteMessage(buffer.buffer, cameraName);
      buffer.buffer = '';
    } else if (startsWithSpace && !endsWithTab) {
      // Сообщение начинается с пробела, но не заканчивается табом - ждем продолжение
      buffer.timeout = setTimeout(() => {
        this.handleIncompleteMessage(cameraName);
      }, 500);
    } else if (!startsWithSpace && buffer.buffer !== '') {
      // Сообщение не начинается с пробела - это продолжение предыдущего
      if (this.cameraBuffers[cameraName].buffer !== '') {
        // Объединяем с предыдущим буфером и проверяем снова
        this.processCameraBuffer(cameraName);
      }
    }
  }

  private async processCompleteMessage(
    message: string,
    cameraName: CameraNames,
  ) {
    // console.log('-------------processCompleteMessage:', message, cameraName);

    // Убираем начальный пробел и конечный таб
    const cleanMessage = message.trim();

    if (!this.globalMonVar.isMonitoring) {
      const errorMessage = 'мониторинг не запущен';
      this.logger.warn(`${cameraName}: ${errorMessage}`);
      this.appGateway.sendRootMessage2(
        {
          status: RootStatus.Error,
          message: errorMessage,
        },
        this.cameraConfigService.getClientPortByCamera(cameraName),
      );
      return;
    }

    if (this.globalMonVar.isPaused) {
      const errorMessage = 'мониторинг на паузе';
      this.logger.warn(`${cameraName}: ${errorMessage}`);
      this.appGateway.sendRootMessage2(
        {
          status: RootStatus.Error,
          message: errorMessage,
        },
        this.cameraConfigService.getClientPortByCamera(cameraName),
      );
      return;
    }

    const lines = cleanMessage.split('@@').filter((el) => el.length);

    if (
      cameraName === CameraNames.Camera1 ||
      cameraName === CameraNames.Camera2 ||
      cameraName === CameraNames.Camera3 ||
      cameraName === CameraNames.Camera4
    ) {
      const start = performance.now();
      const objCodes = await this.codeService.ParseLayer(
        lines,
        cameraName,
        false,
      );
      console.log(objCodes.isValid, '122121');
      if (objCodes.isValid) {
        // for (let i = 0; i < objCodes.codes.length; i++) {
        //   const element = objCodes.codes[i];
        //   await this.codeService.validateAndSaveCode(element, cameraName);
        // }
        await this.codeService.saveCodes(objCodes.codes, cameraName);
      }

      const end = performance.now();
      console.log(start - end, ';;;;;;;;;');
    }
  }

  private handleIncompleteMessage(cameraName: CameraNames) {
    const buffer = this.cameraBuffers[cameraName];

    if (buffer.buffer !== '' && !buffer.buffer.endsWith('\t')) {
      // Сообщение не пришло полностью в течение 500 мс
      const errorMessage = 'неполное сообщение от камеры';
      this.logger.error(`${cameraName}: ${errorMessage}`);

      this.appGateway.sendRootMessage2(
        {
          status: RootStatus.Error,
          message: errorMessage,
        },
        this.cameraConfigService.getClientPortByCamera(cameraName),
      );

      // Очищаем буфер для следующего сообщения
      buffer.buffer = '';
    }
  }
}
