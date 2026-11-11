import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Templates } from './template.entity';
import { Repository } from 'typeorm';
import { TemplateRequest } from './types';
import { Logger } from 'winston';
import { templateLogger } from 'src/logger-winston/winston.config';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,
    @Inject('winston') private readonly logger: Logger = templateLogger,
  ) {}

  async saveTemplate(data: TemplateRequest): Promise<any> {
    try {
      this.logger.info(`Шаблон: Сохранение шаблона с типом: ${data.type}`);
      const existingTemplate = await this.templateRepository.findOne({
        where: { type: data.type },
      });

      if (existingTemplate) {
        this.logger.info(
          `Шаблон: Обновление существующего шаблона с типом: ${data.type}`,
        );
        existingTemplate.template = data.template;
        return await this.templateRepository.save(existingTemplate);
      } else {
        this.logger.info(
          `Шаблон: Создание нового шаблона с типом: ${data.type}`,
        );
        const newTemplate = this.templateRepository.create(data);
        return await this.templateRepository.save(newTemplate);
      }
    } catch (err) {
      this.logger.error(`Ошибка при сохранении шаблона ${data.type}`);
    }
  }

  async getAll(): Promise<any[]> {
    try {
      const templates = await this.templateRepository.find();
      this.logger.info(`Шаблон: Найдено ${templates.length} шаблонов`);
      return templates;
    } catch (err) {
      this.logger.error('Ошибка при полученаии всех шаблонов');
    }
  }

  async getBoxTemplate(): Promise<any[] | null> {
    const templates = await this.getAll();
    const boxTemplate =
      templates.find((el) => el.type === 'box')?.template || null;
    if (!boxTemplate) {
      this.logger.warn('Шаблон для коробки не найден');
    }
    return boxTemplate;
  }

  async getPalletTemplate(): Promise<any[] | null> {
    const templates = await this.getAll();
    const palletTemplate =
      templates.find((el) => el.type === 'pallet')?.template || null;
    if (!palletTemplate) {
      this.logger.warn('Шаблон для паллеты не найден');
    }
    return palletTemplate;
  }
}
