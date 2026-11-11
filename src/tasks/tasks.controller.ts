import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getFiles(@Res() res: Response) {
    try {
      const files = await this.tasksService.getFiles();
      res.json(files);
    } catch (err) {
      res
        .status(500)
        .json({ error: 'Не удалось получить список файлов заданий' });
    }
  }

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const data = await this.tasksService.getFile(filename);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось прочитать файл задания' });
    }
  }

  @Delete(':filename')
  async deleteFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      await this.tasksService.deleteFile(filename);
      res.json({ message: 'Файл задания успешно удален' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Файл задания не найден' });
      } else {
        res.status(500).json({ error: 'Не удалось удалить файл задания' });
      }
    }
  }

  @Post('create')
  async createFile(@Body() body, @Res() res: Response) {
    const { rootName, data } = body;
    // console.log(rootName, data);

    try {
      const taskJsonFilePath = await this.tasksService.createFile(
        rootName,
        data,
      );
      res.json({
        message: 'JSON file created successfully',
        path: taskJsonFilePath,
      });
    } catch (err) {
      res.status(500).json({ error: 'Error creating JSON file' });
    }
  }
}
