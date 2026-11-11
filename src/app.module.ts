import {
  getNomenclatureJsonDirectory,
  getRecordsJsonDirectory,
  getReserveFilesDirectory,
  getSettingJsonDirectory,
  getStartTaskJsonDirectory,
  getTaskJsonDirectory,
  getTemplateDirectory,
} from './path.util';
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { CodeModule } from './code/code.module';
import { NomenclaturesModule } from './nomenclatures/nomenclatures.module';
import { TasksModule } from './tasks/tasks.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { createDirectoryIfNotExists } from './create-directory.util';
import { DatabaseProviders } from './database.providers';
import { SettingsModule } from './settings/settings.module';
import { AppGateway } from './app.gateway';
import { UserModule } from './users/users.module';
import { ModbusModule } from './modbus/modbus.module';
import { GlobalModule } from './global.module';
import { TemplateModule } from './template/template.module';
import { PrinterModule } from './printers/printer.module';
import { EulaMiddleware } from './EulaMiddleware';
import { OldSortingModule } from './old-sorting/old-sorting.module';
import { CameraModule } from './camera/camera.module';
import { FileModule1S } from './files1s/files1s.module';
import { ScannerModule } from './scanner/app.module';
import { TrialModule } from './trail-period/trial-period.module';
import { Gs1ParserModule } from './gs1-parser/gs1-parser.module';
import { FTPModule } from './ftp/ftp.module';
import { numberBoxETEModule } from './NumberBoxETE/numberBoxETE.module';

@Module({
  imports: [
    DatabaseProviders,
    UserModule,
    ModbusModule,
    PrinterModule,
    CodeModule,
    NomenclaturesModule,
    OldSortingModule,
    TasksModule,
    SettingsModule,
    MonitoringModule,
    GlobalModule,
    TemplateModule,
    CameraModule,
    FileModule1S,
    ScannerModule,
    TrialModule,
    FTPModule,
    Gs1ParserModule,
    numberBoxETEModule,
    // QtModule,
  ],
  providers: [AppGateway],
})
export class AppModule {
  constructor() {
    const nomenclatureJsonDirectory = getNomenclatureJsonDirectory();
    const templateDirectory = getTemplateDirectory();
    const settingsJsonDirectory = getSettingJsonDirectory();
    const taskJsonDirectory = getTaskJsonDirectory();
    const recordsJsonDirectory = getRecordsJsonDirectory();
    const startTaskJsonDirectory = getStartTaskJsonDirectory();
    const reserveFilesDirectory = getReserveFilesDirectory();
    createDirectoryIfNotExists(nomenclatureJsonDirectory);
    createDirectoryIfNotExists(templateDirectory);
    createDirectoryIfNotExists(settingsJsonDirectory);
    createDirectoryIfNotExists(taskJsonDirectory);
    createDirectoryIfNotExists(recordsJsonDirectory[0]);
    createDirectoryIfNotExists(recordsJsonDirectory[1]);
    createDirectoryIfNotExists(startTaskJsonDirectory);
    createDirectoryIfNotExists(reserveFilesDirectory);
  }
  // configure(consumer: MiddlewareConsumer) {
  //   consumer
  //     .apply(EulaMiddleware)
  //     .forRoutes({ path: '*', method: RequestMethod.ALL });
  // }
}
