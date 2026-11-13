import { CameraNames } from './types';

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
