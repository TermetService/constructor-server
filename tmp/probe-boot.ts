import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pathStub = {
    getRecordsTextFilesDirectory: () => 'tmp/records-text',
    getTaskJsonDirectory: () => 'tmp/tasks',
    getNomenclatureJsonDirectory: () => 'tmp/nomenclature',
    getSettingJsonDirectory: () => 'tmp/settings',
    getTemplateDirectory: () => 'tmp/templates',
    getRecordsJsonDirectory: () => ['tmp/records-1', 'tmp/records-2'],
    getReserveFilesDirectory: () => 'tmp/reserve',
    getStartTaskJsonDirectory: () => 'tmp/finish',
    getFilesDirectory: () => 'tmp/files',
    getAvailableFilesDirectory: () => 'tmp/available',
    getRecordsFilesDirectory: () => 'tmp/records-files',
    getFilesDirectory1S: () => 'tmp/1s',
    getJsonDirectory1S: () => 'tmp/1s-json',
    getFilesDirectory1STemplate: () => 'tmp/1s-template',
    getJsonDirectory1STemplate: () => 'tmp/1s-template-json',
    getRecordsTextFilesDirectory1: () => 'tmp/records-text',
    sha: 'stub-machine-id',
  };
  const pathUtilId = require.resolve('src/path.util');
  require.cache[pathUtilId] = {
    id: pathUtilId,
    filename: pathUtilId,
    loaded: true,
    exports: pathStub,
  } as any;

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('src/app.module');

  console.log('boot: начало');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  console.log('boot: OK');

  const camera = app.get(require('src/camera/camera.service').CameraService);
  console.log('camera bean:', camera?.constructor?.name);

  await app.close();
  console.log('boot: closed');
  process.exit(0);
}

main().catch((error) => {
  console.error('BOOT FAIL:', error?.message ?? error);
  process.exit(1);
});
