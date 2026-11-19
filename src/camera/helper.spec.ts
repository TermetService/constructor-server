import { getCameraConfigName, isAggregationCameraType } from './helper';

describe('getCameraConfigName', () => {
  it('приводит имя камеры к нотации БД «Камера N»', () => {
    expect(getCameraConfigName('Camera1')).toBe('Камера 1');
    expect(getCameraConfigName('Camera2')).toBe('Камера 2');
    expect(getCameraConfigName('Камера 3')).toBe('Камера 3');
  });

  it('без цифры — первая камера', () => {
    expect(getCameraConfigName('camera')).toBe('Камера 1');
    expect(getCameraConfigName('')).toBe('Камера 1');
  });
});

describe('isAggregationCameraType', () => {
  it('агрегация — пакетный режим', () => {
    expect(isAggregationCameraType('Агрегация')).toBe(true);
    expect(isAggregationCameraType('агрегация')).toBe(true);
  });

  it('сериализация и верификация — поштучный режим', () => {
    expect(isAggregationCameraType('Сериализация')).toBe(false);
    expect(isAggregationCameraType('Верификация')).toBe(false);
  });

  it('пустое значение — поштучный режим', () => {
    expect(isAggregationCameraType('')).toBe(false);
    expect(isAggregationCameraType(null)).toBe(false);
    expect(isAggregationCameraType(undefined)).toBe(false);
  });
});
