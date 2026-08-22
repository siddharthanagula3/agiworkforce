---
name: systematic-debugging
description: Reproduce a failure, isolate its cause, and verify the smallest safe correction. Use when something is broken, crashing, erroring, failing intermittently, or behaving differently in production than locally.
version: 1.0.0
---

# Systematic debugging

Use this skill when behavior is broken, inconsistent, slow, or unexpectedly failing.

1. Capture the exact symptom, environment, inputs, expected result, and actual result.
2. Reproduce with the smallest relevant command or user flow.
3. Inspect logs, errors, network activity, state transitions, and recent changes before forming a cause.
4. Form one falsifiable hypothesis at a time and run the narrowest check that can disprove it.
5. Trace the failure to the owning boundary rather than patching a downstream symptom.
6. Make the smallest safe fix only when authorized, then add a regression test for the reproduced failure.
7. Re-run the reproduction and relevant checks; record unresolved risks honestly.

Never erase user data, weaken a trust boundary, or disable validation to make a symptom disappear.
