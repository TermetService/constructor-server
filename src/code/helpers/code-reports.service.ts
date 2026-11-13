import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { join } from 'path';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';
import { getRecordsTextFilesDirectory } from 'src/path.util';
import { TemplateService } from 'src/template/template.service';
import { CodeRepository } from '../code.repository';
import { generateJSONTemplate, generatePasteckJSONTemplate } from '../helper';
import {
  Hierarchy,
  IBox,
  IPallet,
  IRecords,
  Pallet,
  SearchFrom,
} from '../types';

/**
 * Отчёты для 1С/«Термет» и служебный txt-файл с кодами.
 */
@Injectable()
export class CodeReportsService {
  private readonly recordsTextDirectory = getRecordsTextFilesDirectory();

  constructor(
    private readonly entityManager: EntityManager,
    private readonly codeRepository: CodeRepository,
    private readonly templateService: TemplateService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** Шапка отчёта Databy */
  createReportHeaderDataby() {
    const task = this.globalMonVar.task;

    return {
      ExporterCode: 0,
      Code: 0,
      ClaimNumber: 0,
      PartnerCode: null,
      MarkTemplateCode: 0,
      LineCode: 2,
      StartTime: '2025-08-13T09:27:10',
      CloseTime: '2025-08-14T01:11:27',
      Attributes: [
        { IsMarkReport: false, Code: 4, Value: task.gtin },
        { IsMarkReport: false, Code: 5, Value: task.ITF14 || task.gtin || null },
        { IsMarkReport: false, Code: 1, Value: task.batch },
        { IsMarkReport: false, Code: 2, Value: this.formatDate(task.date_manufacture) },
        { IsMarkReport: false, Code: 3, Value: this.formatDate(task.date_expiration) },
      ],
    };
  }

  /** DD.MM.YYYY → YYYY-MM-DD */
  formatDate(inputDate: string): string {
    const parts = inputDate.split('.');
    if (parts.length !== 3) {
      throw new Error('Неверный формат даты. Ожидается: DD.MM.YYYY');
    }

    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  /** Иерархия паллета → коробка → коды для отчёта Databy */
  async getReportDataby() {
    const { boxTemplate, palletTemplate } = await this.loadTemplates();
    const task = this.globalMonVar.task;
    const tableName = this.globalMonVar.tableName;

    const columns: { column_name: string }[] = await this.entityManager.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1`,
      [tableName],
    );
    const columnNames = new Set(columns.map((c) => c.column_name));

    const boxLabel = columnNames.has('box_label')
      ? 'box_label'
      : 'NULL AS box_label';
    const palletLabel = columnNames.has('pallet_label')
      ? 'pallet_label'
      : 'NULL AS pallet_label';

    const allCodes = await this.entityManager.query(
      `SELECT id, code, box_number, ${boxLabel}, pallet_number, ${palletLabel}
       FROM "${tableName}"`,
    );

    const palletCounts: { pallet_number: number; count: string }[] =
      await this.entityManager.query(`
        SELECT pallet_number, COUNT(*) AS count
        FROM "${tableName}"
        WHERE pallet_number IS NOT NULL
        GROUP BY pallet_number
      `);

    const palletCountMap = new Map<number, number>(
      palletCounts.map((row) => [row.pallet_number, Number(row.count)]),
    );

    await this.writeCodesFileSafely(allCodes.map((row) => row.code));

    const hierarchy: Hierarchy = {};

    for (const row of allCodes) {
      const palletNumber = row.pallet_number;
      const productCountInPallet = palletCountMap.get(palletNumber) || 0;

      hierarchy[palletNumber] ??= {
        Barcode:
          row.pallet_label ||
          generatePasteckJSONTemplate(
            palletTemplate,
            task,
            palletNumber,
            productCountInPallet,
          ),
        Level: 2,
        NumberInTask: palletNumber,
        Weight: null,
        ChildBarcodes: {},
      };

      const boxNumber = row.box_number;

      hierarchy[palletNumber].ChildBarcodes[boxNumber] ??= {
        Barcode:
          row.box_label ||
          generatePasteckJSONTemplate(boxTemplate, task, boxNumber, 0),
        Level: 1,
        NumberInTask: boxNumber,
        Weight: null,
        ChildBarcodes: [],
      };

      hierarchy[palletNumber].ChildBarcodes[boxNumber].ChildBarcodes.push({
        Barcode: row.code,
        Level: 0,
        NumberInTask: row.id,
        Weight: null,
        ChildBarcodes: [],
      });
    }

    return Object.values(hierarchy).map((pallet: Pallet) => ({
      Barcode: pallet.Barcode,
      Level: pallet.Level,
      NumberInTask: pallet.NumberInTask,
      Weight: pallet.Weight,
      ChildBarcodes: Object.values(pallet.ChildBarcodes),
    }));
  }

  /** Коробки и паллеты для отчёта «Термет» */
  async getReportTermet(isTrailEnd?: boolean): Promise<IRecords> {
    const { boxTemplate, palletTemplate } = await this.loadTemplates();
    const task = this.globalMonVar.task;

    const records = await this.codeRepository.getAllRecords(
      this.globalMonVar.tableName,
    );

    if (!isTrailEnd) {
      await this.writeCodesFileSafely(records.map((record) => record.code));
    }

    const boxesMap: Record<string, IBox> = {};
    const palletsMap: Record<string, IPallet> = {};
    const palletCodeCounts: Record<string, number> = {};

    for (const record of records) {
      const { code, box_number, pallet_number } = record;

      boxesMap[box_number] ??= {
        name: generateJSONTemplate(boxTemplate, task, box_number, 0),
        products: [],
      };
      boxesMap[box_number].products.push(code);

      palletCodeCounts[pallet_number] = (palletCodeCounts[pallet_number] || 0) + 1;

      palletsMap[pallet_number] ??= {
        name: generateJSONTemplate(
          palletTemplate,
          task,
          pallet_number,
          palletCodeCounts[pallet_number],
        ),
        boxes: [],
      };
    }

    for (const boxNumber of Object.keys(boxesMap)) {
      const box = boxesMap[boxNumber];
      box.name = generateJSONTemplate(
        boxTemplate,
        task,
        Number(boxNumber),
        box.products.length,
      );

      const palletNumber = records.find(
        (record) => record.box_number === Number(boxNumber),
      )?.pallet_number;

      if (!palletNumber || !palletsMap[palletNumber]) continue;

      if (!palletsMap[palletNumber].boxes.includes(box.name)) {
        palletsMap[palletNumber].boxes.push(box.name);
        palletsMap[palletNumber].name = generateJSONTemplate(
          palletTemplate,
          task,
          Number(palletNumber),
          palletCodeCounts[palletNumber],
        );
      }
    }

    return {
      boxes: Object.values(boxesMap).sort(
        (a, b) => Number(a.name) - Number(b.name),
      ),
      pallets: Object.values(palletsMap).sort(
        (a, b) => Number(a.name) - Number(b.name),
      ),
    };
  }

  /** Как искать отсканированный код: по коду, коробке или паллете */
  getSearchType(code: string): SearchFrom {
    const codeSuffix = code.substring(16, 18);
    const startSuffix = code.substring(0, 2);

    if (codeSuffix === '21') return SearchFrom.Code;
    if (startSuffix === '01') return SearchFrom.Box;
    if (startSuffix === '02') return SearchFrom.Pallet;
  }

  /** Пишет коды в `<table>_codes.txt`; пустой список — просто пропускает */
  async createCodesTextFile(codes: string[]): Promise<void> {
    if (!codes?.length) {
      this.logger.warn('Код: Нет данных для записи в файл');
      return;
    }

    try {
      if (!fs.existsSync(this.recordsTextDirectory)) {
        fs.mkdirSync(this.recordsTextDirectory, { recursive: true });
        this.logger.info(
          `Код: Директория создана: ${this.recordsTextDirectory}`,
        );
      }

      const filePath = join(
        this.recordsTextDirectory,
        `${this.globalMonVar.tableName}_codes.txt`,
      );

      await fs.promises.writeFile(filePath, codes.join('\n'));
      this.logger.info(`Код: Файл с кодами успешно создан: ${filePath}`);
    } catch (error) {
      this.logger.error('Код: Ошибка при создании файла с кодами', error);
      throw error;
    }
  }

  private async writeCodesFileSafely(codes: string[]): Promise<void> {
    try {
      await this.createCodesTextFile(codes);
    } catch (error) {
      this.logger.error(
        'Код: Продолжаем работу несмотря на ошибку создания файла с кодами',
        error,
      );
    }
  }

  private async loadTemplates(): Promise<{
    boxTemplate: string[];
    palletTemplate: string[];
  }> {
    const templates = await this.templateService.getAll();

    return {
      boxTemplate: templates?.find((el) => el.type === 'box')?.template || [],
      palletTemplate:
        templates?.find((el) => el.type === 'pallet')?.template || [],
    };
  }
}
