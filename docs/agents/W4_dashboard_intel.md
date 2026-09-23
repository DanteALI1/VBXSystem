# W4 — Dashboard / EPSS / CVEQL Agent Prompt

## Mission
Собрать аналитический контур: Dashboard, EPSS page, CVEQL threat-hunting UI+engine (подмножество).

## Depends on
W2–W3.

## Read first
- https://cvefeed.io/dashboard/
- https://cvefeed.io/epss/exploit-prediction-scoring-system/
- https://cvefeed.io/cveql-threat-hunting-queries-for-cves
- `docs/PRODUCT_SPEC.md` §5.2, §5.6, §5.7

## Deliverables
### Dashboard `/dashboard`
- KPI cards + deltas
- Activity chart ranges
- Recent critical / recent KEV
- Data source health (NVD/BDU/KEV)

### EPSS `/epss`
- Top predictions list
- Top delta table
- Links to CVE detail
- EPSS sync job if not in W2

### CVEQL `/cveql`
- Query editor + examples + operators/fields docs panel
- Parser for subset: `= != > >= < <= ~ and or in`, fields from PRODUCT_SPEC
- Results table + rate limits by role
- Safe query execution (no raw SQL injection — AST → SQLAlchemy)

## Out of scope
Full SQL engine compatibility; public guest mode.

## DoD
- [ ] Dashboard показывает реальные агрегаты из DB
- [ ] CVEQL examples из help реально выполняются
- [ ] Rate limit enforced
- [ ] Tests for CVEQL parser + injection attempts
- [ ] STATUS.md updated

## Quality bar
Parse errors must be user-friendly (RU); timeouts on heavy queries.
