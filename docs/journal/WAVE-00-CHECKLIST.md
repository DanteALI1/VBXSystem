# WAVE-00 — Gate checklist

Критерии приёмки Wave 0 / Foundation.

## Gate

- [x] код соответствует доменным контрактам
- [x] typecheck PASS (`tsc --noEmit` exit 0)
- [x] lint PASS (`eslint .` exit 0)
- [x] релевантные unit PASS (14 tests)
- [x] релевантные integration/e2e PASS (N/A — skeleton `.gitkeep`)
- [x] UI проверен (placeholders OK for wave 0)
- [x] docs волны обновлены
- [x] TC status/last run обновлены (draft; unit smoke noted in RESULTS)
- [x] RESULTS.md дополнен
- [x] скрины волны на месте (A1 blocked — docker unavailable; documented)
- [x] PROGRESS.md = PASS
- [x] commit + push
- [x] нет открытых P0

## Заметки

- Lint script: Next.js 16 — `eslint .` вместо `next lint`.
- Integration/e2e: каталоги с `.gitkeep` — N/A для Wave 0.
- A1 screenshot deferred until Docker available or Wave 3 final regression.
