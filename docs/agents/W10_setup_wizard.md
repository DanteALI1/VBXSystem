# W10 — First-run setup wizard (from VULNEX)

## Goal
Мастер первичной настройки как в VULNEX `/setup/`, **без** лицензирования.

## Must read
- `docs/ENRICHMENT_FROM_VULNEX.md`
- VULNEX `docs/04_WIZARD_AND_FIRST_LOGIN.md` + templates `core/setup/*`
- W9 branding/database settings (переиспользовать)

## In scope
1. Флаг `setup_completed` в system_settings.
2. Wizard steps: Organization → Branding → Database sources (NVD key / BDU URL) → Notifications (SMTP optional) → Finish.
3. Middleware/guard: если не completed и нет уже seed-admin workflow — редирект web на `/setup/*` (кроме login health).
4. Совместимость с RED OS install: если `VBX_ADMIN_*` уже заданы, wizard может быть pre-filled / skippable admin-step.

## Out of scope
- License / Google OAuth live
- Telegram (W11)
- UI redesign всего app shell

## DoD
- [ ] Чистый volume → открывается wizard
- [ ] После finish — dashboard
- [ ] Повторный вход не показывает wizard
- [ ] STATUS + скриншоты wizard
