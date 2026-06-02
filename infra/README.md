# VoxRelay Infrastructure

```
infra/
├── compose/           # Docker Compose files
│   ├── production.yml # Production stack (nginx + 3 microservices + postgres + redis + minio + coturn + pgbouncer)
│   ├── staging.yml    # Staging stack (isolated DBs, different ports)
│   ├── monitoring.yml # Prometheus + Grafana + exporters
│   └── .env.example   # Environment variables template
├── k8s/
│   └── helm/voxrelay/ # Helm chart for Kubernetes deployment
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── deployment.yaml  # auth-service, channel-svc, media-sfu
│           ├── service.yaml
│           ├── ingress.yaml
│           ├── configmap.yaml
│           ├── secret.yaml
│           └── pvc.yaml
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml       # Scrape config
│   │   └── rules/alerts.yml     # Alert rules
│   └── grafana/
│       ├── datasources/         # Auto-provisioned datasources
│       └── dashboards/          # Auto-provisioned dashboards
└── scripts/
    ├── init-db.sql              # Schema and indexes
    ├── deploy.sh                # Deploy a compose stack
    ├── backup.sh                # Database backup
    └── setup-monitoring.sh      # Deploy monitoring stack
```
