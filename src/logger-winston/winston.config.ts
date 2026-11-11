import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { format, parseISO } from 'date-fns';

let logMessages: any[] = [];

// Создаем основной логгер
const createLogger = (filename: string) => {
  return winston.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({
            all: true,
            colors: { info: 'blue', error: 'red' },
          }),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level}: ${message}`;
          }),
        ),
      }),
      new winston.transports.DailyRotateFile({
        filename: `logs/${filename}/%DATE%-app.log`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: '28d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const log = {
              level,
              message,
              timestamp: format(
                parseISO(timestamp as string),
                'dd.MM.yyyy HH:mm:ss',
              ), // Форматируем дату
              ...meta,
            };
            return JSON.stringify(log);
          }),
        ),
      }),
    ],
  });
};

// Создаем логгеры для различных категорий
export const codeLogger = createLogger('code');
export const cameraLogger = createLogger('camera');
export const modbusLogger = createLogger('modbus');
export const printerLogger = createLogger('printer');
export const monitoringLogger = createLogger('monitoring');
export const oldSortingLogger = createLogger('old-sorting');
export const nomenclaturesLogger = createLogger('nomenclatures');
export const settingsLogger = createLogger('settings');
export const tableLogger = createLogger('table');
export const tasksLogger = createLogger('tasks');
export const templateLogger = createLogger('template');
export const usersLogger = createLogger('users');
export const logger1S = createLogger('1s');
export const loggerGS1 = createLogger('gs1');
export const loggerFTP = createLogger('ftp');

// Создаем объединенный логгер
const combinedLogger = winston.createLogger({
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined/%DATE%-combined.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '3d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const log = {
            level,
            message,
            timestamp: format(parseISO(timestamp as string), 'HH:mm:ss'), // Форматируем дату
            ...meta,
          };
          logMessages.unshift(log); // Добавляем сообщение в начало массив
          return JSON.stringify(log);
        }),
      ),
    }),
  ],
});

// Перенаправляем сообщения из других логгеров в объединенный логгер
const originalCodeLoggerError = codeLogger.error.bind(codeLogger);
codeLogger.error = (message) => {
  originalCodeLoggerError(message);
  combinedLogger.error(message);
  return codeLogger;
};

const originalCodeLoggerWarning = codeLogger.warn.bind(codeLogger);
codeLogger.warn = (message) => {
  originalCodeLoggerWarning(message);
  combinedLogger.warn(message);
  return codeLogger;
};

const originalMonitoringLoggerError = usersLogger.error.bind(usersLogger);
monitoringLogger.error = (message) => {
  originalMonitoringLoggerError(message);
  combinedLogger.error(message);
  return usersLogger;
};

const originalMonitoringLoggerWarning = usersLogger.warn.bind(usersLogger);
monitoringLogger.warn = (message) => {
  originalMonitoringLoggerWarning(message);
  combinedLogger.warn(message);
  return usersLogger;
};

// Функция для получения массива сообщений
export const getLastLogMessages = () => logMessages.slice(-1);
export const getLogMessages = () => logMessages;
export const resetLogMessages = () => (logMessages = []);
