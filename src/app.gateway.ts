import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { AppGatewayNames, RootMessage, RootStatuses } from './globalTypes';

@WebSocketGateway({
  cors: {
    origin: '*', // Разрешить доступ с любого источника
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
})
export class AppGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  afterInit() {}

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

  sendProductCount(productCount: any): void {
    this.server.emit(AppGatewayNames.ProductCount, productCount);
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
