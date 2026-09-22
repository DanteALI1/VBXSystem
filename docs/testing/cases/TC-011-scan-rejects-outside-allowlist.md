# TC-011 Scan rejects outside allowlist

Status: draft  
Type: unit|integration  
Priority: P0  
Module: scans / allowlist

## Preconditions

- Правила allowlist заданы (или переданы в unit как массив `AllowlistRule`).
- Код проверки: [`lib/domain/allowlist.ts`](../../../lib/domain/allowlist.ts) — `isTargetAllowed`, `matchCidr`, `matchUrl`.

## Steps

### Unit

1. `isTargetAllowed("10.1.2.3", [{ type:"cidr", pattern:"10.0.0.0/8", enabled:true }])` → true.
2. `isTargetAllowed("11.0.0.1", same)` → false.
3. Enabled=false правило игнорируется; пустой список → false.
4. URL target вне hostname pattern → false.

### Integration (когда API готов)

5. POST scan с target вне allowlist → 400, `scan_jobs` не создан / не enqueued.
6. Target внутри allowlist → 202 + job `queued`.

## Expected

- Вне allowlist скан не стартует.
- Логика совпадает с unit-тестами `tests/unit/allowlist.test.ts`.

## Automation

**Есть (частично):** `tests/unit/allowlist.test.ts`  
Полный API gate: TBD `tests/integration/scan-allowlist.test.ts`.

## Last run

datetime: —  
command: `npm run test:unit` (allowlist suite)  
result: — (заполняет оркестратор)  
evidence: —

## Notes

Обязательная ссылка на domain helper — не дублировать CIDR-логику в API.
