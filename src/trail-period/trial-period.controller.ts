// trail-period.controller.ts
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { TrialPeriodService } from './trial-period.service';
@Controller('trial')
export class TrialController {
    constructor(private readonly trialPeriodService: TrialPeriodService) { }
    
    @Get()
    async getStatus() {
        try {
            const data = await this.trialPeriodService.getStatusforFront();
            console.log(data);
            return data;
        } catch (err) { }
    }

    @Post('update-time')
    async updateTrailTime(@Body() body) {
        const { time } = body;
        this.trialPeriodService.updateTimeTrial(time);
    }

    @Post('set-time')
    async setTime(@Body() body) {
        const { time } = body;
        await this.trialPeriodService.setCountTime(time);
    }

    @Post('set-is-trial')
    async setIsTrial(@Body() body) {
        const { isTrial } = body;
        await this.trialPeriodService.setIsTrial(isTrial);
    }

    @Post('set-end-date')
    async setEndDate(@Body() body) {
        const { endDate } = body;
        await this.trialPeriodService.setEndDate(endDate);
    }
}