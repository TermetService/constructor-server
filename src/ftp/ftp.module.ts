// src/gs1-parser/gs1-parser.module.ts
import { Module } from '@nestjs/common';
import { loggerFTP } from 'src/logger-winston/winston.config';
import { TemplateModule } from 'src/template/template.module';
import { FTPService } from './ftp.service';

@Module({
    providers: [
        FTPService,
        { provide: 'winston', useValue: loggerFTP },
    ],
    exports: [FTPService],
})
export class FTPModule { }