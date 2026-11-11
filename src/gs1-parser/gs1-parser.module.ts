// src/gs1-parser/gs1-parser.module.ts
import { Module } from '@nestjs/common';
import { Gs1ParserService } from './gs1-parser.service';
import { loggerGS1 } from 'src/logger-winston/winston.config';
import { TemplateModule } from 'src/template/template.module';

@Module({
    imports: [
        TemplateModule
    ],
    providers: [
        Gs1ParserService,
        { provide: 'winston', useValue: loggerGS1 },
    ],
    exports: [Gs1ParserService],
})
export class Gs1ParserModule { }