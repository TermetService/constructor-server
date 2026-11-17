import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';
import { PrinterService } from 'src/printers/printer.service';
import { TemplateService } from 'src/template/template.service';

/**
 * Закрытие коробки/паллеты и печать их этикеток.
 * Код этикетки формируется шаблоном задания и сохраняется в таблицу,
 * чтобы потом попасть в отчёт.
 */
@Injectable()
export class CodeLabelsService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly templateService: TemplateService,
    private readonly printerService: PrinterService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** Код коробки по шаблону задания (пока заглушка, как и раньше) */
  async getFullBoxCode(boxNumber: number, countInBox: number): Promise<string> {
    return 'close';
  }

  /** Код паллеты по шаблону задания */
  async getFullPalletCode(
    palletNumber: number,
    countInPallet: number,
    productCountInPallet: number,
  ): Promise<string> {
    return 'ss';
  }

  /**
   * Формирует код этикетки коробки и записывает его в box_label.
   * Ничего не печатает.
   */
  async bindBoxLabel(box_number, label) {
    await this.entityManager.query(
      `UPDATE "${this.globalMonVar.tableName}"
       SET box_label = $1
       WHERE box_number = $2 AND box_label IS NULL`,
      [label, box_number],
    );
  }

  async assignBoxLabel(boxNumber: number, countInBox: number): Promise<string> {
    const boxLabel = await this.getFullBoxCode(boxNumber, countInBox);

    await this.entityManager.query(
      `UPDATE "${this.globalMonVar.tableName}"
       SET box_label = $1
       WHERE box_number = $2 AND box_label IS NULL`,
      [boxLabel, boxNumber],
    );

    this.logger.info(
      `Авто: коробка ${boxNumber} закрыта (${countInBox} кодов), label: ${boxLabel}`,
    );

    return boxLabel;
  }

  /** Печатает этикетку коробки. В таблицу ничего не пишет. */
  async printBoxLabel(
    boxNumber: number,
    countInBox: number,
    cameraName?: string,
  ): Promise<void> {
    await this.printerService.printBoxLabel(boxNumber, countInBox, cameraName);
  }

  /** Записывает код этикетки коробки в таблицу и печатает её */
  async closeAutoBoxAndPrint(
    boxNumber: number,
    countInBox: number,
    cameraName?: string,
  ): Promise<void> {
    try {
      await this.assignBoxLabel(boxNumber, countInBox);
      await this.printBoxLabel(boxNumber, countInBox, cameraName);
    } catch (err) {
      this.logger.error(
        `Авто: ошибка при закрытии/печати коробки ${boxNumber}: ${err.message}`,
        err,
      );
    }
  }

  /** Записывает код этикетки паллеты в таблицу и печатает её */
  async closeAutoPalletAndPrint(
    palletNumber: number,
    countInBoxesInPallet: number,
  ): Promise<void> {
    try {
      const countResult = await this.entityManager.query(
        `SELECT COUNT(*) AS count FROM "${this.globalMonVar.tableName}" WHERE pallet_number = $1`,
        [palletNumber],
      );
      const productCountInPallet = Number(countResult[0]?.count) || 0;

      const palletLabel = await this.getFullPalletCode(
        palletNumber,
        countInBoxesInPallet,
        productCountInPallet,
      );

      await this.entityManager.query(
        `UPDATE "${this.globalMonVar.tableName}"
         SET pallet_label = $1
         WHERE pallet_number = $2 AND pallet_label IS NULL`,
        [palletLabel, palletNumber],
      );

      this.logger.info(
        `Авто: паллета ${palletNumber} закрыта (${countInBoxesInPallet} коробок, ${productCountInPallet} кодов), label: ${palletLabel}`,
      );

      await this.printerService.printPalletLabel(
        palletNumber,
        countInBoxesInPallet,
        productCountInPallet,
      );
    } catch (err) {
      this.logger.error(
        `Авто: ошибка при закрытии/печати паллеты ${palletNumber}: ${err.message}`,
        err,
      );
    }
  }
}
