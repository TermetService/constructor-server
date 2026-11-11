import { Module } from '@nestjs/common';
import { FileService1S } from './files1s.service';
import { FileController1S } from './files1s.controller';
import { logger1S } from 'src/logger-winston/winston.config';

@Module({
  providers: [FileService1S, { provide: 'winston', useValue: logger1S }],
  controllers: [FileController1S],
})
export class FileModule1S {}
