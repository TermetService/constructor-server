# Контекст для фронта: типы камер на английском

- **Дата:** 2026-11-17
- **Кому:** constructor-front
- **От:** constructor-server

Типы камеры теперь хранятся в БД и ходят по API **на английском**, а на экране
показываем русские подписи. Русские значения, которые уже лежат в БД, сервер
понимает и приводит к английским — но фронт должен отправлять английские.

## Значения

| Значение (API/БД) | Подпись на экране | Обработка |
|---|---|---|
| `aggregation` | Агрегация | пакетная (`handleMessage2`) |
| `box_binding` | Привязка коробки | привязка этикетки (`handleMessageBind`) |
| `pallet_adding` | Добавление в паллету | пакетная (`handleMessage2`) |
| `serialization` | Сериализация | поштучная (`handleMessage`) |

## Новый эндпоинт

```
GET /camera/types
```

```json
[
  { "value": "aggregation",  "label": "Агрегация" },
  { "value": "box_binding",  "label": "Привязка коробки" },
  { "value": "pallet_adding","label": "Добавление в паллету" },
  { "value": "serialization","label": "Сериализация" }
]
```

Рекомендуется брать список оттуда, а не хардкодить (тогда добавление типа не
потребует правок фронта). Фолбэк-константа на случай недоступного сервера —
приветствуется.

## Что меняется на фронте

### 1. `src/components/Settings/Devices/constants.ts`

Было (русские значения прямо в `value`):

```ts
{ name: DeviceNames.Camera, types: ['Сериализация', 'Агрегация', 'Верификация'] }
```

Стало — значение + подпись:

```ts
export interface DeviceTypeOption { value: string; label: string }

{ name: DeviceNames.Camera, types: [
  { value: 'aggregation',   label: 'Агрегация' },
  { value: 'box_binding',   label: 'Привязка коробки' },
  { value: 'pallet_adding', label: 'Добавление в паллету' },
  { value: 'serialization', label: 'Сериализация' },
]}
```

«Верификация» из списка убирается — её больше нет в бэкенде.

### 2. `src/components/Settings/Devices/Devices.tsx`

```tsx
<option value="">Выберите тип</option>
{types.map(({ value, label }) => (
  <option key={value} value={value}>{label}</option>
))}
```

`onChange` пишет в состояние английское `value`.

### 3. Сохранение

`updateCameraConfig(name, type, host, port)` — `type` уже английский
(`aggregation` и т.д.), сервер сохранит как есть.

### 4. Отображение полученного конфига

`GET /camera/camera1` возвращает `type: "aggregation"`. Чтобы в `select`
показался выбранный пункт, состояние устройства должно содержать именно
`"aggregation"`. Если где-то показывается человекочитаемый текст — берите
`label` из `GET /camera/types` (или локальной карты), а не подставляйте `type`.

## Проверка

- [ ] `GET /camera/types` отдаёт 4 типа с русскими подписями
- [ ] в списке типов камеры 4 пункта (без «Верификация»)
- [ ] выбранная «Агрегация» сохраняется как `aggregation` (проверить в ответе
      `GET /camera/camera1`)
- [ ] после перезапуска сервера старые записи с русским типом читаются и
      показываются как английские
- [ ] смена типа на `serialization` переключает камеру на поштучную обработку
      (в логах сервера — `handleMessage`, не `handleMessage2`)
- [ ] `npm test`, `npm run build`

## Ответ

Пиши в `constructor-front/tmp/server-handoff.md`.
