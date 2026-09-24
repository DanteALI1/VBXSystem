"""Download BDU dump from FSTEC URL (used by API upload path and worker)."""

from __future__ import annotations

from pathlib import Path

import httpx

DEFAULT_BDU_URL = "https://bdu.fstec.ru/files/documents/vullist.xlsx"
CHUNK = 1024 * 256


class BduDownloadError(Exception):
    def __init__(self, message: str, *, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code
        self.detail = message


def download_bdu_url(url: str, dest: Path, max_bytes: int) -> int:
    """Download BDU dump. FSTEC often needs verify=False (incomplete CA chain)."""
    last_err: Exception | None = None
    for verify in (True, False):
        try:
            with httpx.Client(timeout=300.0, follow_redirects=True, verify=verify) as client:
                with client.stream("GET", url) as resp:
                    if resp.status_code >= 400:
                        raise BduDownloadError(
                            f"Источник БДУ вернул HTTP {resp.status_code}. "
                            f"Проверьте URL (актуально: {DEFAULT_BDU_URL}).",
                            status_code=502,
                        )
                    ctype = (resp.headers.get("content-type") or "").lower()
                    written = 0
                    with dest.open("wb") as out:
                        for chunk in resp.iter_bytes(CHUNK):
                            written += len(chunk)
                            if written > max_bytes:
                                dest.unlink(missing_ok=True)
                                raise BduDownloadError(
                                    f"Выгрузка БДУ превышает лимит {max_bytes // (1024 * 1024)} МБ",
                                    status_code=413,
                                )
                            out.write(chunk)
                    head = dest.read_bytes()[:64].lstrip() if written else b""
                    if written < 100_000 and ("text/html" in ctype or head.startswith(b"<!")):
                        dest.unlink(missing_ok=True)
                        raise BduDownloadError(
                            "Источник вернул HTML вместо файла БДУ (часто устаревший vulxml.xml). "
                            f"Используйте {DEFAULT_BDU_URL}",
                            status_code=502,
                        )
                    return written
        except BduDownloadError:
            raise
        except Exception as exc:
            last_err = exc
            dest.unlink(missing_ok=True)
            continue
    raise BduDownloadError(f"Не удалось скачать БДУ: {last_err}", status_code=502) from last_err
