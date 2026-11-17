import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Logger } from 'winston';
import { codeLogger } from 'src/logger-winston/winston.config';

/**
 * Минимальный доступ к таблице задания — только то, что нужно
 * для проверок перед назначением box_label коробке.
 */
@Injectable()
export class BoxLabelRepository {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.entityManager.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [tableName],
    );

    return Boolean(result[0]?.exists);
  }

  /** Этикетка уже стоит хотя бы на одной коробке в таблице */
  async isLabelUsed(tableName: string, label: string): Promise<boolean> {
    const result = await this.entityManager.query(
      `SELECT EXISTS (SELECT 1 FROM "${tableName}" WHERE box_label = $1)`,
      [label],
    );

    return Boolean(result[0]?.exists);
  }

  /** Этикетка уже стоит на конкретной коробке */
  async findLabelForBox(
    tableName: string,
    label: string,
    boxNumber: number,
  ): Promise<any[]> {
    return this.entityManager.query(
      `SELECT code, box_number, box_label FROM "${tableName}"
       WHERE box_label = $1 AND box_number = $2`,
      [label, boxNumber],
    );
  }

  /** Строки продуктов по списку кодов */
  async findCodesByList(
    tableName: string,
    codes: string[],
  ): Promise<
    {
      code: string;
      box_number: number | null;
      box_label: string | null;
      pallet_number: number | null;
    }[]
  > {
    if (!tableName || !codes?.length) return [];

    return this.entityManager.query(
      `SELECT code, box_number, box_label, pallet_number
       FROM "${tableName}"
       WHERE code = ANY($1::text[])`,
      [codes],
    );
  }
}
