---
description: Export instincts for sharing
agent: build
---

# Instinct Export Command

Export instincts for sharing with others: $ARGUMENTS

## Your Task

Export instincts from the continuous-learning-v2 system.

## Export Options

### Export All
```
/instinct-export
```

### Export High Confidence Only
```
/instinct-export --min-confidence 0.8
```

### Export by Category
```
/instinct-export --category coding
```

### Export to Specific Path
```
/instinct-export --output ./my-instincts.json
```

---

**TIP**: Export high-confidence instincts (>0.8) for better quality shares.
