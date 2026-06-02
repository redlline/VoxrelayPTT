# VoxRelay — Архитектура

---

## 1. Высокоуровневая архитектура

```mermaid
graph TB
    subgraph "Clients"
        WEB[Web PWA<br/>React + mediasoup-client]
        FLUTTER[Flutter Mobile<br/>iOS/Android]
        TAURI[Tauri Desktop<br/>Rust + React]
    end

    subgraph "CDN / Load Balancer"
        LB[HAProxy / Nginx + Caddy]
    end

    subgraph "Control Plane"
        API[API Gateway<br/>Fastify + Node.js]
        WS[WebSocket Gateway<br/>Node.js]
        AUTH[Auth Service<br/>Go]
        CHANNEL[Channel Service<br/>Go]
        ADMIN[Admin Service<br/>Go]
        RECORD[Recording Service<br/>Go]
    end

    subgraph "Media Plane"
        SFU[Mediasoup SFU<br/>Node.js Workers]
        TURN[coturn TURN/STUN]
        MIXER[Audio Mixer<br/>Go + Opus]
    end

    subgraph "Data Plane"
        PG[(PostgreSQL 16)]
        REDIS[(Redis 7)]
        MINIO[(MinIO S3)]
        NATS[NATS JetStream]
    end

    subgraph "Monitoring"
        PROM[Prometheus]
        GRAF[Grafana]
        LOKI[Loki]
        TRACE[Jaeger]
    end

    WEB --> LB
    FLUTTER --> LB
    TAURI --> LB
    
    LB --> API
    LB --> WS
    LB --> SFU

    WS --> NATS
    API --> PG
    API --> REDIS

    AUTH --> PG
    CHANNEL --> PG
    CHANNEL --> REDIS
    ADMIN --> PG
    RECORD --> MINIO
    RECORD --> NATS

    SFU --> REDIS
    SFU --> NATS
    SFU --> TURN

    PROM --> SFU
    PROM --> API
    PROM --> PG
    GRAF --> PROM
    GRAF --> LOKI
    LOKI --> API
    LOKI --> SFU
```

---

## 2. Аудио-пайплайн (передача голоса)

```mermaid
sequenceDiagram
    participant S as Speaker (Client)
    participant L as Listener (Client)
    participant SFU as Mediasoup SFU
    participant REC as Recording Service

    Note over S: User holds PTT button
    
    S->>SFU: PRODUCE (Opus @ 16-48 kbps)
    activate SFU

    par Audio to listeners
        SFU->>L: CONSUME (forward Opus packets)
        Note over L: Audio plays with < 300ms latency
    and Recording
        SFU->>REC: FORWARD to recording pipeline
        REC->>MINIO: Save Opus file + metadata
    and Presence
        SFU->>REDIS: Update "speaking" state
        REDIS->>WS: Broadcast to all channel members
    end

    Note over S: User releases PTT button
    S->>SFU: PAUSE producer
    deactivate SFU
    SFU->>REDIS: Clear "speaking" state
```

**WebRTC Audio Flow (подробно):**

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Speaker     │         │  Mediasoup   │         │  Listener    │
│  Client      │         │  SFU Worker  │         │  Client      │
├──────────────┤         ├──────────────┤         ├──────────────┤
│ getUserMedia ├────────>│ router      ├────────>│ mediasoup    │
│ ↓            │  UDP    │  │          │  UDP    │ -client      │
│ OpusEncoder  │  RTP    │  Producer  │  RTP    │ ↓            │
│ ↓            │         │  → pipe    │         │ OpusDecoder  │
│ RTCRtpSender │────────>│  → Consumer│────────>│ ↓            │
│              │         │             │         │ AudioContext │
│ DTX/CNG      │         │ Simulcast  │         │ Gain/Volume  │
│ FEC (RED)    │         │ ABR Adapt  │         │ JitterBuffer │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## 3. Масштабирование: Distributed SFU

```mermaid
graph LR
    subgraph "Region A"
        SFU1[SFU Worker 1<br/>pipe-a]
        SFU2[SFU Worker 2<br/>pipe-b]
    end
    subgraph "Region B"
        SFU3[SFU Worker 3<br/>pipe-c]
    end

    NATS1[NATS<br/>JetStream]
    REDIS1[(Redis<br/>Global)]

    SFU1 <--> NATS1
    SFU2 <--> NATS1
    SFU3 <--> NATS1
    
    SFU1 == mediasoup pipe ==> SFU3
    SFU2 == mediasoup pipe ==> SFU3

    subgraph "Kubernetes Cluster"
        HPA[HPA<br/>CPU > 60%]
        HPA --> SFU1
        HPA --> SFU2
    end
```

**Ключевые механизмы масштабирования:**

| Механизм | Описание |
|----------|----------|
| **Горизонтальное масштабирование SFU** | Mediasoup Router-per-room. Каждый worker — отдельный процесс (Node.js worker_threads). При достижении лимита — новый worker. |
| **Pipe транспорт** | Mediasoup pipe для соединения SFU в разных регионах. Аудио идёт через pipe, listeners получают от ближайшего SFU. |
| **Global Redis** | Состояния пользователей (presence) реплицируются через Redis Cluster. |
| **NATS JetStream** | События (user joined, started speaking, recording) проходят через NATS — гарантированная доставка, replay для новых подписчиков. |
| **K8s HPA** | Автоматическое масштабирование по CPU/RAM. SFU workers эфемерны — перенос комнат через drain. |

---

## 4. Компонентная архитектура сервисов

```mermaid
graph TB
    subgraph "Core Services (Go)"
        AS[Auth Service<br/>Port 3001]
        CS[Channel Service<br/>Port 3002]
        RS[Recording Service<br/>Port 3003]
        AD[Admin Service<br/>Port 3004]
        PS[Presence Service<br/>Port 3005]
    end

    subgraph "Media Services"
        MS[Mediasoup SFU<br/>Port 4001<br/>Node.js]
        TURN[coturn<br/>Port 3478]
    end

    subgraph "Gateway Layer"
        GW[API Gateway<br/>Fastify<br/>Port 80]
        WSS[WS Gateway<br/>Port 443]
    end

    subgraph "Message Bus"
        NATS[NATS JetStream<br/>Port 4222]
    end

    GW --> AS
    GW --> CS
    GW --> AD

    WSS --> NATS
    WSS --> PS

    MS --> NATS
    MS --> CS
    MS --> PS

    RS --> NATS
    RS --> MINIO

    PS --> REDIS
    PS --> NATS

    CS --> PG
    CS --> REDIS

    AD --> PG
    AS --> PG
```

---

## 5. Отказоустойчивость

### Стратегия

| Сценарий | Решение |
|----------|---------|
| Отказ SFU | Клиент переподключается к другому SFU через signaling. Аудио теряется только на время ICE-reconnect (< 1s). |
| Отказ сервиса | Каждый сервис stateless (кроме SFU). K8s перезапускает pod. Graceful shutdown + drain connections. |
| Отказ базы данных | PostgreSQL с Patroni (HA). Redis Cluster с репликами. Автоматический failover. |
| Потеря сети клиентом | Буферизация на клиенте (offline queue). После восстановления — replay. |
| Потеря пакетов | Opus FEC + RED + retransmission через NACK. Автоматическое снижение битрейта. |
| NAT traversal | TURN сервер как fallback. ICE + STUN для p2p. |

### SLA Target

| Метрика | MVP | v1.0 | v2.0 |
|---------|-----|------|------|
| Availability | 99.0% | 99.9% | 99.99% |
| Audio latency (RTT) | < 400ms | < 200ms | < 100ms |
| Max users per channel | 50 | 500 | 10,000 |
| Recording retention | 7 days | 30 days | 365 days |

---

## 6. Сетевая архитектура безопасности

```mermaid
graph TB
    subgraph "Internet"
        USER[User]
        ADMIN[Admin]
    end

    subgraph "DMZ"
        LB[Load Balancer<br/>Caddy - HTTPS]
        TURN[coturn<br/>3478 UDP/TCP]
    end

    subgraph "Application Network"
        API[API Gateway]
        WS[WS Gateway]
        SFU[Mediasoup]
    end

    subgraph "Internal Network"
        AUTH[Auth Svc]
        CH[Channel Svc]
        REC[Recording Svc]
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        MINIO[(MinIO)]
        NATS[NATS]
    end

    USER -->|443 HTTPS| LB
    ADMIN -->|443 HTTPS| LB
    USER -->|3478 UDP| TURN
    
    LB -->|80 HTTP| API
    LB -->|WS| WS

    API -->|5432| PG
    API -->|6379| REDIS
    WS -->|4222| NATS
    SFU -->|4222| NATS
    SFU -->|6379| REDIS
    REC -->|9000| MINIO
```

**Политики сети (K8s Network Policies):**

- DMZ → Application: только 80/443
- Application → Internal: только необходимые порты
- Internal → Internal: pg (5432), redis (6379), nats (4222), minio (9000)
- Никакой сервис в DMZ не имеет прямого доступа к Internal network
- SFU (Media) изолирован от Database
- JWT подписывается Auth Service — API Gateway только валидирует

---

## 7. MVP vs v1.0 Архитектура

```mermaid
graph TB
    subgraph "MVP Architecture"
        MVP_WEB[Web PWA React]
        MVP_API[Single Node.js Server<br/>API + SFU + WS]
        MVP_PG[(PostgreSQL<br/>SQLite for dev)]
        MVP_REDIS[(Redis)]
        
        MVP_WEB --> MVP_API
        MVP_API --> MVP_PG
        MVP_API --> MVP_REDIS
    end

    subgraph "v1.0 Architecture"
        V10_WEB[Web PWA]
        V10_FLUTTER[Flutter Mobile]
        V10_TAURI[Tauri Desktop]
        V10_LB[Load Balancer]
        V10_GW[API Gateway<br/>Node.js]
        V10_WS[WS Gateway<br/>Node.js]
        V10_SFU[SFU Cluster<br/>Mediasoup]
        V10_GO[Go Services<br/>Auth, Channel, Record]
        V10_PG[(PostgreSQL<br/>Primary + Replica)]
        V10_REDIS[(Redis Cluster)]
        V10_MINIO[(MinIO)]
        V10_NATS[NATS]
        
        V10_WEB --> V10_LB
        V10_FLUTTER --> V10_LB
        V10_TAURI --> V10_LB
        V10_LB --> V10_GW
        V10_LB --> V10_WS
        V10_LB --> V10_SFU
        V10_GW --> V10_GO
        V10_GO --> V10_PG
        V10_GO --> V10_REDIS
        V10_WS --> V10_NATS
        V10_SFU --> V10_NATS
        V10_SFU --> V10_REDIS
    end
```
