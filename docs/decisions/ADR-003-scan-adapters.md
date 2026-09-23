# ADR-003: Scan adapters

## Статус

Accepted — Wave 3: nmap/nuclei (fixture + optional binary), zap/openvas stubs.

## Контекст

Типы сканов в схеме: `nmap`, `nuclei`, `zap`, `openvas`. Нужна расширяемость без переписывания worker core и единый путь persist findings/services.

## Решение

Паттерн **ScannerAdapter** (`lib/scanners/`):

```ts
interface ScannerAdapter {
  readonly type: ScanType;
  start(ctx: ScanJobStartContext): Promise<ScanReport>;
  parse(report: ScanReport): Promise<FindingDraft[]>;
}

type ScanJobStartContext = {
  job: ScanJob;
  reportDir: string;
  options: Record<string, unknown>;
};

type ScanReport = {
  reportDir: string;
  rawPath: string;
  fixture: boolean;
  meta?: Record<string, unknown>;
};

type FindingDraft = {
  title: string;
  description?: string;
  severity: Severity;
  cveId?: string;
  assetId?: string;
  service?: { port: number; protocol: string; name?; product?; version? };
  raw?: unknown;
};
```

Ключевые правила:

- регистрация адаптеров по `type` (`getScannerAdapter` в `registry.ts`);
- raw всегда на диск `storage/reports/<scanJobId>/`, в БД — нормализованные `services` / `findings`;
- worker entry: `runScanJob` (allowlist re-check → start → parse → `persistFindingDrafts`);
- fixture mode для **nmap/nuclei**: `options.fixture === true` **или** `SCAN_FIXTURE_MODE=1|true|yes` **или** binary missing (`NMAP_BIN`/`NUCLEI_BIN` / PATH);
- stubs **zap/openvas**: только явный `options.fixture === true` даёт empty success; иначе fail `"… not implemented in MVP"`;
- Allowlist — gate до enqueue (`createAndEnqueueScan`) и повторно в worker.

### Реализации

| Adapter | Поведение |
|---------|-----------|
| `NmapAdapter` | live: `nmap -oX … -sV --open`; parse XML → open ports + script vulns; fixture `nmap-sample.xml` → `raw.xml` |
| `NucleiAdapter` | live: `nuclei -u … -jsonl -o …`; parse JSONL (skip broken lines); fixture `nuclei-sample.jsonl` → `raw.jsonl` |
| `ZapAdapter` | stub: fail без fixture; fixture → `raw.json` `[]`, 0 findings |
| `OpenvasAdapter` | stub: fail без fixture; fixture → `raw.xml` `<openvas/>`, 0 findings |

`meta.json` всегда пишется (`adapter`, `fixture`, `reason` / `binary` / `stub`).

## Последствия

- Новый сканер = новый adapter + фикстура + unit TC, без смены формы API (только enum `type`).
- zap/openvas остаются stub дольше nmap/nuclei.
- Парсеры тестируются на фикстурах без реальных бинарей (TC-012, TC-013); allowlist gate — TC-011.
- CI/демо: `SCAN_FIXTURE_MODE=1` или `options.fixture` / `npm run smoke:scan` без установки nmap/nuclei.
