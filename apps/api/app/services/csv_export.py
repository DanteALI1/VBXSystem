"""CSV helpers for search / CVEQL / audit exports."""

from __future__ import annotations

import csv
import io
from typing import Any, Iterable, Sequence


def rows_to_csv(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(list(headers))
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    return buf.getvalue()


def dicts_to_csv(headers: Sequence[str], rows: Iterable[dict]) -> str:
    return rows_to_csv(headers, ([r.get(h) for h in headers] for r in rows))
