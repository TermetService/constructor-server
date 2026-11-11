import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getSettingJsonDirectory } from 'src/path.util';
import { allAddresses } from 'src/addresses';
import { getAddresses } from './helper';
import { TestNames } from './settingNames';
import { ModbusService } from 'src/modbus/modbus.service';
import { Logger } from 'winston';
import { settingsLogger } from 'src/logger-winston/winston.config';
import { IMonitoringVariables } from 'src/globalTypes';

@Injectable()
export class SettingsService {
  constructor(
    private readonly modbusService: ModbusService,
    @Inject('winston') private readonly logger: Logger = settingsLogger,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) { }

  private readonly settingsJsonDirectory = getSettingJsonDirectory();

  async onModuleInit() {
    await this.modbusService.connectModbus();
  }

  async getFile(filename: string): Promise<string> {
    const filePath = path.join(this.settingsJsonDirectory, filename);
    this.logger.info(`Настройки: Получение файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.error('Настройки: Ошибка при чтении файла:', err);
          return reject(err);
        }
        this.logger.info(`Настройки: Файл ${filename} успешно получен`);
        resolve(data);
      });
    });
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.settingsJsonDirectory, filename);
    this.logger.info(`Настройки: Удаление файла: ${filename}`);
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          this.logger.error('Настройки: Ошибка при удалении файла:', err);
          return reject(err);
        }
        this.logger.info(`Настройки: Файл ${filename} успешно удален`);
        resolve();
      });
    });
  }

  async createFile(rootName: string, settings: any): Promise<string> {
    const settingsFilePath = path.join(this.settingsJsonDirectory, rootName);
    this.logger.info(`Настройки: Создание файла: ${rootName}`);
    return new Promise((resolve, reject) => {
      fs.writeFile(
        settingsFilePath,
        JSON.stringify(settings, null, 2),
        (err) => {
          if (err) {
            this.logger.error('Настройки: Ошибка при создании файла:', err);
            return reject(err);
          }
          this.logger.info(`Настройки: Файл ${rootName} успешно создан`);
          this.writeSettingsToPLC(settings);
          resolve(settingsFilePath);
        },
      );
    });
  }

  async writeSettingsToPLC(settings: { [key: string]: any }) {
    let resetDelayTime = 0;
    for (const key in settings) {
      if (settings.hasOwnProperty(key)) {
        const address = allAddresses[key];
        const value = settings[key];
        if (address) {
          try {
            if (false) {
              // должен меняться на данные из файла, при старте
              // нужно загрузить правильные данные при включении мониторинга
            } else if (
              address === '0x0A00' ||
              address === '0x0A05' ||
              address === '0x0A01' ||
              address === '0x0A04'
            ) {
              await this.modbusService.writeCoil(address, value === 'true');
              this.logger.info(
                `Настройки: Записано значение ${value} в катушку ${address}`,
              );
            } else {
              await this.modbusService.writeRegister(address, value);
              // Сохранение задержек для обнуления контуров
              if (key === 'pusherOperationTimer') {
                resetDelayTime += +value;
              }
              if (key === 'pusherDelayTimer') {
                resetDelayTime += +value;
              }
              this.globalMonVar.circuitResetDelayTime = resetDelayTime;
              this.logger.info(
                `Настройки: Записано значение ${value} в регистр ${address}`,
              );
            }
          } catch (err) {
            this.logger.error(
              `Настройки: Ошибка при записи значения ${value} в адрес ${address}:`,
              err,
            );
          }
        } else {
          this.logger.warn(`Настройки: Адрес для ключа ${key} не найден`);
        }
      }
    }
  }

  async writeSingleOrMultipleAddresses(testName: string): Promise<any> {
    const addresses = getAddresses(testName);
    this.logger.info(`Настройки: Адреса для теста ${testName}: ${addresses}`);
    for (const [index, address] of addresses.entries()) {
      try {
        if (testName === TestNames.Lamp) {
          const a = await this.modbusService.writeRegister(allAddresses.redLampTimer1, 1500);
          const b = await this.modbusService.writeRegister(allAddresses.greenLamp1, 1500);

          setTimeout(
            async () =>
              await this.modbusService.writeCoil(allAddresses.greenLamp1, true),
            500,
          );
          await this.modbusService.writeCoil(allAddresses.redLamp1, true);
          this.logger.info(
            `Настройки: Записано значение 1500 в регистры ${allAddresses.redLampTimer1} и ${allAddresses.greenLamp1}`,
          );
          this.logger.info(a);
          this.logger.info(b);
        }

        setTimeout(
          async () => await this.modbusService.writeCoil(address, true),
          (index + 1) * 400,
        );
        setTimeout(
          async () => await this.modbusService.writeCoil(address, false),
          (index + 1) * 600,
        );

        this.logger.info(
          `Настройки: Записано значение true, false в регистр ${address}`,
        );
        return { message: 'ok' };
      } catch (err) {
        this.logger.error(
          `Настройки: Ошибка при записи значения true, false в адрес ${address}:`,
          err,
        );
        return { message: 'dont ok' };
      }
    }
  }
}
