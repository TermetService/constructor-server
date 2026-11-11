/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервис замокан, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./settings.service', () => ({ SettingsService: class {} }));

import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;

  beforeEach(() => {
    controller = new SettingsController({} as any);
  });

  it('создаётся с замоканной зависимостью', () => {
    expect(controller).toBeDefined();
  });
});
