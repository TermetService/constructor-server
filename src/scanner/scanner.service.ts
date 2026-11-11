import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SerialPort } from 'serialport';
import { InterByteTimeoutParser } from '@serialport/parser-inter-byte-timeout';
import { CodeService } from 'src/code/code.service';
import { AppGateway } from 'src/app.gateway';

@Injectable()
export class ScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScannerService.name);
  private ports: Map<string, SerialPort> = new Map();
  private portStatus: Map<string, { available: boolean; connected: boolean }> =
    new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private inputID: string;
  // Конфигурация портов из .env
  private readonly portConfigs = [
    {
      path: process.env.COM_PORT || 'COM3',
      baudRate: 9600,
      dataBits: 8 as 8,
      stopBits: 1 as 1,
      parity: 'none' as 'none',
    },
    // {
    //   path: process.env.USER_2 || 'COM3',
    //   userId: '2',
    //   baudRate: 9600,
    //   dataBits: 8 as 8,
    //   stopBits: 1 as 1,
    //   parity: 'none' as 'none',
    // },
  ];

  constructor(
    private readonly codeService: CodeService,
    private readonly appGateway: AppGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('🔄 Запуск мониторинга COM портов...');

    // Инициализируем статусы для всех портов
    this.portConfigs.forEach((config) => {
      this.portStatus.set(config.path, {
        available: false,
        connected: false,
      });
    });

    await this.checkAllPortsAvailability();
    this.startPortMonitoring();
  }

  async onModuleDestroy() {
    this.stopPortMonitoring();
    this.disconnectAllPorts();
  }

  private startPortMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllPortsAvailability();
    }, 2000);
  }

  private stopPortMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private async checkAllPortsAvailability(): Promise<void> {
    try {
      const availablePorts = await SerialPort.list();
      const availablePaths = availablePorts.map((p) => p.path);

      // Проверяем каждый настроенный порт
      for (const config of this.portConfigs) {
        const isAvailable = availablePaths.includes(config.path);
        const status = this.portStatus.get(config.path);

        if (!status) continue;

        // Если состояние изменилось
        if (isAvailable !== status.available) {
          status.available = isAvailable;

          if (isAvailable) {
            this.logger.log(`🟢 Порт ${config.path} доступен (User ID: )`);
            await this.connectPort(config);
          } else {
            this.logger.warn(`🔴 Порт ${config.path} недоступен (User ID: )`);
            if (status.connected) {
              this.disconnectPort(config.path);
            }
          }
        }

        // Если порт доступен, но нет подключения - пробуем подключиться
        if (isAvailable && !status.connected && !this.ports.has(config.path)) {
          await this.connectPort(config);
        }
      }
    } catch (error) {
      this.logger.error(`Ошибка проверки портов: ${error.message}`);
    }
  }

  private async connectPort(config: any): Promise<void> {
    try {
      this.logger.log(
        `🔌 Подключение к ${config.path} (User ID: ${config.userId})...`,
      );

      const port = new SerialPort({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        autoOpen: false,
      });

      const parser = port.pipe(
        new InterByteTimeoutParser({
          interval: 50,
          maxBufferSize: 1024,
        }),
      );

      parser.on('data', (data: Buffer) => {
        console.log('RAW:', data); // Для отладки

        // Убираем только управляющие символы, но GS показываем в консоли
        const rawText = data.toString('utf8');
        // console.log('RAW text:', rawText.replace(/\x1D/g, '@')); // Показываем GS как [GS]

        // Для отправки - чистим всё
        const barcode = rawText
          // .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Удаляем всё кроме табуляции и переноса
          .replace(/\x1D/g, '@') // Явно удаляем GS
          .replace(/\r$/, '') // Убираем возврат каретки в конце
          .trim(); // Обрезаем пробелы

        if (barcode) {
          // Чистый код без служебных символов
          console.log('CLEAN:', barcode);
          console.log('CLEAN:', rawText);

          // Отправляем в ваш gateway
          this.appGateway.sendCod(barcode, this.inputID);

          // И в сервис
          // this.codeService.handValidateAndSaveCode(barcode, +config.userId);
        }
      });

      port.on('error', (err) => {
        this.logger.error(`❌ Ошибка порта ${config.path}: ${err.message}`);
        const status = this.portStatus.get(config.path);
        if (status) {
          status.connected = false;
        }
        this.ports.delete(config.path);
      });

      port.on('open', () => {
        this.logger.log(
          `✅ Подключено к ${config.path} (User ID: ${config.userId})`,
        );
        const status = this.portStatus.get(config.path);
        if (status) {
          status.connected = true;
        }
      });

      port.on('close', () => {
        this.logger.warn(
          `🔌 Порт ${config.path} закрыт (User ID: ${config.userId})`,
        );
        const status = this.portStatus.get(config.path);
        if (status) {
          status.connected = false;
        }
        this.ports.delete(config.path);
      });

      await new Promise<void>((resolve, reject) => {
        port.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.ports.set(config.path, port);
    } catch (error) {
      this.logger.error(
        `❌ Ошибка подключения к ${config.path}: ${error.message}`,
      );
      const status = this.portStatus.get(config.path);
      if (status) {
        status.connected = false;
      }
      this.ports.delete(config.path);
    }
  }

  private disconnectPort(portPath: string): void {
    const port = this.ports.get(portPath);
    if (port && port.isOpen) {
      port.close();
    }
    this.ports.delete(portPath);

    const status = this.portStatus.get(portPath);
    if (status) {
      status.connected = false;
    }
  }

  private disconnectAllPorts(): void {
    this.ports.forEach((port, portPath) => {
      if (port && port.isOpen) {
        port.close();
      }
    });
    this.ports.clear();

    // Сбрасываем статусы
    this.portStatus.forEach((status) => {
      status.connected = false;
    });
  }
  saveID(id: string) {
    this.inputID = id;
  }

  getStatus() {
    const ports = [];

    for (const config of this.portConfigs) {
      const status = this.portStatus.get(config.path);
      ports.push({
        port: config.path,
        available: status?.available || false,
        connected: status?.connected || false,
      });
    }

    return {
      ports,
      timestamp: new Date().toISOString(),
    };
  }
}
