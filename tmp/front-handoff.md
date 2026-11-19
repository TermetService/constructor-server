# Контекст для фронта: конфигурация сервера (config.json) и камеры

Ты работаешь в репозитории `C:\Users\denis\Termet\constructor-front`
(React + TypeScript + Redux + react-router + socket.io + axios, CRA).

Рядом лежит `C:\Users\denis\Termet\constructor-server` — его **можно читать** по
абсолютному пути, писать нельзя. Сервер уже переведён на конфиг в JSON.

## Что важно понимать

1. Сервер больше **не использует `.env`** для настроек. Все значения — в
   `constructor-server/config.json` рядом с проектом (или с exe).
2. Флаги `flagInpallet`, `flagInBoxLable` лежат в том же `config.json` и меняются
   через API — применяются сразу, без перезапуска.
3. `.env` во фронте (`REACT_APP_SERVER_URL`, `PORT`, `REACT_APP_PANEL_PORT`) —
   это **build-time настройки CRA**, они остаются, их не трогаем.
4. Панель уже умеет представляться серверу: `src/soket/panel-port.ts` +
   `src/soket/socett-connect.tsx` шлют `query: { port }`. Сервер кладёт клиента в
   комнату порта и шлёт счётчики только этой панели. **Не переделывать.**

## Что уже есть на фронте (не создавать заново)

- Роут `/config` → `src/Pages/ConfigPage.tsx` → `src/components/Settings/Runtime/RuntimeSettings.tsx`
- API: `src/API/settingsApi.ts` → `getRuntimeSettings()`, `updateRuntimeFlags(patch)`
- Типы: `src/API/types.ts` → `IRuntimeFlags`, `IRuntimeEnvItem`, `IRuntimeSettings`
- Хелперы: `src/components/Settings/Runtime/helper.ts` → `RUNTIME_FLAG_META`,
  `normalizeRuntimeSettings`, `buildFlagsPatch`
- Страница устройств: `/devices` → `src/components/Settings/Devices/Devices.tsx`
  (тип камеры: Сериализация / Агрегация / Верификация — уже сохраняется)

## Изменения на сервере (уже в main)

### `GET /settings/runtime`

```json
{
  "flags": { "flagInpallet": false, "flagInBoxLable": true },
  "configPath": "C:\\Users\\denis\\Termet\\constructor-server\\config.json",
  "settings": [
    { "key": "IS_PRINT", "value": "true" },
    { "key": "DB_PASSWORD", "value": "***" }
  ]
}
```

Отличия от старого контракта: вместо `env` теперь **`settings`**, добавлен
**`configPath`**. Секреты приходят как `***`.

### `PUT /settings/runtime/flags`

```json
{ "flagInpallet": true }
```

Частичное тело, ответ — актуальные флаги. Сохраняет в `config.json`, применяет сразу.

## Что нужно поправить на фронте (точечно)

### 1. `src/API/types.ts`

```ts
export interface IRuntimeSettings {
  flags: IRuntimeFlags;
  /** путь к config.json на сервере */
  configPath?: string;
  /** все настройки из config.json (read-only) */
  settings: IRuntimeEnvItem[];
}
```

Комментарии к `IRuntimeFlags`/`IRuntimeEnvItem`: заменить «таблица runtime_setting /
перекрывают .env» на «config.json сервера».

### 2. `src/components/Settings/Runtime/helper.ts`

`normalizeRuntimeSettings` — принимать новый ключ, сохранив совместимость:

```ts
const normalizeSettingsList = (raw: unknown): IRuntimeEnvItem[] =>
  normalizeEnv(raw); // переиспользовать текущую normalizeEnv

export const normalizeRuntimeSettings = (
  raw: unknown,
): IRuntimeSettings | undefined => {
  if (!isRecord(raw)) return undefined;

  return {
    flags: normalizeRuntimeFlags(raw.flags),
    configPath:
      typeof raw.configPath === "string" ? raw.configPath : undefined,
    settings: normalizeSettingsList(raw.settings ?? raw.env),
  };
};
```

### 3. `src/components/Settings/Runtime/RuntimeSettings.tsx`

- состояние `env` → `settings` (или оставить имя, но источник `settings.settings`);
- блок «Настройки окружения» → **«Настройки (config.json)»**, бейдж
  **«из config.json · только чтение»**;
- подсказка под заголовком страницы: вместо «перекрывают .env» →
  «хранятся в config.json сервера»;
- подсказка под флагами: вместо «Сохраняются в БД сервера» →
  «Сохраняются в config.json сервера, действуют без перезапуска»;
- показать путь: `<code>{configPath}</code>` мелким текстом под заголовком;
- текст «Меняются в .env на сервере и требуют перезапуска» →
  «Эти ключи правятся в config.json на сервере; применяются после перезапуска»;
- пустое состояние: «Сервер не вернул ни одного ключа конфигурации».

### 4. Devices — без изменений

Тип камеры уже сохраняется. Сервер сам выбирает обработчик:

| Тип | Обработчик |
|---|---|
| `Агрегация` | `handleMessage2` (буфер → ParseLayer → пакетное сохранение) |
| `Сериализация`, `Верификация`, пусто | `handleMessage` (поштучно) |

## Проверка

- [ ] `GET /settings/runtime` рендерится: два переключателя + таблица `settings` + `configPath`
- [ ] «Сохранить» шлёт только изменённые флаги, после ответа — повторный GET
- [ ] в таблице нет `DB_PASSWORD` открытым текстом (должно быть `***`)
- [ ] `/devices` сохраняет тип камеры, ошибок в консоли нет
- [ ] панель подключается к сокету с `query.port` (см. `panel-port.ts`), счётчики приходят
- [ ] `npm test` / `npm run build` проходят

## Вопросы обратно

Пиши в `constructor-front/tmp/server-handoff.md`: что не совпало, какие поля нужны,
что изменено и как проверено.
