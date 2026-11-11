import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { numberBoxETE } from './numberBoxETE.entity';
import { Repository } from 'typeorm';

@Injectable()
export class NumberBoxETEService {
  constructor(
    @InjectRepository(numberBoxETE)
    private numberBoxETERepo: Repository<numberBoxETE>,
  ) {}

  async AddNoteAndTook(gtin: any, DateTask: any): Promise<number> {
    const result = await this.numberBoxETERepo.findOne({
      where: { gtin, DateTask },
    });
    if (result === null) {
      const data = this.numberBoxETERepo.create({
        gtin: gtin,
        BoxNumber: 0,
        DateTask: DateTask,
      });
      const saveBox = await this.numberBoxETERepo.save(data);
      return saveBox.BoxNumber;
    } else {
      return result.BoxNumber;
    }
  }

  async UpdateBoxNumber(gtin, BoxNumber, DateTask) {
    await this.numberBoxETERepo.update(
      { gtin: gtin, DateTask: DateTask }, // Условие поиска
      {
        BoxNumber: BoxNumber,
      },
    );
  }
}
