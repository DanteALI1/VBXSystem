# Фикстуры тестов

Каталог для сырых ответов/отчётов внешних систем. Бинарные сканеры в CI не обязательны — парсеры кормятся файлами отсюда.

## Структура

```
tests/fixtures/
  README.md
  nvd-fragment.json         # NVD API 2.0 fragment (fixture sync + TC-005)
  nvd-sample.json           # seed-aligned sample CVEs
  bdu-mini.xml              # mini BDU XML with/without CVE (TC-007/008)
  nmap/                     # (planned) nmap XML
  nuclei/                   # (planned) nuclei JSONL
```

## Использование

| Фикстура | TC |
|----------|-----|
| `nvd-fragment.json` | TC-005, fixture `nvd-sync` |
| `bdu-mini.xml` | TC-007, TC-008, fixture `bdu-sync` |
| nmap XML | TC-012 |
| nuclei JSONL | TC-013 |

## Правила

- Не класть полные дампы production и персональные данные.
- Минимальный объём, достаточный для assert полей схемы.
