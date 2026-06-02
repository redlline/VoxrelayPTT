# VoxRelayPTT

**Open-source Push-to-Talk (PTT) system for enterprise and dispatcher use.**

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![License](https://img.shields.io/badge/license-AGPLv3-red)

Low-latency voice communication with channels, dispatching, and admin controls.

---

## Architecture

```
apps/
  web/          — PWA (React + Vite + WebRTC)

services/
  api-gateway/  — Fastify + Mediasoup (монолит)

packages/
  voxrelay-core/ — Shared types & validation

infra/
  scripts/      — Скрипты инициализации
```

*Планируется: мобильное приложение (Flutter), десктоп (Tauri), микросервисы на Go, кластер Mediasoup, мониторинг.*

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + TypeScript (Fastify) |
| Real-time Audio | WebRTC + Mediasoup SFU |
| Database | PostgreSQL 16 + Redis 7 |
| Storage | MinIO (S3-compatible) |
| Client (Web) | React 19 + Vite + PWA |
| Deployment | Docker + Docker Compose |

## Features

- Push-to-Talk: клавиша пробела или кнопка на экране
- Channels: публичные/приватные, управление участниками
- Real-time Presence: кто онлайн и кто говорит
- Audio Meter: визуальный индикатор уровня
- Admin Panel: управление пользователями и каналами, RBAC
- PWA: установка на телефон и десктоп

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker

git clone https://github.com/redlline/VoxrelayPTT.git
cd VoxrelayPTT
pnpm install

# Start infrastructure
docker compose up -d postgres redis coturn

# Run migrations
pnpm run db:migrate

# Start development
pnpm run dev
```

## License

AGPL v3
