import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  Query,
  Delete,
  Param,
} from '@nestjs/common';
import { CodeService } from './code.service';
import { CodeEntity } from './code.entity';
import { IBoxResponse, IPalletResponse } from './types';
import { CodeSearchService } from './code-search.service';
import { CodeHelperService } from './code-helper.service';
import { CodeMigrationService } from './code-migration.service';
import { HandOperation } from './hand-operation.service';

@Controller('code')
export class CodeController {
  constructor(
    private readonly codeService: CodeService,
    private readonly handOper: HandOperation,
    private readonly codeHelperService: CodeHelperService,
    private readonly codeMigrationService: CodeMigrationService,
    private readonly codeSearchService: CodeSearchService,
  ) {}

  private defaultLimit = 50;

  @Get('ping')
  ping() {
    console.log('-------------ping');
    return {
      status: 'ok',
      message: 'pong',
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    };
  }

  // Самый быстрый метод - COPY (рекомендую)
  @Post('generate-fast')
  async generateFast(@Body('data') data: any) {
    const { baseCode, count } = data;
    console.log('=====================generate', data);

    if (!baseCode) {
      return { error: 'baseCode is required' };
    }

    // const result = await this.codeGenerator.generateAndCopyToDatabase(
    //   baseCode,
    //   count,
    //   100000 // размер пакета
    // );

    // return result;
    return {
      success: false,
      totalGenerated: 0,
      totalInserted: 0,
      duration: 'a',
      method: 'a',
      message: 'message',
    };
  }

  @Post('hand-save')
  async handSaveCode(@Body() body, @Res() res) {
    let { code } = body;
    code = code.replaceAll('@', '\x1D');
    try {
      const result = await this.codeService.validateAndSaveCode(
        code,
        body.name,
      );
      if (result.isAddCode) {
        res.send({
          message: 'Ручной код успешно сохранен',
          result,
          success: true,
        });
      } else {
        res.send({
          message: 'Ручной код не сохранен',
          result,
          success: false,
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({
        message: 'Ошибка при сохранении кода ручным',
        success: false,
      });
    }
  }

  @Post('search')
  async searchCode(@Body('query') query: string): Promise<
    | { code: CodeEntity; countIn: number }
    // { box: string; countInBox: number } |
    | { message: string }
  > {
    query = query.replaceAll('@', '\x1D');
    console.log('----------------', query, '======', query.length);
    // if (query.length === 33) {
    const res = await this.codeSearchService.search(query);
    // console.log('search-----', res);
    return res;
    // } else {
    //   return { message: 'длина кода не соответствует датаматрикс коду' }
    // }
  }

  @Get('searchWithPageNumber')
  async searchWithPageNumber(
    @Query('query') query: string,
    @Query('limit') limit: number = this.defaultLimit,
  ): Promise<{ code: CodeEntity | null; pageNumber: number }> {
    const res = await this.codeSearchService.searchWithPageNumber(query, limit);
    console.log('searchWithPageNumber-----', res);
    return res;
  }

  @Get('searchByBoxNumber')
  async searchByBoxNumber(
    @Query('boxNumber') boxNumber: number,
  ): Promise<CodeEntity[]> {
    console.log(`searchByBoxNumber----- boxNumber: ${boxNumber}`);
    return this.codeSearchService.searchByBoxNumber(boxNumber);
  }

  @Get('allBoxes')
  async getAllBoxes(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = this.defaultLimit,
  ): Promise<{ data: IBoxResponse; total: number } | any> {
    console.log('getAllBoxes-----');
    return this.codeSearchService.getAllBoxes(page, limit);
  }

  @Get('allPallets')
  async getAllPallets(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = this.defaultLimit,
  ): Promise<{ data: IPalletResponse; total: number } | any> {
    console.log('getAllPallets-----');
    return this.codeSearchService.getAllPallets(page, limit);
  }

  @Get('pallets/:palletNumber/product-count')
  async getProductCountInPallet(
    @Param('palletNumber') palletNumber: number,
  ): Promise<number | { message: string }> {
    try {
      const count =
        await this.codeSearchService.getProductCountInPallet(palletNumber);
      return count;
    } catch (err) {
      console.error(err);
      return { message: 'Ошибка при получении количества продуктов в паллете' };
    }
  }

  @Delete('deleteCodes')
  async deleteCodes(@Body() body, @Res() res) {
    const { codes } = body;
    try {
      await this.codeService.deleteCodes(codes);
      res.send('Коды успешно удалены');
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при удалении кодов');
    }
  }

  @Post('addCodeToBox')
  async addCodeToBox(@Body() body) {
    const { code, boxNumber, palletNumber } = body;
    try {
      const res = await this.handOper.addCodeToBox(
        code,
        boxNumber,
        palletNumber,
      );
      return res;
    } catch (err) {
      console.error(err);
      return { message: 'Ошибка при добавлении кода в короб' };
    }
  }

  @Delete('deleteBox')
  async deleteBox(@Body() body, @Res() res) {
    const { boxNumber } = body;
    try {
      await this.handOper.deleteBox(boxNumber);
      res.send('Короб успешно удален');
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при удалении короба');
    }
  }

  @Post('removeBoxFromPallet')
  async removeBoxFromPallet(@Body() body, @Res() res) {
    const { boxNumber } = body;
    try {
      await this.handOper.removeBoxFromPallet(boxNumber);
      res.send('Короб успешно изъят из паллеты');
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при изъятии короба из паллеты');
    }
  }

  @Delete('deletePallet')
  async deletePallet(@Body() body, @Res() res) {
    const { palletNumber } = body;
    try {
      await this.handOper.deletePallet(palletNumber);
      res.send('Паллета успешно удалена');
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при удалении паллеты');
    }
  }

  @Get('logs')
  async getLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<{ data: any[]; total: number }> {
    return this.codeService.getLogs(page, limit);
  }

  @Get('currentData')
  async getCurrentData(): Promise<void> {
    return this.codeHelperService.sendDBDataToFrontend();
  }

  @Delete('delete-tables')
  async deleteTables() {
    this.codeService.deleteTablesStartingWithNumber();
  }

  @Post('move-box-to-pallet')
  async moveBoxToPallet(
    @Body('boxNumber') boxNumber: number,
    @Body('newPalletNumber') newPalletNumber: number,
    @Res() res,
  ) {
    try {
      await this.handOper.moveBoxToPallet(boxNumber, newPalletNumber);
      res.send({
        message: `Коробка ${boxNumber} успешно перемещена на паллету ${newPalletNumber}`,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Ошибка при перемещении коробки');
    }
  }

  @Post('migrate-from-old-tables')
  async migrateFromOldTables() {
    // Используйте быстрый метод для вашего объема данных
    return await this.codeMigrationService.quickMigrateAll();
  }
}
