/**
 * Проверки перед назначением box_label коробке.
 * Репозиторий и GS1-парсер замоканы: проверяем только правила.
 */
import { IMonitoringVariables } from 'src/globalTypes';
import { SearchFrom } from 'src/gs1-parser/interfaces/gs1.types';
import { BoxLabelCheck, BoxLabelCheckService } from './box-label-check.service';

const product = (n: number) => `0104810272003892${String(n).padStart(2, '0')}`;
const boxLabel = (n: number) => `BOX-LABEL-000000${n}`;

const TABLE = 'test-table';

describe('BoxLabelCheckService', () => {
  let repository: any;
  let gs1ParserService: any;
  let service: BoxLabelCheckService;

  const parseAs = (
    map: Record<
      string,
      { type: SearchFrom; isValid?: boolean; validationMessage?: string }
    >,
  ) => {
    gs1ParserService.getContainerNumber.mockImplementation((code: string) =>
      Promise.resolve(map[code] ?? { type: SearchFrom.Unknown }),
    );
  };

  const rows = (
    codes: string[],
    boxNumber: number,
    palletNumber: number | null,
  ) =>
    codes.map((code) => ({
      code,
      box_number: boxNumber,
      box_label: null,
      pallet_number: palletNumber,
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.IS_DEVELOP;

    repository = {
      tableExists: jest.fn().mockResolvedValue(true),
      isLabelUsed: jest.fn().mockResolvedValue(false),
      findLabelForBox: jest.fn().mockResolvedValue([]),
      findCodesByList: jest.fn().mockResolvedValue([]),
    };
    gs1ParserService = { getContainerNumber: jest.fn() };

    service = new BoxLabelCheckService(
      repository,
      gs1ParserService,
      { tableName: TABLE } as IMonitoringVariables,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    );
  });

  afterAll(() => {
    delete process.env.IS_DEVELOP;
  });

  it('разрешает привязку: продукты из одной коробки, этикетка свободна', async () => {
    const products = [product(1), product(2)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [products[1]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue(rows(products, 3, 2));

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(true);
    expect(report.reason).toBeUndefined();
    expect(report.boxLabel).toBe(label);
    expect(report.boxNumber).toBe(3);
    expect(report.palletNumber).toBe(2);
    expect(report.productCodes).toEqual(products);
    expect(report.checks.every((check) => check.ok)).toBe(true);
    expect(repository.findCodesByList).toHaveBeenCalledWith(
      TABLE,
      products,
    );
  });

  it('отклоняет нераспознанный код', async () => {
    parseAs({
      [product(1)]: { type: SearchFrom.Code },
      [boxLabel(1)]: { type: SearchFrom.Box, isValid: true },
    });

    const report = await service.check([
      product(1),
      boxLabel(1),
      '01048102720038929999',
    ]);

    expect(report.ok).toBe(false);
    expect(report.reason).toContain('Коды не распознаны');
    expect(report.checks[0]).toEqual(
      expect.objectContaining({ code: BoxLabelCheck.CodesRecognized, ok: false }),
    );
  });

  it('требует хотя бы один код продукта', async () => {
    parseAs({ [boxLabel(1)]: { type: SearchFrom.Box, isValid: true } });

    const report = await service.check([boxLabel(1)]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe('Нет кодов продуктов с допустимой длиной');
  });

  it('требует ровно одну этикетку коробки', async () => {
    parseAs({
      [product(1)]: { type: SearchFrom.Code },
      [boxLabel(1)]: { type: SearchFrom.Box, isValid: true },
      [boxLabel(2)]: { type: SearchFrom.Box, isValid: true },
    });

    const report = await service.check([
      product(1),
      boxLabel(1),
      boxLabel(2),
    ]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe('Должен быть один код коробки');
  });

  it('отклоняет этикетку, не соответствующую заданию', async () => {
    parseAs({
      [product(1)]: { type: SearchFrom.Code },
      [boxLabel(1)]: {
        type: SearchFrom.Box,
        isValid: false,
        validationMessage: 'не тот GTIN',
      },
    });

    const report = await service.check([product(1), boxLabel(1)]);

    expect(report.ok).toBe(false);
    expect(report.reason).toContain('не соответствует заданию: не тот GTIN');
    expect(report.boxLabel).toBe(boxLabel(1));
  });

  it('в IS_DEVELOP пропускает проверку соответствия этикетки', async () => {
    process.env.IS_DEVELOP = 'true';
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: false },
    });
    repository.findCodesByList.mockResolvedValue(rows(products, 1, null));

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(true);
    expect(report.boxNumber).toBe(1);
  });

  it('отклоняет привязку, если таблицы задания нет', async () => {
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.tableExists.mockResolvedValue(false);

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe(
      `Таблица ${TABLE} не существует в базе данных`,
    );
    expect(repository.findCodesByList).not.toHaveBeenCalled();
  });

  it('отклоняет уже использованную этикетку', async () => {
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.isLabelUsed.mockResolvedValue(true);

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe(
      'Этикетка коробки уже существует в базе данных',
    );
  });

  it('отклоняет, если коды продуктов не найдены в системе', async () => {
    const products = [product(1), product(2)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [products[1]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue([rows([products[0]], 1, 1)][0]);

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toContain('Коды не найдены в системе');
    expect(report.reason).toContain(products[1]);
  });

  it('отклоняет коды из разных коробок', async () => {
    const products = [product(1), product(2)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [products[1]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue([
      ...rows([products[0]], 3, 1),
      ...rows([products[1]], 4, 1),
    ]);

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toContain('из разных коробок');
    expect(report.reason).toContain('#3');
    expect(report.reason).toContain('#4');
  });

  it('отклоняет, если у продуктов не определена коробка', async () => {
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue(rows(products, 0, null));

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe('У кодов продукта не определена коробка');
  });

  it('отклоняет, если этикетка уже стоит на этой коробке', async () => {
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue(rows(products, 5, 1));
    repository.findLabelForBox.mockResolvedValue([{ code: products[0] }]);

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(false);
    expect(report.reason).toBe(
      'Этикетка коробки уже существует в базе данных',
    );
    expect(repository.findLabelForBox).toHaveBeenCalledWith(TABLE, label, 5);
  });

  it('отбрасывает слишком короткие коды до проверок', async () => {
    const label = boxLabel(1);
    parseAs({ [label]: { type: SearchFrom.Box, isValid: true } });

    const report = await service.check(['short', label]);

    expect(gs1ParserService.getContainerNumber).toHaveBeenCalledTimes(1);
    expect(report.ok).toBe(false);
    expect(report.reason).toBe('Нет кодов продуктов с допустимой длиной');
  });

  it('возвращает паллету только если она положительная', async () => {
    const products = [product(1)];
    const label = boxLabel(1);
    parseAs({
      [products[0]]: { type: SearchFrom.Code },
      [label]: { type: SearchFrom.Box, isValid: true },
    });
    repository.findCodesByList.mockResolvedValue(rows(products, 2, 0));

    const report = await service.check([...products, label]);

    expect(report.ok).toBe(true);
    expect(report.palletNumber).toBeNull();
  });
});
