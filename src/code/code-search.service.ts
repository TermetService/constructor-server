import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { CodeEntity } from './code.entity';
import { IBoxResponse, IPalletResponse, SearchFrom } from './types';
import { IMonitoringVariables } from 'src/globalTypes';
import { Logger } from 'winston';
import { codeLogger } from 'src/logger-winston/winston.config';
import { TemplateService } from 'src/template/template.service';
import * as dotenv from 'dotenv';
import { CodeHelperService } from './code-helper.service';
import { getItemsCountInPallet } from 'src/monitoring/helper';
import { Gs1ParserService } from 'src/gs1-parser/gs1-parser.service';

dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isPrint = process.env.IS_PRINT === 'true';

@Injectable()
export class CodeSearchService {
    constructor(
        @InjectRepository(CodeEntity)
        private readonly entityManager: EntityManager,
        private readonly templateService: TemplateService,
        private readonly gs1ParserService: Gs1ParserService,
        private readonly codeHelperService: CodeHelperService,
        @Inject('GLOBAL_MONITORING_VARIABLES')
        private readonly globalMonVar: IMonitoringVariables,
        @Inject('winston') private readonly logger: Logger = codeLogger,
    ) { }

    async search(
        query: string,
    ): Promise<
        | { code: CodeEntity; countIn: number; from: SearchFrom }
        | { message: string }
    > {
        const start = performance.now();
        this.logger.info(`Код: Поиск кода: ${query}`);
        try {
            const tableName = this.codeHelperService.getTableName();
            await this.codeHelperService.checkTableExists(
                this.globalMonVar.tableName,
            );

            const { type, containerNumber, isValid, validationMessage } =
                await this.gs1ParserService.getContainerNumber(query);
            console.log('============================================', type, containerNumber, isValid, validationMessage);

            if (type == SearchFrom.Unknown) {
              console.log(`ошибка с типом`);
              throw new Error(
                'Отсканированный код не определен. Проверьте шаблоны паллет и коробок',
              );
            }

            if (type === SearchFrom.Code) {
                const codeQuery = `SELECT * FROM "${tableName}" WHERE code = $1 LIMIT 1`;
                const codeResult = await this.entityManager.query(codeQuery, [query]);

                const codeEntity = codeResult[0];

                if(!codeEntity) {
                  throw new Error('Код не найден в текущей фасовке');
                }

                const countQuery = `SELECT COUNT(*) as count FROM "${tableName}" WHERE box_number = $1`;
                const countResult = await this.entityManager.query(countQuery, [
                    codeEntity.box_number,
                ]);
                const countIn = parseInt(countResult[0].count, 10);

                this.logger.info(
                    `Код: Количество кодов в коробе ${codeEntity.box_number}: ${countIn}`,
                );
                const end = performance.now();
                const delta = end - start;
                console.log('delta ------------ search', delta);
                return { code: codeEntity, countIn, from: SearchFrom.Code };
            } else if (type === SearchFrom.Box) {
                const boxQuery = `SELECT * FROM "${tableName}" WHERE box_number = $1`;
                const boxResult = await this.entityManager.query(boxQuery, [containerNumber]);
                console.log('search__________box', containerNumber, boxResult);

                if (boxResult.length === 0) {
                    return { message: 'Коробка не найдена' };
                } else {
                    // Возвращаем первый код из коробки и количество кодов в ней
                    const codeFromBox = boxResult[0]; // Первый код из коробки
                    const countIn = boxResult.length;
                    return { code: codeFromBox, countIn, from: SearchFrom.Box };
                }
            } else if (type === SearchFrom.Pallet) {
                const palletQuery = `SELECT * FROM "${tableName}" WHERE pallet_number = $1`;
                const palletResult = await this.entityManager.query(palletQuery, [containerNumber]);
                console.log('search__________pallet', containerNumber, palletResult);

                if (palletResult.length === 0) {
                    return { message: 'Паллета не найдена' };
                } else {
                    // Возвращаем первый код из коробки и количество кодов в ней
                    const codeFromPallet = palletResult[0]; // Первый код из коробки
                    const countIn = palletResult.length;
                    return { code: codeFromPallet, countIn, from: SearchFrom.Pallet };
                }
            }
        } catch (err) {
            return { message: `Ошибка: ${err.message}` };
        }
    }

    async searchWithPageNumber(
        query: string,
        limit: number,
    ): Promise<{ code: CodeEntity | null; pageNumber: number }> {
        this.logger.info(`Код: Поиск кода с пагинацией: ${query}`);
        const start = performance.now();
        const tableName = this.codeHelperService.getTableName();

        await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

        const res = await this.entityManager.query(
            `SELECT * FROM "${tableName}" WHERE code = $1 LIMIT 1`,
            [query],
        );

        if (res.length === 0) {
            this.logger.info(`Код: Результаты не найдены для кода: ${query}`);
            return { code: null, pageNumber: 0 };
        }

        const boxNumber = res[0].box_number;
        const countRes = await this.entityManager.query(
            `SELECT COUNT(DISTINCT box_number) FROM "${tableName}" WHERE box_number <= $1`,
            [boxNumber],
        );

        const totalBoxes = parseInt(countRes[0].count, 10);
        const pageNumber = Math.ceil(totalBoxes / limit);

        this.logger.info(
            `Код: Результат поиска с пагинацией: ${JSON.stringify(res)}, Номер страницы: ${pageNumber}`,
        );
        const end = performance.now();
        const delta = end - start;
        console.log('delta ------------ searchWithPageNumber', delta);
        return { code: res[0], pageNumber };
    }

    async searchByBoxNumber(boxNumber: number): Promise<CodeEntity[]> {
        this.logger.info(`Код: Поиск всех кодов в коробе номер: ${boxNumber}`);
        const start = performance.now();
        const tableName = this.codeHelperService.getTableName();

        await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

        const res = await this.entityManager.query(
            `SELECT * FROM "${tableName}" WHERE box_number = $1`,
            [boxNumber],
        );
        this.logger.info(`Код: Результат поиска коробки: ${JSON.stringify(res)}`);
        const end = performance.now();
        const delta = end - start;
        console.log('delta ------------ searchByBoxNumber', delta);
        return res;
    }

    async getAllBoxes(
        page: number,
        limit: number,
    ): Promise<{ data: IBoxResponse; total: number } | any> {
        const start = performance.now();
        this.logger.info('Код: Получение всех коробов');
        const tableName = this.codeHelperService.getTableName();

        await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

        const offset = (page - 1) * limit;
        const res = await this.entityManager.query(
            `SELECT box_number, COUNT(code) as code_count FROM "${tableName}" GROUP BY box_number ORDER BY box_number LIMIT $1 OFFSET $2`,
            [limit, offset],
        );

        const total = await this.entityManager.query(
            `SELECT COUNT(DISTINCT box_number) FROM "${tableName}"`,
        );
        this.logger.info(`Код: Все короба получены: ${JSON.stringify(res)}`);
        const end = performance.now();
        const delta = end - start;
        console.log('delta ------------ getAllBoxes', delta);
        return { data: res, total: parseInt(total[0].count, 10) };
    }

    async getAllPallets(
        page: number,
        limit: number,
    ): Promise<{ data: IPalletResponse; total: number } | any> {
        this.logger.info('Код: Получение всех паллет');
        const start = performance.now();
        const tableName = this.codeHelperService.getTableName();

        await this.codeHelperService.checkTableExists(this.globalMonVar.tableName);

        const offset = (page - 1) * limit;
        const res = await this.entityManager.query(
            `SELECT pallet_number, COUNT(DISTINCT box_number) as box_count
         FROM "${tableName}"
         WHERE pallet_number IS NOT NULL
         GROUP BY pallet_number
         ORDER BY pallet_number
         LIMIT $1 OFFSET $2`,
            [limit, offset],
        );

        const total = await this.entityManager.query(
            `SELECT COUNT(DISTINCT pallet_number)
         FROM "${tableName}"
         WHERE pallet_number IS NOT NULL`,
        );

        this.logger.info(`Код: Все паллеты получены: ${JSON.stringify(res)}`);
        const end = performance.now();
        const delta = end - start;
        console.log('delta ------------ getAllPallets', delta);
        return { data: res, total: parseInt(total[0].count, 10) };
    }

    async getProductCountInPallet(palletNumber: number): Promise<number> {
        const count = await getItemsCountInPallet(
            this.entityManager,
            this.globalMonVar.tableName,
            palletNumber,
        );

        return count;
    }
}
