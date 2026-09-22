# Архитектура (обзор)

## Компоненты

| Компонент | Технология | Роль |
|-----------|------------|------|
| **app** | Next.js 16 (App Router) | UI + API routes; enqueue долгих задач в BullMQ |
| **worker** | Node + BullMQ (`npm run worker`) | Обработка `nvd-sync`, `bdu-sync`, `scan` |
| **postgres** | PostgreSQL 15 | Доменные данные, Better Auth таблицы |
| **redis** | Redis 7 | Очереди BullMQ |
| **storage** | том `./storage` / `./storage/reports` | Сырые отчёты сканеров, кэш BDU XML |

Wave 0: UI — placeholders, worker — stub (очереди объявлены, processors не зарегистрированы).

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
    Scanners[nmap / nuclei / zap / openvas]
  end

  Browser --> App
  App --> PG
  App --> Redis
  Worker --> Redis
  Worker --> PG
  Worker --> Storage
  Worker -->|HTTP + API key| NVD
  Worker -->|download XML| BDU
  Worker -->|spawn / parse| Scanners
  App -->|read reports path| Storage
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
  A-->>U: 202 Accepted + job id
  Q->>W: deliver job
  W->>N: fetch (NVD rate-limit / BDU XML)
  W->>DB: upsert vulnerabilities + sources + sync_states
  W-->>Q: completed

  Note over U,S: Scan
  U->>A: POST scan (target + type)
  A->>A: allowlist check
  A->>DB: insert scan_jobs (queued)
  A->>Q: job scan
  Q->>W: deliver
  W->>S: write raw report
  W->>DB: services / findings / status
```

## Границы ответственности

- **App**: auth, CRUD UI, валидация allowlist перед enqueue, чтение статусов.
- **Worker**: сеть к NVD/BDU, парсинг, запись в БД, запуск адаптеров сканеров.
- **Не в app-процессе**: долгий download/parse NVD/BDU и выполнение сканов — только через очередь.

## Связанные документы

- [data-model.md](data-model.md)
- [workers.md](workers.md)
- [ADR-001](../decisions/ADR-001-stack.md)
