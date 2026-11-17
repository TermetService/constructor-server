# HANDOFF: server → front

> Файл-передача между сессиями DSH.
> Первая сессия (constructor-server) пишет сюда, вторая (constructor-front)
> читает по абсолютному пути и отвечает в своём `tmp/server-handoff.md`.
> Запись между папками запрещена — обмен только через чтение.

- **Дата:** YYYY-MM-DD
- **От:** constructor-server (сессия …)
- **Кому:** constructor-front
- **Задача:** кратко, что нужно сделать во фронте

## Контракт (что важно не сломать)

| Что | Значение |
|---|---|
| Сокет-сервер | `http://<host>:3001` |
| Подключение панели | `io(url, { query: { port: 3000 } })` — Camera1 |
| Порты камер | Camera1 — 3000, Camera2 — 3003, Camera3 — 3005, Camera4 — 3006 |
| Событие счётчиков | `productCount` |
| Поля `productCount` | `productCount, productsInCurrentBox, boxesInCurrentPallet, boxCount, palletCount, currentBoxNumber, currentPalletNumber` |
| Поведение сервера | если в комнате порта есть клиент — шлёт только ему; иначе broadcast |

## Файлы фронта, которые нужно посмотреть/поменять

- `src/soket/socett-connect.tsx` — подключение к сокету
- `src/components/Work/...` — отображение счётчиков
- `src/API/hooks/useMonitoringDispatch.tsx` — состояние мониторинга

## Что уже сделано на сервере

- `getCurrentCounts(cameraName)` берёт коробку/паллету/заполненность из состояния камеры.
- `sendCurrentStateToFrontend(counts, cameraName)` шлёт в комнату порта камеры.
- Gateway: `handleConnection` кладёт клиента в комнату `?port=...`; `sendProductCount(counts, port)`.
- При старте мониторинга состояние каждой камеры восстанавливается из БД и счётчики уходят на её панель.

## Что нужно от фронта

1. Подключаться с `?port=<свой порт>`.
2. Слушать `productCount` и обновлять панель.
3. Проверить, что при 4 камерах каждая панель получает только свои данные.

## Проверка

- [ ] панель Camera1 получает счётчики при подключении с `?port=3000`
- [ ] панель Camera2 — с `?port=3003`, данные разные
- [ ] без `?port` — приходит broadcast (совместимость)

## Вопросы обратно

Пиши в `constructor-front/tmp/server-handoff.md`:

- что не совпало по контракту;
- какие поля/события нужны дополнительно;
- что изменено и как проверено.
