import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';
import { codeLogger } from 'src/logger-winston/winston.config';
import { Gs1ParserService } from 'src/gs1-parser/gs1-parser.service';
import { SearchFrom } from 'src/gs1-parser/interfaces/gs1.types';
import { BoxLabelRepository } from './box-label.repository';

export enum BoxLabelCheck {
  CodesRecognized = 'codesRecognized',
  HasProductCodes = 'hasProductCodes',
  SingleBoxLabel = 'singleBoxLabel',
  BoxLabelValid = 'boxLabelValid',
  TableExists = 'tableExists',
  LabelNotUsed = 'labelNotUsed',
  ProductsExist = 'productsExist',
  SameBox = 'sameBox',
  BoxNumberDefined = 'boxNumberDefined',
  LabelNotForBox = 'labelNotForBox',
}

export interface IBoxLabelCheckResult {
  code: BoxLabelCheck;
  ok: boolean;
  message?: string;
}

export interface IBoxLabelCheckReport {
  /** Можно ли назначать box_label */
  ok: boolean;
  /** Первая причина отказа (для оператора) */
  reason?: string;
  boxLabel: string | null;
  boxNumber: number | null;
  palletNumber: number | null;
  productCodes: string[];
  checks: IBoxLabelCheckResult[];
}

interface ISplitResult {
  productCodes: string[];
  boxCodes: {
    code: string;
    isValid?: boolean;
    validationMessage?: string;
  }[];
  unknownCodes: string[];
}

/**
 * Проверки перед назначением box_label коробке.
 *
 * Взяты из CodeBindService.processBindingBox, но без печати, паллет,
 * счётчиков и событий: сервис только решает, можно ли вешать этикетку,
 * и возвращает, на какую коробку и с какими продуктами.
 */
@Injectable()
export class BoxLabelCheckService {
  constructor(
    private readonly repository: BoxLabelRepository,
    private readonly gs1ParserService: Gs1ParserService,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  async check(codes: string[]): Promise<IBoxLabelCheckReport> {
    const checks: IBoxLabelCheckResult[] = [];
    const report = (
      reason: string | undefined,
      partial: Partial<IBoxLabelCheckReport> = {},
    ): IBoxLabelCheckReport => ({
      ok: !reason,
      reason,
      boxLabel: null,
      boxNumber: null,
      palletNumber: null,
      productCodes: [],
      checks,
      ...partial,
    });

    const { productCodes, boxCodes, unknownCodes } =
      await this.splitCodesByType(codes);

    checks.push(
      this.result(
        BoxLabelCheck.CodesRecognized,
        unknownCodes.length === 0,
        `Коды не распознаны: ${this.shortenCodes(unknownCodes)}`,
      ),
    );
    if (unknownCodes.length) {
      return report(`Коды не распознаны: ${this.shortenCodes(unknownCodes)}`, {
        productCodes,
      });
    }

    checks.push(
      this.result(
        BoxLabelCheck.HasProductCodes,
        productCodes.length >= 1,
        'Нет кодов продуктов с допустимой длиной',
      ),
    );
    if (productCodes.length < 1) {
      return report('Нет кодов продуктов с допустимой длиной', {
        productCodes,
      });
    }

    checks.push(
      this.result(
        BoxLabelCheck.SingleBoxLabel,
        boxCodes.length === 1,
        'Должен быть один код коробки',
      ),
    );
    if (boxCodes.length !== 1) {
      return report('Должен быть один код коробки', { productCodes });
    }

    const boxLabel = boxCodes[0].code;
    const isDevelop = process.env.IS_DEVELOP === 'true';

    checks.push(
      this.result(
        BoxLabelCheck.BoxLabelValid,
        isDevelop || boxCodes[0].isValid !== false,
        `Этикетка коробки не соответствует заданию: ${
          boxCodes[0].validationMessage || 'неверный формат'
        }`,
      ),
    );
    if (!isDevelop && boxCodes[0].isValid === false) {
      return report(
        `Этикетка коробки не соответствует заданию: ${
          boxCodes[0].validationMessage || 'неверный формат'
        }`,
        { boxLabel, productCodes },
      );
    }

    const tableName = this.globalMonVar.tableName;
    const tableExists = await this.repository.tableExists(tableName);

    checks.push(
      this.result(
        BoxLabelCheck.TableExists,
        tableExists,
        `Таблица ${tableName} не существует в базе данных`,
      ),
    );
    if (!tableExists) {
      return report(`Таблица ${tableName} не существует в базе данных`, {
        boxLabel,
        productCodes,
      });
    }

    const labelUsed = await this.repository.isLabelUsed(tableName, boxLabel);

    checks.push(
      this.result(
        BoxLabelCheck.LabelNotUsed,
        !labelUsed,
        'Этикетка коробки уже существует в базе данных',
      ),
    );
    if (labelUsed) {
      return report('Этикетка коробки уже существует в базе данных', {
        boxLabel,
        productCodes,
      });
    }

    const productRows = await this.repository.findCodesByList(
      tableName,
      productCodes,
    );
    const foundCodes = new Set(productRows.map((row) => row.code));
    const missingCodes = productCodes.filter((code) => !foundCodes.has(code));

    checks.push(
      this.result(
        BoxLabelCheck.ProductsExist,
        missingCodes.length === 0,
        `Коды не найдены в системе: ${this.shortenCodes(missingCodes)}`,
      ),
    );
    if (missingCodes.length) {
      return report(
        `Коды не найдены в системе: ${this.shortenCodes(missingCodes)}`,
        { boxLabel, productCodes },
      );
    }

    const boxNumbers = [
      ...new Set(productRows.map((row) => Number(row.box_number))),
    ];

    checks.push(
      this.result(
        BoxLabelCheck.SameBox,
        boxNumbers.length === 1,
        `Коды продуктов из разных коробок: ${boxNumbers
          .map((number) => `#${number}`)
          .join(', ')}`,
      ),
    );
    if (boxNumbers.length !== 1) {
      return report(
        `Коды продуктов из разных коробок: ${boxNumbers
          .map((number) => `#${number}`)
          .join(', ')}`,
        { boxLabel, productCodes },
      );
    }

    const [boxNumber] = boxNumbers;
    const boxNumberDefined = Number.isFinite(boxNumber) && boxNumber > 0;

    checks.push(
      this.result(
        BoxLabelCheck.BoxNumberDefined,
        boxNumberDefined,
        'У кодов продукта не определена коробка',
      ),
    );
    if (!boxNumberDefined) {
      return report('У кодов продукта не определена коробка', {
        boxLabel,
        productCodes,
      });
    }

    const labelForBox = await this.repository.findLabelForBox(
      tableName,
      boxLabel,
      boxNumber,
    );

    checks.push(
      this.result(
        BoxLabelCheck.LabelNotForBox,
        labelForBox.length === 0,
        'Этикетка коробки уже существует в базе данных',
      ),
    );
    if (labelForBox.length > 0) {
      return report('Этикетка коробки уже существует в базе данных', {
        boxLabel,
        boxNumber,
        productCodes,
      });
    }

    const palletNumber = Number(productRows[0].pallet_number);

    return report(undefined, {
      boxLabel,
      boxNumber,
      palletNumber:
        Number.isFinite(palletNumber) && palletNumber > 0 ? palletNumber : null,
      productCodes,
    });
  }

  /** Разбивает коды скана на продукты, этикетку коробки и неизвестные */
  async splitCodesByType(codes: string[]): Promise<ISplitResult> {
    const productCodes: string[] = [];
    const boxCodes: ISplitResult['boxCodes'] = [];
    const unknownCodes: string[] = [];

    const normalizedCodes = (codes ?? [])
      .map((code) => code.replace(/^\x1D/, '').trim())
      .filter((code) => code.length > 14);

    for (const code of normalizedCodes) {
      const parsed = await this.gs1ParserService.getContainerNumber(code);

      if (!parsed) {
        unknownCodes.push(code);
        continue;
      }

      const { type, isValid, validationMessage } = parsed;

      if (type === SearchFrom.Code) {
        productCodes.push(code);
      } else if (type === SearchFrom.Box) {
        boxCodes.push({ code, isValid, validationMessage });
      } else {
        unknownCodes.push(code);
      }
    }

    return { productCodes, boxCodes, unknownCodes };
  }

  private result(
    code: BoxLabelCheck,
    ok: boolean,
    message: string,
  ): IBoxLabelCheckResult {
    return { code, ok, message: ok ? undefined : message };
  }

  private shortenCodes(codes: string[]): string {
    const head = codes.slice(0, 3).join(', ');

    return codes.length > 3 ? `${head} …` : head;
  }
}
