import { Inject, Injectable, Optional } from '@nestjs/common';
import { Logger } from 'winston';
import { IMonitoringVariables } from 'src/globalTypes';
import { SearchFrom } from '../types';

export interface IParseResult {
  barcod?: string;
  barCod?: string;
  qrCod?: string;
  brutto_weight?: string;
  parse: boolean;
  message?: string;
}

/**
 * Разбор сырых данных сканера/камеры.
 *
 * Камера присылает один или два кода через `@`: обычный GS1-код (01…21…)
 * и QR с весом. Здесь только чистая логика разбора — без БД и железа.
 */
@Injectable()
export class CodeScanService {
  constructor(
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
    @Optional()
    @Inject('IS_USING_API')
    private readonly isUsingApi: () => boolean = () =>
      process.env.IS_USING_API === 'true',
  ) {}

  getApiStatus(): { isUsingApi: boolean } {
    return { isUsingApi: this.isUsingApi() };
  }

  /** Разбирает строку от камеры в баркод + QR + вес брутто */
  ParseCode(codes: string): IParseResult {
    const usingApi = this.getApiStatus().isUsingApi;
    const codesArr = codes
      .split('@')
      .map((el) => el.replace(/^[\s\t\r\n]+/, ''));

    if (usingApi && codesArr.length === 2) {
      return {
        barcod: '',
        qrCod: '',
        parse: false,
        message: 'Отсканировалось два кода при работе с апи',
      };
    }

    if (!usingApi && codesArr.length !== 2) {
      return {
        barcod: '',
        qrCod: '',
        parse: false,
        message: 'Ожидается 2 кода, разделенных символом "@"',
      };
    }

    if (!usingApi && (codesArr[0] === '' || codesArr[1] === '')) {
      return {
        barcod: '',
        qrCod: '',
        parse: false,
        message: 'Один из кодов пуст',
      };
    }

    const isStandardCode = (code: string) =>
      code.startsWith('01') && code.slice(16, 18) === '21';
    const isQrCode = (code: string) => !isStandardCode(code);

    const firstCode = codesArr[0];

    if (!firstCode || firstCode === 'NoRead') {
      return {
        barcod: '',
        qrCod: '',
        parse: false,
        message: 'Ошибка при сканировании, камера ничего не передала',
      };
    }

    if (usingApi && isStandardCode(firstCode)) {
      return { barcod: firstCode, qrCod: '', parse: true };
    }

    if (usingApi && isQrCode(firstCode)) {
      return { barCod: '', qrCod: firstCode, parse: true };
    }

    const code1IsQr = isQrCode(codesArr[0]);
    const code2IsQr = isQrCode(codesArr[1]);
    const code1IsStandard = isStandardCode(codesArr[0]);
    const code2IsStandard = isStandardCode(codesArr[1]);

    if ((code1IsQr && code2IsQr) || (code1IsStandard && code2IsStandard)) {
      return {
        barcod: '',
        qrCod: '',
        parse: false,
        message:
          'Должен быть один QR код и один обычный код (начинающийся с 01 и содержащий 21 на 16-18 позициях)',
      };
    }

    let barcod = '';
    let qrCod = '';
    let bruttoWeight = '';

    if (code1IsQr && code2IsStandard) {
      const extracted = this.extractQrValue(codesArr[0]);
      qrCod = extracted.weight;
      bruttoWeight = extracted.brutto_weight;
      barcod = codesArr[1];
    } else if (code2IsQr && code1IsStandard) {
      const extracted = this.extractQrValue(codesArr[1]);
      qrCod = extracted.weight;
      bruttoWeight = extracted.brutto_weight || '';
      barcod = codesArr[0];
    } else {
      return {
        barcod,
        qrCod,
        parse: false,
        message: 'Не удалось определить тип кодов',
      };
    }

    if (!qrCod) {
      return {
        barcod,
        qrCod,
        parse: false,
        message: 'Не удалось извлечь данные из QR кода',
      };
    }

    if (!barcod) {
      return { barcod, qrCod, parse: false, message: 'Обычный код пуст' };
    }

    return { barcod, qrCod, brutto_weight: bruttoWeight, parse: true };
  }

  /** Достаёт вес и брутто из QR: сначала AI 3103/3303, иначе по точкам */
  extractQrValue(qrString: string): {
    weight: string;
    brutto_weight?: string;
  } {
    const gs1Match = qrString.match(/\(3103\)(\d+)/);
    const gs2Match = qrString.match(/\(3303\)(\d+)/);

    if (gs1Match) {
      return {
        weight: gs1Match[1],
        brutto_weight: gs2Match ? gs2Match[1] : undefined,
      };
    }

    const parts = qrString.split('.');
    if (parts.length >= 2) {
      return {
        weight: parts[parts.length - 1],
        brutto_weight: parts[parts.length - 2],
      };
    }

    return { weight: qrString, brutto_weight: undefined };
  }

  /** Быстрое определение типа кода без шаблонов */
  simpleDetectCodeType(code: string): { type: string; value: string } {
    if (!code || typeof code !== 'string') {
      return { type: 'unknown', value: '' };
    }

    const isBarcode = code.startsWith('01') && code.slice(16, 18) === '21';

    return {
      type: isBarcode ? 'barcode' : 'qr',
      value: code.trim(),
    };
  }

  /** Определение типа кода для поиска (код/коробка/паллета) */
  determineCodeType(code: string): {
    type: SearchFrom | null;
    reason?: string;
  } {
    if (!code) return { type: null, reason: 'Код не может быть пустым' };

    if (code.length < 18) {
      return {
        type: null,
        reason: 'Код слишком короткий (меньше 18 символов)',
      };
    }

    const prefix = code.substring(0, 2);
    const after16 = code.substring(16, 18);

    if (prefix === '01' && after16 === '21') return { type: SearchFrom.Code };
    if (prefix === '01' && after16 === '11') return { type: SearchFrom.Box };
    if (prefix === '02' && after16 === '11') {
      return { type: SearchFrom.Pallet };
    }

    if (
      prefix === '01' &&
      code.includes('21') &&
      code.includes('10') &&
      code.includes('11')
    ) {
      return { type: SearchFrom.Box };
    }

    const cleanCode = code.replace(/[(]/g, '').replace(/[)]/g, '');
    if (cleanCode.startsWith('01')) return { type: SearchFrom.Box };
    if (cleanCode.startsWith('02')) return { type: SearchFrom.Pallet };

    let reason = 'Неизвестный формат кода';
    if (prefix !== '01' && prefix !== '02') {
      reason = `Неверный префикс (ожидался 01 или 02, получен ${prefix})`;
    } else if (after16 !== '21' && after16 !== '11') {
      reason = `Неверный идентификатор типа (ожидался 21 или 11, получен ${after16})`;
    }

    return { type: null, reason };
  }

  /** Серийник после AI 21 (до GS или до конца кода) */
  extractCodeAfter21(fullCode: string): string | null {
    try {
      if (!fullCode) return null;

      const code = fullCode.trim();
      const GS = '\x1D';
      const serialStart = 18; // 01 + 14 цифр GTIN + 21

      if (
        code.length <= serialStart ||
        !code.startsWith('01') ||
        code.slice(16, 18) !== '21'
      ) {
        this.logger.warn(`Код не соответствует формату 01...21...: ${fullCode}`);
        return null;
      }

      const gsPos = code.indexOf(GS, serialStart);
      const serial = (
        gsPos === -1 ? code.substring(serialStart) : code.substring(serialStart, gsPos)
      ).trim();

      if (!serial) {
        this.logger.warn(`Пустой серийник в коде: ${fullCode}`);
        return null;
      }

      return serial;
    } catch (error) {
      this.logger.error(`Ошибка извлечения серийника: ${error.message}`);
      return null;
    }
  }

  /** Серийник и payload для файла Bizerba */
  parseCodeForBezerba(raw: string): { serial: string; payload: string } {
    const code = raw.trim();
    const GS = '\u001d';
    const serialStart = 18;

    const gsPos = code.indexOf(GS, serialStart);

    return {
      serial: code.substring(serialStart, gsPos),
      payload: code.substring(gsPos + 1 + 2),
    };
  }
}
