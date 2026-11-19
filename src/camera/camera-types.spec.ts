import {
  CAMERA_TYPES,
  CAMERA_TYPE_LABELS,
  CameraType,
  getCameraHandler,
  normalizeCameraType,
} from './camera-types';

describe('camera-types', () => {
  it('английские значения распознаются как есть', () => {
    expect(normalizeCameraType('aggregation')).toBe(CameraType.Aggregation);
    expect(normalizeCameraType('boxbinding')).toBe(CameraType.BoxBinding);
    expect(normalizeCameraType('box_binding')).toBe(CameraType.BoxBinding);
    expect(normalizeCameraType('pallet_adding')).toBe(CameraType.PalletAdding);
    expect(normalizeCameraType('serialization')).toBe(
      CameraType.Serialization,
    );
  });

  it('старые русские значения приводятся к английским', () => {
    expect(normalizeCameraType('Агрегация')).toBe(CameraType.Aggregation);
    expect(normalizeCameraType('Привязка коробки')).toBe(CameraType.BoxBinding);
    expect(normalizeCameraType('Добавление в паллету')).toBe(
      CameraType.PalletAdding,
    );
    expect(normalizeCameraType('Сериализация')).toBe(CameraType.Serialization);
  });

  it('неизвестный тип — null', () => {
    expect(normalizeCameraType('')).toBeNull();
    expect(normalizeCameraType(undefined)).toBeNull();
    expect(normalizeCameraType('что-то')).toBeNull();
  });

  it('агрегация и паллета — пакетная обработка', () => {
    expect(getCameraHandler('aggregation')).toBe('batch');
    expect(getCameraHandler('pallet_adding')).toBe('batch');
    expect(getCameraHandler('Агрегация')).toBe('batch');
  });

  it('привязка коробки — отдельный обработчик', () => {
    expect(getCameraHandler('boxbinding')).toBe('boxbinding');
    expect(getCameraHandler('box_binding')).toBe('boxbinding');
    expect(getCameraHandler('Привязка коробки')).toBe('boxbinding');
  });

  it('сериализация и пустой тип — поштучная обработка', () => {
    expect(getCameraHandler('serialization')).toBe('single');
    expect(getCameraHandler('Сериализация')).toBe('single');
    expect(getCameraHandler(null)).toBe('single');
    expect(getCameraHandler('')).toBe('single');
  });

  it('список для фронта: значение + русская подпись', () => {
    expect(CAMERA_TYPES).toEqual([
      { value: CameraType.Aggregation, label: 'Агрегация' },
      { value: CameraType.BoxBinding, label: 'Привязка коробки' },
      { value: CameraType.PalletAdding, label: 'Добавление в паллету' },
      { value: CameraType.Serialization, label: 'Сериализация' },
    ]);
    expect(CAMERA_TYPE_LABELS[CameraType.Serialization]).toBe('Сериализация');
  });
});
