import { CameraNames } from './types';
import { CameraType, normalizeCameraType } from './camera-types';

/**
 * Имя камеры в таблице camera_config: «Камера 1», «Камера 2», …
 * CameraNames.Camera1 = 'Camera1' — для конфига это имя не подходит,
 * поэтому все поиски конфига идут через этот хелпер.
 */
export const getCameraConfigName = (cameraName: CameraNames | string): string => {
  const digits = String(cameraName).replace(/\D/g, '');

  return digits ? `Камера ${digits}` : 'Камера 1';
};

/** true — тип «Агрегация» (понимает и старое русское значение) */
export const isAggregationCameraType = (type?: string | null): boolean =>
  normalizeCameraType(type) === CameraType.Aggregation;

export const getCameraIdPanel = (cameraName: CameraNames): string => {
  let id = '3000';
  if (cameraName === CameraNames.Camera1) {
    id = '3000';
  } else if (cameraName === CameraNames.Camera2) {
    id = '3003';
  } else if (cameraName === CameraNames.Camera3) {
    id = '3005';
  } else if (cameraName === CameraNames.Camera4) {
    id = '3006';
  }
  return id;
};

export const getCameraNameById = (panelId: string): CameraNames | null => {
  switch (panelId) {
    case '3000':
      return CameraNames.Camera1;
    case '3003':
      return CameraNames.Camera2;
    case '3005':
      return CameraNames.Camera3;
    case '3006':
      return CameraNames.Camera4;
    default:
      console.warn(`Неизвестный ID панели: ${panelId}`);
      return null;
  }
};

export const getAllCameras = (): { cameraNames: CameraNames[] } => {
  return {
    cameraNames: Object.values(CameraNames).filter(
      (value) => typeof value === 'string',
    ),
  } as { cameraNames: CameraNames[] };
};
