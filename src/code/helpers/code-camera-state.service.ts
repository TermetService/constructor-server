import { Injectable } from '@nestjs/common';

export interface ICameraState {
  currectProductInBox: number;
  currectBoxInPallet: number;
  UsedBoxNumber: number;
  UsedPalletNumber: number;
  WeightBox: number;
  WeightPallet: number;
}

/**
 * Состояние камер по имени: коробка, паллета, счётчики.
 * Общий для CodeService (пишет) и CodeCountsService (читает для фронта),
 * чтобы не было циклической зависимости между ними.
 */
@Injectable()
export class CodeCameraStateService {
  private states: Record<string, ICameraState> = {};

  get(name: string): ICameraState | undefined {
    return this.states[name];
  }

  set(name: string, state: ICameraState): void {
    this.states[name] = state;
  }

  all(): Record<string, ICameraState> {
    return this.states;
  }

  reset(): void {
    this.states = {};
  }
}
