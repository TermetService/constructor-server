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
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const data = await this.settingsService.getFile(filename);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось прочитать файл настроек' });
    }
  }

  @Delete(':filename')
  async deleteFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      await this.settingsService.deleteFile(filename);
      res.json({ message: 'Файл настроек успешно удален' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Файл настроек не найден' });
      } else {
        res.status(500).json({ error: 'Не удалось удалить файл настроек' });
      }
    }
  }

  @Post('create')
  async createFile(@Body() body, @Res() res: Response) {
    const { data } = body;
    try {
      const taskJsonFilePath = await this.settingsService.createFile(
        'settings.json',
        data,
      );
      res.json({
        message: 'JSON file settings created successfully',
        path: taskJsonFilePath,
      });
    } catch (err) {
      res.status(500).json({ error: 'Error creating settings JSON file' });
    }
  }

  @Post('test')
  async test(@Body() body, @Res() res: Response) {
    const { data } = body; // address []
    console.log(data);
    try {
      const result =
        await this.settingsService.writeSingleOrMultipleAddresses(data);
      console.log('Post(test)', result);
      res.status(200).json(result); // Отправка ответа клиенту
    } catch (err) {
      res.status(500).json({ error: `Error test settings ${data}` });
    }
  }
}
