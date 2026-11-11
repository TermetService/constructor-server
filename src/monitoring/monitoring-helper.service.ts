import { Inject, Injectable } from "@nestjs/common";
import { allAddresses } from "src/addresses";
import { AppGateway } from "src/app.gateway";
import { IMonitoringVariables, RootStatuses } from "src/globalTypes";
import { ModbusService } from "src/modbus/modbus.service";

@Injectable()
export class MonitoringHelperService {


  constructor(
    private readonly modbusService: ModbusService,
    private readonly appGateway: AppGateway,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
  ) { }

  getResetAddress(konturNumber: number): string | null {
    const resetAddresses = {
      1: '0x847',
      2: '0x848',
      3: '0x849',
      4: '0x84A',
      5: '0x84B',
      6: '0x84C',
      7: '0x84D',
      8: '0x84E',
      9: '0x84F',
      10: '0x850',
    };

    return resetAddresses[konturNumber] || null;
  }

  sendRootStatuses() {
    const rootStatuses: RootStatuses = {
      isMonitoring: this.globalMonVar.isMonitoring,
      isPaused: this.globalMonVar.isPaused,
    };
    this.appGateway.sendRootStatuses(rootStatuses);
  }

  async addPLCDelay() {
    const a = await this.modbusService.readRegistersEnron(allAddresses.pusherOperationTimer);
    const b = await this.modbusService.readRegistersEnron(allAddresses.pusherDelayTimer);
    if (a && b && a.data && b.data) {
      if (a.data.length && b.data.length) {
        this.globalMonVar.circuitResetDelayTime = +a.data[0] + +b.data[0];
      }
    }
  }
}
