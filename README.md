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

### Почта для восстановления пароля

Сброс пароля отправляется по SMTP. Без настроенного SMTP код пишется в лог
сервера, а в development ещё и возвращается в ответе как `dev_code` — этого
достаточно для локальной проверки.

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=robot@example.com
SMTP_PASSWORD=...
SMTP_FROM=FamilyCRM <robot@example.com>
SMTP_USE_TLS=true
PASSWORD_RESET_TOKEN_MINUTES=30
```

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
- Восстановление пароля: `POST /auth/forgot-password` отправляет одноразовый
  код, `POST /auth/reset-password` меняет пароль. Смена/сброс пароля
  инвалидирует старые JWT (`users.token_version`).
- Все данные ограничены рамками семьи: доступ к чужой семье возвращает `403`.
- Роль `Parent` управляет участниками и задачами, `Child` — ограничена.

### Основные возможности API

| Область | Эндпоинты |
|---|---|
| Календарь | `GET/POST /events`, `PATCH/DELETE /events/{id}`, `GET /users/{id}/events`, `GET /families/{id}/events` |
| Повторения | `recurrence`: `none` / `daily` / `weekly` / `monthly`, `recurrence_day` (день недели 0–6 или день месяца 1–31) |
| Задачи и коины | `GET/POST /tasks`, `PATCH/DELETE /tasks/{id}`, `PUT /tasks/{id}/status`, `GET /users/{id}/coins` |
| Магазин и комната | `GET /shop/items`, `POST /shop/purchases`, `GET /users/{id}/room` |
| Финансы | `GET/POST /expenses`, `PATCH/DELETE /expenses/{id}`, `GET /families/{id}/expenses/summary`; фильтры `date_from`, `date_to`, `category` |
| Семья | `GET /families/{id}`, `GET /families/{id}/members`, `POST /families/{id}/invite` |
| Профиль | `PATCH /users/{id}` (имя, аватар), `POST /auth/change-password` |
| Восстановление | `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Бюджеты | `GET /families/{id}/budgets`, `PUT/DELETE /families/{id}/budgets/{category}` |
| Реалтайм | `WS /ws/families/{id}?token=<access_token>` — короткие уведомления об изменениях |
| Push | `GET/POST /users/{id}/push-subscriptions`, `DELETE /users/{id}/push-subscriptions?token=...` |
| Геозоны | `GET/POST /families/{id}/geofences`, `PATCH/DELETE /geofences/{id}`, `GET /families/{id}/location-alerts` |

**Реалтайм.** После любого изменения (событие, задача, расход, покупка,
геопозиция) сервер рассылает подключённым членам семьи сообщение
`{"type": "..."}`. Клиент обновляет только затронутый ресурс, а медленный
polling (60 с) остаётся страховкой. Для WebSocket на сервере нужен пакет
`websockets` — он входит в `requirements.txt`.

**Точечная загрузка.** Приложение не тянет `/families/{id}/overview`:
оболочка запрашивает только `GET /families/{id}` и `members`, а каждый экран
загружает свой ресурс (`events`, `tasks`, `expenses`) через хук
`frontend/useFamilyResource.js` при фокусе и по WebSocket-событию.
`/overview` оставлен для отладки и обратной совместимости.

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
- **Профиль** — отдельная вкладка: аватар (эмодзи), имя, смена пароля, код
  приглашения и выход из аккаунта.
- **Календарь** — переключение «Неделя / Месяц», точки на днях с событиями,
  дата окончания повторяющейся серии.
- **Финансы** — переключение месяцев, фильтр по категории, бюджеты по
  категориям (задаёт родитель) с индикатором перерасхода.
- **Роли** — создавать и назначать задачи может только родитель; ребёнок
  двигает назначенные ему задачи по статусам.
- **Восстановление пароля** — ссылка «Забыли пароль?» на экране входа,
  одноразовый код из письма.
- **Напоминания** — локальные уведомления за 15 минут до события на неделю
  вперёд (`expo-notifications`), включаются в профиле.
- **Push-уведомления** — регистрация Expo-токена в профиле: приходят о новых
  задачах, выполненных задачах и событиях, добавленных другим членом семьи.
  Требуют development build (в Expo Go удалённый push не работает).
- **Геозоны и фоновый трекинг** — родитель создаёт зоны (школа, дом) на
  локаторе, устройство передаёт координаты в фоне (`expo-task-manager`),
  сервер фиксирует вход/выход и отправляет push родителям.

> Для работы WebSocket локальный uvicorn должен быть установлен с пакетом
> `websockets` (он уже в `requirements.txt`).

### Push-уведомления: development build

Удалённый push в Expo Go не поддерживается с SDK 53, нужен development build
и EAS project id.

```bash
cd frontend
npx eas init                     # создаёт/привязывает EAS-проект
# пропишите id в frontend/.env:
# EXPO_PUBLIC_EAS_PROJECT_ID=<uuid>

npx eas build --profile development --platform android
# или локально: npx expo run:android
```

После установки development build откройте профиль и включите
«Push-уведомления». Токен сохраняется в SecureStore и повторно регистрируется
на backend при входе; при выходе подписка удаляется.

Сервер отправляет push через Expo Push API (`https://exp.host/--/api/v2/push/send`).
Настройки: `PUSH_ENABLED`, `EXPO_PUSH_URL`. Невалидные токены
(`DeviceNotRegistered`) автоматически деактивируются.

Триггеры: назначение задачи, выполнение задачи (автору), событие, добавленное
другому члену семьи, приглашение в семью, вход/выход из геозоны.

### Геозоны и фоновый трекинг

1. Родитель открывает **Локатор → Геозоны → Добавить**, задаёт название, радиус
   и координаты (можно взять текущую позицию).
2. На устройстве включается «Передавать геопозицию в фоне»; приложение
   запрашивает разрешение «Всегда» и запускает задачу `expo-task-manager`
   (обновление ~раз в минуту или при смещении на 100 м).
3. Сервер сравнивает предыдущую и новую позицию с каждой геозоной и при
   переходе создаёт событие; родителям уходит push, события видны в
   «События геозон».

Требуется development build: фоновые задачи и «Всегда»-разрешение в Expo Go
недоступны. Первая позиция только сохраняется — ложного «входа» при запуске
не будет. Расход батареи зависит от настроек энергосбережения устройства.

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
- Геолокация обновляется по кнопке; фонового трекинга и геозон пока нет.
- Удалённых push-уведомлений нет: работают только локальные напоминания.
- Восстановление пароля требует настроенного SMTP; без него код виден в логе
  и (в development) в ответе API.
- Для standalone Android-сборки нужен ключ Google Maps (в Expo Go карта
  работает без настройки).
- См. [docs/ROADMAP.md](docs/ROADMAP.md).

## План развития

См. [docs/ROADMAP.md](docs/ROADMAP.md).
