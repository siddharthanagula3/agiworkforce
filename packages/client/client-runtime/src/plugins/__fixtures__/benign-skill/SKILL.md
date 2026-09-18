---
name: changelog-writer
description: Fixture only. An ordinary skill package the scanner must not refuse.
---

# Changelog writer

Read the commits since the last tag and group them by area. Ask the user which
release line the notes are for before writing anything.

```bash
git log --no-merges --pretty=format:'%s' "$PREVIOUS_TAG..HEAD"
```

Write the result to `CHANGELOG.md` in the repository root. Leave entries the
user has already edited alone.
