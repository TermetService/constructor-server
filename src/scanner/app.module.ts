import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { CodeModule } from 'src/code/code.module';
import { ScanerController } from './scanner.controller';
import { AppGateway } from 'src/app.gateway';

@Module({
  imports: [CodeModule],
  providers: [ScannerService, AppGateway],
  exports: [ScannerService],
  controllers: [ScanerController],
})
export class ScannerModule {}
