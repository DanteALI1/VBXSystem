# TC-017 Screenshot walkthrough smoke

Status: draft  
Type: manual  
Priority: P2  
Module: docs / setup-walkthrough

## Preconditions

- Репозиторий с `docs/setup-walkthrough/README.md`.
- Каталог `docs/setup-walkthrough/images/`.

## Steps

1. Прочитать таблицу кадров A1–F2 и C5.
2. Для каждого ID проверить: если статус `ready` — PNG существует и >0 bytes; если `pending` — файла нет (или только .gitkeep в папке).
3. Опционально e2e: тест падает, если README говорит `ready`, а файла нет.
4. Убедиться, что на готовых кадрах нет паролей/секретов и бренда OpenCVE.

## Expected

- Согласованность README ↔ filesystem.
- `.gitkeep` присутствует.
- Нет ложного `ready` без PNG.

## Automation

`tests/e2e/walkthrough-images.spec.ts` (planned) + manual review

## Last run

—

## Notes

В Wave 0 все кадры pending — smoke должен pass при проверке «pending ⇒ нет PNG».
