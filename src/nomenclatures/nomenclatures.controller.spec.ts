/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервис замокан, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./nomenclatures.service', () => ({ NomenclaturesService: class {} }));

import { NomenclaturesController } from './nomenclatures.controller';

describe('NomenclaturesController', () => {
  let controller: NomenclaturesController;

  beforeEach(() => {
    controller = new NomenclaturesController({} as any);
  });

  it('создаётся с замоканной зависимостью', () => {
    expect(controller).toBeDefined();
  });
});
