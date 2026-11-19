import { config, loadConfig, watchConfig } from 'src/config/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as winston from 'winston';
import { sha } from './path.util';

// Настройки — только из config.json рядом с проектом (или с exe при pkg).
// watchConfig следит за файлом: меняется — перечитываем без перезапуска.
loadConfig();
watchConfig();

async function bootstrap() {
  const SHA = config.SHA_256;

  if (sha !== SHA) {
    // return;
  }

  // AppModule грузим после конфига, чтобы его модульные чтения конфига
  // не перетёрли значения из JSON
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Используйте общий логгер для всего приложения
  const logger = winston.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level}: ${message}`;
          }),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/app.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    ],
  });

  app.useLogger(logger);
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: false,
    allowedHeaders: '*',
  });
  await app.listen(3001, '0.0.0.0'); // Убедитесь, что сервер слушает на всех интерфейсах
}
bootstrap();
