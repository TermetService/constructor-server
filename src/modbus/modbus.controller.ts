import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { PLCLabels, PLCNames } from 'src/printers/types';

@Controller('modbus')
export class ModbusController {
  constructor(private readonly modbusService: ModbusService) {}

  @Post('update-config')
  async updateConfig(
    @Body() body: { name: string; host: string; port: number; type: string },
  ): Promise<void> {
    console.log('update-config');

    await this.modbusService.updateModbusConfig(
      body.name,
      body.type,
      body.host,
      body.port,
    );
  }

  @Get(':label')
  async getConfig(@Param('label') label: PLCLabels): Promise<any> {
    try {
      let name = PLCNames.PLC1;
      if (label === PLCLabels.PLC2) {
        name = PLCNames.PLC2;
      }

      return await this.modbusService.getConfigByName(name);
    } catch (err) {
      console.log('get PLC Config', err);
    }
  }
}
