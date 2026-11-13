import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import * as dotenv from 'dotenv';
import { IMonitoringVariables } from 'src/globalTypes';

dotenv.config();

export interface ILayerProgress {
  /** Индекс слоя с нуля */
  layerIndex: number;
  /** Номер слоя с единицы (как в задании) */
  layerNumber: number;
  /** Сколько кодов должно быть в слое */
  expectedCodes: number;
  /** Сколько кодов уже лежит в слое */
  codesInLayer: number;
  totalLayers: number;
  totalExpectedProducts: number;
  isLayerComplete: boolean;
  isLastLayer: boolean;
}

/**
 * Работа со слоями коробки.
 *
 * Задание описывает слои так:
 *   { "layers": "3", "layer1": "4", "layer2": "4", "layer3": "2" }
 * Слой — это часть коробки, в которую кладётся заданное число кодов.
 *
 * Сервис ничего не хранит: все ответы считаются из задания и текущего
 * количества кодов в коробке.
 *
 */
const codeLength = (process.env.CODE_LENGTH || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

@Injectable()
export class CodeLayersService {
  constructor(
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** Количество слоёв в задании (0, если задание не загружено) */
  getTotalLayers(): number {
    const layers = parseInt(this.task()?.layers, 10);

    return Number.isFinite(layers) && layers > 0 ? layers : 0;
  }

  /**
   * Вместимость каждого слоя по порядку.
   * Некорректные значения пропускаются как 0.
   */
  getLayersConfig(): number[] {
    const totalLayers = this.getTotalLayers();
    const task = this.task();
    const config: number[] = [];

    for (let layerNumber = 1; layerNumber <= totalLayers; layerNumber++) {
      const value = parseInt(task?.[`layer${layerNumber}`], 10);
      config.push(Number.isFinite(value) && value > 0 ? value : 0);
    }

    return config;
  }

  /** Сколько всего кодов должно поместиться в коробку по слоям */
  calculateTotalExpectedProducts(): number {
    return this.getLayersConfig().reduce((sum, codes) => sum + codes, 0);
  }

  /**
   * Ожидаемое количество кодов в слое.
   * Бросает ошибку, если слой вне задания или в задании нет значения.
   */
  getExpectedCodesForLayer(layerIndex: number): number {
    const totalLayers = this.getTotalLayers();

    if (layerIndex < 0 || layerIndex >= totalLayers) {
      this.logger.error(
        `Код: Запрошен несуществующий слой ${layerIndex + 1}. Всего слоев: ${totalLayers}`,
      );
      throw new Error(`Несуществующий слой ${layerIndex + 1}`);
    }

    const rawValue = this.task()?.[`layer${layerIndex + 1}`];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      this.logger.error(
        `Код: Не найдено количество кодов для слоя ${layerIndex + 1}`,
      );
      throw new Error(`Не найдено количество кодов для слоя ${layerIndex + 1}`);
    }

    const expectedCodes = parseInt(rawValue, 10);

    if (!Number.isFinite(expectedCodes) || expectedCodes <= 0) {
      this.logger.error(
        `Код: Некорректное количество кодов для слоя ${layerIndex + 1}: ${rawValue}`,
      );
      throw new Error(
        `Некорректное количество кодов для слоя ${layerIndex + 1}`,
      );
    }

    return expectedCodes;
  }

  /**
   * Индекс текущего слоя по количеству кодов в коробке.
   *
   * Коды укладываются последовательно: заполнили слой — перешли к следующему.
   * Если кодов больше, чем вмещают все слои, возвращается последний слой.
   */
  calculateCurrentLayerIndex(productsInBox: number): number {
    const config = this.getLayersConfig();

    if (productsInBox <= 0 || config.length === 0) return 0;

    let accumulated = 0;

    for (let index = 0; index < config.length; index++) {
      accumulated += config[index];

      if (productsInBox < accumulated) return index;

      if (productsInBox === accumulated) {
        return index < config.length - 1 ? index + 1 : index;
      }
    }

    return config.length - 1;
  }

  /** Сколько кодов уже лежит в указанном слое */
  calculateCodesInCurrentLayer(
    layerIndex: number,
    productsInBox: number,
  ): number {
    const config = this.getLayersConfig();

    if (productsInBox <= 0 || layerIndex < 0 || layerIndex >= config.length) {
      return 0;
    }

    const codesInPreviousLayers = config
      .slice(0, layerIndex)
      .reduce((sum, codes) => sum + codes, 0);

    const codesInLayer = productsInBox - codesInPreviousLayers;

    return Math.max(0, Math.min(codesInLayer, config[layerIndex]));
  }

  /** Полное состояние слоя: удобно отправлять на фронт/в лог */
  getLayerProgress(productsInBox: number): ILayerProgress {
    const config = this.getLayersConfig();
    const layerIndex = this.calculateCurrentLayerIndex(productsInBox);
    const expectedCodes = config[layerIndex] ?? 0;
    const codesInLayer = this.calculateCodesInCurrentLayer(
      layerIndex,
      productsInBox,
    );

    return {
      layerIndex,
      layerNumber: layerIndex + 1,
      expectedCodes,
      codesInLayer,
      totalLayers: config.length,
      totalExpectedProducts: this.calculateTotalExpectedProducts(),
      isLayerComplete: expectedCodes > 0 && codesInLayer >= expectedCodes,
      isLastLayer: config.length > 0 && layerIndex === config.length - 1,
    };
  }

  extractProductCodesWithCoords(codes: string[]): {
    productCodes: string[];
    productCoords: string[][];
  } {
    const productCodes: string[] = [];
    const productCoords: string[][] = [];

    for (const code of codes) {
      const atIndex = code.indexOf('@');
      let coords: string[] = [];
      let finalCode: string;
      console.log('==============extractProductCodesWithCoords', code, atIndex);

      if (atIndex === -1) {
        // Старый формат
        coords = (code.match(/\((\d+,\d+)\)/g) || []).map((c) =>
          c.slice(1, -1),
        );
        const cleanCode = code.replace(/\((\d+,\d+)\)/g, '').trim();
        finalCode = cleanCode.startsWith('\x1D')
          ? cleanCode.substring(1)
          : cleanCode;
      } else {
        // Новый формат
        const coordsPart = code.substring(0, atIndex);
        coords = (coordsPart.match(/\((\d+,\d+)\)/g) || []).map((c) =>
          c.slice(1, -1),
        );
        const codePart = code.substring(atIndex + 1);
        finalCode = codePart.startsWith('\x1D')
          ? codePart.substring(1)
          : codePart;
      }

      if (codeLength.includes(`${finalCode.length}`)) {
        productCodes.push(finalCode);
        productCoords.push(coords);
      }
    }

    console.log('productCodes', productCodes);
    console.log('productCoords', productCoords);

    return { productCodes, productCoords };
  }

  private task(): Record<string, any> | null {
    return this.globalMonVar.task ?? null;
  }
}
