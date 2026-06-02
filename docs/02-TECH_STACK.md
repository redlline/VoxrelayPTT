# VoxRelay — Technical Stack (2026)

## Выбор стека: Обоснование

### Backend: Go (primary) + Node.js/TypeScript (для API Gateway)
```
Go — основа (core сервисы, SFU signaling, media processing)
Node.js/TS — API Gateway, SSR, BFF (Backend For Frontend)
```

| Критерий | Go | Node.js |
|----------|-----|---------|
| Производительность raw | Отличная | Средняя |
| Goroutines для реального времени | Идеально (легковесные горутины) | Event-loop (один поток) |
| WebRTC / media processing | Pion/mediasoup-lib | mediasoup (node) |
| Экосистема для PTT | Хорошая (Pion WebRTC) | Отличная (mediasoup) |
| Размер бинарника | < 20 MB | ~ 60 MB + node_modules |
| Скорость разработки | Средняя | Высокая |

**Решение**: Go для core-сервисов (SFU, signaling, recording). Node.js/TS для API Gateway, Admin UI backend, WebSocket gateway.

---

### Real-time Audio: WebRTC + Mediasoup (SFU)

| Компонент | Выбор | Почему |
|-----------|-------|--------|
| SFU (Selective Forwarding Unit) | Mediasoup v3.x | Лучший open-source SFU. Поддерживает simulcast, SVC, динамические уровни. Работает в Node.js. |
| WebRTC library (клиент) | mediasoup-client + simple-peer | Для браузера — mediasoup-client (на базе libwebrtc). Для Flutter — flutter-webrtc + mediasoup-client. |
| NAT Traversal | coturn (TURN) + STUN от Google | ICE + TURN для продакшена |
| Audio codec | Opus (primary), G.711 (SIP gateway) | Лучший для голоса: низкая задержка, высокое сжатие |
| Noise suppression | RNNoise (C → WASM) | Нейросетевой фильтр, работает в браузере |

**Почему Mediasoup, а не LiveKit/Janus?**
- Mediasoup — минимальная обвязка, полный контроль над SFU
- LiveKit — удобно, но больше "магии" и зависимостей
- Janus — сложнее конфигурация, меньше community в 2026
- Mediasoup даёт: simulcast, pipe транспорт для распределённых деплоев, низкую задержку

### Client: Flutter (mobile) + React (web) + Tauri (desktop)

| Платформа | Технология | Обоснование |
|-----------|------------|-------------|
| Web | React + Vite + PWA | Зрелая экосистема, большая библиотека компонентов, PWA для мобильного браузера |
| Mobile | Flutter | Один код — iOS + Android. Нативная производительность. WebRTC через flutter-webrtc. |
| Desktop | Tauri (Rust + React) | Только 5 MB бинарник (vs 150 MB Electron). Встроенная поддержка WebRTC. Нативный PTT (глобальные хоткеи). |

**Почему Flutter, а не React Native?**
- Производительность Flutter выше для real-time аудио (skia canvas, прямой доступ к API платформы)
- React Native требует больше мостов для WebRTC (lag)
- Flutter better для аудио-визуализаций (audio meter, waveform)

### Databases & Storage

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| Primary DB | PostgreSQL 16+ | Пользователи, каналы, роли, метаданные записей, аудит |
| Cache/Session/PubSub | Redis 7+ | WebSocket состояния, presence, rate limiting, очереди |
| Audio recordings | MinIO (S3-compatible) | Хранение записей разговоров, файлов, логов |
| Search | Elasticsearch (или Meilisearch) | Полнотекстовый поиск по STT (опционально v1.0) |
| Message queue | NATS (или Redis Streams) | Межсервисная шина для событий |

**Почему NATS?**
- Супер-лёгкий,高性能 (миллионы сообщений/сек)
- Поддержка JetStream для сохраняемых очередей
- Лучше RabbitMQ для real-time пайплайнов

### Auth & Security

| Компонент | Технология |
|-----------|------------|
| Auth сервис | Go + Casbin (RBAC) |
| JWT signing | RS256 (access) + AES-256 (refresh) |
| OAuth2 provider | ORY Hydra / Dex (self-hosted) |
| 2FA | Go tool (otp) + WebAuthn |
| SSL | Let's Encrypt + Caddy |
| E2EE (v2.0) | Signal Protocol + ML-KEM (post-quantum) |

### Frontend Stack

| Компонент | Технология | Версия |
|-----------|------------|--------|
| Build tool | Vite | 6.x |
| UI framework | React + TypeScript | 19.x |
| State manager | Zustand | 5.x |
| WebRTC | mediasoup-client | 3.x |
| PWA | vite-plugin-pwa | — |
| UI Kit | shadcn/ui + TailwindCSS | — |
| Desktop | Tauri + React | 2.x |
| Mobile (web) | PWA / React | — |

### DevOps

| Компонент | Технология |
|-----------|------------|
| Container | Docker + Docker Compose |
| Orchestration | Kubernetes (k3s / production K8s) |
| CI/CD | GitHub Actions |
| Reverse proxy | Caddy (automatic HTTPS) |
| Monitoring | Prometheus + Grafana |
| Logging | Loki + Promtail |
| Tracing | OpenTelemetry + Jaeger |
| Feature flags | Flagsmith / LaunchDarkly |

---

## Итоговая схема стека

```
┌────────────────────────────────────────────────────────────────────┐
│                        VoxRelay Stack                              │
├────────────────────────────────────────────────────────────────────┤
│ FRONTEND                                                          │
│  React 19 + Vite (Web PWA)  ←  Flutter 3.x (iOS/Android)  ←  Tauri│
│  Zustand | Tailwind | shadcn  |  mediasoup-client  |  PWA         │
├────────────────────────────────────────────────────────────────────┤
│ API GATEWAY / BFF                                                 │
│  Node.js + TypeScript + Fastify  |  WebSocket (WS)                │
├────────────────────────────────────────────────────────────────────┤
│ CORE SERVICES (Go)                                                │
│  Auth Svc  |  Channel Svc  |  Recording Svc  |  Admin Svc         │
│  Casbin RBAC  |  PostgreSQL  |  Redis  |  NATS                    │
├────────────────────────────────────────────────────────────────────┤
│ MEDIA PLANE (Go + Node.js)                                        │
│  Mediasoup SFU (Node)  |  Pion TURN (Go)  |  AudioMixer          │
│  WebRTC Opus  |  DTX/CNG  |  FEC  |  ABR                         │
├────────────────────────────────────────────────────────────────────┤
│ STORAGE & INFRA                                                   │
│  PostgreSQL 16  |  Redis 7  |  MinIO (S3)  |  NATS               │
│  Docker  |  K8s  |  Caddy  |  Prometheus  |  Grafana              │
└────────────────────────────────────────────────────────────────────┘
```

## Лицензирование

| Компонент | Лицензия |
|-----------|----------|
| VoxRelay Core (community edition) | AGPL v3 |
| Mediasoup | ISC |
| React, Vite, Tailwind | MIT |
| Go, PostgreSQL, Redis, MinIO | Open Source |
| Flutter, Tauri | BSD-3 / MIT |
| Enterprise Edition | Commercial (с дополнительными фичами) |
