import { Repository } from 'typeorm';
import { TrialPeriodEntity } from './trial-period.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrialPeriodRepository extends Repository<TrialPeriodEntity> { }
