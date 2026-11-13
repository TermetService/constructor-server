import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { IMonitoringVariables, MonitoringStatusActions } from 'src/globalTypes';
import { CodeRepository } from '../code.repository';

/**
 * Запись кодов и правила нумерации.
 * Сама нумерация (коробка/паллета) живёт в CodeService и cameraStates —
 * здесь только проверки и вставка в таблицу задания.
 */
@Injectable()
export class CodeSaveService {
  constructor(
    private readonly codeRepository: CodeRepository,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** Есть ли код в списке допустимых кодов задания */
  isCodeTask(codes: string[], code: string): boolean {
    return Array.isArray(codes) && codes.includes(code);
  }

  /** Вставка кода в таблицу задания (и в общий реестр code_entity) */
  async saveCode(
    tableName: string,
    code: string,
    boxNumber: number,
    cameraName?: string,
    palletNumber?: number,
  ): Promise<boolean> {
    return this.codeRepository.saveCodeToDatabase(
      tableName,
      code,
      boxNumber,
      cameraName,
      palletNumber,
    );
  }

  /**
   * Историческое имя: раньше метод ещё и двигал счётчики.
   * Сейчас только сохраняет код — состояние ведёт CodeService.
   */
  async saveCodeAndAdvanceState(
    tableName: string,
    code: string,
    boxNumber: number,
  ): Promise<boolean> {
    return this.codeRepository.saveCodeToDatabase(
      tableName,
      code,
      boxNumber,
    );
  }

  /** Сторона, на которую уходит код: зависит от чётности коробки и первой коробки */
  updateCodeStatus(): void {
    const boxIsEven = this.globalMonVar.currentBoxNumber % 2 === 0;
    const firstBoxOdd = this.globalMonVar.isFirstBoxOdd;

    this.globalMonVar.codeStatus =
      boxIsEven === firstBoxOdd
        ? MonitoringStatusActions.Right
        : MonitoringStatusActions.Left;
  }
}
