# W11 — Telegram notify + Ticket SLA (from VULNEX)

## Goal
Довести уведомления и заявки до паритета с полезными частями VULNEX notify/tickets.

## Must read
- `docs/ENRICHMENT_FROM_VULNEX.md`
- `docs/agents/W7_tickets.md`, `W6_settings.md`
- VULNEX `apps/notify`, `apps/tickets/workflow.py`

## In scope
1. Settings → Уведомления / Интеграции: Telegram bot token + chat_id + enable.
2. События: новая KEV match, sync fail, ticket assigned/status (reuse notification prefs).
3. Ticket SLA: due_at, priority→SLA hours map, breach badge в списке.
4. Confirm-close: статус `pending_close` → `closed` только assignee/manager.

## Out of scope
- Exchange EWS full client
- External ITSM
- License

## DoD
- [ ] Telegram test message endpoint
- [ ] SLA поля + фильтр overdue
- [ ] Confirm-close workflow + audit
- [ ] Тесты + STATUS + скриншоты
