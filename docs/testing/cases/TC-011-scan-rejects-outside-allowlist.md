# TC-011 Scan rejects outside allowlist

Status: automated — PASS  
Type: unit|integration  
Priority: P0  
Module: scans / allowlist

## Preconditions

- Правила allowlist заданы (или переданы в unit как массив `AllowlistRule`).
- Код проверки: [`lib/domain/allowlist.ts`](../../../lib/domain/allowlist.ts) — `isTargetAllowed`, `matchCidr`, `matchUrl`.
- API: `POST /api/scans` через `createAndEnqueueScan` / `ScanAllowlistError`.

## Steps

### Unit / domain

1. `isTargetAllowed("10.1.2.3", [{ type:"cidr", pattern:"10.0.0.0/8", enabled:true }])` → true.
2. `isTargetAllowed("11.0.0.1", same)` → false.
3. Enabled=false правило игнорируется; пустой список → false.
4. URL target вне hostname pattern → false.

### Lib + API gate

5. `createAndEnqueueScan` с target вне allowlist → `ScanAllowlistError`.
6. POST scan с target вне allowlist → 400, `scan_jobs` не создан.
7. Target внутри allowlist → 202 + job `queued`.

## Expected

- Вне allowlist скан не стартует.
- Логика совпадает с domain helper — не дублировать CIDR в API.

## Automation

- Domain: `tests/unit/allowlist.test.ts`
- Gate (lib + POST): `tests/unit/scan-allowlist.test.ts`

```bash
npm run test:unit -- tests/unit/scan-allowlist.test.ts
```

## Last run

datetime: 2026-09-23 00:08 UTC  
command: `npm run test:unit` (scan-allowlist + allowlist)  
result: PASS  
evidence: vitest exit 0; POST outside → 400, inside → 202

## Notes

Обязательная ссылка на domain helper — не дублировать CIDR-логику в API.
