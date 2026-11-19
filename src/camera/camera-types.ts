/**
 * Типы камеры. В БД и API — английские значения, на фронте — русские подписи.
 */
export enum CameraType {
  /** Агрегация: коробка/паллета собирается из кодов, пакетная обработка */
  Aggregation = 'aggregation',
  /** Привязка коробки: скан этикетки коробки + кодов продуктов */
  BoxBinding = 'boxbinding',
  /** Добавление в паллету */
  PalletAdding = 'pallet_adding',
  /** Сериализация: поштучный скан */
  Serialization = 'serialization',
}

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  [CameraType.Aggregation]: 'Агрегация',
  [CameraType.BoxBinding]: 'Привязка коробки',
  [CameraType.PalletAdding]: 'Добавление в паллету',
  [CameraType.Serialization]: 'Сериализация',
};

/** Список для фронта: значение для БД + русская подпись */
export const CAMERA_TYPES: { value: CameraType; label: string }[] = (
  Object.values(CameraType) as CameraType[]
).map((value) => ({ value, label: CAMERA_TYPE_LABELS[value] }));

/**
 * Приводит тип к English-значению. Русские значения поддерживаются,
 * чтобы старые записи в БД продолжали работать.
 */
export const normalizeCameraType = (
  type?: string | null,
): CameraType | null => {
  if (!type) return null;

  const lower = String(type).trim().toLowerCase();

  if ((Object.values(CameraType) as string[]).includes(lower)) {
    return lower as CameraType;
  }

  // старые/альтернативные написания: box_binding, box-binding
  if (lower.includes('box') && lower.includes('bind')) {
    return CameraType.BoxBinding;
  }

  if (lower.includes('агрег')) return CameraType.Aggregation;
  if (lower.includes('привязк')) return CameraType.BoxBinding;
  if (lower.includes('паллет')) return CameraType.PalletAdding;
  if (lower.includes('сериализ')) return CameraType.Serialization;

  return null;
};

/**
 * Как обрабатывать сообщения камеры этого типа:
 * batch — буфер + ParseLayer + пакетное сохранение (handleMessage2),
 * box_binding — привязка этикетки коробки (handleMessageBind),
 * single — поштучное сохранение (handleMessage).
 */
export type CameraHandler = 'batch' | 'boxbinding' | 'single';

export const getCameraHandler = (type?: string | null): CameraHandler => {
  switch (normalizeCameraType(type)) {
    case CameraType.Aggregation:
      return 'batch';
    case CameraType.BoxBinding:
      return 'boxbinding';
    case CameraType.PalletAdding:
      return 'batch';
    case CameraType.Serialization:
      return 'single';
    default:
      return 'single';
  }
};
