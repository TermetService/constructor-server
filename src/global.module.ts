// global.module.ts
import { Module, Global } from '@nestjs/common';
import { IMonitoringVariables } from 'src/globalTypes';

const globalMonitoringVariables: IMonitoringVariables = {
  task: null,
  taskName: '',
  tableName: '',
  codeStatus: null,
  boxNumber: 1,
  palletNumber: 1,
  limitProductInBox: 1,
  limitBoxInPallet: 1,

  productCount: 0,
  boxCount: 0,
  palletCount: 0,

  currentBoxNumber: 1,
  currentPalletNumber: 1,
  productsInCurrentBox: 0,
  boxesInCurrentPallet: 0,
  isFirstBoxOdd: true,

  isMonitoring: false,
  isOldSorting: false,
  isPaused: false,
  circuitResetDelayTime: 0,
  konturTime: 0,
};

@Global()
@Module({
  providers: [
    {
      provide: 'GLOBAL_MONITORING_VARIABLES',
      useValue: globalMonitoringVariables,
    },
  ],
  exports: ['GLOBAL_MONITORING_VARIABLES'],
})
export class GlobalModule {}
