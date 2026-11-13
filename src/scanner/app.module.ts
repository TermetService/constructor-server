import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { CodeModule } from 'src/code/code.module';
import { ScanerController } from './scanner.controller';
import { AppGateway } from 'src/app.gateway';
import { GatewayModule } from 'src/gateway.moduel';

@Module({
  imports: [CodeModule, GatewayModule],
  providers: [ScannerService],
  exports: [ScannerService],
  controllers: [ScanerController],
})
export class ScannerModule {}
