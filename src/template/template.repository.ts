import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Templates } from './template.entity';

@Injectable()
export class TemplatesRepository extends Repository<Templates> {}
