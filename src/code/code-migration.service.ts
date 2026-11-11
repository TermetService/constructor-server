// code-migration.service.ts
import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CodeEntity } from './code.entity';

@Injectable()
export class CodeMigrationService {
    constructor(
        @InjectRepository(CodeEntity)
        private codeRepository: Repository<CodeEntity>,
        @InjectEntityManager()
        private entityManager: EntityManager,
    ) { }

    /**
     * Получить все таблицы, названия которых начинаются с цифры
     */
    async getTablesStartingWithNumber(): Promise<string[]> {
        const result = await this.entityManager.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename ~ '^[0-9]'
      ORDER BY tablename
    `);

        return result.map(row => row.tablename);
    }

    /**
     * Проверить существование столбца code в таблице
     */
    private async hasCodeColumn(tableName: string): Promise<boolean> {
        const result = await this.entityManager.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND column_name = 'code'
      )
    `, [tableName]);

        return result[0].exists;
    }

    /**
     * Перенести все уникальные коды из всех таблиц в CodeEntity
     */
    async migrateAllUniqueCodes(): Promise<{
        tablesProcessed: number;
        totalCodesFound: number;
        newCodesInserted: number;
        duplicateCodesSkipped: number;
        details: Array<{
            tableName: string;
            codesFound: number;
            inserted: number;
            skipped: number;
            error?: string;
        }>;
    }> {
        const result = {
            tablesProcessed: 0,
            totalCodesFound: 0,
            newCodesInserted: 0,
            duplicateCodesSkipped: 0,
            details: [],
        };

        // Получаем все таблицы с цифрами
        const tables = await this.getTablesStartingWithNumber();
        console.log(`Найдено таблиц для обработки: ${tables.length}`, tables);

        // Обрабатываем каждую таблицу
        for (const tableName of tables) {
            const tableResult = await this.migrateTableCodes(tableName);
            result.tablesProcessed++;
            result.totalCodesFound += tableResult.codesFound;
            result.newCodesInserted += tableResult.inserted;
            result.duplicateCodesSkipped += tableResult.skipped;
            result.details.push(tableResult);
        }

        console.log('Миграция завершена:', result);
        return result;
    }

    /**
     * Перенести коды из конкретной таблицы
     */
    private async migrateTableCodes(tableName: string): Promise<{
        tableName: string;
        codesFound: number;
        inserted: number;
        skipped: number;
        error?: string;
    }> {
        const result = {
            tableName,
            codesFound: 0,
            inserted: 0,
            skipped: 0,
        };

        try {
            // Проверяем наличие столбца code
            const hasColumn = await this.hasCodeColumn(tableName);
            if (!hasColumn) {
                console.log(`Таблица ${tableName} не имеет столбца "code", пропускаем`);
                return { ...result, error: 'Column "code" not found' };
            }

            // Получаем все уникальные коды из таблицы с правильными кавычками
            const codes = await this.entityManager.query(
                `SELECT DISTINCT "code" FROM "${tableName}" WHERE "code" IS NOT NULL AND "code" != ''`
            );

            result.codesFound = codes.length;

            if (codes.length === 0) {
                console.log(`Таблица ${tableName} не содержит кодов`);
                return result;
            }

            // Вставляем каждый код в CodeEntity
            for (const row of codes) {
                try {
                    // Проверяем, существует ли уже такой код
                    const exists = await this.codeRepository.findOne({
                        where: { code: row.code },
                        select: ['id']
                    });

                    if (!exists) {
                        await this.codeRepository.save({
                            code: row.code,
                            box_number: null,
                            pallet_number: null,
                        });
                        result.inserted++;
                    } else {
                        result.skipped++;
                    }
                } catch (error) {
                    if (error.code === '23505') { // Unique violation
                        result.skipped++;
                    } else {
                        console.error(`Ошибка при вставке кода ${row.code}:`, error.message);
                    }
                }
            }

            console.log(`Таблица ${tableName}: найдено ${result.codesFound} кодов, добавлено ${result.inserted}, пропущено ${result.skipped}`);
        } catch (error) {
            console.error(`Ошибка при обработке таблицы ${tableName}:`, error.message);
            // result.error = error.message;
        }

        return result;
    }

    /**
     * Быстрая миграция одним запросом (рекомендуемый метод)
     */
    async quickMigrateAll(): Promise<{
        tablesCount: number;
        totalUniqueCodes: number;
        insertedCount: number;
        details: Array<{
            tableName: string;
            codesFound: number;
            inserted: number;
        }>;
    }> {
        const tables = await this.getTablesStartingWithNumber();

        if (tables.length === 0) {
            return { tablesCount: 0, totalUniqueCodes: 0, insertedCount: 0, details: [] };
        }

        const details = [];
        let totalUniqueCodes = 0;
        let totalInserted = 0;

        for (const tableName of tables) {
            try {
                // Проверяем наличие столбца code
                const hasColumn = await this.hasCodeColumn(tableName);
                if (!hasColumn) {
                    console.log(`Таблица ${tableName} не имеет столбца "code", пропускаем`);
                    continue;
                }

                // Получаем количество уникальных кодов в таблице
                const countResult = await this.entityManager.query(
                    `SELECT COUNT(DISTINCT "code") as count FROM "${tableName}" WHERE "code" IS NOT NULL AND "code" != ''`
                );
                const codesCount = parseInt(countResult[0].count);

                if (codesCount === 0) {
                    details.push({
                        tableName,
                        codesFound: 0,
                        inserted: 0,
                    });
                    continue;
                }

                // Вставляем новые коды одним запросом
                const insertResult = await this.entityManager.query(`
          INSERT INTO "code_entity" ("code", "box_number", "pallet_number")
          SELECT DISTINCT "${tableName}"."code", NULL, NULL
          FROM "${tableName}"
          WHERE "${tableName}"."code" IS NOT NULL 
            AND "${tableName}"."code" != ''
            AND NOT EXISTS (
              SELECT 1 FROM "code_entity" 
              WHERE "code_entity"."code" = "${tableName}"."code"
            )
        `);

                // Получаем количество реально вставленных записей
                const insertedCount = await this.entityManager.query(`
          SELECT COUNT(*) as count
          FROM (
            SELECT DISTINCT "${tableName}"."code"
            FROM "${tableName}"
            WHERE "${tableName}"."code" IS NOT NULL 
              AND "${tableName}"."code" != ''
              AND NOT EXISTS (
                SELECT 1 FROM "code_entity" 
                WHERE "code_entity"."code" = "${tableName}"."code"
              )
          ) as new_codes
        `);

                const inserted = parseInt(insertedCount[0].count);

                details.push({
                    tableName,
                    codesFound: codesCount,
                    inserted: inserted,
                });

                totalUniqueCodes += codesCount;
                totalInserted += inserted;

                console.log(`Таблица ${tableName}: найдено ${codesCount} кодов, добавлено ${inserted} новых`);
            } catch (error) {
                console.error(`Ошибка при обработке таблицы ${tableName}:`, error.message);
                details.push({
                    tableName,
                    codesFound: 0,
                    inserted: 0,
                    error: error.message,
                });
            }
        }

        console.log(`Быстрая миграция: обработано ${tables.length} таблиц, найдено ${totalUniqueCodes} уникальных кодов, добавлено ${totalInserted} новых`);

        return {
            tablesCount: tables.length,
            totalUniqueCodes: totalUniqueCodes,
            insertedCount: totalInserted,
            details,
        };
    }

    /**
     * Самый простой и надежный метод миграции (рекомендую для вашего объема данных)
     */
    async simpleMigrate(): Promise<{
        tablesProcessed: number;
        totalInserted: number;
        results: Array<{
            tableName: string;
            inserted: number;
            error?: string;
        }>;
    }> {
        const tables = await this.getTablesStartingWithNumber();
        const results = [];
        let totalInserted = 0;

        for (const tableName of tables) {
            try {
                // Проверяем наличие столбца code
                const hasColumn = await this.hasCodeColumn(tableName);
                if (!hasColumn) {
                    results.push({
                        tableName,
                        inserted: 0,
                        error: 'Column "code" not found',
                    });
                    continue;
                }

                // Прямой SQL запрос с двойными кавычками для всех идентификаторов
                await this.entityManager.query(`
          INSERT INTO "code_entity" ("code", "box_number", "pallet_number")
          SELECT DISTINCT "${tableName}"."code", NULL, NULL
          FROM "${tableName}"
          WHERE "${tableName}"."code" IS NOT NULL 
            AND "${tableName}"."code" != ''
            AND "${tableName}"."code" NOT IN (SELECT "code" FROM "code_entity")
        `);

                // Получаем количество вставленных записей
                const countResult = await this.entityManager.query(`
          SELECT COUNT(*) as count
          FROM (
            SELECT DISTINCT "${tableName}"."code"
            FROM "${tableName}"
            WHERE "${tableName}"."code" IS NOT NULL 
              AND "${tableName}"."code" != ''
              AND "${tableName}"."code" NOT IN (SELECT "code" FROM "code_entity")
          ) as remaining_codes
        `);

                const inserted = parseInt(countResult[0].count);
                totalInserted += inserted;

                results.push({
                    tableName,
                    inserted,
                });

                console.log(`Таблица ${tableName}: добавлено ${inserted} новых кодов`);
            } catch (error) {
                console.error(`Ошибка при обработке таблицы ${tableName}:`, error.message);
                results.push({
                    tableName,
                    inserted: 0,
                    error: error.message,
                });
            }
        }

        return {
            tablesProcessed: tables.length,
            totalInserted,
            results,
        };
    }

    /**
     * Получить статистику по всем таблицам
     */
    async getMigrationStats(): Promise<{
        totalTables: number;
        tablesWithCodeColumn: number;
        totalUniqueCodesInOldTables: number;
        existingCodesInCodeEntity: number;
        codesToMigrate: number;
        details: Array<{
            tableName: string;
            uniqueCodesCount: number;
            hasCodeColumn: boolean;
        }>;
    }> {
        const tables = await this.getTablesStartingWithNumber();
        const details = [];
        let tablesWithCodeColumn = 0;
        let totalUniqueCodes = 0;

        for (const tableName of tables) {
            const hasColumn = await this.hasCodeColumn(tableName);

            let uniqueCodesCount = 0;
            if (hasColumn) {
                const countResult = await this.entityManager.query(
                    `SELECT COUNT(DISTINCT "code") as count FROM "${tableName}" WHERE "code" IS NOT NULL AND "code" != ''`
                );
                uniqueCodesCount = parseInt(countResult[0].count);
                totalUniqueCodes += uniqueCodesCount;
                tablesWithCodeColumn++;
            }

            details.push({
                tableName,
                uniqueCodesCount,
                // hasCodeColumn,
            });
        }

        const existingCodesCount = await this.codeRepository.count();
        const codesToMigrate = totalUniqueCodes - existingCodesCount;

        return {
            totalTables: tables.length,
            tablesWithCodeColumn,
            totalUniqueCodesInOldTables: totalUniqueCodes,
            existingCodesInCodeEntity: existingCodesCount,
            codesToMigrate: codesToMigrate > 0 ? codesToMigrate : 0,
            details,
        };
    }
}