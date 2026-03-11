---
description: Import instincts from external sources
agent: build
---

# Instinct Import Command

Import instincts from a file or URL: $ARGUMENTS

## Your Task

Import instincts into the continuous-learning-v2 system.

## Import Sources

### File Import
```
/instinct-import path/to/instincts.json
```

### URL Import
```
/instinct-import https://example.com/instincts.json
```

## Import Format

Expected JSON structure:

```json
{
  "instincts": [
    {
      "trigger": "[situation description]",
      "action": "[recommended action]",
      "confidence": 0.7,
      "category": "coding",
      "source": "imported"
    }
  ],
  "metadata": {
    "version": "1.0",
    "exported": "2026-01-15T10:00:00Z",
    "author": "username"
  }
}
```

---

**TIP**: Review imported instincts with `/instinct-status` after import.
