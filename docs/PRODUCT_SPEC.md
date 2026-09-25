# VBXSystem — Product Specification (Enterprise)

Версия: 0.1  
Статус: Foundation for multi-agent build  
Связанные документы: `MASTER_PROMPT.md`, `agents/*`, `references/settings-database-nvd.png`

---

## 1. Product overview

**VBXSystem** — локальная платформа vulnerability intelligence для enterprise:

- зеркало NVD + обогащение CISA KEV + EPSS;
- импорт БДУ ФСТЭК (XML/XLSX);
- поиск, аналитика, CVEQL;
- exploit database (XDB-like);
- RBAC, AD/LDAP/SSO, SMTP/Exchange;
- внутренняя система заявок на устранение.

Целевые пользователи: ИБ-аналитики, SOC, админы ИБ, владельцы активов, аудиторы.

---

## 2. Information architecture (IA)

### 2.1 Public / Auth
- `/login` — вход (логин/пароль, опционально 2FA step)
- `/register` — саморегистрация (требует approval админа)
- `/forgot-password` — сброс через SMTP (если настроено)

### 2.2 App shell (после auth)
Боковое/верхнее меню в духе cvefeed:

| Раздел | Route | Описание |
|--------|-------|----------|
| Dashboard | `/dashboard` | Метрики, активность CVE, KEV highlights |
| Search | `/search` | Унифицированный поиск CVE + BDU (+ Local); режимы Простой / CVEQL |
| CVEQL | `/search?mode=cveql` | Threat-hunting QL (legacy `/cveql` → redirect) |
| EPSS | `/epss` | Exploit Prediction Scoring System |
| Exploits (XDB) | `/xdb` | Таблица PoC/exploits (формат VulnCheck XDB) |
| Tickets | `/tickets` | Внутренние заявки |
| Settings | `/settings/*` | Профиль, пользователи, … |
| CVE Detail | `/vuln/CVE-YYYY-NNNNN` | Карточка CVE |
| BDU Detail | `/bdu/BDU:YYYY-NNNNN` | Карточка БДУ без CVE |

---

## 3. Visual / UX guidelines (cvefeed-inspired)

- **Тема:** тёмная (deep blue/charcoal). Фон ~`#0b0e14`, поверхности ~`#12161f` / `#161b22`, бордеры тонкие полупрозрачные.
- **Акцент:** синий (primary buttons, active nav, links) — не фиолетовый AI-default.
- **Типографика:** выразительный sans (например Manrope / IBM Plex Sans / Geist), не Inter/Roboto/Arial как default stack.
- **Компоненты:** плотные таблицы, бейджи severity (CRITICAL/HIGH/MEDIUM/LOW), бейдж **KEV**, бейдж **BDU**, бейдж **EPSS**.
- **Hero/marketing** не нужен внутри app — это intranet tool.
- **Cards:** только как контейнеры интерактивных блоков settings (как на макете Database).
- **Motion:** 2–3 осознанных анимации (page fade, table row hover, sync progress) — без шума.
- **Mobile:** адаптив обязателен; таблицы → горизонтальный scroll или compact cards.

---

## 4. Domain model (логика данных)

### 4.1 Vulnerability sources

```
NVD CVE  ──┐
           ├──► VulnerabilityRecord (canonical if CVE exists)
BDU      ──┘         │
                     ├── CisaKevMatch (0..1)
                     ├── EpssScore (history)
                     ├── BduEnrichment (0..1 section on CVE card)
                     └── ExploitRefs[] (XDB)

BDU without CVE ──► BduStandaloneRecord (own card, searchable)
```

### 4.2 Merge rules (BDU)

1. Upload file (XML preferred, XLSX accepted).
2. Parse records (`BDU:YYYY-NNNNN`, description, vendors, software, CVSS, CWE, CVE ids, solution, status, dates).
3. For each BDU record:
   - if linked CVE id(s) exist → attach as **BDU section** on CVE card(s); store mapping table;
   - if no CVE → create/update **standalone BDU card**.
4. Re-import = upsert by BDU id (idempotent).
5. Keep raw file + parse report (errors, counts).

Official dumps (reference):
- `https://bdu.fstec.ru/files/documents/vulxml.xml`
- `https://bdu.fstec.ru/files/documents/vullist.xlsx`

### 4.3 NVD sync

- API key stored encrypted at rest.
- Incremental sync by `lastModStartDate` / `lastModEndDate`.
- Respect NVD rate limits (with key vs without).
- Auto-update interval (default 2h) toggle in Settings → Database.
- On sync: update CVEs, recalc KEV matches, refresh stats.

### 4.4 CISA KEV

- Sync KEV catalog periodically.
- Flag `is_cisa_kev` on vulnerability.
- Search: visual highlight (orange/amber badge + row accent).
- Detail: KEV panel (date added, due date, ransomware use, required action).

---

## 5. Pages — functional requirements

### 5.1 Login (`/login`)
- Email/username + password
- Remember device (optional)
- After password: if 2FA enabled → TOTP code
- Link: register / forgot password
- Error states без user enumeration где возможно

### 5.2 Dashboard
По образцу cvefeed dashboard:
- KPI: CVEs today / week, KEV weekly, delta %
- Activity chart (1M / 6M / 1Y)
- Lists: recent critical, recent KEV
- Sync health widget (NVD / BDU / KEV last success)

### 5.3 Search
- Страница **Security Vulnerability Database** (`/search`)
- Режимы: **Простой** | **CVEQL** (`?mode=cveql`)
- Простой: query box (CVE / BDU / keyword), фильтры severity / KEV / has BDU / date, sort, пагинация; корпус CVE + standalone BDU + Local; KEV-акцент
- CVEQL: редактор + examples/help; execute → таблица; только CVE (см. 5.6)

### 5.4 CVE Detail (cvefeed-like fields)
Обязательные блоки:
- Header: CVE id, title/summary, status, published, modified, source
- Severity / CVSS (vector, score, version, remote?)
- Description
- CWE list
- Affected products / CPE
- **CISA KEV** (if any)
- **EPSS** current + sparkline/history if available
- **БДУ** section (if mapped): BDU id(s), RU description, severity FSTEC, solution, status, dates, link
- Solution / mitigations
- References
- Actions: Create Ticket, Export, Watch (phase 2)

### 5.5 BDU Detail
- BDU id, name, description (RU)
- Linked CVEs (if later linked)
- Software / vendors
- CVSS / severity
- Solution, status, dates, sources
- Actions: Create Ticket

### 5.6 CVEQL
- UI встроен в Search (`/search?mode=cveql`); legacy `/cveql` → redirect
- Editor + examples + operators/fields help (как на cvefeed)
- Execute → results table
- Rate limit per role
- Fields: id, severity, cvss_score, published, description, is_cisa_kev, has_bdu, products.vendor.name, epss_scores.score, bdu.id, …

### 5.7 EPSS
- Top predicted exploits (recent window)
- Top delta movers table
- Link out to CVE detail

### 5.8 XDB (VulnCheck-style)
Таблица колонок:
| Date | XDB ID | CVE ID | Repository | Author |
Поиск/фильтр по CVE, author, repo, date.  
Источник данных: конфигурируемый connector/import (MVP: ручной/CSV import + schema; later feed).

### 5.9 Tickets (внутренняя система заявок)
- Создание из CVE/BDU или вручную
- Поля: title, description, severity, linked vuln, assignee, group, status (New / In Progress / Waiting / Resolved / Closed), due date, comments, attachments
- SLA hooks (optional config)
- RBAC: кто видит/назначает
- Уведомления по событиям заявки

---

## 6. Settings

Route prefix: `/settings`

### 6.1 Профиль пользователя
- ФИО, email, организация, должность, контактный телефон
- Смена первичного пароля (current + new + confirm)
- Включение 2FA (TOTP QR + recovery codes), если админ не принудил уже
- Аватар (optional)

### 6.2 Пользователи (только Главный Администратор)
- Список пользователей + статусы (Pending / Active / Disabled)
- Создание пользователя
- Подтверждение регистрации (approve/reject)
- Назначение ролей/групп
- Добавление групп из структуры AD (sync OU/groups)
- Force reset password / force 2FA

### 6.3 Уведомления
Toggles + channels (in-app toast/modal, email later):
- Новые уязвимости
- Обновления CISA KEV
- Синхронизация NVD (success/fail)
- (ext) BDU import finished, Ticket assigned

### 6.4 Безопасность
Глобальные политики (admin):
- Принудительная 2FA для всех
- Оповещения о входе с нового устройства
- API аутентификация по сертификату (mTLS) — config + docs
- Аудит действий пользователя (просмотр журнала)

### 6.5 База данных
**NVD блок** — по макету `docs/references/settings-database-nvd.png`:
- API ключ NVD (mask + eye toggle) + Сохранить
- Ссылка на получение ключа NIST
- Синхронизация: last sync, +N новых, KEV matches
- Кнопки: Запустить синхронизацию / Импорт из файла / Экспорт базы
- Состояние БД: version, CVE count, size, NVD mirror status, CISA KEV count, cache
- Toggle автообновления (каждые 2 часа)

**BDU блок** (обязательное расширение макета):
- Кнопка «Загрузить БДУ» (XML/XLSX)
- Статус последнего импорта, кол-во записей, mapped-to-CVE / standalone
- Ошибки парсинга / отчёт
- Расписание/ручной re-import

### 6.6 Интеграции
- SMTP / Exchange (host, port, TLS, auth, from)
- LDAP / Active Directory (host, base DN, bind, user filter, group sync)
- SSO (OIDC/SAML) — client id/secret, endpoints, mapping claims→roles

### 6.7 API ключи
- Создание ключей для интеграций (name, scopes, expiry)
- Prefix display + secret once
- Revoke / rotate
- Audit usage (basic)

---

## 7. Roles & groups

### 7.1 Built-in roles
| Role | Capabilities |
|------|----------------|
| `super_admin` | Всё + Users + Integrations + Security policies |
| `admin` | Settings (кроме части super), sync, user support |
| `analyst` | Search, detail, CVEQL, tickets create/update, export |
| `viewer` | Read-only search/dashboard/detail |
| `ticket_manager` | Full tickets + assign |

Роли комбинируются; права проверяются permission-based (`vuln:read`, `vuln:sync`, `users:approve`, …).

### 7.2 Groups
- Local groups
- AD-synced groups → role mapping
- Group-based ticket queues

---

## 8. Non-functional requirements

- On-prem Docker Compose на **РЕД ОС 7.3+ (minimal)**
- Installer «от и до»: `deploy/redos/install.sh` (Docker CE, firewalld, secrets, compose up, отчёт)
- Конфиг установки: `deploy/redos/vbx.conf.example` → `vbx.conf` с подстановкой org/admin/host
- Отчёт установки в отдельный файл (`VBX_INSTALL_INFO.txt`, mode 600)
- Secrets via env / mounted files (`/opt/vbx/config/vbx.env`)
- Encryption at rest for API keys & tokens
- Structured audit log (who/when/what/ip)
- Backup: DB dump + object store
- Performance: search p95 < 1s on 300k CVE (indexed)
- Observability: health endpoints, job status
- Secure defaults: HTTPS termination note, CSRF for cookie flows, rate limits on auth/CVEQL

---

## 9. Out of scope (v1)

- Public marketing site clone of cvefeed pricing
- Commercial ASM / asset discovery agents
- Full Jira replacement (tickets are internal lightweight)
- Live scraping of third-party proprietary XDB content (use import/connector)

---

## 10. Glossary

| Term | Meaning |
|------|---------|
| NVD | National Vulnerability Database (NIST) |
| BDU | Банк данных угроз ФСТЭК |
| KEV | CISA Known Exploited Vulnerabilities |
| EPSS | Exploit Prediction Scoring System |
| CVEQL | Query language for vuln hunting |
| XDB | Exploit database (VulnCheck-style table UX) |
