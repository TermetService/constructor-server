import { Module } from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { AppGateway } from 'src/app.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModbusConfigRepository } from './modbus-config.repository';
import { ModbusController } from './modbus.controller';
import { ModbusConfig } from './modbus-config.entity';
import { modbusLogger } from 'src/logger-winston/winston.config';

@Module({
  imports: [TypeOrmModule.forFeature([ModbusConfig])], // Здесь только сущность
  controllers: [ModbusController],
  providers: [
    ModbusService,
    AppGateway,
    ModbusConfigRepository,
    { provide: 'winston', useValue: modbusLogger },
  ],
  exports: [ModbusService],
})
export class ModbusModule {}
