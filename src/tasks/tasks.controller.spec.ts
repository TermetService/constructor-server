/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервис замокан, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./tasks.service', () => ({ TasksService: class {} }));

import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(() => {
    controller = new TasksController({} as any);
  });

  it('создаётся с замоканной зависимостью', () => {
    expect(controller).toBeDefined();
  });
});
