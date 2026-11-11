import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { PrinterService } from './printer.service';
import { PrinterLabels, PrinterNames } from './types';

@Controller('printer')
export class PrinterController {
  constructor(private readonly printerService: PrinterService) {}

  @Post('update-config')
  async updateConfig(
    @Body()
    body: {
      name: string;
      type: string;
      host: string;
      port: number;
      enabled?: boolean;
    },
  ): Promise<void> {
    await this.printerService.updatePrinterConfig(
      body.name,
      body.type,
      body.host,
      body.port,
      body.enabled,
    );
  }

  @Get('status')
  async getPrinterStatus(): Promise<any> {
    return this.printerService.getPrinterStatus();
  }

  @Get(':label')
  async getConfig(@Param('label') label: PrinterLabels): Promise<any> {
    try {
      let name = PrinterNames.Printer1;
      if (label === PrinterLabels.Printer2) {
        name = PrinterNames.Printer2;
      } else if (label === PrinterLabels.Printer3) {
        name = PrinterNames.Printer3;
      } else if (label === PrinterLabels.Printer4) {
        name = PrinterNames.Printer4;
      }
      return await this.printerService.getConfigByName(name);
    } catch (err) {
      console.log('getConfig', err);
    }
  }

  @Post('print-box')
  async printBox(
    @Body() body: { boxNumber: number; countInBox: number },
  ): Promise<void> {
    await this.printerService.printBoxLabel(body.boxNumber, body.countInBox);
  }

  @Post('print-pallet')
  async printPallet(
    @Body()
    body: {
      palletNumber: number;
      countInPallet: number;
      productCountInPallet: number;
    },
  ): Promise<void> {
    await this.printerService.printPalletLabel(
      body.palletNumber,
      body.countInPallet,
      body.productCountInPallet,
    );
  }
}
