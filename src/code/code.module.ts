import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeController } from './code.controller';
import { CodeEntity } from './code.entity';
import { CodeService } from './code.service';
import { CustomEventEmitterModule } from 'src/EventEmitterModule';
import { MonitoringModule } from 'src/monitoring/monitoring.module';
import { codeLogger } from 'src/logger-winston/winston.config';
import { AppGateway } from 'src/app.gateway';
import { TemplateModule } from 'src/template/template.module';
import { PrinterModule } from 'src/printers/printer.module';
import { CodeHelperService } from './code-helper.service';
import { IMonitoringVariables } from 'src/globalTypes';
import { CodeSearchService } from './code-search.service';
import { CodeMigrationService } from './code-migration.service';
import { CodeRepository } from './code.repository';
import { Gs1ParserModule } from 'src/gs1-parser/gs1-parser.module';
import { numberBoxETEModule } from 'src/NumberBoxETE/numberBoxETE.module';
import { GatewayModule } from 'src/gateway.moduel';
import { HandOperation } from './hand-operation.service';
import { CodeTablesService } from './helpers/code-tables.service';
import { CodeCountsService } from './helpers/code-counts.service';
import { CodeSaveService } from './helpers/code-save.service';
import { CodeLabelsService } from './helpers/code-labels.service';
import { CodeReportsService } from './helpers/code-reports.service';
import { CodeScanService } from './helpers/code-scan.service';
import { CodeWeightsService } from './helpers/code-weights.service';
import { CodeRemoteService } from './helpers/code-remote.service';
import { CodeLayersService } from './helpers/code-layers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CodeEntity]),
    CustomEventEmitterModule,
    TemplateModule,
    Gs1ParserModule,
    PrinterModule,
    numberBoxETEModule,
    forwardRef(() => MonitoringModule),
    GatewayModule,
  ],
  controllers: [CodeController],
  providers: [
    CodeService,
    CodeRepository,
    CodeHelperService,
    CodeSearchService,
    CodeMigrationService,
    CodeTablesService,
    CodeCountsService,
    CodeSaveService,
    CodeLabelsService,
    CodeReportsService,
    CodeScanService,
    CodeWeightsService,
    CodeRemoteService,
    CodeLayersService,
    HandOperation,
    { provide: 'winston', useValue: codeLogger },
  ],
  exports: [
    CodeService,
    CodeRepository,
    CodeHelperService,
    CodeSearchService,
    CodeMigrationService,
  ],
})
export class CodeModule {}
