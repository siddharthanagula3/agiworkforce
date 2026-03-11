---
description: Run comprehensive security review (ToolGuard, SecretManager, OWASP)
agent: security-reviewer
subtask: true
---

# Security Review Command

Conduct a comprehensive security review: $ARGUMENTS

## Your Task

Analyze the specified code for security vulnerabilities following OWASP guidelines, AGI Workforce security architecture, and best practices.

## AGI Workforce Security Architecture

- **ToolGuard** (`sys/security/tool_guard.rs`) - Validates ALL tool execution
- **SecretManager** - Encrypts API keys via Argon2id + AES-GCM, stored in SQLite/keychain
- **RBAC** - Role-based access control for operations
- **Rate Limiting** - Upstash Redis for web app API routes

## Security Checklist

### OWASP Top 10

1. **Injection** (SQL, NoSQL, OS command, LDAP)
   - Check for parameterized queries in Rust SQLite
   - Verify Supabase RLS policies
   - Review dynamic query construction

2. **Broken Authentication**
   - Supabase auth (SSR via @supabase/ssr)
   - Session management
   - Mobile auth via expo-secure-store

3. **Sensitive Data Exposure**
   - All secrets through SecretManager (never plaintext)
   - Proper key management
   - PII handling

4. **Broken Access Control**
   - Tauri IPC command authorization
   - ToolGuard validation
   - MCP tool execution sandboxing

5. **Security Misconfiguration**
   - Default credentials removed
   - Error handling doesn't leak info
   - Security headers configured

6. **Cross-Site Scripting (XSS)**
   - React output encoding
   - Content Security Policy
   - Input sanitization

### AGI Workforce Specific Checks

- [ ] Secrets go through SecretManager (Argon2id + AES-GCM)
- [ ] MCP tool execution validated by ToolGuard
- [ ] Tauri IPC commands validate input params
- [ ] Deep linking uses ALLOWED_DEEP_LINK_PARAMS allowlist
- [ ] Chrome extension API keys in chrome.storage.session
- [ ] Mobile auth tokens in expo-secure-store
- [ ] No AppleScript injection in automation commands

## Report Format

### Critical Issues
[Issues that must be fixed immediately]

### High Priority
[Issues that should be fixed before release]

### Recommendations
[Security improvements to consider]

---

**IMPORTANT**: Security issues are blockers. Do not proceed until critical issues are resolved.
