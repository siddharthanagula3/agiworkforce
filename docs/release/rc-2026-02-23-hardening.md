# Commercial Hardening Audit — RC 2026-02-23

## 1. Subscription Posture

See [subscription-posture.md](./subscription-posture.md) for detailed findings.

**Summary:** Cloud LLM access is server-validated via JWT Bearer token to `api.agiworkforce.com`. Client-side gates (`subscriptionGate.ts`) are advisory UX — not the security boundary. Acceptable for RC.

## 2. Sensitive Logging Audit

### Rust Backend

**No direct secret logging found.** Reviewed all `tracing::info!`, `tracing::debug!`, `tracing::warn!`, and `println!` calls containing token/key/secret/password/bearer/credential patterns.

Findings:

- `sys/security/audit_logger.rs:109` — Logs a warning about hardcoded HMAC key, but only in `#[cfg(debug_assertions)]` (debug builds). Production builds error instead. **PASS.**
- `sys/commands/api.rs:226,244` — Logs client_id for OAuth refresh/credential flows. Does NOT log token values. **PASS.**
- `lib.rs:566` — Logs error when writing `.ipc_token` file fails. Does NOT log the token value. **PASS.**
- `core/mcp/config.rs:555` — Logs "Stored new refresh token for provider: {provider}". Logs provider name, not token value. **PASS.**

### Redaction Module Gap

**File:** `apps/desktop/src-tauri/src/sys/telemetry/redaction.rs:5`

The `API_KEY_REGEX` pattern is `sk-[a-zA-Z0-9]{20,}` which matches OpenAI-style keys (`sk-proj-abc123...`) but does **NOT** match Anthropic key format `sk-ant-api03-...` because the regex requires alphanumeric characters after `sk-` and does not allow hyphens.

**Recommendation:** Update the regex to cover Anthropic tokens. Suggested pattern:

```rust
static API_KEY_REGEX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(sk-[a-zA-Z0-9\-]{20,})").unwrap()
);
```

This is **LOW RISK** for RC because the managed cloud provider does not log token values, and the redaction module is a defense-in-depth measure. However, it should be fixed before GA.

### TypeScript Frontend

**No token value logging found.** Reviewed all `console.log`/`console.debug` calls with token/key/secret/password/bearer/auth patterns.

Key observations:

- `supabaseAuth.ts:285` — Logs `session?.user?.email` on auth state change. Email only, not a secret. **PASS.**
- `supabaseAuth.ts:308,421` — Logs "tokens synced to Rust backend" (confirmation message, no values). **PASS.**
- `supabaseAuth.ts:182` — Logs `subscription.plan_tier` (e.g., "pro"). Not sensitive. **PASS.**

### Fixes Applied

None required. No clear-text secret logging found in either Rust or TypeScript code.

## 3. Updater Configuration

**File:** `apps/desktop/src-tauri/tauri.conf.json`

| Check                  | Status   | Details                                                                           |
| ---------------------- | -------- | --------------------------------------------------------------------------------- |
| HTTPS endpoints        | **PASS** | `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`        |
| Pubkey present         | **PASS** | `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQxODAzNEI3NDk3MzIzODEK...` |
| Windows install mode   | **PASS** | `"installMode": "passive"`                                                        |
| macOS signing identity | **PASS** | `"Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)"`                     |
| macOS entitlements     | **PASS** | `"entitlements": "entitlements.plist"`                                            |

## 4. Privacy/Terms/About Links

**Status: NOT YET PRESENT**

No Privacy Policy, Terms of Service, or Support links found in `apps/desktop/src/components/Settings/SettingsPanel.tsx` or other settings components.

TODO comments added to `SettingsPanel.tsx` to track this for release. Links needed:

- Privacy Policy: `https://agiworkforce.com/privacy`
- Terms of Service: `https://agiworkforce.com/terms`
- Support: `https://agiworkforce.com/support`

## 5. Content Security Policy

**File:** `apps/desktop/src-tauri/tauri.conf.json:35`

| Directive                                       | Status   | Notes                                                                                                |
| ----------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `default-src 'self'`                            | **PASS** | Restrictive default                                                                                  |
| `script-src 'self' 'wasm-unsafe-eval'`          | **PASS** | No `unsafe-inline` or `unsafe-eval`                                                                  |
| `style-src 'self' https://fonts.googleapis.com` | **PASS** | Only Google Fonts allowed                                                                            |
| `connect-src`                                   | **PASS** | Limited to known domains: api.agiworkforce.com, supabase, stripe, signaling server, localhost Ollama |
| `frame-ancestors 'none'`                        | **PASS** | Prevents clickjacking                                                                                |
| `object-src 'none'`                             | **PASS** | Blocks plugins                                                                                       |
| `base-uri 'self'`                               | **PASS** | Prevents base tag injection                                                                          |
| `form-action 'self'`                            | **PASS** | Prevents form hijacking                                                                              |

## Overall Assessment

| Area                     | Status                                             |
| ------------------------ | -------------------------------------------------- |
| Subscription enforcement | PASS — server-validated for cloud LLM              |
| Sensitive logging        | PASS — no secrets in logs                          |
| Redaction coverage       | NOTE — Anthropic token format not covered by regex |
| Updater security         | PASS — HTTPS, pubkey, passive install              |
| Privacy/Terms links      | TODO — comments added, links needed before GA      |
| CSP                      | PASS — well-configured                             |
