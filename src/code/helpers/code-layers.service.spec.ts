/**
 * Тесты сервиса слоёв: конфигурация из задания, расчёт текущего слоя
 * и количества кодов в нём.
 */
import { IMonitoringVariables } from 'src/globalTypes';
import { CodeLayersService } from './code-layers.service';

const makeGlobalMonVar = (task: any): IMonitoringVariables =>
  ({
    task,
    taskName: 'task.json',
    tableName: 'test-table',
  }) as any;

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const taskWithLayers = (overrides: Record<string, any> = {}) => ({
  layers: '3',
  layer1: '4',
  layer2: '4',
  layer3: '2',
  ...overrides,
});

describe('CodeLayersService', () => {
  let logger: any;

  beforeEach(() => {
    logger = makeLogger();
  });

  const makeService = (task: any) =>
    new CodeLayersService(makeGlobalMonVar(task), logger);

  describe('конфигурация слоёв', () => {
    it('читает количество слоёв из задания', () => {
      expect(makeService(taskWithLayers()).getTotalLayers()).toBe(3);
    });

    it('без задания возвращает 0 слоёв', () => {
      expect(makeService(null).getTotalLayers()).toBe(0);
      expect(makeService(null).getLayersConfig()).toEqual([]);
      expect(makeService(null).calculateTotalExpectedProducts()).toBe(0);
    });

    it('некорректное layers даёт 0', () => {
      expect(makeService({ layers: 'abc' }).getTotalLayers()).toBe(0);
      expect(makeService({ layers: '0' }).getTotalLayers()).toBe(0);
      expect(makeService({ layers: '-2' }).getTotalLayers()).toBe(0);
    });

    it('собирает вместимость слоёв по порядку', () => {
      expect(makeService(taskWithLayers()).getLayersConfig()).toEqual([4, 4, 2]);
    });

    it('некорректные значения слоя заменяет на 0', () => {
      const service = makeService(
        taskWithLayers({ layer2: 'abc', layer3: '-5' }),
      );

      expect(service.getLayersConfig()).toEqual([4, 0, 0]);
    });

    it('считает общую ожидаемую вместимость', () => {
      expect(
        makeService(taskWithLayers()).calculateTotalExpectedProducts(),
      ).toBe(10);
    });
  });

  describe('getExpectedCodesForLayer', () => {
    it('возвращает вместимость конкретного слоя', () => {
      const service = makeService(taskWithLayers());

      expect(service.getExpectedCodesForLayer(0)).toBe(4);
      expect(service.getExpectedCodesForLayer(1)).toBe(4);
      expect(service.getExpectedCodesForLayer(2)).toBe(2);
    });

    it('бросает ошибку для слоя вне задания', () => {
      const service = makeService(taskWithLayers());

      expect(() => service.getExpectedCodesForLayer(3)).toThrow(
        'Несуществующий слой 4',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('бросает ошибку, если в задании нет значения слоя', () => {
      const service = makeService(taskWithLayers({ layer2: undefined }));

      expect(() => service.getExpectedCodesForLayer(1)).toThrow(
        'Не найдено количество кодов для слоя 2',
      );
    });

    it('бросает ошибку на ноль или отрицательное значение', () => {
      expect(() =>
        makeService(taskWithLayers({ layer1: '0' })).getExpectedCodesForLayer(
          0,
        ),
      ).toThrow('Некорректное количество кодов для слоя 1');

      expect(() =>
        makeService(taskWithLayers({ layer1: '-5' })).getExpectedCodesForLayer(
          0,
        ),
      ).toThrow('Некорректное количество кодов для слоя 1');
    });
  });

  describe('calculateCurrentLayerIndex', () => {
    it.each([
      { products: 0, expected: 0, note: 'коробка пуста' },
      { products: 2, expected: 0, note: 'середина первого слоя' },
      { products: 4, expected: 1, note: 'первый слой закрыт' },
      { products: 5, expected: 1, note: 'начался второй слой' },
      { products: 8, expected: 2, note: 'второй слой закрыт' },
      { products: 9, expected: 2, note: 'начался третий слой' },
      { products: 10, expected: 2, note: 'все слои заполнены' },
      { products: 15, expected: 2, note: 'кодов больше, чем слоёв' },
    ])('$note: $products кодов → слой $expected', ({ products, expected }) => {
      expect(makeService(taskWithLayers()).calculateCurrentLayerIndex(products)).toBe(
        expected,
      );
    });

    it('без конфигурации всегда 0', () => {
      expect(makeService({ layers: '0' }).calculateCurrentLayerIndex(5)).toBe(0);
      expect(makeService(null).calculateCurrentLayerIndex(5)).toBe(0);
    });
  });

  describe('calculateCodesInCurrentLayer', () => {
    it.each([
      { layer: 0, products: 2, expected: 2 },
      { layer: 0, products: 4, expected: 4 },
      { layer: 1, products: 5, expected: 1 },
      { layer: 1, products: 8, expected: 4 },
      { layer: 2, products: 9, expected: 1 },
      { layer: 2, products: 10, expected: 2 },
    ])(
      'слой $layer при $products кодах → $expected',
      ({ layer, products, expected }) => {
        expect(
          makeService(taskWithLayers()).calculateCodesInCurrentLayer(
            layer,
            products,
          ),
        ).toBe(expected);
      },
    );

    it('пустая коробка и слой вне диапазона дают 0', () => {
      const service = makeService(taskWithLayers());

      expect(service.calculateCodesInCurrentLayer(0, 0)).toBe(0);
      expect(service.calculateCodesInCurrentLayer(3, 5)).toBe(0);
    });

    it('не отдаёт отрицательное значение, если кодов меньше предыдущих слоёв', () => {
      expect(
        makeService(taskWithLayers()).calculateCodesInCurrentLayer(1, 3),
      ).toBe(0);
    });
  });

  describe('getLayerProgress', () => {
    it('пустая коробка — первый слой, ничего не заполнено', () => {
      expect(makeService(taskWithLayers()).getLayerProgress(0)).toEqual({
        layerIndex: 0,
        layerNumber: 1,
        expectedCodes: 4,
        codesInLayer: 0,
        totalLayers: 3,
        totalExpectedProducts: 10,
        isLayerComplete: false,
        isLastLayer: false,
      });
    });

    it('середина первого слоя', () => {
      expect(makeService(taskWithLayers()).getLayerProgress(3)).toMatchObject({
        layerIndex: 0,
        layerNumber: 1,
        codesInLayer: 3,
        isLayerComplete: false,
      });
    });

    it('последний слой заполнен полностью', () => {
      expect(makeService(taskWithLayers()).getLayerProgress(10)).toMatchObject({
        layerIndex: 2,
        layerNumber: 3,
        expectedCodes: 2,
        codesInLayer: 2,
        isLayerComplete: true,
        isLastLayer: true,
      });
    });
  });

  describe('3 слоя по 5 кодов (коробка 15)', () => {
    const task3x5 = {
      layers: '3',
      layer1: '5',
      layer2: '5',
      layer3: '5',
    };

    it('конфигурация [5, 5, 5] и всего 15 кодов', () => {
      const service = makeService(task3x5);

      expect(service.getLayersConfig()).toEqual([5, 5, 5]);
      expect(service.calculateTotalExpectedProducts()).toBe(15);
      expect(service.getTotalLayers()).toBe(3);
    });

    it.each([
      { products: 0, layer: 0 },
      { products: 4, layer: 0 },
      { products: 5, layer: 1 },
      { products: 9, layer: 1 },
      { products: 10, layer: 2 },
      { products: 14, layer: 2 },
      { products: 15, layer: 2 },
    ])('$products кодов → слой $layer', ({ products, layer }) => {
      expect(makeService(task3x5).calculateCurrentLayerIndex(products)).toBe(
        layer,
      );
    });

    it.each([
      { products: 0, layer: 0, codes: 0 },
      { products: 3, layer: 0, codes: 3 },
      { products: 7, layer: 1, codes: 2 },
      { products: 11, layer: 2, codes: 1 },
      { products: 15, layer: 2, codes: 5 },
    ])(
      '$products кодов: в слое $layer лежит $codes',
      ({ products, layer, codes }) => {
        expect(
          makeService(task3x5).calculateCodesInCurrentLayer(layer, products),
        ).toBe(codes);
      },
    );

    it('прогресс на 15 кодах — последний слой заполнен', () => {
      expect(makeService(task3x5).getLayerProgress(15)).toEqual({
        layerIndex: 2,
        layerNumber: 3,
        expectedCodes: 5,
        codesInLayer: 5,
        totalLayers: 3,
        totalExpectedProducts: 15,
        isLayerComplete: true,
        isLastLayer: true,
      });
    });

    it('ожидаемое количество кодов по каждому слою', () => {
      const service = makeService(task3x5);

      expect(service.getExpectedCodesForLayer(0)).toBe(5);
      expect(service.getExpectedCodesForLayer(1)).toBe(5);
      expect(service.getExpectedCodesForLayer(2)).toBe(5);
    });
  });
});
