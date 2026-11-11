import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as winston from 'winston';
import * as dotenv from 'dotenv';
import { sha } from './path.util';

dotenv.config();

async function bootstrap() {
  const SHA = process.env.SHA_256;
  // console.log('Уникальный идентификатор машины', SHA); // Уникальный идентификатор машины
  // console.log('Уникальный идентификатор машины2', sha); // Уникальный идентификатор машины
  // console.log('Уникальный идентификатор машины3', sha === SHA); // Уникальный идентификатор машины
  if (sha !== SHA) {
    // return;
  }
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
