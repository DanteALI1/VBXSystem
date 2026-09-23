# W7 — Internal Ticketing Agent Prompt

## Mission
Внутренняя система заявок на обработку уязвимостей: создание из карточки CVE/BDU, жизненный цикл, назначения, комментарии, уведомления.

## Depends on
W1 (users/groups/RBAC), W3 (vuln detail actions).

## Read first
`docs/PRODUCT_SPEC.md` §5.9

## Deliverables
### Model
- tickets, ticket_comments, ticket_events, optional attachments
- statuses: `new | in_progress | waiting | resolved | closed`
- fields: title, description, severity, linked_cve/bdu, assignee, group queue, due_date

### API + UI
- `/tickets` list (filters: status, assignee, severity, vuln)
- `/tickets/[id]` detail + timeline
- Create from CVE/BDU detail (“Создать заявку”)
- Assign to user/group; status transitions with permission checks
- Comments
- Notify assignee (in-app; email if SMTP on)

### RBAC
- viewer: read own org tickets if granted
- analyst: create/update
- ticket_manager / admin: assign/close all

## Out of scope
Full ITSM (SLA calendars advanced, email-to-ticket parsing) — только lean enterprise queue.

## DoD
- [ ] Create ticket from CVE end-to-end
- [ ] Status workflow enforced
- [ ] Group queue works with AD/local groups
- [ ] Tests on transitions + permissions
- [ ] STATUS.md updated

## Quality bar
Idempotent create-from-vuln (optional dedupe warning); full audit of status changes.
