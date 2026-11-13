export enum PrinterLabels {
  Printer1 = 'printer1',
  Printer2 = 'printer2',
  Printer3 = 'printer3',
  Printer4 = 'printer4',
}
export enum PLCLabels {
  PLC1 = 'PLC1',
  PLC2 = 'PLC2',
}
export enum CameraLabels {
  Camera1 = 'camera1',
  Camera2 = 'camera2',
  Camera3 = 'camera3',
  Camera4 = 'camera4',
}

export enum PLCNames {
  PLC1 = 'Контроллер 1',
  PLC2 = 'Контроллер 2',
}

export enum PrinterNames {
  Printer1 = 'Принтер 1',
  Printer2 = 'Принтер 2',
  Printer3 = 'Принтер 3',
  Printer4 = 'Принтер 4',
}


export enum DeviceNames {
  Camera = 'Камера',
  PLC = 'Контроллер',
  Printer = 'Принтер',
}

// export enum PrintersTypes {
//   Pasteck = 'Pasteck',
//   TSC = 'TSC',
// }

export enum PrintersTypes {
  ZPL = 'ZPL',
  TSC = 'TSC',
}

export const LABEL_FORMATS = {
  JSON: 'json',
  JSON_ZPL: 'json_zpl',
  ZPL: 'zpl',
  TSC: 'tsc',
  DM_ZPL: 'dm_zpl',
  DM_TSC: 'dm_tsc',
  PEOPLE: 'people',
  PEOPLE_ZPL: 'people_zpl',
} as const;

export interface GenerateOptions {
  template: string[];
  task: any;
  packagingNumber: number;
  productCount?: number;
  boxCount?: number;
  nettoWeight?: number;
  bruttoWeight?: number;
  formatOptions?: Record<string, string>;
  isZPL?: boolean;
  prefix?: string;
  useSuffixes?: boolean;
  padOddLength?: boolean;
}

export enum EncodingType {
  WIN1251 = 'win1251',
  UTF8 = 'utf-8',
}