import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ModbusModule } from 'src/modbus/modbus.module';
import { settingsLogger } from 'src/logger-winston/winston.config';

@Module({
  imports: [ModbusModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: 'winston', useValue: settingsLogger },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
