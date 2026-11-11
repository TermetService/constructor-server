export enum EventTypes {
  CodeStatusUpdated = 'codeStatusUpdated',
  VariablesUpdated = 'variablesUpdated',
  ConnectionRestored = 'connectionRestored',
}

export enum MonitoringStatusActions {
  Left = 'left',
  Right = 'right',
  Reject = 'reject',
}

export interface IAllCounts {
  productCount: number;
  productsInCurrentBox: number;
  boxesInCurrentPallet: number;
  boxCount: number;
  palletCount: number;
  currentBoxNumber: number;
  currentPalletNumber: number;
}

export interface IMonitoringVariables {
  task: any | null;
  taskName: string;
  tableName: string;
  codeStatus: MonitoringStatusActions | null;
  boxNumber: number;
  palletNumber: number;
  limitProductInBox: number;
  limitBoxInPallet: number;
  productCount: number;
  boxCount: number;
  palletCount: number;
  currentBoxNumber: number;
  currentPalletNumber: number;
  productsInCurrentBox: number;
  boxesInCurrentPallet: number;
  isFirstBoxOdd: boolean;

  isMonitoring: boolean;
  isOldSorting: boolean;
  isPaused: boolean;
  circuitResetDelayTime: number;
  konturTime: any;
}

export enum TemplateTypes {
  Box = 'box',
  Pallet = 'pallet',
}

export enum AppGatewayNames {
  PLCStatus = 'connectionPLCStatus',
  PrinterStatus = 'connectionPrinterStatus',
  CameraStatus = 'connectionCameraStatus',
  ConfigStatus = 'controllerConfigStatus',
  ConturNumber = 'conturNumber',
  ProductCount = 'productCount',
  LogData = 'logData',
  RootMessage = 'rootMessage',
  RootStatuses = 'rootStatuses',
  SendCod = 'sendCod',
}

export enum Status {
  Connected = 'connected',
  Disconnected = 'disconnected',
}

export enum RootStatus {
  Success = 'success',
  Error = 'error',
}

export interface RootMessage {
  status: RootStatus;
  message: string;
}

export interface RootStatuses {
  isMonitoring: boolean;
  isPaused: boolean;
}
