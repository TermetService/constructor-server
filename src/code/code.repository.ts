// code.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { codeLogger } from 'src/logger-winston/winston.config';
import { EntityManager, Repository } from 'typeorm';
import { Logger } from 'winston';
import { CodeEntity } from './code.entity';

@Injectable()
export class CodeRepository {
  constructor(
    @InjectEntityManager()
    private entityManager: EntityManager,
    @InjectRepository(CodeEntity)
    private codeRepository: Repository<CodeEntity>,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  async tableExists(tableName: string): Promise<boolean> {
    const query = `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`;
    const res = await this.entityManager.query(query, [tableName]);
    return res[0].exists;
  }

  async isDuplicateCode(code: string): Promise<boolean> {
    const timerLabel = `duplicate_check_${code.substring(0, 10)}`;
    console.time(timerLabel);

    const startDbTime = Date.now();
    const existingCode = await this.codeRepository.findOne({
      where: { code: code },
      select: ['id'],
    });
    const dbDuration = Date.now() - startDbTime;

    const result = !!existingCode;

    console.timeEnd(timerLabel);
    console.log(
      `Детализация: запрос к БД занял ${dbDuration} мс, результат: ${result}`,
    );

    return result;
  }

  async saveCodeToDatabase(
    tableName: string,
    code: string,
    boxNumber: number,
    cameraName?: string,
    pallet_number?: number,
    // palletNumber: number,
  ): Promise<boolean> {
    return this.entityManager.transaction(
      async (transactionalEntityManager) => {
        const inserted: { id: number }[] =
          await transactionalEntityManager.query(
            `INSERT INTO "${tableName}" (code, box_number,camera_name,pallet_number)
         VALUES ($1, $2,$3,$4) ON CONFLICT (code) DO NOTHING
         RETURNING id`,
            [code, boxNumber, 'Camera1', pallet_number],
          );

        if (!inserted.length) {
          return false;
        }

        await transactionalEntityManager.query(
          `INSERT INTO "code_entity" (code, box_number, pallet_number)
         VALUES ($1, NULL, NULL) ON CONFLICT (code) DO NOTHING`,
          [code],
        );

        return true;
      },
    );
  }

  async deleteCodesFromTables(
    mainTableName: string,
    codeStrings: string[],
  ): Promise<void> {
    const queryRunner = this.entityManager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Поочередное удаление каждого кода
      for (const code of codeStrings) {
        // Удаляем из основной таблицы
        await queryRunner.query(
          `DELETE FROM "${mainTableName}" WHERE code = $1`,
          [code],
        );

        // Удаляем из CodeEntity
        await queryRunner.query(`DELETE FROM "code_entity" WHERE code = $1`, [
          code,
        ]);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Не удалось удалить коды: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async getProductCountInBox(
    mainTableName: string,
    boxNumber: number,
  ): Promise<number> {
    const result = await this.entityManager.query(
      `SELECT COUNT(*) as count FROM "${mainTableName}" WHERE box_number = $1`,
      [boxNumber],
    );
    return parseInt(result[0].count);
  }

  async addCodeToTables(
    mainTableName: string,
    code: string,
    boxNumber: number,
    palletNumber: number,
  ): Promise<{ id: number; code: string } | null> {
    const queryRunner = this.entityManager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Вставка в основную таблицу
      const result = await queryRunner.query(
        `INSERT INTO "${mainTableName}" (code, box_number, pallet_number)
       VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING
       RETURNING id, code`,
        [code, boxNumber, palletNumber],
      );

      // Если вставка прошла успешно, вставляем в CodeEntity
      if (result.length > 0) {
        await queryRunner.query(
          `INSERT INTO "code_entity" (code, box_number, pallet_number)
         VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
          [code, null, null],
        );
      }

      await queryRunner.commitTransaction();
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Не удалось добавить код: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async getCodesByBoxNumber(
    mainTableName: string,
    boxNumber: number,
  ): Promise<string[]> {
    const result = await this.entityManager.query(
      `SELECT code FROM "${mainTableName}" WHERE box_number = $1`,
      [boxNumber],
    );
    return result.map((row) => row.code);
  }

  async deleteBoxFromTables(
    mainTableName: string,
    boxNumber: number,
    codeStrings: string[],
  ): Promise<void> {
    const queryRunner = this.entityManager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Удаляем коробку из основной таблицы
      await queryRunner.query(
        `DELETE FROM "${mainTableName}" WHERE box_number = $1`,
        [boxNumber],
      );

      // Удаляем коды из CodeEntity
      if (codeStrings.length > 0) {
        await queryRunner.query(
          `DELETE FROM "code_entity" WHERE code = ANY($1::text[])`,
          [codeStrings],
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Не удалось удалить коробку: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async removeBoxFromPalletInTable(
    mainTableName: string,
    boxNumber: number,
  ): Promise<void> {
    await this.entityManager.query(
      `UPDATE "${mainTableName}" SET pallet_number = NULL WHERE box_number = $1`,
      [boxNumber],
    );
  }

  async getCodesByPalletNumber(
    mainTableName: string,
    palletNumber: number,
  ): Promise<string[]> {
    const result = await this.entityManager.query(
      `SELECT code FROM "${mainTableName}" WHERE pallet_number = $1`,
      [palletNumber],
    );
    return result.map((row) => row.code);
  }

  async deletePalletFromTables(
    mainTableName: string,
    palletNumber: number,
    codeStrings: string[],
  ): Promise<void> {
    const queryRunner = this.entityManager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Удаляем паллету из основной таблицы
      await queryRunner.query(
        `DELETE FROM "${mainTableName}" WHERE pallet_number = $1`,
        [palletNumber],
      );

      // Удаляем коды из CodeEntity
      if (codeStrings.length > 0) {
        await queryRunner.query(
          `DELETE FROM "code_entity" WHERE code = ANY($1::text[])`,
          [codeStrings],
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Не удалось удалить паллету: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async moveBoxToPalletInTable(
    mainTableName: string,
    boxNumber: number,
    newPalletNumber: number,
  ): Promise<void> {
    await this.entityManager.query(
      `UPDATE "${mainTableName}"
     SET pallet_number = $1
     WHERE box_number = $2`,
      [newPalletNumber, boxNumber],
    );
  }

  // ============================================== helper ==========================

  async getDatabaseCounts(
    mainTableName: string,
    currentBoxNumber: number,
    currentPalletNumber: number,
  ): Promise<{
    productCount: number;
    boxCount: number;
    palletCount: number;
    productsInCurrentBox: number;
    boxesInCurrentPallet: number;
  }> {
    const query = `
    WITH
    product_count AS (SELECT COUNT(*) as product_count FROM "${mainTableName}"),
    box_count AS (SELECT COUNT(DISTINCT box_number) as box_count FROM "${mainTableName}"),
    pallet_count AS (SELECT COUNT(DISTINCT pallet_number) as pallet_count FROM "${mainTableName}"),
    products_in_current_box AS (
      SELECT COUNT(*) as products_in_current_box
      FROM "${mainTableName}"
      WHERE box_number = $1
    ),
    boxes_in_current_pallet AS (
      SELECT COUNT(DISTINCT box_number) as boxes_in_current_pallet
      FROM "${mainTableName}"
      WHERE pallet_number = $2
    )
    SELECT
      pc.product_count,
      bc.box_count,
      plc.pallet_count,
      picb.products_in_current_box,
      bipc.boxes_in_current_pallet
    FROM
      product_count pc,
      box_count bc,
      pallet_count plc,
      products_in_current_box picb,
      boxes_in_current_pallet bipc
  `;

    const [result] = await this.entityManager.query(query, [
      currentBoxNumber,
      currentPalletNumber,
    ]);

    return {
      productCount: Number(result.product_count),
      boxCount: Number(result.box_count),
      palletCount: Number(result.pallet_count),
      productsInCurrentBox: Number(result.products_in_current_box),
      boxesInCurrentPallet: Number(result.boxes_in_current_pallet),
    };
  }

  async getLastBoxAndPalletInfo(mainTableName: string): Promise<{
    lastBoxNumber: number;
    lastPalletNumber: number;
    productsInLastBox: number;
    boxesInLastPallet: number;
    allProductsCount: number;
    countBox: number;
    countPallet: number;
  }> {
    // Получаем номер последней коробки
    const lastBoxResult = await this.entityManager.query(
      `SELECT MAX(box_number) as last_box_number FROM "${mainTableName}"`,
    );
    const lastBoxNumber = lastBoxResult[0].last_box_number || 0;

    // Получаем номер последней паллеты
    const lastPalletResult = await this.entityManager.query(
      `SELECT MAX(pallet_number) as last_pallet_number FROM "${mainTableName}"`,
    );
    const lastPalletNumber = lastPalletResult[0].last_pallet_number || 0;

    // Получаем количество продуктов в последней коробке
    const productsInLastBoxResult = await this.entityManager.query(
      `SELECT COUNT(*) as count FROM "${mainTableName}" WHERE box_number = $1`,
      [lastBoxNumber],
    );
    const productsInLastBox = parseInt(productsInLastBoxResult[0].count, 10);

    // Получаем количество коробок в последней паллете
    const boxesInLastPalletResult = await this.entityManager.query(
      `SELECT COUNT(DISTINCT box_number) as count FROM "${mainTableName}" WHERE pallet_number = $1`,
      [lastPalletNumber],
    );
    const boxesInLastPallet = parseInt(boxesInLastPalletResult[0].count, 10);

    const allProductsCountResult = await this.entityManager.query(
      `SELECT COUNT(*) as count FROM "${mainTableName}"`,
    );

    const countBoxResult = await this.entityManager.query(
      `SELECT COUNT(DISTINCT box_number)  as count FROM "${mainTableName}"`,
    );
    const countBox = parseInt(countBoxResult[0].count, 10);

    const countPalletResult = await this.entityManager.query(
      `SELECT COUNT(DISTINCT pallet_number)  as count FROM "${mainTableName}"`,
    );

    const countPallet = parseInt(countPalletResult[0].count, 10);

    const allProductsCount = parseInt(allProductsCountResult[0].count, 10);

    return {
      lastBoxNumber,
      lastPalletNumber,
      productsInLastBox,
      boxesInLastPallet,
      allProductsCount,
      countBox,
      countPallet,
    };
  }

  async getAllRecords(mainTableName: string): Promise<any[]> {
    return await this.entityManager.query(
      `SELECT code, box_number, pallet_number FROM "${mainTableName}"`,
    );
  }
}
