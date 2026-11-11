import { Module } from '@nestjs/common';
import { PrinterService } from './printer.service';
import { AppGateway } from 'src/app.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrinterConfigRepository } from './printer-config.repository';
import { PrinterController } from './printer.controller';
import { PrinterConfig } from './printer-config.entity';
import { printerLogger } from 'src/logger-winston/winston.config';
import { TemplateModule } from 'src/template/template.module';

@Module({
  imports: [TypeOrmModule.forFeature([PrinterConfig]), TemplateModule],
  controllers: [PrinterController],
  providers: [
    PrinterService,
    AppGateway,
    PrinterConfigRepository,
    { provide: 'winston', useValue: printerLogger },
  ],
  exports: [PrinterService],
})
export class PrinterModule {}
