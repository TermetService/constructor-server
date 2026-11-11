import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateRequest } from './types';

@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post('save')
  async create(@Body() data: TemplateRequest): Promise<any> {
    return this.templateService.saveTemplate(data);
  }

  @Get()
  async getAll(): Promise<any> {
    return this.templateService.getAll();
  }
}
