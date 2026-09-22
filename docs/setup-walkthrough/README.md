# Setup walkthrough — обязательные кадры

Скриншоты для приёмочной документации установки и smoke UI. Кадры складывать в [`images/`](images/).

Статусы: `pending` | `captured` | `blocked`.

| ID | Кадр | Путь файла | Статус | Примечание |
|----|------|------------|--------|------------|
| A1 | Compose/инфра up (или `npm run dev` home) | `images/A1-app-home.png` | pending | Docker в cloud-agent может быть недоступен — зафиксировать в PROGRESS |
| A2 | Страница логина `/login` | `images/A2-login.png` | pending | Wave 0: placeholder |
| B1 | Dashboard `/app` | `images/B1-dashboard.png` | pending | placeholder |
| B2 | Список уязвимостей `/app/vulnerabilities` | `images/B2-vulnerabilities.png` | pending | |
| B3 | Деталь уязвимости `/app/vulnerabilities/[id]` | `images/B3-vuln-detail.png` | pending | нужен seed id |
| C1 | Активы `/app/assets` | `images/C1-assets.png` | pending | |
| C2 | Findings `/app/findings` | `images/C2-findings.png` | pending | |
| D1 | Сканы `/app/scans` | `images/D1-scans.png` | pending | |
| E1 | Sync settings `/app/settings/sync` | `images/E1-sync-settings.png` | pending | |
| E2 | Allowlist `/app/settings/allowlist` | `images/E2-allowlist.png` | pending | |
| F1 | Worker logs (очереди ready) | `images/F1-worker-logs.png` | pending | терминал / docker logs |
| F2 | TC walkthrough smoke (сводка) | `images/F2-walkthrough-smoke.png` | pending | связан с TC-017 |

## Захват

Скрипт: `npm run test:screenshots` → [`scripts/capture-setup-screenshots.ts`](../../scripts/capture-setup-screenshots.ts).

Wave 0: скрипт stub (`not implemented`). Кадры снимать вручную Playwright/браузер до реализации.

## Правила

- Без реальных секретов на кадрах (маскировать пароли).
- Имя файла = ID + короткий slug.
- После захвата обновить статус в этой таблице и `docs/journal/PROGRESS.md`.
