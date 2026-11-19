/**
 * Чтение/запись config.json — единственного источника настроек.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getConfigPath,
  getPublicConfig,
  readConfig,
  setConfigPath,
  writeConfig,
} from './app-config';

describe('app-config', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-appconfig-'));
    setConfigPath(path.join(dir, 'config.json'));
  });

  afterEach(() => {
    setConfigPath(null);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('путь берётся из APP_CONFIG_PATH', () => {
    expect(getConfigPath()).toBe(path.join(dir, 'config.json'));
  });

  it('читает JSON', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_PORT: 5432, IS_PRINT: true }),
    );

    expect(readConfig()).toEqual({ DB_PORT: 5432, IS_PRINT: true });
  });

  it('нет файла — пустой объект', () => {
    expect(readConfig()).toEqual({});
  });

  it('writeConfig дописывает и сохраняет остальное', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_PORT: 5432 }),
    );

    writeConfig({ flagInpallet: true });

    expect(readConfig()).toEqual({ DB_PORT: 5432, flagInpallet: true });
  });

  it('getPublicConfig маскирует секреты', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ DB_PASSWORD: 'secret', IS_PRINT: false }),
    );

    expect(getPublicConfig()).toEqual([
      { key: 'DB_PASSWORD', value: '***' },
      { key: 'IS_PRINT', value: 'false' },
    ]);
  });
});
