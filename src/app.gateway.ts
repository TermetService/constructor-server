import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppGatewayNames, RootMessage, RootStatuses } from './globalTypes';

@WebSocketGateway({
  cors: {
    origin: '*', // Разрешить доступ с любого источника
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  afterInit() {}

  /** Клиент может подключиться с ?port=3000 — попадёт в комнату своей панели */
  handleConnection(client: Socket): void {
    const port =
      (client.handshake?.query?.port as string) ??
      (client.handshake?.auth?.port as string);

    if (port) client.join(String(port));
  }

  sendModbusConnectionStatus(status: string): void {
    this.server.emit(AppGatewayNames.PLCStatus, status);
  }

  sendPrinterConnectionStatus(status: string): void {
    // console.log('____________sendPrinterConnectionStatus', status);
    this.server.emit(AppGatewayNames.PrinterStatus, status);
  }

  sendCameraConnectionStatus(status: string): void {
    // console.log('____________sendCameraConnectionStatus', status);
    this.server.emit(AppGatewayNames.CameraStatus, status);
  }

  sendControllerConfigStatus(status: string): void {
    this.server.emit(AppGatewayNames.ConfigStatus, status);
  }

  sendConturNumber(number: number): void {
    this.server.emit(AppGatewayNames.ConturNumber, number);
  }

  /**
   * Счётчики на фронт. Если передан targetPort — только панели этой камеры
   * (комната с именем порта), иначе всем клиентам.
   */
  sendProductCount(productCount: any, targetPort?: string): void {
    const port = targetPort ? String(targetPort) : null;

    if (port && this.hasRoom(port)) {
      this.server.to(port).emit(AppGatewayNames.ProductCount, productCount);
      return;
    }

    this.server.emit(AppGatewayNames.ProductCount, productCount);
  }

  private hasRoom(room: string): boolean {
    const sockets = this.server?.sockets?.adapter?.rooms?.get(room);

    return Boolean(sockets && sockets.size > 0);
  }

  sendLogData(logData: any): void {
    this.server.emit(AppGatewayNames.LogData, logData);
  }

  sendRootMessage(RootMessage: RootMessage): void {
    this.server.emit(AppGatewayNames.RootMessage, RootMessage);
  }

  sendRootMessage2(rootMessage: RootMessage, targetClientIp?: string): void {
    // if (targetClientIp) {
    //   this.sendToClient(
    //     targetClientIp,
    //     AppGatewayNames.RootMessage,
    //     rootMessage,
    //   );
    //   console.log(rootMessage.status, RootStatus.Success);
    //   if (rootMessage.status === RootStatus.Success) {
    //     // ✅ правильное сравнение
    //     if (targetClientIp !== '3000')
    //       this.gpioSerise.setHttpGreen(`${Addresses[targetClientIp]}:3000`);
    //     else this.gpioSerise.setGreenTimer();
    //   }
    //   if (rootMessage.status === RootStatus.Error) {
    //     console.log(21414);
    //     if (targetClientIp !== '3000')
    //       this.gpioSerise.setHttpRed(`${Addresses[targetClientIp]}:3000`);
    //     else this.gpioSerise.setGreenTimer();
    //   }
    // } else {
    //   this.server.emit(AppGatewayNames.RootMessage, rootMessage);
    // }
  }

  sendCoordinates(coordinates: string[][], targetClientIp?: string): void {
    //   if (targetClientIp) {
    //     // Отправка конкретному клиенту
    //     const sent = this.sendToClient(
    //       targetClientIp,
    //       AppGatewayNames.Coordinates,
    //       coordinates,
    //     );
    //     console.log(
    //       '-------------sendCoordinates to client:',
    //       targetClientIp,
    //       'success:',
    //       sent,
    //       coordinates,
    //     );
    //   } else {
    //     // Отправка всем клиентам (обратная совместимость)
    //     this.server.emit(AppGatewayNames.Coordinates, coordinates);
    //     console.log('-------------sendCoordinates to all clients:', coordinates);
    //   }
    // }
    // sendStatus(status, taskname, isOld?) {
    //   this.server.emit(AppGatewayNames.SendStatus, { status, taskname, isOld });
    // }
    // sendStatusSecondDB(massege: string): any {
    //   console.log({ massege }, '[[[[]]][asfasf');
    //   this.server.emit(AppGatewayNames.sendStatusSecondDB, { massege });
    // }
  }

  sendRootStatuses(RootStatuses: RootStatuses): void {
    this.server.emit(AppGatewayNames.RootStatuses, RootStatuses);
  }

  sendCod(cod: string, inputID: string): void {
    this.server.emit(AppGatewayNames.SendCod, { cod, inputID });
  }
}
