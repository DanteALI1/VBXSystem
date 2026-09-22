# Setup walkthrough

Скриншоты установки и smoke UI. Viewport ~1440×900. PNG в [`images/`](images/). Без секретов на кадрах.

Статусы: `pending` | `captured` | `blocked` | `offline-seed`.

| ID | Описание | Файл | Статус | Волна |
|----|----------|------|--------|-------|
| A1 | `docker compose up` / healthy (или документированный offline stub) | `images/01-docker-up.png` | blocked | 0 — нет docker в cloud-agent |
| A2 | Страница логина `/login` | `images/02-login.png` | captured | 1 |
| B1 | Форма логина (до submit) | `images/03-login-form.png` | captured | 1 |
| B2 | Dashboard после логина | `images/04-dashboard.png` | captured | 1 |
| B3 | Конфиг/env UI или документированный конфиг без секретов | `images/05-config-env.png` | pending | 2 |
| C1 | Sync settings до запуска | `images/06-sync-before.png` | pending | 2 |
| C2 | Sync state/job после enqueue | `images/07-sync-after.png` | pending | 2 |
| C3 | Таблица уязвимостей | `images/08-vulnerabilities-table.png` | captured | 1 |
| C4 | Карточка уязвимости | `images/09-vulnerability-card.png` | captured | 1 |
| D1 | Assets list/create | `images/10-assets.png` | pending | 2 |
| D2 | Asset detail | `images/11-asset-detail.png` | pending | 2 |
| D3 | Allowlist entry | `images/12-allowlist.png` | pending | 2 |
| E1 | Create scan job | `images/13-scan-create.png` | pending | 3 |
| E2 | Job status | `images/14-scan-status.png` | pending | 3 |
| E3 | Findings list | `images/15-findings.png` | pending | 3 |
| E4 | Finding status change | `images/16-finding-status.png` | pending | 3 |
| F1 | Dashboard totals | `images/17-dashboard-totals.png` | pending | 3 |
| F2 | App shell/nav | `images/18-app-shell-nav.png` | captured | 1 |

## Захват

```bash
npm run test:screenshots
```

Скрипт: [`scripts/capture-setup-screenshots.ts`](../../scripts/capture-setup-screenshots.ts).  
Wave 1: A2, B1, B2, C3, C4 (+ optional F2). Env: `APP_URL`, `BOOTSTRAP_ADMIN_*`. Auth session reused via `playwright/.auth/admin.json`.

## Правила

- Offline/seed кадры подписывать в примечании.
- После захвата обновить статус здесь и в `docs/journal/PROGRESS.md`.
- Коммитить PNG в git.
