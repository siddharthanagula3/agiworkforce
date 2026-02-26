# Section 6 — Security & Data Architecture

> PRD: AGI Workforce — Open Model-Agnostic AI Desktop Platform
> Section: 6 of 8
> Last updated: 2026-02-26
> Status key: Implemented | Partial | Planned | Blocked

---

## 6.1 Security Architecture Overview

AGI Workforce employs a layered, defense-in-depth security model spanning the Tauri desktop application, Next.js web frontend, API gateway, browser extension, and signaling server. Each layer has independent controls; compromise of one layer does not cascade to others.

| Layer | Primary Module | Status |
|---|---|---|
| Tool execution sandboxing | ToolGuard (`sys/security/tool_guard.rs`, 1,778 lines) | Implemented |
| Secret storage | SecretManager (`sys/security/secret_manager.rs`) | Implemented |
| Encryption (at rest + in transit) | Argon2id / PBKDF2 / AES-256-GCM / SQLCipher | Implemented |
| Authentication | AuthManager + Supabase Auth + JWT | Implemented |
| Authorization (RBAC) | rbac.rs (desktop) + Supabase org roles (web) | Partial |
| Input validation | validator.rs + Zod (web) + command_validator.rs | Implemented |
| Injection prevention | injection_detector.rs + prompt_injection.rs | Implemented |
| Audit logging | audit.rs + audit_logger.rs + Supabase security_audit_logs | Implemented |
| Web security headers | Helmet.js + Next.js middleware | Implemented |
| Browser extension isolation | Closed shadow DOM + allowlisted DOM ops | Implemented |
| Rate limiting | rate_limit.rs (desktop) + API gateway (web) | Partial |
| Process sandboxing | sandbox.rs + macOS app sandbox (entitlements.plist) | Implemented |

---

## 6.2 Tool Execution — ToolGuard

**SEC-01** — P0 — Implemented

ToolGuard is the central execution control point for all tool calls within the desktop agent runtime. Every tool invocation passes through ToolGuard before execution.

**Safety tier classification:**

| Tier | Examples | Default Behavior |
|---|---|---|
| Safe | Read files (user dirs), web search | Auto-approve |
| RequiresNotification | Read system files | Notify user, auto-approve |
| RequiresConfirmation | Write files, run commands | Prompt user once |
| RequiresExplicitApproval | Delete files, system changes | Hard prompt, cannot auto-approve |

**Risk levels:** Low, Medium, High, Critical — each maps to ToolSafetyTier.

**SEC-02** — P0 — Implemented — Per-tool rate limiting enforced at ToolGuard level. Token-bucket algorithm via `rate_limit.rs`.

**SEC-03** — P0 — Implemented — Path traversal detection on all file-related tool calls. Blocks `../` and absolute path escapes outside approved directories.

**SEC-04** — P1 — Implemented — Domain blocking list for network tool calls. Prevents SSRF against loopback, link-local, and private RFC-1918 ranges.

**SEC-05** — P1 — Implemented — Approval workflow (`approval_workflow.rs`): per-tool approval state persisted in SQLite `approval_requests` and `approval_rules` tables. Approval modes: Ask, Auto-approve read-only, Auto-approve all.

**SEC-06** — P1 — Implemented — Destructive modification protection (`dm_protection.rs`): guard layer specifically for irreversible operations (mass delete, schema drop, credential overwrite).

---

## 6.3 Secret Management

**SEC-07** — P0 — Implemented

SecretManager stores all API keys and credentials using AES-256-GCM encryption backed by SQLCipher. Plaintext secrets never touch disk.

```
encrypt_secret(key, plaintext) -> EncryptedSecret { ciphertext, nonce, tag }
decrypt_secret(key, EncryptedSecret) -> plaintext
```

OS Keyring integration for email credentials:
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service (libsecret)

**SEC-08** — P0 — Implemented — Environment variables for API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) are injected at build time via Vite / at runtime via Tauri env. Never committed to source.

---

## 6.4 Encryption Architecture

**SEC-09** — P0 — Implemented

Five distinct encryption layers protect data at rest and in transit:

| Layer | Algorithm | Purpose | Status |
|---|---|---|---|
| Master password KDF | Argon2id (19 MiB mem, 2 iter, 1 par) | OWASP-compliant user password hashing | Implemented |
| Machine key KDF | PBKDF2-HMAC-SHA256 (600,000 iter) | Machine-derived key (no master password) | Implemented |
| Symmetric encryption | AES-256-GCM | Secret + data encryption | Implemented |
| Key derivation | HKDF-SHA256 | Calendar tokens, cloud storage keys | Implemented |
| Database encryption | SQLCipher | Entire SQLite database at rest | Implemented |
| Update signing | Ed25519 | Desktop auto-update signature verification | Implemented |

**SEC-10** — P1 — Partial — SQLite conversation history and audit log entries are encrypted only when a master password is set. Without a master password, SQLCipher uses the machine-derived key; plaintext recovery is possible with physical access to the device.

**Machine key derivation** (`sys/security/machine_key.rs`):
- Input: `machine-uid + hostname`
- Output via PBKDF2 + `derive_key()` → `KeyPurpose` enum
- Enables automatic encryption without user interaction

---

## 6.5 Authentication

**SEC-11** — P0 — Implemented

| Context | Mechanism | Details |
|---|---|---|
| Desktop app | Session-based + JWT | AuthManager in `auth.rs`; Argon2id password hash; `alg:none` JWT blocked |
| Web app | Supabase Auth | JWT, session cookies via SSR, auto-refresh on expiry |
| API Gateway | JWT HS256 | 7-day expiry, issuer + audience validated |
| OAuth2 | PKCE flow | Google, GitHub, Microsoft (consumer only) |

**SEC-12** — P0 — Implemented — Kill switch: `account_status` column on `profiles` table. Checked on every authenticated API request. 60-second in-memory cache for performance. Fails closed: returns HTTP 503 on Supabase DB error (does not grant access on failure).

**SEC-13** — P1 — Implemented — Constant-time password comparison on API gateway to prevent timing attacks. Dummy bcrypt hash evaluated when user is not found.

**SEC-14** — P2 — Planned — Enterprise SSO: WorkOS configuration exists in codebase but is not wired to live endpoints. No SAML 2.0. No Okta/Azure AD OIDC. Planned for enterprise tier.

---

## 6.6 Role-Based Access Control (RBAC)

**SEC-15** — P1 — Partial

| System | Roles | Location | Status |
|---|---|---|---|
| Web (Supabase) | owner, admin, member, viewer | `organization_members` table | Implemented |
| Desktop | Viewer, Editor, Admin | SQLite `role_permissions` table via `rbac.rs` | Implemented |
| Unified cross-platform model | — | — | Planned |

**Known gaps:**
- No "Billing Manager" role in either system
- No custom roles
- Web and desktop role systems are entirely separate; a desktop admin is not recognized as a web admin
- Per-user subscriptions (not per-org); enterprise billing aggregation not implemented

**SEC-16** — P2 — Planned — Unified RBAC model required before enterprise release. Single role definition propagated to both web and desktop contexts.

---

## 6.7 Input Validation & Injection Prevention

**SEC-17** — P0 — Implemented

All inputs validated before processing:

| Layer | Mechanism |
|---|---|
| Web API routes | Zod `.strict()` schema validation on all request bodies |
| Desktop commands | `validator.rs` + `command_validator.rs` |
| SQL queries | `SqlSecurityValidator` on all external DB connections |
| File paths | `validateFilePath()` in `packages/utils/src/validation.ts` — blocks `../` |
| API keys | `validateApiKey()` format check |

**SEC-18** — P0 — Implemented — SQL injection prevention via `injection_detector.rs` on external query builder. Also applied in `packages/utils/src/validation.ts` via `checkForInjection()` and `sanitizeCommandArgs()`.

**SEC-19** — P0 — Implemented — Prompt injection detection via `prompt_injection.rs`. Functions: `escape_xml()` and `sanitize_multiline_for_prompt()` applied to all tool results before they are inserted into LLM context.

**SEC-20** — P0 — Implemented — Open redirect prevention on web: redirect targets validated against CORS allowlist before issuing 302.

---

## 6.8 Web Application Security

**SEC-21** — P0 — Implemented

HTTP security headers set on all web responses:

| Header | Value |
|---|---|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Resource-Policy | same-origin |
| Cross-Origin-Embedder-Policy | require-corp |

**SEC-22** — P0 — Implemented — Content Security Policy: nonce-based per-request. `script-src` allows Stripe.js and Cloudflare. `connect-src` allows Supabase, Stripe, OpenAI, Anthropic, and Google endpoints only.

**SEC-23** — P0 — Implemented — CSRF protection: `requireCsrfToken()` applied on all state-changing API endpoints.

**SEC-24** — P1 — Implemented — `'server-only'` import guard on all server-side modules to prevent accidental client-side leakage of secrets.

---

## 6.9 Tauri Capabilities & Filesystem Deny List

**SEC-25** — P0 — Implemented

`capabilities/default.json` deny list: 19 entries covering system paths and sensitive files:

| Blocked Category | Examples |
|---|---|
| SSH keys | `~/.ssh/*` |
| Shell configuration | `~/.bashrc`, `~/.zshrc`, `~/.profile` |
| Credential stores | `~/.aws/credentials`, `~/.config/gcloud/*` |
| System directories | `/etc/passwd`, `/etc/shadow`, `/private/etc/*` |
| Process information | `/proc/*` |
| macOS Keychain directory | `~/Library/Keychains/*` |

**SEC-26** — P1 — Planned (TODO #16) — `.env` files are not currently in the Tauri filesystem deny list. A tool agent could theoretically read `.env` from the project working directory. Fix: add `**/.env`, `**/.env.*` to deny list.

**SEC-27** — P2 — Implemented — Write deny list has been aligned to 19 entries matching the read deny list (previously weaker).

---

## 6.10 Browser Extension Security

**SEC-28** — P1 — Implemented

| Control | Detail |
|---|---|
| Script execution | No dynamic code evaluation. Only allowlisted DOM operations permitted |
| Attribute injection | `SET_ATTRIBUTE` allowlisted safe attributes only; blocks `onclick`, `onerror`, `href` on scripts, `src` on scripts, `action` on forms |
| Overlay isolation | FAB overlay rendered in closed shadow DOM — invisible to page JS |
| Rate limiting | 120 requests per 500ms per origin |
| Origin validation | All messages validated against registered origin |
| Native messaging backoff | Exponential backoff: base 1s, max 30s, 8 attempts |

---

## 6.11 API Gateway & Signaling Server Security

**SEC-29** — P1 — Implemented

API Gateway:
- Helmet.js security headers
- JWT HS256, issuer + audience validated
- UUID validation on all path params
- bcrypt for password hashing
- Rate limiting per endpoint (in-memory; Redis needed for multi-instance deployments — see DEBT-07)

Signaling Server:
- Per-IP connection limits enforced
- Message rate limiting per connection
- IP blacklisting via admin endpoint
- Message size caps: 64KB general, 100KB for SDP
- Session cleanup sweep every 30s

---

## 6.12 Audit Logging

**SEC-30** — P1 — Partial

Three fragmented audit systems currently exist:

| System | Location | Format | Integrity | Retention |
|---|---|---|---|---|
| Desktop operation audit | `audit.rs` + SQLite `audit_log` table | Structured (AuditLogEntry) | HMAC-signed | Indefinite |
| Desktop event log | `audit_logger.rs` + SQLite `audit_events` | Structured | HMAC-signed | Indefinite |
| Web security audit | Supabase `security_audit_logs` | JSON | Service-role access only | 90-day auto-cleanup |

**SEC-31** — P2 — Planned — Unified, immutable, aggregated audit log pipeline required for enterprise compliance (SOC 2, ISO 27001). Current logs are not exported, not aggregated across desktop + web, and not queryable by security tooling.

---

## 6.13 Data Architecture — Local Storage (SQLite + SQLCipher)

**DATA-01** — P0 — Implemented

Local database: encrypted SQLite via `bundled-sqlcipher`. Configuration:

| Setting | Value |
|---|---|
| Journal mode | WAL (Write-Ahead Logging) |
| Synchronous | NORMAL |
| Cache size | 64MB |
| Foreign keys | ON |
| Busy timeout | 5,000ms |
| Full-text search | FTS5 with Porter tokenizer |

Schema: 55 migrations (v1 to v55). 80+ tables grouped by functional domain:

| Category | Key Tables |
|---|---|
| Core | conversations, messages, settings, settings_v2, schema_version |
| Security | permissions, audit_log, audit_events, approval_requests, approval_rules |
| Auth | users, auth_sessions, oauth_providers, api_keys, auth_audit_log, role_permissions, user_permissions |
| Memory | user_memory, daily_logs, project_memories |
| AGI / Agents | autonomous_sessions, autonomous_task_logs, ai_employees, user_employees, employee_tasks, background_agents |
| Workflows | workflow_definitions, workflow_executions, workflow_execution_logs, published_workflows |
| Billing | billing_customers, billing_subscriptions, billing_invoices, billing_usage, billing_payment_methods, billing_webhook_events |
| Calendar / Email | calendar_accounts, email_accounts, emails, email_attachments, contacts |
| MCP | mcp_servers, mcp_tools_cache, context_items |
| Checkpoints | conversation_checkpoints, checkpoint_restore_history, agi_tasks, agi_task_checkpoints |
| Analytics | analytics_snapshots, process_benchmarks, roi_configurations, realtime_metrics |
| Teams | teams, team_members, team_invitations, team_resources, team_activity, team_billing |
| Scheduling | scheduled_jobs, job_executions |
| Automation | automation_history, overlay_events, command_history, clipboard_history |
| Captures | captures, ocr_results |
| Computer Use | computer_use_sessions, computer_use_actions |
| Master Password | master_password, master_password_migration |
| Sync | offline_operations_queue, codebase_cache |
| FTS (virtual) | messages_fts, conversations_fts |

**Key model schemas:**

```
Conversation: id, user_id, title, created_at, updated_at
Message: id, conversation_id, user_id, role (User|Assistant|System),
         content, tokens, cost, provider, model
TokenUsage: input_tokens, output_tokens, total_cost, model, provider
Permission: permission_type (File*/Command*/App*/Clipboard*/Process*),
            state (Allowed|Prompt|PromptOnce|Denied)
AuditLogEntry: operation_type, approved, success, duration_ms
```

---

## 6.14 Data Architecture — Cloud Storage (Supabase PostgreSQL)

**DATA-02** — P0 — Implemented

16+ Supabase migrations establishing the cloud data model. Row-Level Security (RLS) enabled on all tables, keyed on `auth.uid()` and `organization_members`.

**Key tables:**

| Table | Purpose |
|---|---|
| profiles | User profile; `stripe_customer_id`, `account_status`, timestamps |
| subscriptions | Per-user; `plan_tier` (free/hobby/pro/max), `stripe_subscription_id`, `current_period_end` |
| credit_accounts | `monthly_allocation`, `monthly_used`, `daily_allocation`, `daily_used`, `idempotency_keys` |
| organizations | Multi-tenant container with RBAC |
| organization_members | `role` (owner/admin/member/viewer) |
| security_audit_logs | Service-role access only; 90-day TTL |
| processed_stripe_events | Stripe webhook idempotency |

**DATA-03** — P1 — Partial — SCIM provisioning fields added to `profiles` and `organization_members` in migration `20260224000001_add_scim_fields.sql`. No SCIM 2.0 API endpoints implemented yet (see DEBT-12).

**DATA-04** — P2 — Partial — Subscriptions are per-user, not per-organization. Enterprise customers requiring org-level consolidated billing cannot be served by current schema. Team billing model exists in code ($29/seat Team, $99/seat Enterprise) but is not wired to Stripe.

---

## 6.15 Data Architecture — Embeddings & External Databases

**DATA-05** — P1 — Implemented

Embeddings stored in separate SQLite file (`.agi/embeddings.db`):
- `EmbeddingGenerator`, `EmbeddingModel`, `EmbeddingCache`
- `CodeChunker` with configurable `ChunkStrategy`
- Cosine similarity search for retrieval

**DATA-06** — P1 — Implemented — External database connectivity from desktop agent:

| Database | Module | Security Control |
|---|---|---|
| PostgreSQL | `sql_client.rs` | `SqlSecurityValidator` |
| MySQL | `sql_client.rs` | `SqlSecurityValidator` |
| SQLite (external) | `sql_client.rs` | `SqlSecurityValidator` |
| MongoDB | `nosql_client.rs` | Connection string validation |
| Redis | `redis_client.rs` | Auth URL validation |

Safe query construction via `query_builder.rs` (Select / Insert / Update / Delete builders).

---

## 6.16 Shared Types & Validation Utilities

**DATA-07** — P1 — Implemented

Canonical types in `packages/types/src/`:

| File | Key Types |
|---|---|
| context.ts | `ContextItemType` (file/folder/url/web/image/code-snippet/selection/clipboard), `ContextItem` variants |
| errors.ts | `ErrorCode` (18 codes), `ApiError`, `FriendlyError`, `FRIENDLY_ERROR_MESSAGES`, `HTTP_STATUS_TO_ERROR_CODE` |
| tauri.ts | `BrowserActionPayload`, `SqlQueryResult`, `MCPServerConfig`, `SubscriptionStatus`, `PlanTier`, `ExtendedMessageMetadata` |
| customModel.ts | `CustomModelConfig` (id, displayName, provider, baseUrl, modelId, apiKeyRef, contextWindow, capabilities, status) |
| signaling.ts | `SignalingRole`, `SignalingEvent`, `SignalKind`, `SignalingClientOptions` |

Shared validation in `packages/utils/src/validation.ts`:
- `validateEmail`, `validateUrl`, `validateFilePath` (blocks `../`), `validatePassword`
- `validateApiKey`, `validateJson`, `validateSqlQuery`
- `sanitizeCommandArgs`, `checkForInjection`

---

## 6.17 Cache Architecture

**DATA-08** — P2 — Implemented

| Cache | Algorithm | TTL | Max Entries | Invalidation |
|---|---|---|---|---|
| LLM responses | LRU | 24h | 512 | Eviction on capacity |
| Codebase analysis | File-watcher backed | On-change | Unbounded | File system events |
| Tool results | Execution result cache | Per-tool config | — | Manual or TTL |
| Swarm decomposition | SHA-256 content hash | 1h | — | Hash mismatch |

22 Tauri cache commands exposed to frontend for manual cache management.

---

## 6.18 Security Compliance Gaps & Roadmap

**SEC-32** — P1 — Planned — Full enterprise compliance checklist:

| Requirement | Current State | Gap | Priority |
|---|---|---|---|
| SAML 2.0 / enterprise OIDC | Not implemented | WorkOS config unused | P1 |
| Unified RBAC | Two separate systems | No cross-platform propagation | P1 |
| Org-level billing | Per-user only | Schema migration required | P1 |
| SCIM 2.0 provisioning | DB fields only | No API endpoints | P2 |
| Immutable audit log | Three fragmented systems | Aggregation + export needed | P1 |
| MDM profiles (GPO/Jamf/Intune) | Passive MSI/DMG | No provisioning profiles | P2 |
| IT-admin update deferral | Ed25519 verify only | No maintenance window config | P2 |
| In-app proxy UI | Auto-detect only | No PAC/TLS inspection UI | P3 |
| .env filesystem deny list | Not blocked | Tauri deny list gap (TODO #16) | P1 |
| Redis rate limiting | In-memory only | Single-instance limitation | P1 |
