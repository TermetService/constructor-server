/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервис замокан, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./monitoring.service', () => ({ MonitoringService: class {} }));

import { MonitoringController } from './monitoring.controller';

describe('MonitoringController', () => {
  let controller: MonitoringController;

  beforeEach(() => {
    controller = new MonitoringController({} as any);
  });

  it('создаётся с замоканной зависимостью', () => {
    expect(controller).toBeDefined();
  });
});
