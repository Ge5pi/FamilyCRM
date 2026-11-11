# FamilyCRM

Мобильное приложение-органайзер для семьи: общий календарь, задачи с
наградными «коинами», учёт расходов, виртуальная комната ребёнка, карта с
геолокацией членов семьи и живые обновления.

- **Backend** — FastAPI + SQLAlchemy 2 + Alembic. SQLite для локальной
  разработки, PostgreSQL — целевая production-база.
- **Frontend** — React Native / Expo: iOS и Android (плюс веб-версия для
  разработки).

## Структура репозитория

```
backend/
  main.py          # HTTP API
  models.py        # SQLAlchemy-модели
  schemas.py       # Pydantic-схемы
  config.py        # настройки из окружения (.env)
  database.py      # engine и сессии
  security.py      # bcrypt + JWT
  deps.py          # аутентификация и проверки доступа
  alembic/         # миграции схемы
  tests/           # pytest-тесты
frontend/
  App.js           # навигация и состояние сессии
  api.js           # единый API-клиент (JWT, ошибки)
  screens/         # экраны приложения
docs/
  ROADMAP.md       # план развития продукта
```

## Backend: запуск

Требуется Python 3.11+.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env          # при необходимости отредактируйте
alembic upgrade head          # создаёт схему БД

uvicorn main:app --reload
```

API: <http://127.0.0.1:8000>, интерактивная документация: `/docs`.

### База данных

По умолчанию используется SQLite-файл `backend/family_crm.db`.

Для PostgreSQL создайте базу и укажите URL в `.env`:

```env
DATABASE_URL=postgresql+psycopg2://familycrm:change-me@localhost:5432/familycrm
```

Затем примените миграции:

```bash
alembic upgrade head
```

Миграции общие для SQLite и PostgreSQL.

Для локального PostgreSQL в репозитории есть `docker-compose.yml`:

```bash
docker compose up -d db
# затем в backend/.env:
# DATABASE_URL=postgresql+psycopg2://familycrm:change-me@localhost:5432/familycrm
alembic upgrade head
```

```bash
alembic revision --autogenerate -m "add purchases"   # новая миграция
alembic upgrade head                                 # применить
```

> Если у вас осталась база, созданная до внедрения Alembic (таблицы уже есть,
> но нет `alembic_version`), выполните `alembic stamp head` либо начните с
> чистой базы.

### Тесты

```bash
cd backend
pytest -q
```

Тесты работают с изолированной in-memory SQLite и не затрагивают локальную
базу или PostgreSQL.

### Аутентификация

- `POST /auth/register` и `POST /auth/login` возвращают `access_token` (JWT).
- Токен передаётся заголовком `Authorization: Bearer <token>`.
- `GET /auth/me` — текущий пользователь.
- Пароли хранятся как bcrypt-хеши; старые SHA-256 хеши автоматически
  обновляются при успешном входе.
- Все данные ограничены рамками семьи: доступ к чужой семье возвращает `403`.
- Роль `Parent` управляет участниками и задачами, `Child` — ограничена.

### Основные возможности API

| Область | Эндпоинты |
|---|---|
| Календарь | `GET/POST /events`, `PATCH/DELETE /events/{id}`, `GET /users/{id}/events`, `GET /families/{id}/events` |
| Повторения | `recurrence`: `none` / `daily` / `weekly` / `monthly`, `recurrence_day` (день недели 0–6 или день месяца 1–31) |
| Задачи и коины | `GET/POST /tasks`, `PATCH/DELETE /tasks/{id}`, `PUT /tasks/{id}/status`, `GET /users/{id}/coins` |
| Магазин и комната | `GET /shop/items`, `POST /shop/purchases`, `GET /users/{id}/room` |
| Финансы | `GET/POST /expenses`, `PATCH/DELETE /expenses/{id}`, `GET /families/{id}/expenses/summary` |
| Семья | `GET /families/{id}/overview`, `GET /families/{id}/members`, `POST /families/{id}/invite` |
| Реалтайм | `WS /ws/families/{id}?token=<access_token>` — короткие уведомления об изменениях |

**Реалтайм.** После любого изменения (событие, задача, расход, покупка,
геопозиция) сервер рассылает подключённым членам семьи сообщение
`{"type": "..."}`. Клиент обновляет данные по нему, а медленный polling (30 с)
остаётся страховкой. Для WebSocket на сервере нужен пакет `websockets` — он
входит в `requirements.txt`.

**Часовые пояса.** API принимает и возвращает ISO-8601 в UTC
(`2026-07-03T09:00:00Z` / `+05:00`). В базе хранится naive UTC, поэтому SQLite и
PostgreSQL ведут себя одинаково. Фронтенд конвертирует время в локальное
(`frontend/datetime.js`).

**Коины.** Баланс `users.coins` меняется только через журнал
`coin_transactions` (награда за задачу, отзыв награды, покупка). История
доступна в `GET /users/{id}/coins`.

## Frontend: запуск (мобильное приложение)

Приложение — React Native / Expo. Запуск на телефоне:

```bash
cd frontend
npm install
cp .env.example .env     # необязательно в dev, см. ниже
npx expo start
```

- **Android** — откройте Expo Go и отсканируйте QR-код.
- **iOS** — отсканируйте QR-код камерой (Expo Go).
- **Эмуляторы** — нажмите `a` (Android) или `i` (iOS) в терминале.

В dev-режиме адрес backend определяется автоматически по IP компьютера из
Expo (`frontend/api.js`), поэтому телефон в той же Wi-Fi сети сразу видит API на
порту `8000`. Переопределить можно через `EXPO_PUBLIC_API_URL`:

| Платформа | Значение |
|---|---|
| Физическое устройство | `http://<IP-адрес-компьютера>:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Web / iOS Simulator | `http://127.0.0.1:8000` |

### Мобильные возможности

- **Сессия сохраняется** в защищённом хранилище (`expo-secure-store`, на вебе —
  `localStorage`): повторный вход при перезапуске не требуется.
- **Геолокация** — `expo-location`, разрешение запрашивается при отправке
  координат (настраивается в `app.json`).
- **Карта** — `react-native-maps` на iOS/Android; в вебе показывается список
  координат. Для standalone Android-сборки понадобится ключ Google Maps
  (`android.config.googleMaps.apiKey`); в Expo Go карта работает без него.
- **Редактирование** — долгое нажатие на задачу и нажатие на событие открывают
  модальные формы (название, время, повторение, награда, исполнитель).

> Для работы WebSocket локальный uvicorn должен быть установлен с пакетом
> `websockets` (он уже в `requirements.txt`).

## Безопасность и конфигурация

- `SECRET_KEY` обязателен в production: при `ENVIRONMENT=production` приложение
  не запустится с дефолтным или коротким ключом.
- `CORS_ORIGINS` — список источников через запятую (или `*` для разработки).
- Локальные `.env`, SQLite-базы и артефакты Expo не попадают в git.

### Известные ограничения (следующие этапы)

- Роль выбирается пользователем при регистрации; приглашения по email — только
  для пользователей, которые ещё не состоят в семье с другими участниками.
- Нет refresh-токенов, отзыва токенов и rate limiting на вход.
- Перемещение пользователя в другую семью не переносит его записи
  (события/задачи/расходы остаются в прежней семье).
- Повторяющиеся события бессрочные: даты окончания серии пока нет.
- Основной экран всё ещё использует `/families/{id}/overview`; переход на
  точечные эндпоинты — следующий шаг.
- Геолокация обновляется по кнопке; фонового трекинга и геозон пока нет.
- Для standalone Android-сборки нужен ключ Google Maps (в Expo Go карта
  работает без настройки).
- См. [docs/ROADMAP.md](docs/ROADMAP.md).

## План развития

См. [docs/ROADMAP.md](docs/ROADMAP.md).
