import { CodeRepository } from './code.repository';

describe('CodeRepository', () => {
  const makeRepo = (results: any | any[]) => {
    const query = jest.fn();
    if (Array.isArray(results) && results.length && Array.isArray(results[0])) {
      // последовательность ответов на несколько query
      results.forEach((r) => query.mockResolvedValueOnce(r));
    } else {
      query.mockResolvedValue(results);
    }

    const entityManager = {
      query,
      transaction: (fn: any) => fn({ query }),
    };

    const repo = new CodeRepository(
      entityManager as any,
      {} as any,
      { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as any,
    );

    return { repo, query };
  };

  describe('getBoxNumbersByCodes', () => {
    it('возвращает номер коробки и количество кодов в ней', async () => {
      const { repo, query } = makeRepo([
        { boxNumber: 1, codesCount: 15 },
        { boxNumber: 2, codesCount: 7 },
      ]);

      const result = await repo.getBoxNumbersByCodes('task_table', [
        'code1',
        'code2',
      ]);

      expect(result).toEqual([
        { boxNumber: 1, codesCount: 15 },
        { boxNumber: 2, codesCount: 7 },
      ]);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('code = ANY($1::text[])');
      expect(sql).toContain('"task_table"');
      expect(params).toEqual([['code1', 'code2']]);
    });

    it('пустой список кодов — пустой результат без запроса', async () => {
      const { repo, query } = makeRepo([]);

      await expect(
        repo.getBoxNumbersByCodes('task_table', []),
      ).resolves.toEqual([]);
      expect(query).not.toHaveBeenCalled();
    });

    it('приводит строковые значения из БД к числам', async () => {
      const { repo } = makeRepo([{ boxNumber: '3', codesCount: '15' }]);

      await expect(
        repo.getBoxNumbersByCodes('task_table', ['code1']),
      ).resolves.toEqual([{ boxNumber: 3, codesCount: 15 }]);
    });
  });

  describe('saveCodesToDatabase', () => {
    it('пустой список — успех без запроса', async () => {
      const { repo, query } = makeRepo([]);

      await expect(
        repo.saveCodesToDatabase('task_table', [], 1, 'Camera1'),
      ).resolves.toBe(true);
      expect(query).not.toHaveBeenCalled();
    });

    it('все коды вставлены — пишет основную таблицу, затем code_entity', async () => {
      const { repo, query } = makeRepo([
        [
          { id: 1, code: 'code1' },
          { id: 2, code: 'code2' },
        ],
        [],
      ]);

      await expect(
        repo.saveCodesToDatabase('task_table', ['code1', 'code2'], 1, 'Camera1'),
      ).resolves.toBe(true);

      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0][0]).toContain('INSERT INTO "task_table"');
      expect(query.mock.calls[1][0]).toContain('INSERT INTO "code_entity"');
    });

    it('часть кодов уже есть — ошибка (транзакция откатывается)', async () => {
      const { repo } = makeRepo([[{ id: 1, code: 'code1' }]]);

      await expect(
        repo.saveCodesToDatabase('task_table', ['code1', 'code2'], 1, 'Camera1'),
      ).rejects.toThrow(/пакет отменён/);
    });
  });

  describe('saveCodeToDatabase', () => {
    it('передаёт имя камеры, а не жёсткий Camera1', async () => {
      const { repo, query } = makeRepo([[{ id: 1 }], []]);

      await repo.saveCodeToDatabase('task_table', 'code1', 1, 'Camera2', 3);

      expect(query.mock.calls[0][1]).toEqual(['code1', 1, 'Camera2', 3]);
    });

    it('дубликат — false, code_entity не трогаем', async () => {
      const { repo, query } = makeRepo([[]]);

      await expect(
        repo.saveCodeToDatabase('task_table', 'code1', 1, 'Camera1'),
      ).resolves.toBe(false);
      expect(query).toHaveBeenCalledTimes(1);
    });
  });
});
