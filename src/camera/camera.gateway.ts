import { WebSocket } from 'ws';

const ws = new WebSocket('ws://172.16.16.16:2002');

ws.on('open', () => {
  console.log('Connected to the camera WebSocket server');
});

ws.on('message', (data) => {
  console.log(`Received data from camera: ${data}`);
  // Отправляем данные на ваш NestJS WebSocket сервер
  sendToNestWebSocketServer(data.toString());
});

ws.on('error', (error) => {
  console.log(`WebSocket error: ${error.message}`);
});

ws.on('close', () => {
  console.log('Disconnected from the camera WebSocket server');
});

function sendToNestWebSocketServer(data: string) {
  const nestWs = new WebSocket('ws://localhost:2002/ws');

  nestWs.on('open', () => {
    nestWs.send(data);
  });

  nestWs.on('close', () => {
    console.log('Disconnected from NestJS WebSocket server');
  });

  nestWs.on('error', (error) => {
    console.log(`NestJS WebSocket error: ${error.message}`);
  });
}
