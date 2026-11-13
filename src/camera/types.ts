import * as net from 'net';

export enum CameraNames {
  Camera1 = 'Камера 1',
  Camera2 = 'Камера 2',
  Camera3 = 'Камера 3',
  Camera4 = 'Камера 4',
}

export interface CameraConnection {
  client: net.Socket;
  isConnected: boolean;
  ip: string;
  port: number;
  name: string;
}
