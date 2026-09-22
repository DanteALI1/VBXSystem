# Dashboard

Route: `/app`

## Summary

Dense overview of inventory totals and NVD/BDU sync state. Data from `GET /api/dashboard`.

## API shape

```json
{
  "vulnerabilities": 0,
  "assets": 0,
  "findingsOpen": 0,
  "sync": {
    "nvd": {
      "source": "nvd",
      "status": "idle",
      "lastSyncAt": null,
      "lastSuccessAt": null,
      "cursor": null
    },
    "bdu": { "...": "optional when row missing" }
  }
}
```

Missing `sync_states` rows omit the corresponding `sync.nvd` / `sync.bdu` keys; UI shows idle/never.
