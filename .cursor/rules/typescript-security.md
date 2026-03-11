---
description: "TypeScript security for AGI Workforce"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
# TypeScript/JavaScript Security

> Extends the common security rule with TypeScript/JavaScript specifics for AGI Workforce.

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Use Tauri SecretManager via invoke
const apiKey = await invoke('get_secret', { key: 'openai_api_key' })

if (!apiKey) {
  throw new Error('OpenAI API key not configured')
}
```

## Tauri Security

- All tool execution goes through ToolGuard
- Never expose raw API keys in frontend state
- Use SecretManager (Argon2id + AES-GCM) for all credential storage
- Validate all IPC parameters on the Rust side
- Sanitize data before rendering in UI (XSS prevention)

## Web App Security

- Supabase RLS policies for data access
- CSRF protection on API routes
- Rate limiting via Upstash Redis
- Environment variable validation at startup (`lib/validate-env.ts`)

## Deep Link Security

- Validate scheme and parameters via allowlist
- Redact tokens from logged URLs
- Never pass secrets through deep link parameters
