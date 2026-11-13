export interface IBoxResponse {
  data: { box_number: number; code_count: number }[];
  total: number;
}

export interface IPalletResponse {
  data: { pallet_number: number; box_count: number }[];
  total: number;
}

export interface IBox {
  name: string;
  products: string[];
}

export interface IPallet {
  name: string;
  boxes: string[];
}

export interface IRecords {
  boxes: IBox[];
  pallets: IPallet[];
}

export enum SearchFrom {
  Code = 'code',
  Box = 'box',
  Pallet = 'pallet',
  Unknown = 'unknown',
}

/** Статус ответа методов поиска/веса */
export enum SearchStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  INVALID_FORMAT = 'invalid_format',
  DUPLICATE = 'duplicate',
}

// =====================================
// 1. Описываем интерфейсы для каждого уровня
export interface ProductCode {
  Barcode: string;
  Level: 0;
  NumberInTask: number;
  Weight: null;
  ChildBarcodes: [];
}

export interface Box {
  Barcode: string;
  Level: 1;
  NumberInTask: number;
  Weight: null;
  ChildBarcodes: ProductCode[];
}

export interface Pallet {
  Barcode: string;
  Level: 2;
  NumberInTask: number;
  Weight: null;
  ChildBarcodes: { [key: number]: Box }; // Объект с коробками по номерам
}

// Для hierarchy используем Record с ключом number и значением Pallet
export interface Hierarchy {
  [key: number]: Pallet;
}