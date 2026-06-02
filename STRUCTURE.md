# VoxRelay — Monorepo Structure

```
voxrelay/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, test, build
│       ├── deploy-staging.yml
│       └── deploy-production.yml
│
├── apps/
│   ├── web/                          # Web PWA (React + Vite)
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/                  # App shell, routing
│   │   │   ├── pages/                # Страницы (Login, Dashboard, Channel, etc.)
│   │   │   ├── features/             # Фичи (ptt, channels, auth, admin)
│   │   │   │   ├── ptt/              # Push-to-Talk ядро
│   │   │   │   │   ├── components/   # PTTButton, AudioMeter, ChannelList
│   │   │   │   │   ├── hooks/        # usePTT, useAudioStream
│   │   │   │   │   ├── stores/       # Zustand stores
│   │   │   │   │   └── workers/      # AudioWorkletProcessor
│   │   │   │   ├── channels/         # Каналы, группы
│   │   │   │   ├── auth/             # Логин, регистрация, 2FA
│   │   │   │   ├── dispatcher/       # Диспетчерская панель
│   │   │   │   └── admin/            # Админ-панель
│   │   │   ├── shared/               # UI kit (shadcn)
│   │   │   ├── lib/                  # WebRTC, API client
│   │   │   ├── types/                # TypeScript типы
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   ├── mobile/                       # Flutter (iOS + Android)
│   │   ├── lib/
│   │   │   ├── core/
│   │   │   ├── features/
│   │   │   │   ├── ptt/
│   │   │   │   ├── channels/
│   │   │   │   └── auth/
│   │   │   └── main.dart
│   │   ├── android/
│   │   ├── ios/
│   │   ├── test/
│   │   └── pubspec.yaml
│   │
│   └── desktop/                      # Tauri (Rust + React)
│       ├── src/                      # React UI
│       ├── src-tauri/                # Rust backend
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── ptt.rs            # Глобальные хоткеи (PTT)
│       │   │   ├── audio.rs          # Нативное аудио
│       │   │   └── tray.rs           # System tray
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       └── package.json
│
├── packages/
│   ├── voxrelay-core/                # Shared core types & validation
│   │   ├── src/
│   │   │   ├── types/                # User, Channel, Message, etc.
│   │   │   ├── validation/           # Zod schemas
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── voxrelay-api-client/          # Shared HTTP/WS client
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── ws.ts
│   │   │   └── api.ts
│   │   └── package.json
│   │
│   └── voxrelay-audio/               # Audio processing (WASM-ready)
│       ├── src/
│       │   ├── processor.ts
│       │   ├── codec.ts
│       │   └── rnnnoise.ts
│       └── package.json
│
├── services/                         # Backend сервисы
│   ├── api-gateway/                  # Fastify + TypeScript
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── plugins/
│   │   │   └── main.ts
│   │   └── package.json
│   │
│   ├── ws-gateway/                   # WebSocket Gateway (Node.js)
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   ├── rooms.ts
│   │   │   └── main.ts
│   │   └── package.json
│   │
│   ├── auth-service/                 # Go
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   ├── service/
│   │   │   ├── repository/
│   │   │   ├── model/
│   │   │   └── middleware/
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   ├── channel-service/              # Go
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   ├── recording-service/            # Go
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   ├── admin-service/                # Go
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   ├── presence-service/             # Go
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── go.mod
│   │   └── Dockerfile
│   │
│   └── media-sfu/                    # Mediasoup (Node.js)
│       ├── src/
│       │   ├── router.ts
│       │   ├── producer.ts
│       │   ├── consumer.ts
│       │   ├── signaling.ts
│       │   ├── pipe.ts               # Pipe transport
│       │   └── main.ts
│       ├── package.json
│       └── Dockerfile
│
├── infra/
│   ├── compose/
│   │   ├── docker-compose.yml        # Dev stack
│   │   ├── docker-compose.prod.yml   # Production stack
│   │   └── docker-compose.monitor.yml
│   │
│   ├── k8s/
│   │   ├── helm/
│   │   │   └── voxrelay/
│   │   │       ├── charts/
│   │   │       ├── templates/
│   │   │       ├── values.yaml
│   │   │       ├── values.staging.yaml
│   │   │       └── values.prod.yaml
│   │   ├── namespaces.yaml
│   │   └── network-policies.yaml
│   │
│   ├── monitoring/
│   │   ├── prometheus/
│   │   │   └── prometheus.yml
│   │   ├── grafana/
│   │   │   └── dashboards/
│   │   └── loki/
│   │       └── loki-config.yml
│   │
│   └── scripts/
│       ├── seed.ts                   # Seed data
│       ├── migrate.ts                # DB migrations
│       └── setup.sh
│
├── docs/
│   ├── 01-FEATURES.md
│   ├── 02-TECH_STACK.md
│   ├── 03-ARCHITECTURE.md
│   └── 04-MVP_SPEC.md
│
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.cjs
├── turbo.json                        # Turborepo config
├── package.json                      # Root (workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml                # Root docker compose
└── README.md
```

## Монорепо-инструмент: Turborepo + pnpm

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/*"
```

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {}
  }
}
```
