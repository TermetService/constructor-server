import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { tasksLogger } from 'src/logger-winston/winston.config';

@Module({
  controllers: [TasksController],
  providers: [TasksService, { provide: 'winston', useValue: tasksLogger }],
  exports: [TasksService],
})
export class TasksModule {}
