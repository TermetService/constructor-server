import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Templates } from './template.entity';
import { templateLogger } from 'src/logger-winston/winston.config';
import { TemplatesRepository } from './template.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Templates])],
  providers: [
    TemplateService,
    { provide: 'winston', useValue: templateLogger },
  ],
  controllers: [TemplateController],
  exports: [TemplateService],
})
export class TemplateModule {}
