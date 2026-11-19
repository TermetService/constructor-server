import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { RuntimeFlagsService } from './runtime-flags.service';
import { ModbusModule } from 'src/modbus/modbus.module';
import { settingsLogger } from 'src/logger-winston/winston.config';

@Module({
  imports: [ModbusModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    RuntimeFlagsService,
    { provide: 'winston', useValue: settingsLogger },
  ],
  exports: [SettingsService, RuntimeFlagsService],
})
export class SettingsModule {}
