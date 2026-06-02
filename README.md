# VoxRelayPTT

**Open-source Push-to-Talk (PTT) system for enterprise and dispatcher use.**

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![License](https://img.shields.io/badge/license-AGPLv3-red)

Low-latency voice communication with channels, dispatching, and admin controls.

---

## Architecture

```
apps/
  web/          — PWA (React + Vite + WebRTC)
  mobile/       — Flutter (iOS + Android) [v1.0]
  desktop/      — Tauri (Rust + React)     [v1.0]

services/
  api-gateway/  — Fastify + Mediasoup      [MVP monolith]
  auth-service/ — Go                       [v1.0]
  channel-svc/  — Go                       [v1.0]
  recording/    — Go + MinIO               [v1.0]
  media-sfu/    — Mediasoup cluster        [v1.0]

packages/
  core/         — Shared types & validation
  api-client/   — API client library
  audio/        — Audio processing (WASM)

infra/
  compose/      — Docker Compose files
  k8s/          — Kubernetes Helm charts
  monitoring/   — Prometheus + Grafana
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + TypeScript (API), Go (services) |
| Real-time Audio | WebRTC + Mediasoup SFU |
| Database | PostgreSQL 16 + Redis 7 |
| Storage | MinIO (S3-compatible) |
| Client (Web) | React 19 + Vite + PWA |
| Client (Mobile) | Flutter 3.x [v1.0] |
| Client (Desktop) | Tauri 2.x [v1.0] |
| Deployment | Docker + Kubernetes |

## Features

- Push-to-Talk: Space key or on-screen button
- Channels: Public/private, member management
- Real-time Presence: See who's online and speaking
- Audio Meter: Visual level indicator
- Admin Panel: User & channel management, RBAC
- PWA: Installable on desktop and mobile

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker

git clone https://github.com/redlline/VoxrelayPTT.git
cd VoxrelayPTT
pnpm install

# Start infrastructure (PostgreSQL, Redis, TURN)
docker compose up -d postgres redis coturn

# Run database migrations
pnpm run db:migrate

# Start development
pnpm run dev
```

## License

AGPL v3
