import { setConfigPath } from 'src/config/app-config';
/**
 * Аксессор настроек: значения из config.json, без process.env.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  config,
  getConfigValue,
  loadConfig,
  notifyConfigChanged,
  onConfigChange,
  setConfigOverride,
} from './config';

describe('config', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-config-'));
    setConfigPath(path.join(dir, 'config.json'));
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_HOST: 'localhost', DB_PORT: 5432, IS_PRINT: true }),
    );
    loadConfig();
  });

  afterEach(() => {
    setConfigPath(null);
    setConfigOverride('DB_HOST', undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('читает значения из JSON как строки', () => {
    expect(config.DB_HOST).toBe('localhost');
    expect(config.DB_PORT).toBe('5432');
    expect(config.IS_PRINT).toBe('true');
  });

  it('неизвестный ключ — undefined', () => {
    expect(config.NOT_EXISTS).toBeUndefined();
  });

  it('override перекрывает JSON и снимается', () => {
    setConfigOverride('DB_HOST', 'remote');
    expect(getConfigValue('DB_HOST')).toBe('remote');

    setConfigOverride('DB_HOST', undefined);
    expect(getConfigValue('DB_HOST')).toBe('localhost');
  });

  it('после перезагрузки видит изменения файла', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_HOST: 'changed' }),
    );
    loadConfig();

    expect(config.DB_HOST).toBe('changed');
  });

  it('оповещает подписчиков и применяет изменения без перезапуска', () => {
    const listener = jest.fn();
    const unsubscribe = onConfigChange(listener);

    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_HOST: 'hot-reload' }),
    );
    notifyConfigChanged();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ DB_HOST: 'hot-reload' }),
    );
    expect(config.DB_HOST).toBe('hot-reload');

    unsubscribe();
    notifyConfigChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
