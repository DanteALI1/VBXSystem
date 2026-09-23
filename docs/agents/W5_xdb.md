# W5 — XDB (Exploits) Agent Prompt

## Mission
Сделать отдельный раздел Exploit Database с UX табличного поиска как на https://www.vulncheck.com/xdb.

## Depends on
W2–W3.

## Read first
- https://www.vulncheck.com/xdb
- `docs/PRODUCT_SPEC.md` §5.8

## Deliverables
### Data
- `exploits` table: xdb_id, cve_id (nullable), published_at, repo_url, repo_name, author, source, raw meta
- Import API (CSV/JSON) + optional connector stub
- Link from CVE detail → related exploits

### UI `/xdb`
Columns: **Date | XDB ID | CVE ID | Repository | Author**
- Search box + filters (CVE, author, date range)
- Sortable columns, pagination
- Click CVE → CVE detail; repo → external link
- Empty state with import CTA for admins

## Out of scope
Scraping proprietary VulnCheck content; hosting exploit payloads. Store **metadata/links only**.

## DoD
- [ ] Table UX близка к XDB референсу
- [ ] Import sample dataset
- [ ] Search filters work
- [ ] STATUS.md updated

## Quality bar
No executable exploit code in repo; sanitize URLs; RBAC on import.
