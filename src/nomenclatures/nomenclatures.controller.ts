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
import { NomenclaturesService } from './nomenclatures.service';

@Controller('nomenclatures')
export class NomenclaturesController {
  constructor(private readonly nomenclaturesService: NomenclaturesService) {}

  @Get()
  async getFiles(@Res() res: Response) {
    try {
      const files = await this.nomenclaturesService.getFiles();
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось получить список файлов' });
    }
  }

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const data = await this.nomenclaturesService.getFile(filename);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось прочитать файл' });
    }
  }

  @Delete(':filename')
  async deleteFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      await this.nomenclaturesService.deleteFile(filename);
      res.json({ message: 'Файл успешно удален' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Файл не найден' });
      } else {
        res.status(500).json({ error: 'Не удалось удалить файл' });
      }
    }
  }

  @Post('create')
  async createFile(@Body() body, @Res() res: Response) {
    const { rootName, data } = body;
    try {
      const jsonFilePath = await this.nomenclaturesService.createFile(
        rootName,
        data,
      );
      res.json({
        message: 'JSON file created successfully',
        path: jsonFilePath,
      });
    } catch (err) {
      res.status(500).json({ error: 'Error creating JSON file' });
    }
  }
}
