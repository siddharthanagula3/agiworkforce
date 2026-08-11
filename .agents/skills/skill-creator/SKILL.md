---
name: skill-creator
description: Draft a small AGI skill bundle with explicit triggers, trust boundaries, and verification steps.
version: 0.1.0-draft
draft: true
---

# Skill creator

This catalog entry is a draft and must not be offered to the model for execution.

When it is promoted, it should guide an author to:

1. Define one narrow job and the requests that should trigger it.
2. Reuse the standard `SKILL.md` bundle layout and keep the main instructions concise.
3. Declare only tools and environment capabilities that the target runtime actually provides.
4. Treat external content as untrusted data and require approval for destructive, privileged, external, or expensive actions.
5. Avoid copied proprietary instructions, hidden downloads, bundled secrets, and unnecessary scripts.
6. Add representative trigger, non-trigger, safety, and failure-path tests.
7. Run integrity-lock verification and skill vetting before distribution.
