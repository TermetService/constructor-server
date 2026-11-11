import { forwardRef, Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { ModbusModule } from 'src/modbus/modbus.module';
import { AppGateway } from 'src/app.gateway';
import { MonitoringController } from './monitoring.controller';
import { CustomEventEmitterModule } from 'src/EventEmitterModule';
import { CodeModule } from 'src/code/code.module';
import { monitoringLogger } from 'src/logger-winston/winston.config';
import { PrinterModule } from 'src/printers/printer.module';
import { TasksModule } from 'src/tasks/tasks.module';
import { MonitoringHelperService } from './monitoring-helper.service';
import { TrialPeriodService } from 'src/trail-period/trial-period.service';
import { TrialModule } from 'src/trail-period/trial-period.module';
import { FTPModule } from 'src/ftp/ftp.module';

@Module({
  imports: [
    ModbusModule,
    PrinterModule,
    TasksModule,
    TrialModule,
    FTPModule,
    CustomEventEmitterModule,
    forwardRef(() => CodeModule),
  ],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    MonitoringHelperService,
    AppGateway,
    { provide: 'winston', useValue: monitoringLogger },
  ],
  exports: [MonitoringService, MonitoringHelperService],
})
export class MonitoringModule { }
