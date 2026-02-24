# Specification: Enterprise Readiness Assessment

Generated: 2026-02-23T00:00:00Z

## Task Overview

Four parallel audit agents will assess whether the AGI Workforce codebase meets B2B enterprise buyer requirements across 10 sub-items in 4 domains: Identity & Access Management, Data Security & Tenant Isolation, Administration & Governance, and Deployment & IT Control. Each agent reads (never modifies) the relevant files and produces a findings report.

## Team Composition

- **Agent F** -- Identity & Access Management (IAM): SSO, RBAC, SCIM Provisioning
- **Agent G** -- Data Security & Tenant Isolation: RLS/org isolation, local encryption
- **Agent H** -- Administration & Governance: Audit logging, centralized billing & seats
- **Agent I** -- Deployment & IT Control: MDM deployment, update control, proxy/firewall

---

## File Allocation

### Agent F -- Identity & Access Management

**Sub-Item 1: SSO (SAML/OIDC)**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/login/page.tsx` -- Web login UI. Currently supports email/password, magic link OTP, and GitHub OAuth via Supabase Auth. No SAML/OIDC enterprise IdP flow found.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/config.toml` -- Supabase auth config. Lists external OAuth providers (Apple, GitHub, Google, etc.) but all disabled. Comments reference `keycloak` and `workos` as available OIDC providers. No SAML configuration block present in this file.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/oauth.rs` -- Desktop OAuth manager. Supports Google, GitHub, Microsoft OAuth2 with PKCE. This is consumer OAuth (OIDC standard scopes: openid, email, profile) but NOT enterprise SAML federation.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/auth.rs` -- Desktop auth session storage. Simple in-memory session store for Supabase JWT. No SSO integration.
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/auth.ts` -- API gateway auth routes. Register/login with email+password, JWT issuance. No SSO endpoints.
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/auth.ts` -- JWT verification middleware. Uses HS256, checks account_status kill switch.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/teams/team_billing.rs` -- Team billing plans. Enterprise plan listing mentions "SSO and SAML" as a feature string (line 63) but this is marketing only; no implementation exists.

**Current State (SSO):** The codebase has consumer-grade OAuth2 (Google, GitHub, Microsoft) via the desktop `OAuthManager` and Supabase Auth, but no SAML 2.0 federation, no enterprise OIDC integration (e.g., Okta, Azure AD tenant-specific), and no WorkOS integration despite Supabase supporting it. The `team_billing.rs` Enterprise plan lists "SSO and SAML" as a bullet point but it is not implemented.

**Sub-Item 2: RBAC**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` -- Defines `organizations`, `organization_members` (roles: owner, admin, member, viewer). This is the web/cloud RBAC schema.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260118000000_add_missing_rls_policies.sql` -- RLS policies enforce org membership roles (owner/admin can update org, add members, etc.).
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/auth.rs` -- Desktop `UserRole` enum: Viewer, Editor, Admin (3 roles). In-memory auth with Argon2id password hashing, account lockout, session management.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/rbac.rs` -- Desktop `RBACManager` with SQLite-backed permission system. Roles get permissions via `role_permissions` table, with per-user overrides via `user_permissions` table. Supports `has_permission()`, `require_admin()`, etc.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/permissions.rs` -- Desktop `PermissionManager` for filesystem/automation permissions (FileRead, FileWrite, CommandExecute, etc.). Separate from RBAC -- this controls agent tool access, not user roles.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts` -- Admin API route. Verifies admin via `app_metadata.role === 'admin'` or profiles `is_admin` column. Supports suspend-user, ban-user actions.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/policy/mod.rs` -- Security policy engine for tool safety tiers (Safe, RequiresNotification, RequiresConfirmation, RequiresExplicitApproval).

**Current State (RBAC):** Two separate RBAC systems exist. The web platform has org-level roles (owner/admin/member/viewer) enforced via Supabase RLS. The desktop app has a local RBAC with 3 roles (Viewer/Editor/Admin) backed by SQLite, plus a separate tool-permission system. There is no unified role model across platforms. Notably missing: "Billing Manager" as a distinct role, custom role creation, and role hierarchy documentation.

**Sub-Item 3: SCIM Provisioning**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` -- No SCIM-related tables found.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/` -- No SCIM endpoint directory exists.
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/` -- Routes: auth.ts, credits.ts, desktop.ts, mobile.ts, sync.ts. No SCIM routes.

**Current State (SCIM):** No SCIM 2.0 provisioning endpoints exist anywhere in the codebase. There are no user lifecycle webhooks for IT provisioning/deprovisioning. The only user creation path is self-service signup or service-role admin operations.

---

### Agent G -- Data Security & Tenant Isolation

**Sub-Item 4: Tenant Data Isolation**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` -- Defines `organizations` and `organization_members` tables. `audit_logs` has `organization_id` FK. Subscriptions, token_credits, credit_transactions are user-scoped (not org-scoped). RLS on profiles, subscriptions, token_credits uses `auth.uid()` for user-level isolation.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260105000000_optimize_rls_policies.sql` -- Optimized RLS using `(select auth.uid())` pattern for caching.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260118000000_add_missing_rls_policies.sql` -- Comprehensive RLS for all tables. Organizations use membership-based access. `organization_members` access is scoped to same-org members. `audit_logs` are viewable by user or org admin/owner.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260107000000_fix_duplicate_indexes_and_rls.sql` -- RLS fixes.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260108000002_fix_claim_beta_invite_rpc_security.sql` -- Security fix for RPC functions.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260109100000_fix_database_cleanup_and_security.sql` -- Database security cleanup.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260115000000_critical_fixes_gdpr_compliance.sql` -- GDPR compliance fixes.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql` -- Kill switch (account_status), revoked export_user_data direct access, fixed SECURITY DEFINER search_path.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260108000000_lock_down_credit_rpcs.sql` -- Locked down credit RPC functions.
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/auth.ts` -- API gateway checks account_status via Supabase profile query.
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/rateLimit.ts` -- Rate limiting by user ID or IP. Per-endpoint rate configs (credits, devices, sync, etc.).

**Current State (Tenant Isolation):** Data isolation is implemented at two levels: (a) user-level via RLS policies keyed on `auth.uid()`, and (b) organization-level via membership lookups in `organization_members`. All tables have RLS enabled. Critical financial tables (subscriptions, token_credits) are user-scoped, not org-scoped. There is no org-level billing (subscriptions are per-user). Cross-tenant query prevention relies entirely on Supabase RLS -- no application-layer org context filtering (e.g., no `org_id` header validated in middleware). SECURITY DEFINER functions have been patched with `SET search_path`.

**Sub-Item 5: Local Data Encryption (Tauri Desktop)**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/master_password.rs` -- `MasterPasswordManager` implements Argon2id (OWASP params: 19 MiB memory, 2 iterations, 1 parallelism). Password verifier stored in SQLite (never the password). Key derivation: Argon2id -> HKDF-SHA256 with purpose-specific salts. Migration support for existing installations. Secure zeroization via volatile writes + memory barrier.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/machine_key.rs` -- `MachineKeyManager` derives deterministic keys from machine_id + app_bundle_id + install_id using PBKDF2-HMAC-SHA256 with 600,000 iterations. Different `KeyPurpose` variants (JwtSecret, DatabaseEncryption, McpCredentials, ApiKeys, etc.) produce different keys. Also supports password-based derivation combining user password + machine identity.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/encryption.rs` -- `SecretStore` uses AES-256-GCM for encryption/decryption. Keys derived from `machine_key::derive_key(KeyPurpose::MasterEncryption)`. Random nonce per encryption.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/secret_manager.rs` -- `SecretManager` manages JWT secrets and encryption keys. Stores encrypted secrets in SQLite `settings` table with `encrypted=1` flag. Uses machine-derived keys for database encryption.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/storage.rs` -- Secure file-level encryption utilities.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/mod.rs` -- Re-exports all security modules. Documents the full security surface: encryption, master password, RBAC, audit, OAuth, policy engine, tool guards, command validation, prompt injection detection, sandbox, rate limiting, etc.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/entitlements.plist` -- macOS sandbox enabled (`com.apple.security.app-sandbox = true`). Requests: network client/server, user-selected file read-write, downloads read-write, camera, microphone, audio input, Apple Events automation, JIT, unsigned memory, dyld env vars.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/tauri.conf.json` -- CSP policy restricts script-src, connect-src to specific domains. frame-ancestors 'none' prevents clickjacking.

**Current State (Local Encryption):** Strong local encryption architecture. Master password (Argon2id, OWASP params) -> HKDF key derivation -> AES-256-GCM for secrets. Machine-specific PBKDF2 keys (600K iterations) as fallback. SQLite database stores encrypted settings. Secure zeroization implemented. However: SQLite database itself is NOT encrypted at rest (no SQLCipher or similar). The `settings` table values are encrypted, but table structure, unencrypted columns, and other tables (conversations, audit_log, etc.) are plaintext on disk. macOS app sandbox is enabled.

---

### Agent H -- Administration & Governance

**Sub-Item 6: Audit Logging**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/audit_logger.rs` -- `EnhancedAuditLogger` with HMAC-SHA256 integrity signatures on each audit event. Event types: ToolExecution, WorkflowExecution, TeamAccess, SecurityViolation, ApprovalRequest, ConfigChange, DataExport, DataDeletion, AgentCreated/Deleted, PermissionGranted/Revoked. Supports `verify_event()` and `verify_all_events()` for tamper detection. Stored in SQLite `audit_events` table.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/audit.rs` -- Basic `AuditLogger` for operation-level logging (operation_type, details, permission_type, approved, success, duration_ms). Stored in SQLite `audit_log` table. Includes statistics and cleanup.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` -- `audit_logs` table (organization_id, user_id, action, resource, resource_id, metadata, ip_address, user_agent).
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260122000000_add_security_audit_logs.sql` -- `security_audit_logs` table (user_id, event_type, severity, ip_address, user_agent, endpoint, details). Service-role only access. 90-day cleanup function.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/security-audit.ts` -- TypeScript helpers for logging security events (auth_failed, rate_limit_exceeded, authorization_failed, suspicious_activity, csrf_validation_failed, invalid_signature). Writes to `security_audit_logs` via Supabase service role.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/services/security-monitoring-service.ts` -- Security monitoring service. Dashboard summary, metrics, alert thresholds, event queries, top IP analysis.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts` -- Admin security API. GET: dashboard/metrics/alerts/events/user/ips. POST: cleanup, suspend-user, ban-user. All actions logged to security audit.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260118000000_add_missing_rls_policies.sql` -- Audit logs viewable by user or org admin/owner via RLS.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/telemetry/mod.rs` -- Telemetry system (analytics metrics, event collector, correlation IDs, log redaction, tracing/Sentry integration).
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/rateLimit.ts` -- Rate limiter logs rate_limit_exceeded events with user/IP context.

**Current State (Audit Logging):** Comprehensive but fragmented. Three separate audit systems: (1) Desktop HMAC-signed audit_events in SQLite (tamper-evident), (2) Desktop operation audit_log in SQLite, (3) Web security_audit_logs in Supabase (service-role only). The desktop audit is robust with HMAC integrity verification. The web audit captures auth failures, rate limits, CSRF violations, suspicious activity. However: audit logs are NOT immutable (desktop `clear_all()` and `clear_old_entries()` exist; web has 90-day auto-cleanup). No centralized audit aggregation across desktop+web. No audit for data exports from the web platform (only desktop DataExport event type). No login-from-new-IP alerting. The HMAC key for desktop audit uses an env var or falls back to a hardcoded key in debug builds.

**Sub-Item 7: Centralized Billing & Seat Management**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` -- `pricing_plans` table (tiers: free, hobby, pro, max). `subscriptions` table is per-user (user_id FK), not per-org. `token_credits` per-user with daily limits.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000003_add_stripe_integration.sql` -- Stripe integration migration.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/stripe-webhook/route.ts` -- Stripe webhook handler. Handles: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_succeeded/failed. Manages per-user subscriptions and credit allocations.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/checkout/route.ts` -- Checkout session creation.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/portal/route.ts` -- Stripe customer portal.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/services/subscription-service.ts` -- Subscription service layer.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/billing/mod.rs` -- Desktop Stripe integration (behind `billing` feature flag). Commands: create_customer, create_subscription, cancel, update, get_invoices, get_usage, track_usage, create_portal_session, payment methods management.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/billing/models.rs` -- Billing data models.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/billing/stripe_client.rs` -- Stripe API client.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/billing/webhooks.rs` -- Desktop webhook handler.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/teams/team_billing.rs` -- Team billing model. BillingPlan enum: Team ($29/seat, 5 included, max 50) and Enterprise ($99/seat, 10 included, unlimited). Supports BillingCycle (Monthly/Annual). Includes seat-based pricing logic.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql` -- Webhook idempotency via processed_stripe_events table.

**Current State (Billing & Seats):** Billing is per-user via Stripe, not per-organization. The `subscriptions` table has `user_id` FK, not `organization_id`. Pricing tiers are individual (free/hobby/pro/max). Team billing exists only as a data model in `team_billing.rs` (Team $29/seat, Enterprise $99/seat) but the actual Stripe integration operates per-user. There is no org-admin billing dashboard, no centralized seat management UI, no ability for a billing admin to add/remove seats for an organization. The Stripe portal is per-customer. Invoice retrieval is per-customer. Credit allocation and consumption is per-user with daily/monthly limits. No org-wide credit pooling.

---

### Agent I -- Deployment & IT Control

**Sub-Item 8: MDM Deployment**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/tauri.conf.json` -- Bundle config. `targets: "all"` (builds all platform formats). Windows: WiX MSI installer with SHA-256 digest, DigiCert timestamp. macOS: Developer ID Application signing, entitlements.plist, Info.plist, `.providerShortName`. No explicit MSI silent install flags, no custom WiX actions for GPO/registry.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/entitlements.plist` -- macOS entitlements. App sandbox enabled. Network, file, camera, microphone, Apple Events access. JIT, unsigned memory, dyld env vars allowed (for hardened runtime).
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Info.plist` -- macOS app metadata. LSMinimumSystemVersion 11.0, category: productivity.
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/manifest.json` -- Chrome extension manifest v3. Uses `nativeMessaging` for desktop integration. Permissions: activeTab, tabs, storage, webNavigation, cookies, scripting, nativeMessaging, alarms, contextMenus, sidePanel. `host_permissions: <all_urls>`. Has extension key for consistent CRX ID. No mention of Chrome Web Store enterprise distribution or force-install policy.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml` -- Has `app-store` feature flag that disables shell execution, auto-updater, and sandbox-restricted features.

**Current State (MDM):** The desktop app builds MSI (Windows/WiX) and PKG/DMG (macOS) via Tauri's standard bundler. The MSI supports passive install mode (`installMode: "passive"` in tauri.conf.json). However: no documentation for silent/unattended installation flags (`/qn`, `/quiet`), no pre-configured registry keys for Group Policy, no Jamf/Intune deployment profiles, no .mobileconfig for macOS management. The extension has a static key for consistent CRX ID but no Chrome policy template for force-install. No MDM-specific build configurations or manifests.

**Sub-Item 9: Update Control**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/tauri.conf.json` -- Updater config: endpoint `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`, Ed25519 public key for signature verification, Windows `installMode: "passive"`.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/updater.rs` -- Auto-updater module. Commands: `check_for_updates()`, `install_update()`, `install_update_and_restart()`, `get_current_version()`. Uses Tauri updater plugin with Ed25519 signature verification. Emits events for progress (checking, available, downloading, installing, error). No update deferral, no channel selection, no admin-controlled update policy.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/updater.rs` -- `UpdateSecurityManager`: checksum verification (SHA-256), Ed25519 signature verification, download URL validation (allowlist: agiworkforce.com, releases.agiworkforce.com, github.com), backup/restore for database and config files. `UpdateMetadata` includes `forced` and `min_version` fields.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260115100000_release_management.sql` -- Release management tables (for the web API that serves update manifests).

**Current State (Update Control):** Updates use Tauri's built-in updater with Ed25519 signature verification. The endpoint is a single URL pattern with no channel/ring support. `installMode: "passive"` means the update installs silently in the background on Windows. There is a `forced` field in `UpdateMetadata` and `min_version` for forced updates, but no IT-admin-facing controls to defer updates, select channels (stable/beta/canary), set maintenance windows, or manage update policies via GPO/MDM. No update deferral API. The `app-store` Cargo feature disables the auto-updater entirely.

**Sub-Item 10: Network Proxies & Firewalls**

Files to read:

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` -- LLM provider HTTP client. Check for proxy configuration in reqwest client builder.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs` -- Browser automation. May reference proxy settings.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/tauri.conf.json` -- CSP connect-src whitelist: `self`, `ipc:`, `https://api.agiworkforce.com`, `https://agiworkforce.com`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://api.stripe.com`, `https://agiworkforce-signaling.fly.dev`, `wss://agiworkforce-signaling.fly.dev`, `http://localhost:11434` (Ollama), `http://127.0.0.1:11434`.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/updater.rs` -- Download uses reqwest client with 300s timeout. No proxy configuration visible.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/api.rs` -- API security (CORS config, CSP builder). Check for proxy awareness.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` -- Chat commands referencing proxy.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/sandbox.rs` -- AGI sandbox referencing proxy.

**Current State (Proxy/Firewall):** No explicit proxy configuration support found in the codebase. The app uses `reqwest` for HTTP, which by default respects `HTTP_PROXY`/`HTTPS_PROXY` environment variables (reqwest auto-detects system proxy on all platforms). However: there is no in-app proxy settings UI, no PAC file support, no HTTPS inspection/TLS interception certificate trust configuration, no documented list of required firewall egress destinations. The CSP connect-src in tauri.conf.json provides the authoritative list of outbound domains. WebSocket connections to Supabase and the signaling server require WSS. Ollama local model server expects localhost access on port 11434.

---

## Cross-Domain Files

These files are relevant to multiple agents and should be read by all agents that need them:

| File                                                                        | Agents                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web/supabase/migrations/20260101000000_consolidated_schema.sql`       | F (orgs/roles), G (RLS), H (audit_logs, billing)                 |
| `apps/web/supabase/migrations/20260118000000_add_missing_rls_policies.sql`  | F (org roles), G (RLS policies), H (audit log access)            |
| `services/api-gateway/src/middleware/auth.ts`                               | F (auth flow), G (account_status check)                          |
| `apps/desktop/src-tauri/tauri.conf.json`                                    | G (CSP), I (updater, bundle, MDM)                                |
| `apps/desktop/src-tauri/src/sys/security/mod.rs`                            | F (auth exports), G (encryption exports), H (audit exports)      |
| `apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql` | F (account_status), G (search_path fixes), H (kill switch audit) |

---

## DO NOT TOUCH Sections

This is a read-only assessment. No agent should modify any file.

Explicitly, no agent should:

- Modify any source code file
- Run database migrations
- Execute build commands that alter state
- Modify configuration files
- Create branches or commits

The output of each agent is a findings document only.

---

## Interface Contracts

### Output Format for Each Agent

Each agent produces a Markdown assessment document with the following structure per sub-item:

```markdown
### Sub-Item N: {Name}

**Maturity Level:** Not Started | Partial | Adequate | Enterprise-Ready

**Findings:**

- {Bullet points of what exists and what is missing}

**Evidence:**

- {File paths and line numbers supporting findings}

**Gap Analysis:**

- {Specific gaps that must be closed for enterprise readiness}

**Recommendations:**

- {Prioritized recommendations with effort estimates}
```

### Agent Output Files

- Agent F: `docs/specs/assessment-2026-02-23-iam.md`
- Agent G: `docs/specs/assessment-2026-02-23-data-security.md`
- Agent H: `docs/specs/assessment-2026-02-23-admin-governance.md`
- Agent I: `docs/specs/assessment-2026-02-23-deployment-it.md`

---

## Key Architectural Observations for All Agents

1. **Dual Platform Architecture:** The desktop (Rust/Tauri) and web (Next.js/Supabase) apps have separate auth, RBAC, and audit systems that are not unified.

2. **Supabase Auth is the Web Identity Provider:** The web platform relies on Supabase Auth for user management, which supports OIDC providers but none are enabled.

3. **Organization Model Exists but is Underutilized:** The `organizations` and `organization_members` tables exist with proper RLS, but billing, subscriptions, and credits are user-scoped rather than org-scoped.

4. **Desktop Security is Strong for Individual Use:** Argon2id master password, AES-256-GCM encryption, HMAC-signed audit logs, RBAC with permission overrides -- but all scoped to a single local user, not to an enterprise IT-managed deployment.

5. **No Enterprise Control Plane:** There is no admin panel for IT administrators to manage organization settings, enforce policies, view cross-org audit logs, or control deployments.

---

## Verification Checklist

- [x] All file paths verified to exist in the codebase
- [x] All interface contracts are compatible (read-only assessment, no cross-agent dependencies)
- [x] No circular dependencies between agent scopes (agents operate independently)
- [x] DO NOT TOUCH sections clearly communicated (entire codebase is read-only)
- [x] Cross-domain files identified to avoid duplicate work
- [x] Output format standardized across all agents
