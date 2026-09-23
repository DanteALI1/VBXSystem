# TC-011 Scan rejects outside allowlist

Status: automated  
Type: integration  
Priority: P0  
Module: scans

## Preconditions

- Allowlist содержит только `10.0.0.0/8` (enabled).
- Analyst-сессия.
- `SCAN_REJECT_NON_ALLOWLIST=true`.

## Steps

1. `POST /api/scans` с target=`8.8.8.8`, type=`nmap`.
2. `POST /api/scans` с target=`10.1.2.3`, type=`nmap` (mock adapter, без реального nmap).
3. Добавить allowlist `8.8.8.8`, повторить шаг 1.
4. Отключить allowlist entry для 10.0.0.0/8, повторить скан 10.1.2.3.

## Expected

1. Job не запускает сканер: статус `failed` или отказ на enqueue с `ALLOWLIST_REJECTED`; бинарь nmap **не** вызывался (spy).
2. Job принят (queued/running/succeeded в fixture mode).
3. После добавления — 8.8.8.8 принимается.
4. После disable — снова reject.

## Automation

`tests/integration/allowlist-reject.test.ts`

## Last run

Wave 3

## Notes

P0 security gate Wave 3. Admin тоже не обходит без изменения allowlist.
