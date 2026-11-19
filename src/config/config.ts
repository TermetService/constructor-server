import * as fs from 'fs';
import { readConfig, getConfigPath } from './app-config';

/**
 * Конфигурация приложения — только из config.json.
 *
 * process.env для настроек не используется: JSON читается при старте.
 * При изменении файла конфиг перечитывается на лету (watchConfig), поэтому
 * перезапуск сервера для смены настроек не нужен — значения, которые читаются
 * через config.* в момент вызова, применяются сразу.
 *
 * Значения, зашитые в инфраструктуру при старте (подключение к БД, TCP-порты),
 * применяются после перезапуска — это ограничение самих соединений.
 */
let cache: Record<string, any> = {};
const overrides: Record<string, string | undefined> = {};
const listeners: ((config: Record<string, any>) => void)[] = [];
let watcher: fs.FSWatcher | null = null;
let poller: ReturnType<typeof fs.watchFile> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function loadConfig(): void {
  cache = readConfig();
}

/** Значение как строка или undefined */
export function getConfigValue(key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }

  const value = Object.prototype.hasOwnProperty.call(cache, key)
    ? cache[key]
    : undefined;

  if (value === undefined || value === null) return undefined;

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Только для тестов */
export function setConfigOverride(
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) delete overrides[key];
  else overrides[key] = String(value);
}

/** Подписка на изменение конфига; возвращает функцию отписки */
export function onConfigChange(
  listener: (config: Record<string, any>) => void,
): () => void {
  listeners.push(listener);

  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/** Перечитать файл и оповестить подписчиков (вызывается watcher'ом) */
export function notifyConfigChanged(): Record<string, any> {
  loadConfig();

  for (const listener of listeners) {
    try {
      listener(cache);
    } catch {
      // подписчик не должен ломать перезагрузку конфига
    }
  }

  return cache;
}

/**
 * Следит за config.json: файл изменили — перечитываем и оповещаем.
 * Без перезапуска сервера.
 */
export function watchConfig(): void {
  if (watcher || poller) return;

  const file = getConfigPath();

  try {
    watcher = fs.watch(file, () => scheduleReload());
    watcher.on('error', () => {
      // файл могли удалить/пересоздать — переключаемся на polling
      watcher?.close();
      watcher = null;
      startPolling(file);
    });
  } catch {
    startPolling(file);
  }
}

/** Несколько событий от редактора склеиваем в одну перезагрузку */
function scheduleReload(): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    notifyConfigChanged();
  }, 200);
}

function startPolling(file: string): void {
  if (poller) return;

  poller = fs.watchFile(file, { interval: 1000 }, () => scheduleReload());
}

export function stopConfigWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  if (poller) {
    fs.unwatchFile(getConfigPath());
    poller = null;
  }
}

export const config = new Proxy({} as Record<string, string | undefined>, {
  get: (_target, key: string) => getConfigValue(key),
  has: () => true,
});

// при импорте сразу читаем файл, чтобы модули видели настройки
loadConfig();
