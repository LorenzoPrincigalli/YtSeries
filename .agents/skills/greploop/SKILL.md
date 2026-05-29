---
name: greploop
description: Iterative codebase exploration via grep chains. Trace code paths, data flow, dependencies, and feature boundaries through repeated search-and-refine cycles.
---

# Greploop

Iterative grep-driven codebase traversal. Each result feeds the next search.

## When to Use

- Trace a function/method from callers to definition
- Map data flow: event -> handler -> store -> UI
- Find all files related to a domain concept
- Discover dependencies between modules
- Understand how a feature is wired end-to-end

## How It Works

Execute repeated grep/glob rounds, each informed by the previous:

1. **Start** — grep the entry point (event name, function call, store key, etc.)
2. **Inspect** — skim results, pick the relevant lines/files
3. **Refine** — grep again with new context (imports, types, adjacent patterns)
4. **Repeat** — until you hit a natural boundary (API boundary, storage layer, UI)

## Patterns

### Trace call chain
```
grep "emitEvent\|dispatch\|sendMessage"  ->  find handler  ->  grep handler name  ->  find logic
```

### Map module dependencies
```
grep "import.*from.*moduleX"  ->  list consumers  ->  grep each consumer's exports
```

### Find feature boundary
```
grep "feature-flag\|isEnabled.*featureX"  ->  grep toggled code  ->  grep featureX component imports
```

## Rules

- **No assumptions** — grep first, infer second
- **No single pass** — a deep trace needs 3-5 rounds minimum
- **Show intermediate results** — share what each round reveals
- **Stop at boundaries** — storage schema, external API, config files
