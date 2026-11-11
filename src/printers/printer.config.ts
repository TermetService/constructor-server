import { PrinterConfigRepository } from './printer-config.repository';
import { Logger } from 'winston';
import { PrinterConfig } from './printer-config.entity';

export async function getConfigByName(
  name: string,
  printerConfigRepo: PrinterConfigRepository,
  logger: Logger,
): Promise<PrinterConfig | undefined> {
  logger.info(`Принтер: Получение конфигурации по имени: ${name}`);
  try {
    const config = await printerConfigRepo.findOne({ where: { name } });
    logger.info(`Принтер: Конфигурация найдена: ${JSON.stringify(config)}`);
    return config;
  } catch (err) {
    logger.error('Принтер: Ошибка в getConfigByName:', err);
    return undefined;
  }
}

export async function updatePrinterConfig(
  name: string,
  type: string,
  host: string,
  port: number,
  printerConfigRepo: PrinterConfigRepository,
  logger: Logger,
  enabled: boolean = false,
): Promise<void> {
  logger.info(
    `Принтер: Обновление конфигурации принтера: ${name}, ${type}, ${enabled}, ${host}, ${port}`,
  );
  let config = await printerConfigRepo.findOne({ where: { name } });
  if (!config) {
    config = printerConfigRepo.create({ name, host, enabled, type, port });
    logger.info(
      `Принтер: Создана новая конфигурация: ${JSON.stringify(config)}`,
    );
  } else {
    config.host = host;
    config.port = port;
    config.type = type;
    config.enabled = enabled;
    logger.info(
      `Принтер: Обновлена существующая конфигурация: ${JSON.stringify(config)}`,
    );
  }
  await printerConfigRepo.save(config);
  logger.info(`Принтер: Конфигурация сохранена: ${JSON.stringify(config)}`);
}
