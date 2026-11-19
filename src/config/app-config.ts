import * as fs from 'fs';
import * as path from 'path';

/**
 * Конфигурация приложения — JSON рядом с проектом (или с exe при pkg).
 * Единственный источник настроек: переменные окружения не используются.
 *
 * Порядок поиска:
 *   1. setConfigPath() — программное переопределение (тесты/инструменты)
 *   2. `--config=путь` в аргументах запуска
 *   3. config.json рядом с исполняемым файлом (pkg)
 *   4. config.json в текущей рабочей директории
 */
let pathOverride: string | null = null;

/** Переопределить путь к конфигу (тесты, нестандартная установка) */
export function setConfigPath(configPath: string | null): void {
  pathOverride = configPath;
}

export function getConfigPath(): string {
  if (pathOverride) {
    return path.resolve(pathOverride);
  }

  const fromArgv = process.argv.find((arg) => arg.startsWith('--config='));
  if (fromArgv) {
    return path.resolve(fromArgv.slice('--config='.length));
  }

  if ((process as any).pkg) {
    return path.join(path.dirname(process.execPath), 'config.json');
  }

  return path.join(process.cwd(), 'config.json');
}

export function readConfig(): Record<string, any> {
  const file = getConfigPath();

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error(
        `Конфиг: не удалось прочитать ${file}: ${error?.message ?? error}`,
      );
    }

    return {};
  }
}

/** Сохраняет изменения в config.json */
export function writeConfig(
  patch: Record<string, any>,
): Record<string, any> {
  const file = getConfigPath();
  const next = { ...readConfig(), ...patch };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  return next;
}

/** Настройки для страницы конфигурации: секреты маскируем */
export function getPublicConfig(): { key: string; value: string | null }[] {
  return Object.entries(readConfig()).map(([key, value]) => {
    const isSecret = /PASSWORD|SECRET|TOKEN/i.test(key);

    return {
      key,
      value:
        isSecret && value ? '***' : value === null || value === undefined ? null : String(value),
    };
  });
}
