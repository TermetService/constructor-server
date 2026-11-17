import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pathUtilId = require.resolve('src/path.util');
  require.cache[pathUtilId] = {
    id: pathUtilId,
    filename: pathUtilId,
    loaded: true,
    exports: {
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
      sha: 'stub-machine-id',
    },
  } as any;

  const { Test } = require('@nestjs/testing');
  const { AppModule } = require('src/app.module');
  const { ModbusService } = require('src/modbus/modbus.service');

  const modbusStub = {
    writeCoil: async () => undefined,
    readCoils: async () => [],
    readDiscreteInputs: async () => [],
    readHoldingRegisters: async () => [],
    readInputRegisters: async () => [],
  };

  console.log('compile: начало');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ModbusService)
    .useValue(modbusStub)
    .compile();
  console.log('compile: OK');

  const { CameraService } = require('src/camera/camera.service');
  const camera = moduleRef.get(CameraService);
  console.log('camera:', camera?.constructor?.name);

  const { DataSource } = require('typeorm');
  const ds = moduleRef.get(DataSource);
  const rows = await ds.query('select 1 as ok');
  console.log('db:', rows[0]);

  await moduleRef.close();
  console.log('closed');
  process.exit(0);
}

main().catch((error) => {
  console.error('FAIL:', error?.message ?? error);
  process.exit(1);
});
