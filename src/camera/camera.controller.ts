import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { CameraService } from './camera.service';
import { CameraLabels, CameraNames } from 'src/printers/types';

@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  @Post('update-config')
  async updateConfig(
    @Body() body: { name: string; type: string; host: string; port: number },
  ): Promise<void> {
    await this.cameraService.updateCameraConfig(
      body.name,
      body.type,
      body.host,
      body.port,
    );
  }

  @Get(':label')
  async getConfig(@Param('label') label: CameraLabels): Promise<any> {
    try {
      let name = CameraNames.Camera1;
      if (label === CameraLabels.Camera2) {
        name = CameraNames.Camera2;
      } else if (label === CameraLabels.Camera3) {
        name = CameraNames.Camera3;
      } else if (label === CameraLabels.Camera4) {
        name = CameraNames.Camera4;
      }

      return await this.cameraService.getConfigByName(name);
    } catch (err) {
      console.log('get PLC Config', err);
    }
  }

  @Get('status')
  async getCameraStatus(): Promise<any> {
    return this.cameraService.getConnectionStatus();
  }
}
