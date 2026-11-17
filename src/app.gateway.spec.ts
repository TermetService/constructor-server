/**
 * Адресация счётчиков по панели камеры: комната = порт фронта (Camera1 → 3000).
 */
import { AppGateway } from './app.gateway';

const makeServer = (rooms: Record<string, Set<string>> = {}) => {
  const roomEmit = jest.fn();

  return {
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: roomEmit })),
    roomEmit,
    sockets: { adapter: { rooms: new Map(Object.entries(rooms)) } },
  };
};

describe('AppGateway', () => {
  it('клиент с ?port=3000 попадает в комнату 3000', () => {
    const gateway = new AppGateway();
    const client: any = { handshake: { query: { port: '3000' } }, join: jest.fn() };

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('3000');
  });

  it('без порта клиент никуда не вступает', () => {
    const gateway = new AppGateway();
    const client: any = { handshake: { query: {} }, join: jest.fn() };

    gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
  });

  it('sendProductCount с портом шлёт только в комнату панели', () => {
    const gateway = new AppGateway();
    const server = makeServer({ '3000': new Set(['socket-1']) });
    gateway.server = server as any;

    gateway.sendProductCount({ productCount: 5 }, '3000');

    expect(server.to).toHaveBeenCalledWith('3000');
    expect(server.roomEmit).toHaveBeenCalledWith('productCount', {
      productCount: 5,
    });
    expect(server.emit).not.toHaveBeenCalled();
  });

  it('sendProductCount без порта шлёт всем', () => {
    const gateway = new AppGateway();
    gateway.server = makeServer() as any;

    gateway.sendProductCount({ productCount: 5 });

    expect(gateway.server.emit).toHaveBeenCalledWith('productCount', {
      productCount: 5,
    });
    expect(gateway.server.to).not.toHaveBeenCalled();
  });

  it('если в комнате никого нет — шлёт всем', () => {
    const gateway = new AppGateway();
    gateway.server = makeServer({ '3000': new Set() }) as any;

    gateway.sendProductCount({ productCount: 5 }, '3000');

    expect(gateway.server.emit).toHaveBeenCalledWith('productCount', {
      productCount: 5,
    });
  });
});
