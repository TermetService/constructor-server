// trialPeriod.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { TrialPeriodRepository } from './trialPeriod.repository';
import { TrialPeriodEntity } from './trial-period.entity';
import { AppGateway } from 'src/app.gateway';
import { TrialController } from './trial-period.controller';
import { TrialPeriodService } from './trial-period.service';

@Module({
    imports: [TypeOrmModule.forFeature([TrialPeriodEntity])],
    controllers: [TrialController],
    providers: [TrialPeriodService, AppGateway],
    exports: [TrialPeriodService],
})

export class TrialModule { }
