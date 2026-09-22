# Фикстуры тестов

Каталог для сырых ответов/отчётов внешних систем. Бинарные сканеры в CI не обязательны — парсеры кормятся файлами отсюда.

## Планируемая структура

```
tests/fixtures/
  README.md                 ← этот файл
  nvd/
    cve-sample.json         # фрагмент NVD API 2.0 (1–3 CVE)
    cve-upsert-dup.json     # повтор того же CVE для идемпотентности
  bdu/
    vulxml-sample.xml       # урезанный BDU XML с bdu_id + cve
    vulxml-no-cve.xml       # запись без CVE link
  nmap/
    scan-sample.xml         # nmap XML → ports/services
  nuclei/
    findings-sample.jsonl   # nuclei JSONL → findings + CVE
```

## Использование

| Фикстура | TC |
|----------|-----|
| NVD JSON | TC-005, TC-006 (mock HTTP) |
| BDU XML | TC-007, TC-008 |
| nmap XML | TC-012 |
| nuclei JSONL | TC-013 |

## Правила

- Не класть полные дампы production и персональные данные.
- Минимальный объём, достаточный для assert полей схемы.
- Wave 0: каталог пустой (`.gitkeep`); файлы добавить при реализации парсеров.
