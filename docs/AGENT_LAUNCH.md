# Copy-paste prompts for subagents

Использовать **по одному**. Не запускать следующую волну, пока предыдущая не закрыла DoD.

---

## Оркестратор (корень)

```
Ты оркестратор VBXSystem. Работай медленно и системно.
Прочитай docs/MASTER_PROMPT.md, docs/PRODUCT_SPEC.md, docs/STATUS.md, docs/agents/README.md.
Определи следующую незакрытую волну Wn и запускай только её субагента по docs/agents/Wn_*.md.
UI: стилистика cvefeed.io, бренд VBX, язык интерфейса русский.
Референс Database settings: docs/references/settings-database-nvd.png (+ блок BDU).
Цель — enterprise on-prem vulnerability platform, не прототип. Не делай весь продукт сразу.
```

---

## W0 Foundation

```
Субагент W0 VBXSystem. Scope только docs/agents/W0_foundation.md.
Также прочитай docs/MASTER_PROMPT.md и docs/PRODUCT_SPEC.md (IA + stack + visual).
Собери монорепо Next.js+FastAPI+Postgres+Redis+Compose, design tokens dark cvefeed-like, RBAC skeleton, seed super_admin.
Не делай NVD/Search/Tickets. Обнови docs/STATUS.md. Темп: enterprise, без спешки.
```

## W1 Auth & Users

```
Субагент W1 VBXSystem. Scope только docs/agents/W1_auth_users.md.
Login/2FA/register+approval/profile/users/groups/RBAC. Референс login: cvefeed.io/accounts/login/.
Не делай LDAP live sync (W6) и vuln sync. Обнови STATUS.md.
```

## W2 Vuln Core

```
Субагент W2 VBXSystem. Scope только docs/agents/W2_vuln_core.md.
NVD API sync + BDU upload/parse/merge + CISA KEV + Settings/Database UI по docs/references/settings-database-nvd.png и зеркальный блок BDU.
Правила merge BDU→CVE section или standalone card — строго из PRODUCT_SPEC. Async jobs. Обнови STATUS.md.
```

## W3 Search & Detail

```
Субагент W3 VBXSystem. Scope только docs/agents/W3_search_detail.md.
Search CVE+BDU с подсветкой KEV; карточки CVE/BDU как cvefeed detail + секция БДУ.
Референсы: cvefeed.io/search/ и cvefeed.io/vuln/detail/CVE-2026-96808. Обнови STATUS.md.
```

## W4 Dashboard / EPSS / CVEQL

```
Субагент W4 VBXSystem. Scope только docs/agents/W4_dashboard_intel.md.
Dashboard + EPSS + CVEQL (безопасный AST→SQL). Референсы cvefeed dashboard/epss/cveql. Обнови STATUS.md.
```

## W5 XDB

```
Субагент W5 VBXSystem. Scope только docs/agents/W5_xdb.md.
Раздел /xdb таблицей Date|XDB ID|CVE|Repository|Author как vulncheck.com/xdb. Только metadata/links, import CSV/JSON. Обнови STATUS.md.
```

## W6 Settings

```
Субагент W6 VBXSystem. Scope только docs/agents/W6_settings.md.
Notifications, Security (force 2FA, new device alerts, mTLS API, audit viewer), Integrations SMTP/Exchange/LDAP/AD/SSO, API keys.
Полировка Profile/Users/Database. Обнови STATUS.md.
```

## W7 Tickets

```
Субагент W7 VBXSystem. Scope только docs/agents/W7_tickets.md.
Внутренние заявки из CVE/BDU, статусы, assign user/group, comments, уведомления. Не ITSM-монстр. Обнови STATUS.md.
```

## W8 Hardening

```
Субагент W8 VBXSystem. Scope только docs/agents/W8_hardening.md.
Security hardening, backup/restore, ops/user docs, Playwright E2E, финальный README. Без новых фич. Закрой exit criteria MASTER_PROMPT §6.
```
