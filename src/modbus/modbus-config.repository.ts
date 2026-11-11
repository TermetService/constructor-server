import { Repository } from 'typeorm';
import { ModbusConfig } from './modbus-config.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ModbusConfigRepository extends Repository<ModbusConfig> {
  // Дополнительные методы, если необходимо
}
