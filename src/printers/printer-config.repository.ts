import { Repository } from 'typeorm';
import { PrinterConfig } from './printer-config.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PrinterConfigRepository extends Repository<PrinterConfig> {}
