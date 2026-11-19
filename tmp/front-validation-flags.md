# Фронт: флаги проверок кода и этикетки коробки

- **Дата:** 2026-11-18
- **Кому:** constructor-front
- **От:** constructor-server

Добавили флаги на каждую проверку. Значения лежат в `config.json` сервера,
по умолчанию **все включены**. Меняются со страницы «Конфигурация» и
применяются сразу, без перезапуска.

## API

### `GET /settings/runtime`

Теперь дополнительно отдаёт:

```json
{
  "flags": { "flagInpallet": false, "flagInBoxLable": true },
  "validationFlags": {
    "codeEmpty": true,
    "codeLength": true,
    "codeDuplicate": false
  },
  "validationFlagsMeta": [
    {
      "key": "codeEmpty",
      "group": "code",
      "label": "Пустой код",
      "hint": "Отклонять пустой скан."
    }
  ],
  "configPath": "C:\\...\\config.json",
  "settings": [...]
}
```

`validationFlagsMeta` — готовый список для рендера: `key`, `group`, `label`,
`hint`. Группы: `code` (проверки кода) и `boxLabel` (проверки этикетки коробки).

### `PUT /settings/runtime/validation-flags`

Частичное тело, только изменённые:

```json
{ "codeLength": false, "boxSameBox": false }
```

Ответ — все актуальные флаги проверок.

## Ключи

### Проверки кода (`group: "code"`)

| key | Подпись |
|---|---|
| `codeEmpty` | Пустой код |
| `codeLength` | Длина кода |
| `codePrefix` | Префикс «01» |
| `codeGtin` | GTIN задания |
| `codeFormat` | Формат кода |
| `codeDuplicate` | Дубликат |
| `codeInTask` | Код в списке задания |

### Проверки этикетки коробки (`group: "boxLabel"`)

| key | Подпись |
|---|---|
| `boxCodesRecognized` | Коды распознаны |
| `boxHasProductCodes` | Есть коды продуктов |
| `boxSingleLabel` | Одна этикетка коробки |
| `boxLabelValid` | Этикетка по заданию |
| `boxTableExists` | Таблица существует |
| `boxLabelNotUsed` | Этикетка не использована |
| `boxProductsExist` | Продукты в системе |
| `boxSameBox` | Одна коробка |
| `boxNumberDefined` | Коробка определена |
| `boxLabelNotForBox` | Этикетка не привязана к коробке |

## Что сделать на фронте

`src/API/types.ts`:

```ts
export interface IValidationFlagMeta {
  key: string;
  group: "code" | "boxLabel";
  label: string;
  hint: string;
}

export interface IRuntimeSettings {
  flags: IRuntimeFlags;
  validationFlags: Record<string, boolean>;
  validationFlagsMeta: IValidationFlagMeta[];
  configPath?: string;
  settings: IRuntimeEnvItem[];
}
```

`src/API/settingsApi.ts`:

```ts
export const updateValidationFlags = async (
  patch: Record<string, boolean>,
): Promise<Record<string, boolean> | undefined> => {
  try {
    const response = await apiClient.put<Record<string, boolean>>(
      "/settings/runtime/validation-flags",
      patch,
    );
    return handleResponse(response);
  } catch (err) {
    handleError(err, "Ошибка при сохранении флагов проверок");
    return undefined;
  }
};
```

`RuntimeSettings.tsx`:

- новый блок «Проверки» с двумя секциями по `group`;
- для каждой `validationFlagsMeta` — `ToggleSwitch` + `hint`;
- состояние `savedValidationFlags` / `validationFlags`, патч только изменённых
  (как уже сделано для `flags`);
- кнопка «Сохранить проверки» → `updateValidationFlags(patch)` → повторный
  `GET /settings/runtime`;
- подсказка: «Выключенная проверка не блокирует сохранение/привязку».

Хелпер нормализации (`Runtime/helper.ts`): читать `raw.validationFlags ?? {}`,
`raw.validationFlagsMeta ?? []`, подставлять `true` для отсутствующих ключей.

## Проверка

- [ ] на странице «Конфигурация» видны 7 проверок кода и 10 проверок этикетки
- [ ] выключение «Длина кода» пропускает код другой длины (сохраняется)
- [ ] выключение «Одна коробка» позволяет привязать этикетку к кодам из разных
      коробок
- [ ] после сохранения значения есть в `config.json` сервера
- [ ] повторный `GET` показывает те же значения; перезапуск не нужен
- [ ] `npm test`, `npm run build`

## Ответ

Пиши в `constructor-front/tmp/server-handoff.md`.
