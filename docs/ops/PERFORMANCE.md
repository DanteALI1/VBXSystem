# Производительность и индексы

## Индексы (проверка)

Основные индексы создаются Alembic-миграциями `0001`–`0006`:

| Таблица | Индексы (ключевые) |
|--------|---------------------|
| `cves` | `id` PK, `is_cisa_kev` |
| `bdu_records` | `id` PK, `is_standalone` |
| `cve_bdu_links` | `cve_id`, `bdu_id` |
| `cisa_kev` | `cve_id` |
| `epss_scores` | `cve_id` |
| `exploits` | `xdb_id` UNIQUE, `cve_id`, `published_at`, `author` |
| `tickets` | `status`, `severity`, `linked_cve_id`, `assignee_user_id`, `created_at` |
| `audit_logs` | `actor_user_id`, `action`, `created_at` |
| `users` | `username`, `email`, `status` |

Проверка на стенде:

```bash
docker compose exec -T postgres \
  psql -U vbx -d vbx -c "\di+ ix_*"
```

## Ожидаемое поведение

| Операция | Ориентир (тёплый кэш, малый датасет) |
|----------|--------------------------------------|
| `/health` | < 50 ms |
| Search `q=CVE-2024` | < 500 ms на демо-сиде |
| CVE detail | < 300 ms |
| Dashboard KPI | < 1 s |
| Full NVD sync | часы; зависит от API key / сети |

Полное зеркало NVD требует 8–16 GB RAM и SSD (см. INSTALL_REDOS).

## Рекомендации

1. Не отключайте Redis — rate limit и будущий кэш опираются на него.
2. Для тяжёлого поиска по описанию планируйте FTS/trigram в следующем релизе; сейчас LIKE/ILIKE по индексированным id и KEV-флагам.
3. Лимиты экспорта CVE (5000) и CVEQL rate limit защищают от случайной перегрузки.
4. Worker и API разделяют CPU: не снижайте `VBX_*_MEM_LIMIT` ниже минимума из install docs.
