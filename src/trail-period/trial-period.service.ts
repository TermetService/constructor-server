import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TrialPeriodEntity } from './trial-period.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppGateway } from 'src/app.gateway';
@Injectable()
export class TrialPeriodService implements OnApplicationBootstrap {

  constructor(
    @InjectRepository(TrialPeriodEntity)
    private trialPeriodRepo: Repository<TrialPeriodEntity>,
    private readonly appGateway: AppGateway,
  ) { }

  async onApplicationBootstrap() {
    await this.initializeDefaultTrialPeriod();
    await this.getStatus();
  }

  private async initializeDefaultTrialPeriod() {
    // Проверяем, есть ли вообще какие-либо записи в таблице
    const count = await this.trialPeriodRepo.count();

    // Если таблица пустая (нет записей)
    if (count === 0) {
      // Создаем одну запись с датой начала
      const defaultTrial = new TrialPeriodEntity();
      defaultTrial.startDate = new Date(); // текущая дата
      // defaultTrial.endDate = null; // дата окончания не установлена (NULL)

      await this.trialPeriodRepo.save(defaultTrial);
      console.log('✅ Создана начальная запись пробного периода');
    } else {
      console.log(
        'ℹ️   Запись пробного периода уже существует, пропускаем инициализацию',
      );
    }
  }

  async getStatusforFront() {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: {},
      order: { id: 'DESC' }, // берем последнюю запись
    });
    const now = new Date();
    let isExpired = false;
    console.log(trialPeriod.endDate, '-----------------');
    // Если установлена дата окончания
    if (trialPeriod.endDate && trialPeriod.isTrial) {
      isExpired = now > trialPeriod.endDate;        
      if (isExpired) {
        return {
          message: 'У вас истек пробный переиод ',
          close: true,
        };
      }
    }
    if (Number(trialPeriod.countTime) <= 0 && trialPeriod.isTrial) {
      return {
        message: 'У вас истек пробный переиод ',
        close: true,
      };
    }
    return {
      close: false,
    };
  }

  async getStatus() {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: {},
      order: { id: 'DESC' }, // берем последнюю запись
    });
    const now = new Date();
    let isExpired = false;
    // Если установлена дата окончания
    if (trialPeriod.endDate && trialPeriod.isTrial) {
      isExpired = now > trialPeriod.endDate;
      if (isExpired) {
        // this.fatalExit();
      }
    }
    console.log(
      Number(trialPeriod.countTime) <= 0,
      Number(trialPeriod.countTime),
    );
    if (
      trialPeriod.countTime !== null &&
      Number(trialPeriod.countTime) <= 0 &&
      trialPeriod.isTrial
    ) {
      // this.fatalExit();
    }
  }

  // fatalExit() {
  //   process.exit(1);
  // }

  async setCountTime(time: number) {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: {},
      order: { id: 'DESC' },
    });

    if (trialPeriod) {
      // Прямая установка значения
      await this.trialPeriodRepo.update(trialPeriod.id, {
        countTime: time,
      });
      console.log(`✅ Установлено начальное время: ${time}`);
    }
  }

  async setIsTrial(isTrial: boolean) {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: {},
      order: { id: 'DESC' },
    });

    if (trialPeriod) {
      await this.trialPeriodRepo.update(trialPeriod.id, {
        isTrial: isTrial,
      });
      console.log(`✅ Режим пробного периода: ${isTrial ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`);
    }
  }

  async updateTimeTrial(time: number) {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: { id: 1 },
    });
    if (trialPeriod && trialPeriod.countTime) {
      const newTime = trialPeriod.countTime - time;

      await this.trialPeriodRepo.update(1, {
        countTime: newTime,
      });
    }
  }

  async setEndDate(endDate: Date | string | null) {
    const trialPeriod = await this.trialPeriodRepo.findOne({
      where: {},
      order: { id: 'DESC' },
    });

    if (trialPeriod) {
      let endDateObj = null;

      // Если передан null или пустая строка - очищаем дату окончания
      if (endDate === null || endDate === '') {
        endDateObj = null;
        console.log('✅ Дата окончания очищена');
      } else {
        // Преобразуем строку в Date если нужно
        endDateObj = typeof endDate === 'string' ? new Date(endDate) : endDate;

        // Проверяем валидность даты
        if (isNaN(endDateObj.getTime())) {
          console.log('❌ Некорректная дата');
          throw new Error('Invalid date format');
        }

        console.log(`✅ Установлена дата окончания: ${endDateObj.toLocaleString()}`);
      }

      await this.trialPeriodRepo.update(trialPeriod.id, {
        endDate: endDateObj,
      });
    } else {
      console.log('❌ Запись пробного периода не найдена');
    }
  }
}