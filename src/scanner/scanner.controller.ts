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
import { ScannerService } from './scanner.service';

@Controller('scaner')
export class ScanerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('saveID')
  async handSaveId(@Body() body) {
    let { id } = body;
    // code = code.replaceAll('@', '\x1D');
    try {
      this.scannerService.saveID(id);
      //   res.send({ message: 'Ручной код успешно сохранен', result });
    } catch (err) {}
  }

  // @Get('getID')
  // async handGetID(@Body() body, @Res() res) {
  //   try {
  //     // Вызов сервиса
  //     const result = await this.scannerService.sandSaveid();

  //     // Успех - возвращаем объект
  //     return {
  //       success: true,
  //       message: 'ID сохранен',
  //       data: result,
  //     };
  //   } catch (err) {
  //     // Ошибка - выбрасываем исключение
  //   }
  // }
}
