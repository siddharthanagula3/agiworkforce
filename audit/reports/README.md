# audit/reports

Status: Current
Owner: Platform + security
Purpose: security, defect, dead-code, and remediation evidence reports
Retention: Keep audit evidence while the related finding, remediation, or verification baseline is active. After closure, summarize durable facts into `docs/agent-context/known-flaws.md`, `audit/audit-log.md`, or a dated audit ledger before deleting raw scan output.

## Rules

- Every direct child folder must be a lowercase kebab-case report collection with its own `README.md`.
- Do not place loose scan files directly under `audit/reports/`.
- Raw scan output belongs in a dated collection so future agents can tell which run produced it.
- Security-sensitive samples must be redacted before they are committed.
