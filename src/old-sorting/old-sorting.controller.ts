import { Controller, Get, Post, Param, Body, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { OldSortingFilesService } from './old-sorting-files.service';
import { OldSortingService } from './old-sorting.service';
import { IBoxResponse, IPalletResponse } from 'src/code/types';

@Controller('old-sorting')
export class OldSortingController {
  constructor(
    private readonly oldSortingService: OldSortingService,
    private readonly oldSortingFilesService: OldSortingFilesService,
  ) {}

  private defaultLimit = 50;

  @Post('create')
  async createFile(@Body() body, @Res() res: Response) {
    const { rootName, data } = body;
    try {
      const jsonFilePath = await this.oldSortingFilesService.createFile(
        rootName,
        data,
      );
      res.json({
        message: 'JSON file created successfully',
        path: jsonFilePath,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Error creating JSON file' });
    }
  }

  @Get('allBoxes')
  async getAllBoxes(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = this.defaultLimit,
  ): Promise<{ data: IBoxResponse; total: number } | any> {
    console.log('getAllBoxes-----');
    return this.oldSortingService.getAllBoxes(page, limit);
  }

  @Get('allPallets')
  async getAllPallets(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = this.defaultLimit,
  ): Promise<{ data: IPalletResponse; total: number } | any> {
    console.log('getAllPallets-----');
    return this.oldSortingService.getAllPallets(page, limit);
  }

  @Get('pallets/:palletNumber/product-count')
  async getProductCountInPallet(
    @Param('palletNumber') palletNumber: number,
  ): Promise<number | { message: string }> {
    try {
      const count =
        await this.oldSortingService.getProductCountInPallet(palletNumber);
      return count;
    } catch (err) {
      console.error(err);
      return { message: 'Ошибка при получении количества продуктов в паллете' };
    }
  }

  @Post('start-label')
  async startLabel(@Body() body, @Res() res: Response) {
    const { fileName } = body;
    try {
      const response = await this.oldSortingService.startLabel(fileName);
      res.json({ response });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Error old label starting' });
    }
  }

  @Post('stop-label')
  async stopLabel(@Res() res: Response) {
    try {
      const response = await this.oldSortingService.stopLabel();
      res.json({ response });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Error old label stoping' });
    }
  }

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const data = await this.oldSortingFilesService.getFile(filename);
      res.json(data);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Не удалось прочитать файл' });
    }
  }

  @Get()
  async getFiles(@Res() res: Response) {
    try {
      const files = await this.oldSortingFilesService.getFiles();
      res.json(files);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Не удалось получить список файлов' });
    }
  }
}
