import { Inject, Injectable } from '@nestjs/common';
import ModbusRTU from 'modbus-serial';
import { AppGateway } from 'src/app.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModbusConfig } from './modbus-config.entity';
import { ModbusConfigRepository } from './modbus-config.repository';
import { EventTypes, Status } from 'src/globalTypes';
import { Logger } from 'winston';
import { modbusLogger } from 'src/logger-winston/winston.config';
import { allAddresses, IAllAddresses } from 'src/addresses';

@Injectable()
export class ModbusService {
  constructor(
    @Inject('ModbusConfigRepository')
    private modbusConfigRepo: ModbusConfigRepository,
    private readonly appGateway: AppGateway,
    private readonly eventEmitter: EventEmitter2,
    @Inject('winston') private readonly logger: Logger = modbusLogger,
  ) { }

  private client = new ModbusRTU();
  private connectionInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private readonly RECONNECT_DELAY = 100; // Задержка перед повторной попыткой подключения (0.1 секунд)
  private readonly CHECK_INTERVAL = 1000; // Проверка каждые 1 секунду
  private isFirtsInit = true;

  async onModuleInit() {
    await this.updateModbusConfig(
      'Контроллер 1',
      'Одиночный',
      '172.16.16.5',
      502,
    );
  }

  async getConfigByName(name: string): Promise<ModbusConfig | undefined> {
    this.logger.info(`Модбас: Получение конфигурации по имени: ${name}`);
    return this.findByName(name);
  }

  async findByName(name: string): Promise<ModbusConfig | undefined> {
    try {
      this.logger.info(`Модбас: Поиск конфигурации по имени: ${name}`);
      const config = await this.modbusConfigRepo.findOne({ where: { name } });
      this.logger.info(
        `Модбас: Конфигурация найдена: ${JSON.stringify(config)}`,
      );
      return config;
    } catch (err) {
      this.logger.error('Модбас: Ошибка в findByName:', err);
      return undefined;
    }
  }

  public async updateModbusConfig(
    name: string,
    type: string,
    host: string,
    port: number,
  ): Promise<void> {
    this.logger.info(
      `Модбас: Обновление конфигурации Modbus: ${name}, ${type} ${host}, ${port}`,
    );
    let config = await this.modbusConfigRepo.findOne({ where: { name } });
    if (!config) {
      config = this.modbusConfigRepo.create({ name, type, host, port });
      this.logger.info(`Модбас: Создана новая конфигурация: ${config}`);
    } else {
      if (!this.isFirtsInit) {
        config.host = host;
        config.type = type;
        config.port = port;
        this.logger.info(
          `Модбас: Обновлена существующая конфигурация: ${JSON.stringify(config)}`,
        );
      }
      this.isFirtsInit = false;
    }
    await this.modbusConfigRepo.save(config);
    this.logger.info(
      `Модбас: Конфигурация сохранена: ${JSON.stringify(config)}`,
    );
    await this.connectModbus();
  }

  public async connectModbus(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.logger.info('Модбас: Подключение к Modbus...');

    try {
      const config = await this.getConfigByName('Контроллер 1');
      if (!config) {
        this.appGateway.sendControllerConfigStatus('not config');
        this.logger.warn('Модбас: Конфигурация для Контроллер 1 не найдена');
        return;
      }

      const host = config.host || '172.16.16.5';
      const port = config.port || 502;

      await this.client.connectTCP(host, { port });

      this.logger.info('Модбас: Подключено к DVP-SE');
      this.client.setID(1);
      this.isConnected = true;
      this.appGateway.sendModbusConnectionStatus(Status.Connected);
      this.eventEmitter.emit(EventTypes.ConnectionRestored); // Уведомляем о восстановлении соединения
      this.checkConnection();
    } catch (err) {
      this.logger.error('Модбас: Ошибка подключения:', err);
      this.isConnected = false;
      this.appGateway.sendModbusConnectionStatus(Status.Disconnected); // Отправляем статус соединения
      setTimeout(() => this.connectModbus(), this.RECONNECT_DELAY); // Повторить попытку подключения через заданную задержку
    } finally {
      this.isConnecting = false;
    }
  }

  private checkConnection(): void {
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }

    this.connectionInterval = setInterval(async () => {
      try {
        await this.client.readHoldingRegisters(0, 1);
        if (!this.isConnected) {
          this.isConnected = true;
          this.appGateway.sendModbusConnectionStatus(Status.Connected); // Отправляем статус соединения
          this.eventEmitter.emit(EventTypes.ConnectionRestored); // Уведомляем о восстановлении соединения
          this.logger.info('Модбас: Соединение восстановлено');
        }
      } catch (err) {
        if (this.isConnected) {
          this.logger.warn('Модбас: Соединение потеряно, повторная попытка...');
          this.isConnected = false;
          this.appGateway.sendModbusConnectionStatus(Status.Disconnected); // Отправляем статус соединения
          setTimeout(() => this.connectModbus(), this.RECONNECT_DELAY); // Повторить попытку подключения через заданную задержку
        }
      } finally {
        // Отправляем статус соединения каждую секунду
        this.appGateway.sendModbusConnectionStatus(
          this.isConnected ? Status.Connected : Status.Disconnected,
        );
      }
    }, this.CHECK_INTERVAL);
  }

  public getClient(): ModbusRTU {
    try {
      return this.client;
    } catch (err) {
      this.logger.error('Модбас: Ошибка в getClient:', err);
      return undefined;
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // ================= methods =======================

  async writeCoil(address: string, value: boolean) {
    const client = this.getClient();
    await client.writeCoil(parseInt(address, 16), value);
  }

  async readRegistersEnron(address: string) {
    const client = this.getClient();
    return await client.readRegistersEnron(+address, 1);
  }

  async writeRegister(address: string, value: number) {
    const client = this.getClient();
    await client.writeRegister(parseInt(address, 16), value);
  }

}
