import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CameraConfig } from './camera-config.entity';
import { AppGateway } from 'src/app.gateway';
import { CameraConfigRepository } from './camera-config.repository';
import { cameraLogger } from 'src/logger-winston/winston.config';
import { CameraService } from './camera.service';
import { CameraController } from './camera.controller';
import { CodeModule } from 'src/code/code.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CameraConfig]),
    forwardRef(() => CodeModule),
  ],
  controllers: [CameraController],
  providers: [
    CameraService,
    AppGateway,
    CameraConfigRepository,
    { provide: 'winston', useValue: cameraLogger },
  ],
  exports: [CameraService],
})
export class CameraModule {}
