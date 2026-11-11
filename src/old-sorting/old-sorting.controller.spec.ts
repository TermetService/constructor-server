/**
 * Smoke-тест контроллера: проверяет, что он создаётся.
 * Сервисы замоканы, поэтому Nest-модуль и база данных не поднимаются.
 */
jest.mock('./old-sorting.service', () => ({ OldSortingService: class {} }));
jest.mock('./old-sorting-files.service', () => ({
  OldSortingFilesService: class {},
}));

import { OldSortingController } from './old-sorting.controller';

describe('OldSortingController', () => {
  let controller: OldSortingController;

  beforeEach(() => {
    controller = new OldSortingController({} as any, {} as any);
  });

  it('создаётся с замоканными зависимостями', () => {
    expect(controller).toBeDefined();
  });
});
