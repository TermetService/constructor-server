import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as net from 'net';
import * as ping from 'ping';
import { Logger } from 'winston';
import { cameraLogger } from 'src/logger-winston/winston.config';
import { CameraConfigRepository } from './camera-config.repository';
import { IMonitoringVariables, Status } from 'src/globalTypes';
import { AppGateway } from 'src/app.gateway';
import { CameraConfig } from './camera-config.entity';
import { CodeService } from 'src/code/code.service';

@Injectable()
export class CameraService implements OnModuleInit {
  constructor(
    @Inject('CameraConfigRepository')
    private cameraConfigRepo: CameraConfigRepository,
    private readonly appGateway: AppGateway,
    private readonly codeService: CodeService,
    @Inject('winston') private readonly logger: Logger = cameraLogger,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) { }

  private isConnected = false;
  private client: net.Socket;
  private ip = '172.16.16.16';
  private port = 2002;

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
    this.codeService.validateAndSaveCode(lines[0]).catch((err) => {
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
}
