import { Module } from '@nestjs/common';
import { NomenclaturesController } from './nomenclatures.controller';
import { NomenclaturesService } from './nomenclatures.service';
import { nomenclaturesLogger } from 'src/logger-winston/winston.config';

@Module({
  controllers: [NomenclaturesController],
  providers: [
    NomenclaturesService,
    { provide: 'winston', useValue: nomenclaturesLogger },
  ],
})
export class NomenclaturesModule {}
