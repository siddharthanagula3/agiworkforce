---
name: code-review
description: Review code for concrete correctness, security, and regression risks with actionable evidence.
version: 1.0.0
---

# Code review

Use this skill for a review of a change, pull request, patch, or focused code area.

1. Establish the intended behavior and inspect the smallest relevant owner paths and tests.
2. Prioritize correctness, security, authorization, tenant isolation, data loss, concurrency, and compatibility.
3. Trace inputs through validation, state changes, side effects, errors, and cleanup.
4. Check loading, empty, disabled, success, timeout, cancellation, retry, and rollback behavior where applicable.
5. Report only findings supported by concrete code paths or reproducible behavior.
6. Order findings by severity and cite the narrowest useful file and line.
7. If no actionable defect is found, say so and list the remaining verification gaps.

Do not treat style preference as a defect or claim a test passed unless it was actually run.
