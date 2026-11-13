import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as net from 'net';
import * as ping from 'ping';
import { Logger } from 'winston';
import { cameraLogger } from 'src/logger-winston/winston.config';
import { CameraConfigRepository } from './camera-config.repository';
import { IMonitoringVariables, RootStatus, Status } from 'src/globalTypes';
import { AppGateway } from 'src/app.gateway';
import { CameraConfig } from './camera-config.entity';
import { CodeService } from 'src/code/code.service';
import { CameraConnection, CameraNames } from './types';
import { CameraConfigService } from './camera-config.service';

interface CameraBuffer {
  buffer: string;
  timeout: NodeJS.Timeout | null;
  lastReceived: number;
}
@Injectable()
export class CameraService implements OnModuleInit {
  constructor(
    @Inject('CameraConfigRepository')
    private cameraConfigRepo: CameraConfigRepository,
    private readonly appGateway: AppGateway,
    private readonly codeService: CodeService,
    private readonly cameraConfigService: CameraConfigService,
    @Inject('winston') private readonly logger: Logger = cameraLogger,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) {}

  private isConnected = false;
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
    this.connectToCamera();
    setInterval(() => this.pingCamera(), 1000); // Пинг камеры каждые 1 секунду
    setInterval(() => this.sendConnectionStatus(), 3000); // Отправка состояния каждые 3 секунды
  }

  private async connectToCamera() {
    const config = await this.getConfigByName('Камера 1');
    if (!config) {
      this.logger.warn('Камера: Конфигурация для Камара 1 не найдена');

      return;
    } else {
      this.ip = config.host;
      this.port = +config.port;
    }
    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      this.logger.info(`Connected to the camera at ${this.ip}:${this.port}`);
    });

    this.client.on('data', (data) => {
      this.handleMessage(data.toString());
    });

    this.client.on('error', (error) => {
      this.logger.error(`TCP error: ${error.message}`);
      // this.isConnected = false;
      this.appGateway.sendCameraConnectionStatus(Status.Disconnected);
    });

    this.client.on('close', () => {
      // this.logger.warn('Connection to the camera closed');
      // Optionally, you can try to reconnect after a delay
      setTimeout(() => this.connectToCamera(), 5000);
    });
  }

  private handleMessage(message: string) {
    let name = 'q34';
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
    let config = await this.cameraConfigRepo.findOne({ where: { name } });
    if (!config) {
      config = this.cameraConfigRepo.create({ name, host, type, port });
    } else {
      config.host = host;
      config.port = port;
      config.type = type;
    }
    await this.cameraConfigRepo.save(config);
    this.connectToCamera();
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private handleMessage2(message: string, cameraName: CameraNames) {
    console.log('-------------handleMessage raw:', message, cameraName);

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
    console.log('-------------processCompleteMessage:', message, cameraName);

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
      const objCodes = await this.codeService.ParseLayer(lines, cameraName);

      if (objCodes.isValid)
        for (let i = 0; i < objCodes.codes.length; i++) {
          const element = objCodes.codes[i];
          this.codeService.validateAndSaveCode(element, cameraName);
        }
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
