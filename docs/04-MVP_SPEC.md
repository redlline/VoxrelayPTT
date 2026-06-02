# VoxRelay MVP — Детальная спецификация

**Версия**: 1.0  
**Дата**: 2026-05-20  
**Статус**: Draft  

---

## 1. Цель MVP

Работающий PTT-сервис с веб-клиентом, базовыми каналами, аутентификацией и административной панелью. Поддержка до **50 одновременных пользователей** в режиме peer-to-peer (без SFU).

**Ключевой сценарий**: Пользователь заходит на сайт → логинится → видит список каналов → зажимает Space → говорит → все в канале слышат.

---

## 2. Функциональные требования

### 2.1. Аутентификация

| # | Требование | Статус |
|---|-----------|--------|
| FR-1.1 | Регистрация по email + пароль (min 8 символов, uppercase+number) | MVP |
| FR-1.2 | Логин с JWT (access token 15min, refresh token 7d) | MVP |
| FR-1.3 | Выход (revoke refresh token) | MVP |
| FR-1.4 | Сброс пароля (email + ссылка) | MVP |
| FR-1.5 | Профиль: имя, аватар, статус | MVP |
| FR-1.6 | Сессия: одно устройство (по умолчанию), опционально несколько | MVP |

### 2.2. Каналы

| # | Требование | Статус |
|---|-----------|--------|
| FR-2.1 | Создание канала (название, описание, тип: public/private) | MVP |
| FR-2.2 | Список доступных каналов для пользователя | MVP |
| FR-2.3 | Присоединение к каналу (войти/выйти) | MVP |
| FR-2.4 | Просмотр участников канала (онлайн/офлайн) | MVP |
| FR-2.5 | Владелец канала может удалить канал | MVP |
| FR-2.6 | Владелец канала может кикнуть участника | MVP |

### 2.3. Push-to-Talk

| # | Требование | Статус |
|---|-----------|--------|
| FR-3.1 | PTT по клавише Space (зажал → говоришь, отпустил → слушаешь) | MVP |
| FR-3.2 | PTT по кнопке на экране (touch) | MVP |
| FR-3.3 | Индикация "кто сейчас говорит" (имя, аватар) | MVP |
| FR-3.4 | Уровень громкости (базовый audio meter) | MVP |
| FR-3.5 | Выбор активного канала (клик по каналу) | MVP |
| FR-3.6 | Listen-only режим (пользователь только слушает) | MVP |
| FR-3.7 | Визуальное оповещение, когда кто-то начал говорить | MVP |

### 2.4. WebRTC / Аудио

| # | Требование | Статус |
|---|-----------|--------|
| FR-4.1 | Захват микрофона (getUserMedia) | MVP |
| FR-4.2 | Opus encoding (48kHz, 20ms frames) | MVP |
| FR-4.3 | Peer-to-peer WebRTC (каждый говорит — все получают) | MVP |
| FR-4.4 | ICE + STUN (Google STUN) | MVP |
| FR-4.5 | Fallback на Relay-TURN (если недоступен) | MVP |
| FR-4.6 | Audio playback (AudioContext + gain control) | MVP |
| FR-4.7 | Latency display (ping в UI) | MVP |
| FR-4.8 | Автоматический reconnect при потере соединения | MVP |

### 2.5. Админ-панель

| # | Требование | Статус |
|---|-----------|--------|
| FR-5.1 | Список всех пользователей (с пагинацией) | MVP |
| FR-5.2 | Создание/редактирование/удаление пользователей | MVP |
| FR-5.3 | Блокировка пользователя | MVP |
| FR-5.4 | Назначение роли (admin / dispatcher / user) | MVP |
| FR-5.5 | Список всех каналов | MVP |
| FR-5.6 | Удаление любого канала | MVP |
| FR-5.7 | Просмотр логов: кто входил, выходил, создавал | MVP |

### 2.6. API

| # | Требование | Статус |
|---|-----------|--------|
| FR-6.1 | REST API для всех CRUD-операций | MVP |
| FR-6.2 | WebSocket для real-time событий (presence, speaking) | MVP |
| FR-6.3 | Swagger/OpenAPI документация | MVP |
| FR-6.4 | Rate limiting (100 req/min per user) | MVP |

---

## 3. Non-functional requirements

| # | Требование | Цель |
|---|-----------|------|
| NFR-1 | Audio latency (end-to-end) | < 500ms (p2p) |
| NFR-2 | Время соединения (join → слышу) | < 2s |
| NFR-3 | Максимум пользователей | 50 online, 5 активных спикеров |
| NFR-4 | Uptime | 99.0% |
| NFR-5 | Time to first byte | < 500ms |
| NFR-6 | Memory (браузер) | < 200MB |
| NFR-7 | Secure by default | HTTPS-only, HTTP-only cookies, CSP |

---

## 4. Архитектура MVP

```
[MVP Architecture — упрощенная]

┌─────────────────────────────────────────────────────────────┐
│                     VoxRelay MVP                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │  Web PWA     │◄──►│  Node.js     │                       │
│  │  (React)     │    │  Server      │                       │
│  │              │    │              │                       │
│  │  mediasoup-  │    │  Express +   │                       │
│  │  client      │    │  mediasoup   │                       │
│  │  p2p mode    │    │  (SFU-ready) │                       │
│  └──────────────┘    │              │                       │
│       │              │  - Auth      │                       │
│       │ WebRTC       │  - API       │                       │
│       │ (UDP)        │  - WS        │                       │
│       ▼              │  - Admin     │                       │
│  ┌──────────────┐    │              │                       │
│  │  Другой       │    └──────┬───────┘                       │
│  │  клиент      │           │                               │
│  └──────────────┘           │                               │
│                             ▼                               │
│                    ┌────────────────┐                       │
│                    │  PostgreSQL    │                       │
│                    │  + Redis       │                       │
│                    └────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

**Отличие от v1.0**: 
- В MVP — монолитный сервер (Node.js + Express + mediasoup). 
- Все в одном процессе (кроме базы данных).
- WebRTC в p2p-режиме (каждый клиент отправляет аудио всем участникам канала).
- Mediasoup интегрирован, но используется в минимальном режиме (только relay между участниками одной комнаты).

---

## 5. Технические детали реализации

### 5.1. Аудио-конвейер (Browser)

```typescript
// Псевдокод аудио-пайплайна в браузере
async function startPTT(channelId: string) {
  // 1. Захват микрофона
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  });

  // 2. Opus encoding через RTCRtpSender (WebRTC)
  const pc = new RTCPeerConnection({ iceServers: [...] });
  const track = stream.getAudioTracks()[0];
  pc.addTrack(track);

  // 3. Отправка на SFU / или напрямую peer-to-peer
  // В MVP: отправка на mediasoup SFU, SFU форвардит всем в канале
  const producer = await mediasoupClient.createProducer({
    track,
    encodings: [
      { maxBitrate: 32000 } // 32 kbps Opus
    ]
  });

  // 4. Прием аудио
  const consumer = await mediasoupClient.createConsumer({
    producerId: remoteProducerId,
    kind: 'audio',
  });
  const audio = new Audio();
  audio.srcObject = new MediaStream([consumer.track]);
  audio.play();
}
```

### 5.2. Структура БД (MVP)

```sql
-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'admin', 'dispatcher', 'user'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Каналы
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'public',  -- 'public', 'private'
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Участники канала
CREATE TABLE channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',  -- 'owner', 'admin', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Аудит логов
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3. API Routes (MVP)

```
# Auth
POST   /api/v1/auth/register          # Регистрация
POST   /api/v1/auth/login             # Вход
POST   /api/v1/auth/logout            # Выход
POST   /api/v1/auth/refresh           # Обновление токена
POST   /api/v1/auth/forgot-password   # Запрос сброса пароля
POST   /api/v1/auth/reset-password    # Сброс пароля
GET    /api/v1/auth/me                # Текущий пользователь

# Users (admin)
GET    /api/v1/users                  # Список пользователей
GET    /api/v1/users/:id              # Пользователь
POST   /api/v1/users                  # Создать пользователя
PATCH  /api/v1/users/:id              # Обновить пользователя
DELETE /api/v1/users/:id              # Удалить пользователя
PATCH  /api/v1/users/:id/role         # Сменить роль

# Channels
GET    /api/v1/channels               # Список каналов (доступных пользователю)
POST   /api/v1/channels               # Создать канал
GET    /api/v1/channels/:id           # Детали канала
PATCH  /api/v1/channels/:id           # Обновить канал
DELETE /api/v1/channels/:id           # Удалить канал
POST   /api/v1/channels/:id/join      # Присоединиться к каналу
POST   /api/v1/channels/:id/leave     # Покинуть канал
DELETE /api/v1/channels/:id/members/:userId  # Кикнуть участника (owner)
GET    /api/v1/channels/:id/members   # Список участников канала

# WebSocket
WS     /ws                            # WebSocket соединение
  Events:
    user.online / user.offline
    channel.join / channel.leave
    speaking.start / speaking.stop
    ping / pong
```

### 5.4. WebSocket Protocol

```typescript
// Сообщение от клиента → сервер
interface ClientMessage {
  type: 'speaking.start' | 'speaking.stop' | 'ping' |
        'channel.join' | 'channel.leave' | 'signal';
  channelId?: string;
  payload?: any;
}

// Сообщение от сервера → клиент
interface ServerMessage {
  type: 'speaking.start' | 'speaking.stop' | 'pong' |
        'user.joined' | 'user.left' | 'signal' | 'error';
  channelId?: string;
  userId?: string;
  userName?: string;
  payload?: any;
}
```

### 5.5. Security (MVP)

- HTTPS обязательно (Caddy auto cert)
- JWT access token: 15 минут, RS256
- Refresh token: 7 дней, хранится в httpOnly cookie
- Rate limiting: 100 req/min per IP
- CORS: только домен приложения
- Helmet middleware (security headers)
- CSP (Content Security Policy)
- Input validation (Zod)
- SQL injection protection (parameterized queries)
- Passwords: bcrypt (cost 12)

---

## 6. Deploy (MVP)

### 6.1. Docker Compose

```yaml
version: '3.8'
services:
  voxrelay-server:
    build: ./services/api-gateway
    ports:
      - "443:443"
    depends_on:
      - postgres
      - redis
    env_file: .env
    volumes:
      - ./data:/app/data

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: voxrelay
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  coturn:
    image: instrumentisto/coturn
    ports:
      - "3478:3478"
      - "3478:3478/udp"

volumes:
  pgdata:
```

### 6.2. System Requirements (MVP)

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Network | 100 Mbps | 1 Gbps |
| Docker | 24+ | 24+ |

---

## 7. Критерии приемки MVP

### Юнит-тесты (покрытие > 70%)
- [ ] Auth service: register, login, refresh, logout
- [ ] Channel service: CRUD, join, leave
- [ ] User service: CRUD, role management
- [ ] Validation schemas

### Интеграционные тесты
- [ ] Полный цикл: регистрация → логин → создание канала → join → PTT
- [ ] WebRTC connect/disconnect
- [ ] WebSocket reconnect
- [ ] Rate limiting

### E2E тесты (Playwright)
- [ ] PWA устанавливается
- [ ] PTT работает (hold space → mic on → release → mic off)
- [ ] Несколько пользователей слышат друг друга
- [ ] Admin может заблокировать пользователя

### Performance тесты
- [ ] 50 одновременных WebSocket соединений
- [ ] 5 одновременных аудио-потоков
- [ ] Audio latency < 500ms (95th percentile)
- [ ] Memory < 300MB на стороне сервера

---

## 8. Оценка трудозатрат (MVP)

| Модуль | Примерные часы | Разработчик |
|--------|---------------|-------------|
| Backend: Auth + Users CRUD | 40h | Backend |
| Backend: Channels CRUD | 30h | Backend |
| Backend: WebSocket + Presence | 40h | Backend |
| Backend: WebRTC signaling + p2p | 60h | Backend |
| Frontend: Auth pages (login, register, forgot) | 20h | Full-stack |
| Frontend: Main layout + channel list | 30h | Frontend |
| Frontend: PTT component + audio | 60h | Full-stack |
| Frontend: Admin panel | 40h | Frontend |
| DevOps: Docker + CI/CD + deploy | 30h | DevOps |
| Testing + Bug fixing | 40h | All |
| **Total** | **~390h** | **~2.5 месяца (3 devs)** |

---

## 9. Риски (MVP)

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| WebRTC не работает в корпоративных сетях | Высокая | Высокое | TURN сервер, fallback на WS-audio (v1.0) |
| Латенси > 500ms на слабых каналах | Средняя | Среднее | Адаптивный битрейт, Opus снижение качества |
| Node.js event-loop блокируется при 50 пользователях | Средняя | Высокое | worker_threads, кластеризация |
| Микрофон не работает в Safari (iOS) | Средняя | Среднее | WebKit getUserMedia quirks, fallback UI |
| PWA не поддерживается в IE/старых браузерах | Низкая | Среднее | Support matrix: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ |
