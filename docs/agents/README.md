# How to spawn subagents (orchestration cheat-sheet)

## Rule
Один субагент = одна волна = один узкий промпт из `docs/agents/`.  
Не давать субагенту весь PRODUCT_SPEC как единственную задачу «сделай всё».

## Template call

```
Subagent model: inherit (or strongest available for architecture waves W0/W2)

Prompt:
"""
Ты субагент волны Wn проекта VBXSystem.
Работай медленно, enterprise-качество важнее скорости.

Обязательно прочитай:
- docs/MASTER_PROMPT.md (принципы)
- docs/PRODUCT_SPEC.md (только релевантные секции)
- docs/agents/Wn_*.md (твой единственный scope)
- docs/STATUS.md (что уже сделано)

Запрещено выходить за Out of scope своего файла.
Стилистика UI: cvefeed.io dark; бренд VBX; UI на русском.
По завершении: тесты + обновление docs/STATUS.md + краткий отчёт DoD checklist.
"""
```

## Suggested order
```
W0 → W1 → W2 → W3 → (W4 ∥ W5) → W6 → W7 → W8
→ W9 (VULNEX enrich) → (W10 ∥ W11)
```
`W4` и `W5` можно параллелить после W3.  
`W6` может стартовать после W1, но Database polish лучше после W2.  
После W8 — обогащение по `docs/ENRICHMENT_FROM_VULNEX.md` (W9→W11).

## Review gate between waves
Перед стартом следующей волны проверить:
1. DoD checklist в агент-файле закрыт
2. API contract не сломан (или есть migration note)
3. Compose всё ещё поднимается
4. STATUS.md актуален
