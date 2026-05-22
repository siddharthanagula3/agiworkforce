# Gap Matrix — Supabase Data Model vs Anthropic Backend (May 2026)

> **Scope.** Compares the AGI Workforce data plane (35 SQL files in `/supabase/migrations/` + 50 in legacy `/apps/web/supabase/migrations/` + `apps/web/supabase/config.toml`) to Anthropic's externally-visible backend behavior per `tasks/research/anthropic-claude-suite-may-2026.md` §1.6 (Memory), §1.5/§E.1 (Skills), §5.4/§5.10 (Hooks), §1.4/§E.4 (Connectors), §5.7/§E.1 (Subagents), §3.4/§5.10 (Schedules), §10/§11 (Console + Compliance API), §3.9 (Audit-log exclusions), §5.4 (HTTP/event hooks), §1.7 (Sharing/Publish), §1.9 (Artifacts), §5.16/§F.6 (security incidents), §6.5/§3.5 (Dispatch + Cowork data). Output is **Have / Partial / Missing** plus per-axis percentage. Cited file:line everywhere; emoji-free per project rules.
>
> **Two-directory reality** (per `supabase/README.md:1-26`). `supabase/migrations/` is the canonical-going-forward dir (35 files post-add of Step 2 backfills); `apps/web/supabase/migrations/` is legacy (50 files). Production database has BOTH applied — verified 2026-05-08 via `mcp__supabase__list_migrations`. The Stripe ship-blocker P0 from FINAL_AUDIT 2026-05-05 (`WEB-STRIPE-RPC-MISSING`) was reconciled at the filesystem level on 2026-05-05 by copying the legacy idempotency RPC into canonical at `20260505000007_stripe_webhook_idempotency.sql:1-209` (verbatim attribution comment at line 1: `"Migrated from apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql on 2026-05-05"`). Companion `20260505000006_stripe_integration.sql:1-132` carries the `process_stripe_event_idempotent` first-version + `link_stripe_customer` + `get_user_by_stripe_customer_id` RPCs. Both files are byte-for-byte SQL-equivalent to their legacy originals at `apps/web/supabase/migrations/20260101000003_add_stripe_integration.sql` and `20260108000004_fix_stripe_webhook_idempotency.sql`.

---

## A. Have — Tables (canonical `supabase/migrations/`)

| Table                             | Migration                | Purpose                                                                                               |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `vibe_sessions`                   | `20260305000001:5-23`    | Desktop "vibe coding" session metadata + token totals                                                 |
| `vibe_messages`                   | `20260305000002:5-26`    | Per-session messages with `tool_calls`/`tool_results` JSONB and `parent_message_id` (branch tree)     |
| `vibe_agent_actions`              | `20260308100001:5-16`    | VIBE IDE agent action tracking (status/result/error)                                                  |
| `vibe_agent_messages`             | `20260308100002:5-14`    | Internal agent message log                                                                            |
| `workforce_tasks`                 | `20260308100003:5-19`    | Workforce-orchestration task definitions, `employee_id` keyed                                         |
| `workforce_executions`            | `20260308100004:5-20`    | Per-run history for `workforce_tasks`                                                                 |
| `conversations`                   | `20260308120001:4-16`    | Generic cross-surface conversation (`source` ∈ desktop/web/mobile/extension/vscode)                   |
| `messages`                        | `20260308120002:4-18`    | Generic cross-surface messages, `tool_calls`/`tool_results` JSONB                                     |
| `shared_sessions`                 | `20260307000001:4-15`    | Shareable-link snapshots, 7-day expiry, token-gated public read                                       |
| `shared_conversations`            | `20260310000001:5-12`    | Service-role-only public-link snapshots (30-day expiry implied)                                       |
| `github_installations`            | `20260307000002:2-13`    | GitHub App per-user installation tokens                                                               |
| `github_pr_review_attempts`       | `20260505000004:42-53`   | Idempotency + spend-cap log for PR-review webhook                                                     |
| `user_projects`                   | `20260318000001:3-14`    | User-defined "projects" with system-prompt + color metadata                                           |
| `teams` + `team_members`          | `20260318000002:3-23`    | RBAC org/team membership with admin/editor/viewer roles                                               |
| `scheduled_tasks` (cross-surface) | `20260319100001:16-48`   | cron/once/interval action triggers (action_type ∈ agent/workflow/notification/command)                |
| `scheduled_task_runs`             | `20260319100001:108-120` | Append-only execution log (status/duration/result)                                                    |
| `workspace_analytics_events`      | `20260319100002:21-41`   | Append-only event stream per workspace (event_type/surface/cost)                                      |
| `workspace_analytics_daily`       | `20260319100002:109-130` | Pre-aggregated daily rollups (active_users, tokens, cost)                                             |
| `workspace_usage_quotas`          | `20260319100002:169-189` | Workspace-level monthly + daily caps + alert thresholds                                               |
| `device_pairings`                 | `20260319100003:24-48`   | QR-pair primary↔secondary device pairings                                                             |
| `cross_device_threads`            | `20260319100003:109-128` | Persistent threads spanning desktop↔mobile                                                            |
| `cross_device_messages`           | `20260319100003:184-204` | Per-thread messages with `surface` + `device_id` origin                                               |
| `cross_device_artifacts`          | `20260319100003:267-288` | Storage-bucket-backed file blobs (`storage_bucket='cross-device-artifacts'`)                          |
| `dispatch_threads`                | `20260324000001:36-43`   | Per-user singleton Dispatch thread                                                                    |
| `dispatch_messages`               | `20260324000001:82-96`   | Mobile↔desktop Dispatch chat (CHECK-constrained surface/role consistency at `20260504000001:200-205`) |
| `dispatch_agent_state`            | `20260324000001:175-182` | Live agent + pending_approvals JSONB published by desktop                                             |
| `revoked_jwts`                    | `20260504000002:13-23`   | JTI-keyed kill-switch for sign-out-everywhere + per-jti revocation                                    |
| `connector_tool_permissions`      | `20260505000005:7-17`    | Per-tool connector permission level (always-allow/needs-approval/blocked)                             |
| `profiles`                        | `20260506120001:19-29`   | auth.users shadow with stripe_customer_id, account_status, routing_preferences                        |
| `subscriptions`                   | `20260506120001:75-98`   | Stripe-linked plan_tier free/hobby/pro/max + status enum                                              |
| `token_credits`                   | `20260506120001:133-152` | Per-period token bucket + flagship_daily counter (`20260508120000:22-26`)                             |
| `credit_transactions`             | `20260506120001:189-206` | Audit trail (allocation/deduction/reset/refund/purchase/adjustment/bonus)                             |

**Have — Tables (legacy-only, applied to production but NOT yet in canonical dir):** `user_memories` (`apps/web/supabase/migrations/20260226100001_add_user_memories.sql:1-22` + hardening at `20260319000000:1-97`), `web_conversations` + `web_messages` (`20260117000000_add_web_chat.sql:5-27`), `multi_agent_conversations` + `conversation_participants` + `conversation_metadata` + `agent_collaborations` (`20260315000000_create_multi_agent_tables.sql:9-296`), `organizations` + `organization_members` (`20260101000000_consolidated_schema.sql:21-37`), `pricing_plans` (`:40-56`), `beta_invites` + `beta_redemptions` (`:113-140`), `email_campaigns` + `email_preferences` + `email_sends` (`:143-197`), `feature_flags` (`:200-209`), `feedback` (`:212-221`), `referrals` (`:224-238`), `usage_events` (`:241-250`), `waitlist` (`:253-270`), `api_keys` (`:273-283`) + `api_keys.key_prefix` extension (canonical `20260505000001:18-19`), `audit_logs` (`:286-298`), `notifications` (`:301-311`), `signaling_sessions` (`:314-320`), `processed_stripe_events` (`:339-343`), `security_audit_logs` (`20260122000000:6-16`), `sso_connections` (`20260224000000:4-18`), `directory_sync_connections` + `directory_sync_events` (`20260224000001:21-57`), `desktop_devices` (`20260110000000:6-16`), `mobile_devices` (`20260110000003:6-14`), `sync_data` (`20260110000002:6-15`), `device_authorization_codes` (`20260106000000`), `messaging_connections` (`20260226100000:4-14`), `conversation_tags` (`20260226100003:4-12`), `releases` + `release_channels` + `release_downloads` (`20260115100000`), `credit_idempotency_keys` (`20260110000001`).

## B. Have — RPCs / Functions

**Stripe (RECONCILED to canonical 2026-05-05):** `process_stripe_event_idempotent(text)` (`20260505000007:92-156`, replaces older insert-on-conflict version at `20260505000006:36-57` — both granted to `service_role` only at `:60` and `:158` respectively); `mark_stripe_event_succeeded(text)` (`20260505000007:163-178`); `mark_stripe_event_failed(text,text)` (`20260505000007:182-198`); `link_stripe_customer(uuid,text)` (`20260505000006:89-106` plus DiD body-check at `20260508150001:39-64`); `get_user_by_stripe_customer_id(text)` (`20260505000006:65-81`); `add_credits(uuid,uuid,int,text,text)` (`20260506120001:246-291`); `handle_refund(uuid,int,text)` (`20260506120001:298-339` plus DiD body-check at `20260508150001:73-123`).

**Usage / quota:** `increment_usage(uuid,int,text,bool)` (`20260508120000:37-149`, supersedes 3-arg version dropped at `:34-35`; DUAL-ROLE service_role OR auth.uid()=p_user_id at `:59-65`).

**Account-status gate:** `is_account_active(uuid)` (`20260508150000:50-67`) — used in shared_sessions, shared_conversations, teams, team_members RLS predicates (`:85-162`).

**Trigger functions (touched by hardening at `20260506060001:8-18`):** `update_vibe_session_updated_at`, `update_vibe_session_on_message`, `update_workforce_task_updated_at`, `update_workforce_execution_updated_at`, `update_conversations_updated_at`, `update_conversation_on_message_insert`, `update_user_projects_updated_at`, `update_teams_updated_at`, `update_scheduled_tasks_updated_at`, `update_workspace_usage_quotas_updated_at`, `update_device_pairings_updated_at`, `update_cross_device_threads_updated_at`, `update_dispatch_updated_at`, `set_connector_tool_permissions_updated_at`.

**Legacy-only (applied to production):** `handle_new_user`, `set_updated_at`, `delete_user_data(p_user_id uuid)` + `export_my_data()` (GDPR — `20260115000000`), `claim_beta_invite`, `consume_device_authorization_tokens`, `get_credit_balance`, `deduct_credits`, `check_credits_available`, `reset_credits_for_period`, `get_or_create_credit_account`, `revoke_all_user_tokens`, `is_token_revoked`, `cleanup_expired_*` family, `track_search`/`get_recent_searches`/`get_search_suggestions`/`get_branch_history`/`get_root_session`/`move_session_to_folder`/`get_message_reactions` (referenced by `20260506060000:28-35` with REVOKE FROM anon — function bodies NOT in repo migration history per the explicit out-of-scope note at `20260508150001:20-27`).

## C. Have — RLS hardening (post-2026-05-04 wave)

`auth.role()='service_role'` JWT-claim antipattern rewritten to `TO service_role` role-grant on every simple-form policy — automated sweep at `20260505000003:51-101`. Compound policies skipped with WARNING for hand-fixing (per `:91-97`). `vibe_messages`/`vibe_agent_actions`/`vibe_agent_messages`/`messages` INSERT/UPDATE policies hardened with parent-session/conversation ownership checks (`20260504000001:32-173`). `dispatch_messages` got CHECK constraint enforcing `(surface=mobile AND role=user) OR (surface=desktop AND role=assistant)` (`:200-205`). `cross_device_messages` + `cross_device_artifacts` got explicit UPDATE policies (`:215-254`). `shared_sessions` SELECT tightened to require `x-share-token` header for anon + `is_account_active(owner_id)` predicate (`:275-289` and `20260508150000:85-92`). `github_installations` UPDATE policy got missing `WITH CHECK` (`20260505000002:34-38`). `revoked_jwts` 7-day pg_cron cleanup at `20260504000002:46-55`.

## D. Have — Cron schedules

Three pg_cron jobs declared in canonical migrations:

1. `cleanup-expired-shared-sessions` — daily 3 AM UTC, prunes `shared_sessions WHERE expires_at < now()` (`20260307000001:40-44`).
2. `cleanup-revoked-jwts` — daily 4 AM UTC, prunes `revoked_jwts WHERE until_exp < now()` (`20260504000002:50-55`).
3. `github-pr-review-attempts-cleanup` — hourly, prunes rows older than 30 days (`20260505000004:95-103`).

## E. Have — Realtime publication

Eleven tables on `supabase_realtime` publication (`conversations`, `messages`, `device_pairings`, `cross_device_threads`, `cross_device_messages`, `cross_device_artifacts`, `scheduled_tasks`, `scheduled_task_runs`, `dispatch_threads`, `dispatch_messages`, `dispatch_agent_state` per the `ALTER PUBLICATION` lines counted across `20260308120001:48`, `20260308120002:54`, `20260319100001:162-163`, `20260319100003:344-347`, `20260324000001:218-220`).

## F. Have — Storage

One implicit bucket: `cross-device-artifacts` (default in `cross_device_artifacts.storage_bucket` column at `20260319100003:277`). No bucket DDL in migrations; bucket itself must be created in dashboard (`apps/web/supabase/config.toml:103-111` shows local-dev shape but no production bucket declaration).

## G. Have — `apps/web/supabase/config.toml` (canonical for project linkage)

API exposes `public` + `graphql_public` schemas (`:13`). DB major_version=17 (`:34`). Realtime enabled (`:75-77`). Studio/inbucket enabled (`:82-100`). Storage 50MiB cap (`:106`). MFA TOTP/Phone enroll/verify=false (Pro plan-gated) (`:280-289`). Auth third_party providers (Firebase/Auth0/AWS Cognito/Clerk) all disabled (`:319-339`). OAuth server disabled (`:343-349`). Edge runtime per_worker (`:351-360`). Analytics postgres backend (`:365-369`). **Anonymous sign-ins disabled** (`:165`). **JWT expiry = 3600s** (`:152` — Anthropic standard is 3-day rotating refresh — see Partial §H below).

---

## H. Partial — what we have but doesn't match Anthropic surface

### H.1 Memory (per ref §1.6 / §E.2)

- **Have:** `user_memories` (legacy-only, `apps/web/supabase/migrations/20260226100001:1-22`) — single-shape `content TEXT, category TEXT, source TEXT, is_deleted BOOLEAN`; hardened at `20260319000000:34-71` to per-CRUD policies + 10000-char check + GIN tsvector full-text index.
- **Anthropic actual:** Per-account synthesized profile, ~daily Memory Synthesis job, edit/delete/pause/reset UX, sensitive-content exclusion (passwords/financial/health), org-wide disable for Team/Enterprise, import-from-ChatGPT/Gemini/Grok flow at `claude.com/import-memory`.
- **Gap:** No `memory_synthesis_jobs` queue, no `memory_imports` table, no `excluded_categories` filter table, no org-level disable column on `organizations`, no incognito-chat-exclusion flag (incognito field missing on `conversations`/`vibe_sessions`/`messages`). `is_deleted` is soft-delete only — no "Reset memory" hard-purge transaction wrapper. No 6-hour-after-source-conversation-deletion synthesis-update trigger. **`user_memories` lives only in legacy dir — needs canonicalization (Step 2 of `supabase/README.md:21`)**.

### H.2 Skills (per ref §1.5 / §E.1 / §10.6)

- **Have:** Nothing. Skills directory exists in code (`packages/skills/`) but **zero database tables.**
- **Gap:** No `skills` registry, no `user_enabled_skills`, no `org_default_skills`, no `skill_marketplace_listings`. The Skills API at Anthropic Console (`/v1/skills`, `skills-2025-10-02` beta header per ref §10.6) ships **org-shared custom skills** — our equivalent backplane has 0% data model. Score: **0%**.

### H.3 Plugins / Marketplace (per ref §5.11)

- **Have:** Nothing. `enabledPlugins` lives in `~/.claude/settings.json` blueprint per `cli-day1` memory but no DB-side mirror.
- **Gap:** `installed_plugins`, `marketplace_subscriptions`, `plugin_versions` all absent. Anthropic ships marketplace install via `claude plugin install <name>@<marketplace>` and tracks 4,200+ skills / 770+ MCP servers / 2,500+ marketplaces (ref §5.11). Our DB tracks zero of this. Score: **0%**.

### H.4 Hooks (per ref §5.4)

- **Have:** No DB-side hook registry. CHECK constraint at `dispatch_messages` (`20260504000001:200-205`) enforces a single invariant — that's not a "hook" in Anthropic's sense.
- **Anthropic actual:** 12 hook events × 4 handler types (command/HTTP/prompt/agent) × allow/deny/ask/inject decisions. Async hooks since Jan 2026.
- **Gap:** `user_hook_definitions`, `hook_invocations` (audit), `allowed_hook_http_urls` (per-org allowlist), `allowed_hook_env_vars` all absent. The webhook-side equivalent (per-org event subscription) is also missing — Anthropic Managed Agents API has **webhook subscriptions** per ref §10.7. Score: **0%**.

### H.5 Connectors / MCP (per ref §1.4 / §D / §E.4)

- **Have:** `connector_tool_permissions` (`20260505000005:7-17`) — per-tool level (always-allow/needs-approval/blocked) + destructive flag. `messaging_connections` (legacy `20260226100000:4-14`) — WhatsApp/Telegram/Slack tokens.
- **Gap:** No `connector_registry` (the 200+ Anthropic-verified connectors), no `user_connector_oauth_tokens` (we put OAuth in `github_installations` per-installation but no generic per-connector token store), no `mcp_servers` per-org JSON config table, no `mcp_app_install` table for the 26-Jan-2026 MCP Apps spec. Authorization flow assumes Anthropic-cloud OAuth — no per-tenant Client ID/Secret column anywhere. **`messaging_connections` covers only 3 of 200+ connectors.** Score: **~10%**.

### H.6 Subagents / multi-agent (per ref §5.7)

- **Have:** `multi_agent_conversations` (legacy `20260315000000:9-42`) + `conversation_participants` (`:80-116`) + `conversation_metadata` (`:158-194`) + `agent_collaborations` (`:223-259`). Plus `vibe_agent_actions` / `vibe_agent_messages` for tracking actions per-session.
- **Anthropic actual:** Subagents are markdown+YAML files in `~/.claude/agents/` or `.claude/agents/` with `name`/`description`/`tools`/`model`/`permissionMode` frontmatter; spawned via `/agents`, run in own context window. Built-in subagents (Explore, Plan, general-purpose). Marketplace distribution.
- **Gap:** Our model is "agent participation in a multi-agent conversation" — Anthropic's is "user-authored persistent agent definitions reusable across sessions." No `user_subagents` (definition store), no `subagent_invocations` (per-spawn audit). Marketplace-installed subagents have nowhere to live. **`employee_id` text column (`workforce_tasks.employee_id`) is the closest analog — but it's not a foreign key, no agent-definition table to point at.** Score: **~25%** (we have run-time but not definition-time).

### H.7 Workflows (per ref §3.4 / §5.10 `worktree.baseRef`)

- **Have:** `scheduled_tasks.action_type ∈ workflow` (`20260319100001:33-34`) + `agent_collaborations.workflow_steps JSONB` (`20260315000000:242`) + `agent_collaborations.session_type ∈ task_based|brainstorming|review|problem_solving|research` (`:229-230`).
- **Gap:** No first-class `workflows` table — workflow definitions live in JSONB blobs. No version history, no workflow-template marketplace, no `workflow_runs` (separate from `agent_collaborations`). Anthropic's Cowork+Cron+Workflow trio is closer to a generic state machine; we have one row that JSON-blobs the steps. Score: **~30%**.

### H.8 Cron schedules (per ref §3.4 + §5.4)

- **Have:** Three pg_cron jobs (see §D above). User-facing: `scheduled_tasks` cron/once/interval definitions (`20260319100001:22-37`).
- **Gap:** No "recurring browser tasks" table for Chrome ext (ref §7.5). No `cron_history` per-trigger log distinct from `scheduled_task_runs`. The scheduled_tasks duplicate (legacy `apps/web/supabase/migrations/20260226100002:7-26` has its own shape with `recurrence`/`days_of_week`/`day_of_month`/`time_of_day` columns, while canonical `20260319100001:16-48` has `cron_expression`/`execute_at`/`interval_ms`) — **two incompatible schemas live in production simultaneously.** This is a known reconciliation debt. Score: **~60%** (two divergent shapes, needs unification).

### H.9 Audit log / Compliance API (per ref §11.2 + §3.9)

- **Have:** `audit_logs` (legacy `20260101000000:286-298`) — generic action/resource/metadata. `security_audit_logs` (legacy `20260122000000:6-16`) — auth_failed/rate_limit_exceeded/csrf_violation events with severity. `cleanup_old_security_logs()` keeps 90 days (`:49-65`).
- **Anthropic actual:** Compliance API logs per-tool-call with full input/output (Enterprise/Self-Serve Enterprise — ref §11.2). 30-day default retention for Pro/Max/Team/Enterprise; up to 2 years for safety-flagged content; 7 years for classification scores.
- **Gap:** Our `audit_logs` lacks `tool_call_id`, `model`, `provider`, `tokens_input`/`tokens_output`, raw `input_blob`/`output_blob` columns. Per-org enablement column missing on `organizations`. **No table covers Cowork-task event stream the way Anthropic's API would** (and Anthropic explicitly excludes Cowork from Compliance API per ref §3.9 — but our equivalent has no separate Cowork-event store either). `audit_logs` is service-role-only (no per-user export RPC) — Anthropic's "Data Export" at Settings → Privacy is unimplemented at the SQL layer. Score: **~25%**.

### H.10 Stripe webhook idempotency (per FINAL_AUDIT WEB-STRIPE-RPC-MISSING)

- **Have:** Reconciled. `process_stripe_event_idempotent(text)` exists in canonical at `20260505000007:92-156` (retry-safe with status processing/succeeded/failed and 10-min stale-lock interval). `mark_stripe_event_succeeded` + `mark_stripe_event_failed` companions at `:163-198`. `processed_stripe_events.status` + `attempts` + `locked_at` + `updated_at` + `last_error` columns added at `:23-69`. All locked down to service_role only at `20260506060000:9-11`.
- **Gap:** **Reconciliation is CODE-COMPLETE but not VERIFIED end-to-end against production database** per `MEMORY.md` "Remaining work for paid-tier launch: apply migrations to production Supabase DB via `supabase db push` and verify webhook idempotency end-to-end. No more code/filesystem fixes needed." Score: **~95%**.

### H.11 Cross-device sync (per ref §A pricing matrix + §6.5 Dispatch)

- **Have:** `device_pairings` + `cross_device_threads` + `cross_device_messages` + `cross_device_artifacts` (`20260319100003:24-347`) + `dispatch_threads` + `dispatch_messages` + `dispatch_agent_state` (`20260324000001:36-220`) + `desktop_devices` (legacy `20260110000000:6-16`) + `mobile_devices` (legacy `20260110000003:6-14`) + `sync_data` (legacy `20260110000002:6-15`) + `device_authorization_codes` (legacy `20260106000000`).
- **Gap:** **Three overlapping device-registration tables** (`device_pairings` vs `desktop_devices`+`mobile_devices` vs `device_authorization_codes`) — none replaces the others; all live in production. `cross_device_threads` + `dispatch_threads` are also overlapping concepts. Per FINAL_AUDIT cross-surface gap: desktop has zero `dispatchHmac`/`dispatchSalt` implementation (mobile-side ships HMAC but desktop listener missing); transitional unsigned-message path expires 2026-06-05 — DB schema has no HMAC column on `dispatch_messages`. Score: **~75%** (functional, but architectural debt).

### H.12 Project knowledge base (per ref §1.3)

- **Have:** `user_projects.instructions TEXT` + `user_projects.metadata JSONB` (`20260318000001:8-11`).
- **Anthropic actual:** Files (30 MB/file, 8000×8000px image cap, 100-page PDF), default model+style per project, scoped Skills + Connectors per project, optional Drive-Cataloging RAG (Enterprise).
- **Gap:** No `project_files` table. No `project_default_model`, `project_default_style`, `project_enabled_skills`, `project_enabled_connectors` columns. RAG indexing is unsupported at the data layer. **`user_projects` is a thin wrapper — 70% of Anthropic Project capability has no schema.** Score: **~30%**.

### H.13 Conversation history / sharing

- **Have:** `conversations` + `messages` (canonical), `web_conversations` + `web_messages` (legacy), `vibe_sessions` + `vibe_messages` (canonical), `multi_agent_conversations` (legacy), `cross_device_threads` + `cross_device_messages` (canonical), `dispatch_threads` + `dispatch_messages` (canonical), `shared_sessions` + `shared_conversations` (canonical), `conversation_metadata` (legacy), `conversation_tags` (legacy).
- **Gap:** **NINE distinct conversation tables across the schema.** No `is_incognito` flag (Anthropic incognito chats are excluded from history per ref §1.1). No "republish-blocking after unpublish" enforcement column on `shared_sessions` (Anthropic's "once unpublished, cannot republish" rule per ref §1.7 is not enforced — `expires_at` resets on re-INSERT). No artifact-storage-mode column ("personal or shared mode" per ref §1.9). Score: **~70%** (excessive surface area, missing semantic flags).

### H.14 Computer Use approval log (per ref §3.2 + §12.2)

- **Have:** `dispatch_agent_state.pending_approvals JSONB` (`20260324000001:179`) + `connector_tool_permissions` (`20260505000005:7-17`).
- **Gap:** No `computer_use_app_permissions` table, no per-app blocklist (banking/crypto/healthcare blocked-by-default per ref §12.2 has no SQL enforcement layer), no `computer_use_action_log` (per-action approval audit), no 30-min Dispatch session re-prompt counter. `pending_approvals` is JSONB blob — not queryable, not exportable. Score: **~10%**.

### H.15 SSO / SCIM / Org enrollment (per ref §10.5 + §11)

- **Have:** `sso_connections` (legacy `20260224000000:4-18`) — saml/oidc with attribute_mapping JSONB. `directory_sync_connections` (`20260224000001:21-32`) — okta/azure_ad/google/onelogin/generic_scim. `directory_sync_events` (`:50-57`) — idempotency for SCIM events. SCIM fields on `profiles` (external_id, provisioning_source, provisioned_at, department, job_title) (`:5-10`).
- **Gap:** No `sso_provisioning_audit` per-event log distinct from `directory_sync_events`. No JIT-provisioning trigger. Anthropic Enterprise has SAML/SSO + JIT + custom data retention — JIT path missing. Score: **~70%**.

---

## I. Missing — what does NOT exist anywhere in our schema

| Feature                                                        | Anthropic doc     | Our state                                                                                                                                                 |
| -------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills registry**                                            | §1.5, §E.1, §10.6 | 0% — no table. Skills logic lives only in package code.                                                                                                   |
| **Plugin marketplace**                                         | §5.11             | 0% — no table.                                                                                                                                            |
| **Hook definitions**                                           | §5.4              | 0% — no table.                                                                                                                                            |
| **Memory synthesis job queue**                                 | §1.6, §E.2        | 0% — `user_memories` is content-only, no job queue table.                                                                                                 |
| **MCP server registry (per-org)**                              | §D                | 0% — `connector_tool_permissions` is permission only, not server inventory.                                                                               |
| **Subagent definitions store**                                 | §5.7              | 0% — only run-time, no def-time.                                                                                                                          |
| **Cowork VM allowlist (per-user network egress)**              | §3.4              | 0% — no table.                                                                                                                                            |
| **Cowork file-mount config**                                   | §3.4              | 0% — no table.                                                                                                                                            |
| **Computer Use action log**                                    | §12.2             | 0% — no per-action audit.                                                                                                                                 |
| **Computer Use app blocklist**                                 | §12.2             | 0% — banking/crypto/health default-block has no SQL store.                                                                                                |
| **Custom Style definitions**                                   | §1.1, §1.2        | 0% — no `user_styles` table.                                                                                                                              |
| **Voice mode preferences**                                     | §1.2              | 0% — no `voice_preferences` table.                                                                                                                        |
| **Health-data connector config**                               | §1.4              | 0% — no `health_connector_config` table.                                                                                                                  |
| **Custom MCP server config (Desktop developer mode)**          | §2.3              | 0% — JSON file in `claude_desktop_config.json`, no DB mirror.                                                                                             |
| **`.mcpb` extension install state**                            | §2.3              | 0% — no `installed_extensions` table.                                                                                                                     |
| **Output styles**                                              | §5.12             | 0% — no `user_output_styles` table.                                                                                                                       |
| **Status line config**                                         | §5.12             | 0% — no table.                                                                                                                                            |
| **Plan-mode plan files**                                       | §5.6              | 0% — `~/.claude/plans/`, no DB.                                                                                                                           |
| **Project Drive-Cataloging RAG index**                         | §1.3              | 0% — no embeddings table; `[storage.vector]` disabled in `apps/web/supabase/config.toml:135-138`.                                                         |
| **Live Artifacts auto-refresh subscriptions**                  | §1.9              | 0% — no `artifact_subscriptions` table.                                                                                                                   |
| **Persistent-storage artifacts (20MB shared mode)**            | §1.9              | 0% — `cross_device_artifacts` is per-thread, not per-artifact-published.                                                                                  |
| **MCP-connected artifacts**                                    | §1.9              | 0% — no table.                                                                                                                                            |
| **Embed code allowed-domains list**                            | §1.7              | 0% — no `artifact_embeds` table.                                                                                                                          |
| **Push notification log**                                      | §6.4              | 0% — `mobile_devices.push_token` exists (legacy `20260110000003:11`) but no `push_notification_history`.                                                  |
| **Dispatch QR pair scope (files only / browser / full)**       | §6.5              | 0% — `device_pairings` has no `access_scope` column.                                                                                                      |
| **Voice-mode session recordings / transcriptions**             | §6.2              | 0% — Anthropic deletes after transcription, but we have no log column either.                                                                             |
| **Workflow recording for replay (Chrome ext)**                 | §7.5              | 0% — no table.                                                                                                                                            |
| **Per-action approval policy (ClaudeBleed v1.0.70 patch)**     | §7.6              | 0% — no `extension_action_policies` table.                                                                                                                |
| **API key per-org / per-workspace**                            | §10.3             | 0% — `api_keys` (legacy) is per-user only, no `workspace_id` column.                                                                                      |
| **Workspaces (multi-environment)**                             | §10.5             | 0% — `teams` table exists but no `workspaces` distinct from teams; rate-limit-config-per-workspace is missing.                                            |
| **Service tier (Standard / Priority / Flex / Batch)**          | §10.3             | 0% — no `service_tier` column on `subscriptions`.                                                                                                         |
| **Spend cap per workspace**                                    | §10.5             | 0% — `workspace_usage_quotas.max_monthly_cost_usd` exists (`20260319100002:174`), but no per-key spend cap.                                               |
| **Per-org Compliance API enablement column**                   | §10.5             | 0% — no `compliance_api_enabled` flag on `organizations`.                                                                                                 |
| **HIPAA-ready activation flag**                                | §11.3             | 0% — no `hipaa_enabled` boolean.                                                                                                                          |
| **Custom data retention (Enterprise)**                         | §11.3             | 0% — no `data_retention_days` column on `organizations`.                                                                                                  |
| **ZDR (Zero Data Retention) opt-in**                           | §11.2             | 0% — no `zdr_enabled` column.                                                                                                                             |
| **Region preference (US-only / EU-residency)**                 | §11.1             | `profiles.routing_preferences` JSONB exists (`20260508130000:18`) — but it's a per-user routing pref for LLM provider geo, not a data-residency selector. |
| **Trust & Safety classifier flagged-content retention bucket** | §F.5              | 0% — no `flagged_content_retention` table.                                                                                                                |
| **Memory imports (ChatGPT/Gemini/Grok)**                       | §1.6              | 0% — no `memory_import_jobs` table.                                                                                                                       |
| **Effort downgrade audit**                                     | §C Mar-Apr 2026   | 0% — Anthropic published a postmortem; no equivalent audit table.                                                                                         |
| **Token usage by `service_tier`**                              | §10.3             | 0% — `usage_events` (legacy) has no `service_tier` column.                                                                                                |
| **OAuth server tokens (JetBrains AI / VS Code remote)**        | §8.7 / §10.5      | 0% — `apps/web/supabase/config.toml:343-349` has `[auth.oauth_server] enabled = false`. No token-issued audit table.                                      |

---

## J. Per-axis percentage scoring

| Axis                             | Score   | Note                                                                                                                                                   |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Memory storage                   | **25%** | `user_memories` exists (legacy-only) but no synthesis pipeline, no incognito-exclude, no import-from-X, no org-disable, no reset-vs-pause distinction. |
| Skills                           | **0%**  | No table. Code only.                                                                                                                                   |
| Plugins / Marketplace            | **0%**  | No table.                                                                                                                                              |
| Hooks (event registry)           | **0%**  | No table.                                                                                                                                              |
| Connectors / MCP server registry | **10%** | Three connector types in `messaging_connections`; permission table at `connector_tool_permissions`; no inventory.                                      |
| Subagents / team definitions     | **25%** | Run-time tables exist; definition-time tables missing.                                                                                                 |
| Workflow definitions             | **30%** | JSONB-blob workflows in `agent_collaborations.workflow_steps`; no first-class table.                                                                   |
| Cron schedules                   | **60%** | Two divergent `scheduled_tasks` shapes in production; pg_cron present for cleanup-only; no Chrome-ext recurring task store.                            |
| Audit log / Compliance API       | **25%** | `audit_logs` + `security_audit_logs` exist but lack tool-call shape, retention controls, per-org enablement, export RPC.                               |
| Stripe webhook idempotency       | **95%** | Reconciled at filesystem; pending production-DB application + e2e verify.                                                                              |
| Cross-device sync                | **75%** | Functional but with 3 overlapping device-registration tables and no Dispatch HMAC column.                                                              |
| Project knowledge base           | **30%** | `user_projects` is metadata-only; no files, no per-project skills/connectors, no RAG index.                                                            |
| Conversation history             | **70%** | Nine conversation tables; no incognito flag; no republish-blocking.                                                                                    |
| Sharing / Publish                | **45%** | `shared_sessions` + `shared_conversations` exist; embed code, persistent-storage, MCP-connected artifacts all missing.                                 |
| Computer Use approval log        | **10%** | JSONB blob in `dispatch_agent_state.pending_approvals`; no dedicated log/blocklist tables.                                                             |
| SSO / SCIM                       | **70%** | All core tables present; JIT-provisioning audit missing.                                                                                               |
| Workspaces (per-key, per-env)    | **15%** | `teams` ≠ workspaces; spend caps per workspace partial; rate-limit config missing.                                                                     |
| Trust Center / compliance flags  | **5%**  | No HIPAA/ZDR/data-residency/Compliance-API columns.                                                                                                    |

**Overall data-model parity vs Anthropic backend: ~32%.**

---

## K. Surface percentage (data-model coverage by Anthropic surface)

| Anthropic surface                  | Coverage | Driver                                                                                                                 |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| claude.ai web (chat + projects)    | **45%**  | conversations + messages + user_projects + shared_sessions present; project files, Skills, Live Artifacts missing.     |
| Claude Desktop Chat tab            | **45%**  | Same as web; plus desktop_devices for registration.                                                                    |
| Claude Desktop Cowork              | **15%**  | dispatch\_\* + scheduled_tasks present; VM allowlist, file-mount, Computer Use audit, app blocklist all missing.       |
| Claude Desktop Code tab            | **30%**  | vibe_sessions + vibe_messages + workforce_tasks; no IDE pane state, no file-tree state, no `--worktree` baseRef store. |
| Claude Code CLI                    | **20%**  | `~/.claude/settings.json` blueprint; ZERO DB mirror for CLI hooks/skills/plugins.                                      |
| Claude Mobile (iOS+Android)        | **55%**  | mobile*devices + dispatch*_ + cross*device*_ + scheduled_tasks; voice/Health connector/widgets/Siri Shortcuts missing. |
| Claude Chrome ext                  | **5%**   | Only `messaging_connections` (incidental); no extension state table at all.                                            |
| Claude VS Code ext                 | **10%**  | shares CLI shape; no DB-side extension config.                                                                         |
| Claude JetBrains plugin            | **5%**   | No DB tables.                                                                                                          |
| Anthropic Console (workbench/eval) | **5%**   | api_keys + audit_logs present (legacy); workbench-prompt-version/eval-test-cases missing.                              |
| Trust Center                       | **5%**   | No compliance/HIPAA/ZDR/data-retention columns.                                                                        |
| Computer Use                       | **10%**  | JSONB blob only.                                                                                                       |

---

## L. Effort estimate (to reach 80% Anthropic-data-model parity)

| Bucket                                                | Weeks            | Surfaces               | Notes                                                                                                                                |
| ----------------------------------------------------- | ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Skills + Plugins + Hooks data plane                   | 3-4              | All                    | New 6 tables minimum (skills, user_enabled_skills, plugins, installed_plugins, hook_definitions, hook_invocations) + RLS + Realtime. |
| Memory synthesis pipeline                             | 2                | web/desktop/mobile     | memory_synthesis_jobs queue + Edge Function + 6-hour-after-conversation-deletion trigger.                                            |
| Connector / MCP registry                              | 2                | web/desktop/mobile/cli | connector_registry (200+ rows seed) + user_connector_oauth_tokens + mcp_servers + mcp_app_install.                                   |
| Subagent definitions                                  | 1                | cli/desktop/code       | user_subagents + subagent_invocations.                                                                                               |
| Project knowledge base                                | 2                | web/desktop/mobile     | project_files + project_skill_links + project_connector_links + Storage bucket setup.                                                |
| Computer Use audit                                    | 1                | desktop/cowork         | computer_use_app_permissions + computer_use_action_log + per-app blocklist.                                                          |
| Compliance / Trust Center flags                       | 1                | enterprise             | organizations columns (compliance_api_enabled, hipaa_enabled, data_retention_days, zdr_enabled, region_preference).                  |
| Stripe production verification                        | 0.5              | web                    | `supabase db push` against production + Stripe-test-mode webhook replay.                                                             |
| Two-dir reconciliation (legacy → canonical Step 2)    | 1                | all                    | Per `supabase/README.md:21` — copy 50 unique-to-legacy files into `supabase/migrations/`.                                            |
| Migration consolidation (dedupe scheduled_tasks etc.) | 1                | all                    | Resolve 9-conversation-tables, 3-device-tables, 2-scheduled_tasks-shapes drift.                                                      |
| **Total**                                             | **~14-16 weeks** |                        | One engineer full-time, or 2 in parallel for ~7-8 weeks.                                                                             |

---

## Summary (return-payload)

**Anthropic features with NO data model on our side (zero tables):**

1. **Skills** — no `skills`, no `user_enabled_skills`, no `org_default_skills`. Only package code at `packages/skills/`.
2. **Plugins / Marketplace** — no `installed_plugins`, no `marketplace_subscriptions`. Anthropic ships 4,200+ skills / 770+ MCP / 2,500+ marketplaces (ref §5.11) — we track 0.
3. **Hooks** — no `hook_definitions`, no `hook_invocations` audit, no `allowed_hook_http_urls` allowlist.
4. **Subagent definitions** — only run-time `multi_agent_conversations`/`agent_collaborations` (legacy `20260315000000`); no def-time `user_subagents`.
5. **MCP server registry** — `connector_tool_permissions` is permission-only; no inventory.
6. **Computer Use action log + app blocklist** — JSONB blob in `dispatch_agent_state.pending_approvals` only.
7. **Project knowledge base files** — `user_projects` is metadata only; no `project_files`, no RAG embedding index.
8. **Memory synthesis pipeline** — `user_memories` (legacy only) is content-only; no synthesis-job queue, no import-from-ChatGPT/Gemini/Grok queue.
9. **Cowork VM allowlist + file-mount config** — DB-zero.
10. **Trust Center flags** — no `compliance_api_enabled`, `hipaa_enabled`, `zdr_enabled`, `data_retention_days`, `region_preference` columns on `organizations`.
11. **Custom Styles, Output styles, Voice preferences, Health connector config, `.mcpb` extension install** — all DB-zero.
12. **Live Artifacts subscriptions, persistent-storage artifacts, MCP-connected artifacts, embed-domain allowlist** — DB-zero.
13. **Workflow recording for replay (Chrome ext), Browser action policy** — DB-zero.

**Stripe RPC reconciliation status:** **CODE-COMPLETE.** Filesystem-level reconciliation shipped 2026-05-05 per FINAL_AUDIT WEB-STRIPE-RPC-MISSING. The retry-safe idempotency RPC `process_stripe_event_idempotent(text)` exists in canonical at `/Users/siddhartha/Desktop/agiworkforce/supabase/migrations/20260505000007_stripe_webhook_idempotency.sql:92-156` (verbatim port from legacy `apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql:89-153`, attribution at line 1). Companion RPCs `mark_stripe_event_succeeded`/`mark_stripe_event_failed` at `:163-198`. The `processed_stripe_events` table extension columns (status/attempts/locked_at/updated_at/last_error) are at `:23-69`. Stripe-customer linkage RPCs (`link_stripe_customer`, `get_user_by_stripe_customer_id`, `process_stripe_event_idempotent` first version) live at `/Users/siddhartha/Desktop/agiworkforce/supabase/migrations/20260505000006_stripe_integration.sql:36-106`. All locked to service_role-only at `20260506060000_lockdown_definer_functions.sql:9-15`. Webhook caller at `apps/web/app/api/stripe-webhook/route.ts:1251` (per MEMORY.md) resolves correctly. **Remaining work for paid-tier launch: (1) `supabase db push` to apply canonical migrations to production DB, (2) end-to-end webhook idempotency verify with Stripe test-mode replay.** No more code/filesystem fixes needed.

**File path:** `/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/supabase-data-model.md`

**Overall data-plane parity: ~32%.** Effort to 80% parity: ~14-16 engineer-weeks; biggest ticket items are Skills/Plugins/Hooks data plane (3-4 weeks), Connector registry (2 weeks), Memory synthesis pipeline (2 weeks), and project knowledge base (2 weeks).
