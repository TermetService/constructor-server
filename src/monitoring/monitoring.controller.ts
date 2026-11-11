import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { IIsUnfinishedTask, IMonitoringStatus } from './types';

@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('start')
  async startMonitoring(@Body() body, @Res() res) {
    const { taskName } = body;
    try {
      console.log('=========================startMonitoring');
      const tableName = await this.monitoringService.startMonitoring(taskName);
      res.send({ message: 'начало', tableName });
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при начале мониторинга');
    }
  }

  @Post('start-old-sorting')
  async startOldSorting(@Body() body, @Res() res) {
    const { taskName } = body;
    try {
      console.log('=========================startOldSorting');
      const tableName = await this.monitoringService.startOldSorting(taskName);
      res.send({ message: 'Досортировка', tableName });
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при начале старой сортировки');
    }
  }

  @Post('stop')
  async stopMonitoring() {
    console.log('=========================stop');
    return await this.monitoringService.stopMonitoring();
  }

  @Post('pause')
  async pauseMonitoring() {
    console.log('=========================pause');
    return await this.monitoringService.pauseMonitoring();
  }

  @Post('continued')
  async continuedMonitoring() {
    console.log('=========================continued');
    return await this.monitoringService.continuedMonitoring();
  }

  @Get('status') getMonitoringStatus(): IMonitoringStatus {
    return this.monitoringService.getMonitoringStatus();
  }

  @Get('is-unfinished-task')
  async getIsUnfinishedTask(): Promise<IIsUnfinishedTask> {
    return await this.monitoringService.checkIsUnfinishedTask();
  }
}
