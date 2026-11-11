/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервис замокан, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./template.service', () => ({ TemplateService: class {} }));

import { TemplateController } from './template.controller';

describe('TemplateController', () => {
  let controller: TemplateController;

  beforeEach(() => {
    controller = new TemplateController({} as any);
  });

  it('создаётся с замоканной зависимостью', () => {
    expect(controller).toBeDefined();
  });
});
