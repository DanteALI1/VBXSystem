# Setup walkthrough (скриншоты)

Визуальный гайд on-prem развёртывания и консоли VBX. PNG: [`images/`](./images/).
Viewport ~1440×900. Без секретов. Продукт **VBX** — без бренда OpenCVE.

| ID | Описание | Файл | Статус | Волна |
|----|----------|------|--------|-------|
| A1 | docker compose up / healthy | `images/01-docker-up.png` | **ready** | 0 |
| A2 | login page | `images/02-login.png` | **ready** | 1 |
| B1 | login form | `images/03-login-form.png` | **ready** | 1 |
| B2 | dashboard after login | `images/04-dashboard.png` | **ready** | 1 |
| B3 | config/env UI или документированный конфиг без секретов | `images/05-config.png` | pending | 2 |
| C1 | sync settings before | `images/06-sync-before.png` | pending | 2 |
| C2 | sync state/job after | `images/07-sync-after.png` | pending | 2 |
| C3 | vulnerabilities table (OpenCVE-like columns) | `images/08-vulns-table.png` | **ready** | 1 |
| C4 | vulnerability detail (description, scoring, affected, refs, history) | `images/09-vuln-detail.png` | **ready** | 1 |
| C5 | advanced search / filters / saved view | `images/10-search-views.png` | **ready** | 1 |
| D1 | assets list/create | `images/11-assets.png` | pending | 2 |
| D2 | asset detail | `images/12-asset-detail.png` | pending | 2 |
| D3 | allowlist entry | `images/13-allowlist.png` | pending | 2 |
| E1 | create scan job | `images/14-scan-create.png` | pending | 3 |
| E2 | job status | `images/15-scan-status.png` | pending | 3 |
| E3 | findings list | `images/16-findings.png` | pending | 3 |
| E4 | finding status change | `images/17-finding-status.png` | pending | 3 |
| F1 | dashboard totals | `images/18-dashboard-totals.png` | pending | 3 |
| F2 | app shell/nav | `images/19-app-shell.png` | **ready** | 1 |

Съёмка: `pnpm test:screenshots` (`scripts/capture-setup-screenshots.ts`) + Playwright. Offline/seed подписывать в подписи кадра.
