export enum SearchFrom {
  Code = 'code',
  Box = 'box',
  Pallet = 'pallet',
  Unknown = 'unknown',
}

export interface Gs1ParseResult {
  type: SearchFrom;
  data?: Record<string, string>; // AI -> значение
  semantic?: Record<string, string>; // AI -> семантический тип (gtin, itf14, etc.)
  error?: string;
  rawCode?: string;
}

export interface Gs1Template {
  id: number;
  template: string[];
  type: 'box' | 'pallet';
}

export interface Gs1ValidationResult {
  isValid: boolean;
  error?: string;
  position?: number;
  expected?: string;
  found?: string;
}

export const FIXED_LENGTH_AI: Record<string, number> = {
  '01': 14,
  '02': 14,
  '11': 6,
  '17': 6,
  '3102': 6,
  '3103': 6,
};

// Новый интерфейс для элемента шаблона
export interface TemplateItem {
  ai: string; // Код AI (01, 10, 17 и т.д.)
  semantic?: string; // Семантический тип (gtin, itf14, batch и т.д.)
  fullString: string; // Полная строка "01 gtin"
}
