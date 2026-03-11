---
description: "Security: mandatory checks, secret management, response protocol"
alwaysApply: true
---
# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management (AGI Workforce)

- NEVER hardcode secrets in source code
- All secrets go through SecretManager (Argon2id + AES-GCM + SQLite/keychain)
- Use ToolGuard for all tool execution sandboxing
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed
- No `eval()`, no dynamic code execution from user input

## Deep Linking Security

- Validate scheme and allowed parameters via ALLOWED_DEEP_LINK_PARAMS allowlist
- Redact tokens from URLs
- Validate origin of deep link requests

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Assess severity (CRITICAL / HIGH / MEDIUM / LOW)
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues
