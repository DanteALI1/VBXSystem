# Архитектура (обзор)

## Компоненты

| Компонент | Технология | Роль |
|-----------|------------|------|
| **app** | Next.js 16 (App Router) | UI + API routes; enqueue NVD/BDU/scan в BullMQ |
| **worker** | Node + BullMQ (`npm run worker`) | `nvd-sync`, `bdu-sync`, **`scan`** (адаптеры nmap/nuclei + stubs) |
| **postgres** | PostgreSQL 15 | Доменные данные, Better Auth таблицы |
| **redis** | Redis 7 | Очереди BullMQ |
| **storage** | том `./storage` | BDU XML (`storage/bdu/`), сырые отчёты сканов (`storage/reports/<jobId>/`) |

Wave 3: сканы и findings реализованы end-to-end (fixture + optional binaries); zap/openvas — stubs.

## Диаграмма компонентов

```mermaid
flowchart LR
  subgraph Clients
    Browser[Browser / Intranet]
  end

  subgraph Compose["docker-compose"]
    App[Next.js app :3000]
    Worker[BullMQ worker]
    PG[(PostgreSQL)]
    Redis[(Redis)]
    Storage[(storage/reports)]
  end

  subgraph External
    NVD[NVD API]
    BDU[BDU vulxml.xml]
    Scanners[nmap / nuclei]
  end

  Browser --> App
  App --> PG
  App --> Redis
  Worker --> Redis
  Worker --> PG
  Worker --> Storage
  Worker -->|HTTP + API key| NVD
  Worker -->|download XML| BDU
  Worker -->|spawn or fixture| Scanners
  App -->|read status / reportDir| Storage
```

## Потоки данных

```mermaid
sequenceDiagram
  participant U as User (admin/analyst)
  participant A as Next.js app
  participant Q as Redis / BullMQ
  participant W as Worker
  participant N as NVD / BDU
  participant DB as Postgres
  participant S as storage/reports

  Note over U,S: Sync уязвимостей
  U->>A: POST sync (enqueue only)
  A->>Q: job nvd-sync | bdu-sync
  A-->>U: 202 Accepted + jobId
  Q->>W: deliver job
  W->>N: fetch (NVD rate-limit / BDU XML)
  W->>DB: upsert vulnerabilities + sources + sync_states
  W-->>Q: completed

  Note over U,S: Scan
  U->>A: POST /api/scans (target + type)
  A->>A: allowlist check
  A->>DB: insert scan_jobs (queued)
  A->>Q: job scan { scanJobId }
  A-->>U: 202 { id, status }
  Q->>W: deliver
  W->>W: allowlist re-check
  W->>S: raw.xml|jsonl + meta.json
  W->>DB: services / findings / scan_jobs.status
```

## Границы ответственности

- **App**: auth, CRUD UI, валидация allowlist перед enqueue scan, чтение статусов/findings, PATCH finding status.
- **Worker**: сеть к NVD/BDU, парсинг, запись в БД, запуск адаптеров сканеров (или fixture), persist findings/services.
- **Не в app-процессе**: долгий download/parse NVD/BDU и выполнение сканов — только через очередь (исключение: CLI `smoke:scan` вызывает `runScanJob` inline для демо без double-enqueue).

## Связанные документы

- [data-model.md](data-model.md)
- [workers.md](workers.md)
- [ADR-001](../decisions/ADR-001-stack.md)
- [ADR-003 scan adapters](../decisions/ADR-003-scan-adapters.md)
- [features/scans.md](../features/scans.md)
- [features/findings.md](../features/findings.md)
