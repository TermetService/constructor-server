// camera-config.service.ts
import { Injectable } from '@nestjs/common';
import { CameraNames } from './types';

@Injectable()
export class CameraConfigService {
  // Начальные значения по умолчанию
  private cameraToClientPortMap: Partial<Record<CameraNames, string>> = {
    [CameraNames.Camera1]: '3000',
    [CameraNames.Camera2]: '3003',
    [CameraNames.Camera3]: '3005',
    [CameraNames.Camera4]: '3006',
  };

  // Получить порт для камеры
  getClientPortByCamera(cameraName: CameraNames): string | undefined {
    return this.cameraToClientPortMap[cameraName];
  }

  // Установить порт для конкретной камеры
  setCameraPort(cameraName: CameraNames, port: string): void {
    if (!Object.values(CameraNames).includes(cameraName)) {
      throw new Error(`Неизвестное имя камеры: ${cameraName}`);
    }
    this.cameraToClientPortMap[cameraName] = port;
  }

  // Обновить всю конфигурацию
  updateAllCameraMappings(
    newMappings: Partial<Record<CameraNames, string>>,
  ): void {
    this.cameraToClientPortMap = {
      ...this.cameraToClientPortMap,
      ...newMappings,
    };
  }

  // Получить текущую конфигурацию (копию)
  getAllCameraMappings(): Partial<Record<CameraNames, string>> {
    return { ...this.cameraToClientPortMap };
  }
}
