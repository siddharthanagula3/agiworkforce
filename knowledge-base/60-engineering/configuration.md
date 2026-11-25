---
id: "ENG-configuration"
type: "engineering"
title: "Configuration"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Configuration

Configuration in AGI Workforce is env-var driven per app. Each app owns a tracked .env.example. The web app has a typed key registry (apps/web/lib/validate-env.ts) that checks values at boot. scripts/env-doctor.mjs checks per-app contracts. Runtime feature flags live in the database (table:feature_flags), with env kill-switches beside them. Pages group names by sign-in, database, providers, billing, storage, connectors, observability and release. Names only, never values.

## Purpose

This page lists where every setting of AGI Workforce lives and what each group of environment variable names is for. It gives names and purposes only, never values.

**Status labels.** Implementation status (the code exists) is kept apart from verification status (someone ran it). Nothing here is [executed]: no project document records a real run of the checks below, and this page did not run them. Every claim was read from files.

**Basis tags.** [code] = read in a source file (path:line). [requirement] = stated in a project document. [inferred] = reasoned from code. [unknown] = not established.

### The shape of configuration

| Layer | What it is | Where |
|---|---|---|
| Per-app example file | Tracked list of every name an app reads, with comments | file:apps/web/.env.example, file:apps/web/.env.local.example, file:apps/desktop/.env.example, file:apps/desktop/.env.local.example, file:apps/mobile/.env.example, file:apps/mobile/.env.local.example, file:apps/extension/.env.example, file:apps/extension/.env.local.example, file:apps/cli/.env.example, file:services/signaling-server/.env.example, file:services/upload-scanner/.env.example [code] |
| Contract checker | Per-app lists of required names, URL checks, forbidden production values | file:scripts/env-doctor.mjs (contracts at line 14 on) [code] |
| Web key registry | Typed description of web keys: secret or public, owner, allowed environments, validator | file:apps/web/lib/validate-env.ts (CONFIG_KEY_DESCRIPTORS, about 143 entries; registry built at line 1773) [code] |
| Optional-feature table | Which feature turns on when which names are set | file:apps/web/lib/config/optional-features.ts (OPTIONAL_FEATURES, line 36) [code] |
| Runtime flags | Per-user, per-workspace flags and kill switches stored in the database | file:apps/web/lib/feature-flags/ (flag-store.ts, kill-switches.ts, routing-flags.ts) [code] |
| JSON config | Free-model promotion and free pools | file:apps/web/config/free-model-promotion.json, file:apps/web/config/free-pools.json [code] |
| Model catalog | Generated catalog; the only place a model ID may be a literal | file:packages/ai/model-registry/catalog/models.curation.json (edit), then pnpm sync:models [requirement: AGENTS.md section 4] |

A name starting NEXT_PUBLIC_, VITE_ or EXPO_PUBLIC_ is compiled into client code and is public. Every other web name is server-only [code] (apps/web/.env.example:6-8; apps/desktop/.env.example:5-6; apps/mobile/.env.example:7-8).

## Procedure

## How to set up or change configuration

1. **Find the owner file.** Each app owns one example file (table above). Copy the `.env.local.example` to `.env.local` for local work. Production values live in the deployment secret store, never in a file [code] (apps/web/.env.local.example:1-2, apps/web/.env.example:6-8).
2. **Web is not loaded by the doctor.** `env-doctor` reads `process.env` only and never reads dotenv files or prints values, so export the variables in the shell first [code] (scripts/env-doctor.mjs:664-671). A value already exported in the shell wins over `.env.local` [requirement] (docs/development/troubleshooting.md:66-68).
3. **Mobile production builds** use EAS environment variables, because eas.json sets EXPO_NO_DOTENV=1 [code] (apps/mobile/eas.json base env; apps/mobile/.env.example:3-5).
4. **Signaling service** loads `.env` through dotenv, not `.env.local` [code] (services/signaling-server/.env.example:1-3). The **CLI** does not load `.env` itself; it reads the process environment [code] (apps/cli/.env.example:1-3).
5. **Add a new web name:** read it as a literal `process.env.NAME`, add it to apps/web/.env.example, and classify it in CONFIG_KEY_DESCRIPTORS (secret or published, owner, environments). A name reached through a constant is invisible to the scan; pin it in `documentedKeys` in scripts/env-doctor.mjs [code] (apps/web/.env.example:9-14; scripts/check-config-keys.mjs:1-8).
6. **Web boot check.** On the Node runtime, `register()` in file:apps/web/instrumentation.ts runs validateEnvironment(), then assertPooledDatabaseEndpoint(). If errors exist and NODE_ENV is production, boot throws unless AGI_ALLOW_INVALID_ENV=1 [code] (apps/web/instrumentation.ts:40-64).
7. **Flags without a deploy.** Create or edit a flag definition through the operator or admin routes (for example api:GET /api/admin/upgrade-access exists for the upgrade switch) [inferred] (apps/web/app/api/admin/upgrade-access/route.ts exists; method not opened).

## Groups by area (names and purposes)

### Sign-in
| Name | Purpose |
|---|---|
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY | Clerk (the identity provider) public and server keys for web [code] (apps/web/.env.example:38-39) |
| CLERK_AUTHORIZED_PARTIES | Token audiences accepted by API routes and the proxy; must include the Chrome extension origin or extension sign-in breaks. Unset falls back to the origin of NEXT_PUBLIC_APP_URL [code] (apps/web/.env.example:40-45) |
| AGI_IDENTITY_PROVIDER | Which identity adapter loads; only `clerk` exists [code] (apps/web/.env.example:33-37) |
| AGI_AUTH_PROVIDERS | Social providers on sign-in screens; `passkey` turns on passkeys. Default Google and GitHub [code] (apps/web/.env.example:47-50) |
| AGI_AUTH_MFA_EMAIL_FALLBACK | Offer an emailed code to accounts with a stronger second factor; default off [code] (apps/web/.env.example:52-58) |
| AGI_BLOCK_EEA_TRAFFIC | Refuse EEA requests with a 451 page (apps/web/lib/eu-access.ts, applied in proxy.ts); default off [code] (apps/web/.env.example:60-64) |
| AGI_PLATFORM_ADMIN_USER_IDS | Clerk user ids allowed into /admin and cross-tenant admin APIs; unset means nobody [code] (apps/web/.env.example:826-829) |
| CSRF_SECRET (+ CSRF_SECRET_PREV for rotation), JWT_SECRET, CRON_SECRET | Signing secrets for browser mutations, tokens and cron routes [code] (apps/web/.env.example:97-102) |
| TOTP_ENCRYPTION_KEY, LOG_SALT, IP_HASH_PEPPER, EMAIL_HASH_PEPPER | Authenticator-secret encryption, log and IP pseudonymization, email pseudonymization [code] (apps/web/.env.example:113-126, 830) |
| SESSION_ABSOLUTE_LIFETIME_HOURS, API_KEY_MAX_LIFETIME_DAYS | Optional credential lifetime bounds (defaults 720 hours, 365 days) [code] (apps/web/.env.example near the credential lifetime comment) |
| VITE_CLERK_PUBLISHABLE_KEY (desktop) | Native in-app sign-in; without it desktop falls back to browser device authorization [code] (apps/desktop/.env.example) |
| EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_AGI_AUTH_PROVIDERS (mobile) | Must be a live key for preview/production; providers list for signup buttons [code] (apps/mobile/.env.example) |
| CLERK_PUBLISHABLE_KEY, CLERK_FRONTEND_API, CLERK_SYNC_HOST (Chrome) | Clerk extension setup; same Clerk instance as web [code] (apps/extension/.env.example) |
| AGIWORKFORCE_JWT, AGI_AUTH_BASE, AGIWORKFORCE_NO_KEYRING (CLI) | Account token override, device-code login base (needs /api), store credentials in file not OS keyring [code] (apps/cli/.env.example) |

### Database
| Name | Purpose |
|---|---|
| DATABASE_URL (alias AGI_DATABASE_URL) | Postgres connection string; set one [code] (apps/web/.env.example:72-74) |
| AGI_DATABASE_PROVIDER | `neon` (default, WebSocket, edge-capable) or `postgres` (plain TCP, not edge) [code] (apps/web/.env.example:85-91) |
| AGI_DATABASE_WS_PROXY | Local loopback proxy target used with scripts/dev-db-ws-proxy.mjs [code] (apps/web/.env.example:75-76) |
| AGI_ALLOW_REMOTE_DATABASE | Escape for the development isolation refusal; value is the exact sentence the refusal prints [code] (apps/web/.env.example:78-83; packages/platform/data-layer/src/environment-isolation.ts) |
| AGI_DEPLOY_ENV, VERCEL_ENV, NODE_ENV | Environment resolution order for isolation and production-only rules [code] (apps/web/.env.example:80-82; apps/web/lib/config/runtime-environment.ts) |
| AGI_DB_LOW_POWER | 1 runs frequent crons only in the first quarter of each hour so a Neon Free compute can suspend [code] (apps/web/.env.example:29-31) |
| UPSTASH_REDIS_REST_URL/TOKEN (alias KV_REST_API_URL/TOKEN) | Shared rate-limit and session state; required in production [code] (apps/web/.env.example:199-203; scripts/env-doctor.mjs requiredGroups) |
| AGI_KV_PROVIDER, AGI_KV_REDIS_URL, AGI_KV_BREAKER_FAILURE_THRESHOLD, AGI_KV_BREAKER_COOLDOWN_MS | Pick upstash, redis, memory or none; circuit breaker tuning [code] (apps/web/.env.example:205-215; packages/platform/key-value/src/factory.ts:19) |
| AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY | `fail-open` is forbidden in production [code] (scripts/env-doctor.mjs productionForbiddenValues; apps/web/lib/validate-env.ts:370-378) |
| NEON_DATABASE_URL (or DATABASE_URL) | Signaling service store [code] (services/signaling-server/.env.example; scripts/env-doctor.mjs signaling) |
| AGI_DATA_REGION, AGI_DATA_REGION_<REGION>_* | Data residency; a region is provisioned only when all its pieces are set [code] (apps/web/.env.example:159-172) |

### Providers (inference)
| Name | Purpose |
|---|---|
| OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY (aliases GOOGLE_AI_API_KEY, GEMINI_API_KEY), DEEPSEEK_API_KEY, XAI_API_KEY, PERPLEXITY_API_KEY, MOONSHOT_API_KEY, OPENROUTER_API_KEY | Managed-cloud provider keys, server-only and optional [code] (apps/web/.env.example:311-321) |
| MINIMAX_API_KEY, QWEN_API_KEY, ZHIPU_API_KEY, DASHSCOPE_API_KEY | Direct routes; MiniMax, Qwen, Zhipu default through OpenRouter while a key is set [code] (apps/web/.env.example:325-329, 374-376) |
| ANTHROPIC_PROMO_API_KEY | Second account that pays first for the free model promotion [code] (apps/web/.env.example:313-315; apps/web/config/free-model-promotion.json credentials) |
| <PROVIDER>_BASE_URL (OPENAI, ANTHROPIC, GOOGLE, OPENROUTER, MINIMAX, MOONSHOT, ZHIPU, QWEN, DEEPSEEK, XAI, PERPLEXITY) | Allowlisted endpoint overrides [code] (apps/web/.env.example:331-347) |
| AGI_OPENROUTER_ROUTED_PROVIDERS | Which providers route via OpenRouter; code default minimax,qwen,zhipu [code] (apps/web/.env.example:374-376) |
| AGI_ROUTE_*, AGI_MODEL_LOCKOUT_*, AGI_CREDENTIAL_COOLDOWN_*, AGI_CAPABILITY_HEALTH_*, AGI_ROLLOUT_*, AGI_ROUTING_TRACE_RETENTION_* | Breaker, lockout, cooldown, health and rollout-evaluation tuning (windows, thresholds) [code] (apps/web/.env.example:851-1003) |
| AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW, AGI_ROUTING_GATEWAY_ROUTES | Routing stage switches; the first three are on unless 0, false or off; gateway routes are off unless 1 [code] (apps/web/.env.example) |
| AGI_OPENAI_ZDR_AGREEMENT, AGI_ANTHROPIC_ZDR_AGREEMENT | Declare a zero-data-retention agreement so a ZDR workspace may use the direct route [code] (apps/web/.env.example) |
| AGI_FREE_LANE_MODE | off, shadow, prefer or strict; default off; invalid value keeps it off [code] (apps/web/lib/services/free-lane/mode.ts:3-32) |
| AGI_PRICING_UNPRICED_POLICY | `warn` lets a model with no price run at a fallback rate; otherwise refused [code] (apps/web/.env.example) |
| TYPESAFE_API_KEY, TYPESAFE_BASE_URL, TYPESAFE_MODEL, TYPESAFE_INPUT_MICROUSD_PER_MTOK | External decision transport; all four needed, and a decision.<kind> flag must also serve it [code] (apps/web/.env.example tail) |
| RUNWAY_API_KEY | Image and video generation [code] (apps/web/.env.example:350) |
| CLI BYOK keys: ANTHROPIC, OPENAI, GOOGLE, GEMINI, XAI, DEEPSEEK, MINIMAX, OPENROUTER, NVIDIA, DASHSCOPE; also PERPLEXITY, QWEN, MOONSHOT, ZHIPU, OLLAMA in the default provider table | Stay on the machine; sent only to the issuing provider [code] (apps/cli/.env.example; apps/cli/src/config.rs:351-449) |
| AGIWORKFORCE_PROVIDER, AGIWORKFORCE_MODEL, AGIWORKFORCE_DEFAULT_MODEL, AGIWORKFORCE_MAX_TOKENS, AGI_PLAN, AGI_QUOTA_REMAINING_PCT, AGI_TEAM | CLI session defaults and quota-banner overrides [code] (apps/cli/.env.example) |
| Local providers (provider:ollama, provider:lmstudio) | Ollama default base URL is a local address in code; no cloud key [code] (packages/ai/providers/ollama/src/catalog.ts:6) |

### Billing
| Name | Purpose |
|---|---|
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe credentials; live prefix required in production, test/live mode must match across keys [code] (scripts/env-doctor.mjs:567-600; apps/web/lib/validate-env.ts:319-370) |
| STRIPE_CHECKOUT_ENABLED, NEXT_PUBLIC_CHECKOUT_ENABLED | Server and client checkout gates; must match [code] (scripts/env-doctor.mjs web scope) |
| STRIPE_PRICE_BASIC_MONTHLY_USD/_INR, _PRO_MONTHLY(_INR), _MAX_MONTHLY(_INR), _MAX_20X_MONTHLY(_INR), _PRO_YEARLY (retired, kept for renewals) | Individual-plan Price IDs [code] (apps/web/.env.example:235-252) |
| STRIPE_PRICE_TEAM_MONTHLY/YEARLY_USD/INR, _TEAM_PREMIUM_*_USD, STRIPE_PRICE_ENTERPRISE_MONTHLY/YEARLY, STRIPE_PRODUCT_ENTERPRISE | Team seat, Premium seat and enterprise prices; missing means that checkout fails closed [code] (apps/web/.env.example:259-276) |
| PRICE_ID_OVERRIDES | Extra price_id,tier mapping [code] (apps/web/.env.example:278) |
| BILLING_ALERT_EMAIL | Internal enterprise collection escalations [code] (apps/web/.env.example:264) |
| AGI_BILLING_WAITLIST_OPEN | 1 force-opens paid checkout, billing portal and store purchases for everyone; otherwise operator switch decides [code] (apps/web/.env.example:25-28; apps/web/lib/server/billing-waitlist-access.ts:29) |
| MOBILE_IAP_ENABLED, MOBILE_IAP_APPLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON | Native store purchases, off until real products exist [code] (apps/web/.env.example:280-293) |
| APPLE_APP_STORE_BUNDLE_ID/APP_ID/ENVIRONMENT/ROOT_CA_CERTS_BASE64_JSON/SANDBOX_NOTIFICATIONS_ENABLED | Apple verification and notifications [code] (apps/web/.env.example:295-299, 830-840) |
| GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_PUBSUB_AUDIENCE, GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL | Google Play verification and push [code] (apps/web/.env.example:301-305) |
| AGI_E2B_COMPUTE_MICROUSD_PER_SECOND, AGI_PLACES_SEARCH_MICROUSD_PER_CALL | Cost rates metered to the cost ledger [code] (apps/web/.env.example) |
| AGI_EVENT_* (ENABLED, MODELS, STARTS_AT, ENDS_AT, GLOBAL_BUDGET_USD, DISABLED_MODELS, DISABLED_PROVIDERS) | Event overlay that grants text-model access to free accounts only; nothing stored [code] (apps/web/.env.example:430-462) |

### Storage
| Name | Purpose |
|---|---|
| AGI_STORAGE_PROVIDER (s3 or memory), AGI_STORAGE_ENDPOINT, _REGION, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _FORCE_PATH_STYLE | S3-compatible object store; provider inferred as s3 when endpoint and both keys exist [code] (apps/web/.env.example; packages/platform/object-storage/src/config.ts:7) |
| AGI_STORAGE_BUCKET, AGI_STORAGE_PUBLIC_BASE_URL | Public bucket for avatars and legacy reads [code] (apps/web/.env.example) |
| AGI_STORAGE_PRIVATE_BUCKET | Private bucket for generated media, attachments, project knowledge; must differ from the public one [code] (apps/web/.env.example) |
| CLOUDFLARE_R2_* (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME, PUBLIC_BASE_URL, PRIVATE_BUCKET_NAME) | Fallback for each neutral name; set either set, not both [code] (apps/web/.env.example) |
| AGI_STORAGE_BACKUP_* | Second store for hourly copy; unset makes the cron answer 503 [code] (apps/web/.env.example) |
| AGI_STORAGE_RETRY_MAX_ATTEMPTS, _BASE_DELAY_MS, _MAX_DELAY_MS | Bounded retry [code] (apps/web/.env.example) |
| UPLOAD_SCAN_WEBHOOK_URL, UPLOAD_SCAN_WEBHOOK_TOKEN, UPLOAD_SCAN_REQUIRED | Malware scanner link; in production uploads are refused with no scanner unless REQUIRED=false [code] (apps/web/.env.example:174-185) |
| CHAT_LARGE_FILES_ENABLED, UPLOAD_STORAGE_CORS_ORIGINS | Large chat files (over 25 MiB inline limit), direct-to-storage origins [code] (apps/web/.env.example:187-197) |
| Scanner service: UPLOAD_SCAN_WEBHOOK_TOKEN(_PREVIOUS), PORT, UPLOAD_SCAN_SOURCE_HOSTS, MAX_SOURCE_SCAN_BYTES, SCAN_* | Token must match web, at least 32 chars [code] (services/upload-scanner/.env.example) |
| NEXT_PUBLIC_SANDBOX_ORIGIN, NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN | Cross-origin renderers for artifacts and MCP app cards; must differ from the app origin [code] (apps/web/.env.example) |

### Connectors
| Name | Purpose |
|---|---|
| CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY (+ _KEY_ID, _KEY_RETIRED) | Encrypts connector tokens and hosted MCP OAuth grants; must be 64 hex characters [code] (apps/web/.env.example:110-119) |
| GITHUB_TOKEN_ENCRYPTION_KEY, GITHUB_APP_ID, _PRIVATE_KEY_BASE64, _SLUG, _CLIENT_ID, _CLIENT_SECRET, GITHUB_WEBHOOK_SECRET, GITHUB_BOT_LOGIN, GITHUB_TOKEN | GitHub App connector; leave the whole group unset to disable [code] (apps/web/.env.example) |
| CONNECTOR_OAUTH_PROVIDERS_JSON, CONNECTOR_OAUTH_<ID>_CLIENT_ID/_CLIENT_SECRET, CONNECTOR_OAUTH_REDIRECT_BASE_URL | Hosted OAuth connectors; partial config is treated as absent [code] (apps/web/.env.example) |
| WEB_MCP_SERVERS_JSON, CONNECTOR_MCP_SERVERS_JSON, SKILLS_LAYERS, AGI_USER_SKILL_AUTHORING, PLUGIN_SIGNING_PUBLIC_KEYS | MCP and skills configuration [code] (apps/web/.env.example) |
| AGI_WEB_MCP_PRIVATE_BETA, AGI_MANAGED_COMPUTE_PRIVATE_BETA | Kill-switches; 0, false or off re-gates [code] (apps/web/.env.example) |
| E2B_API_KEY, AGI_E2B_EXECUTION, E2B_API_URL, E2B_DOMAIN, AGI_E2B_CHAT_TEMPLATE | Managed code execution; needs both cutover flag and key [code] (apps/web/.env.example:382-394) |
| PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV | Bank accounts connector; all three or none [code] (apps/web/.env.example) |
| SLACK_SIGNING_SECRET, SLACK_APP_CLIENT_ID/SECRET, EVENT_TRIGGER_SIGNING_SECRET, GMAIL_PUBSUB_TOPIC/AUDIENCE/SERVICE_ACCOUNT_EMAIL, GOOGLE_CALENDAR_CHANNEL_SECRET, GOOGLE_PICKER_API_KEY/APP_ID | Event receivers; each fails closed with 503 when its secret is unset [code] (apps/web/.env.example event triggers block) |
| GOOGLE_PLACES_API_KEY, AGI_MAP_* | Places search tool (not offered when unset) and map tiles [code] (apps/web/.env.example) |
| SIGNALING_HTTP_URL, SIGNALING_INTERNAL_SECRET | Web-to-relay pairing; must equal the relay's own value; pairing 503s without them [code] (apps/web/.env.example; services/signaling-server/.env.example) |
| RESEND_API_KEY, AGI_NOTIFICATIONS_FROM_EMAIL, AGI_SUPPORT_* , WEB_PUSH_VAPID_* | Email, support handoff, web push [code] (apps/web/.env.example) |
| AGI_PLUGIN_REGISTRY_URL (CLI) | Plugin registry base; https or loopback http [code] (apps/cli/.env.example) |

### Observability
| Name | Purpose |
|---|---|
| NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN | Browser plus server reporting, or server only [code] (apps/web/.env.example) |
| SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT | Source-map upload; all three or the wrapper is skipped [code] (apps/web/.env.example) |
| NEXT_PUBLIC_SENTRY_RELEASE, SENTRY_RELEASE, VERCEL_GIT_COMMIT_SHA | Release tag for events [code] (apps/web/.env.example) |
| AGI_OTEL_EXPORTER_ENDPOINT, AGI_OTEL_SERVICE_NAME, AGI_OTEL_HEADERS, AGI_OTEL_SAMPLE_RATIO, AGI_OTEL_SLOW_SPAN_MS | OpenTelemetry export; unset endpoint means no SDK starts. Same names in the signaling service [code] (apps/web/.env.example; services/signaling-server/.env.example) |
| LOG_LEVEL, AGI_DEV_LOG_FORMAT, NEXT_PUBLIC_GA_TRACKING_ID, NEXT_PUBLIC_APP_VERSION | Logging, analytics, version label [code] (apps/web/.env.example) |
| PAGER_WEBHOOK_URL, INCIDENT_CHANNEL_WEBHOOK_URL, INCIDENT_OUT_OF_BAND_*, AGI_STATUS_MIRROR_*, AGI_ONCALL_*, AGI_MAINTENANCE_WINDOW | Paging, incident channel, status page, on-call rotation, maintenance banner [code] (apps/web/.env.example) |
| AGI_RELEASE_SHA, AGI_DEPLOY_REGION, AGI_DEPLOYMENT_ID | Reported by api:GET /api/version [code] (apps/web/.env.example:800-818) |
| AGI_BOT_PROTECTION, NEXT_PUBLIC_AGI_BOT_PROTECTION, AGI_BOT_CHALLENGE_ENFORCED | Bot protection provider (platform or off) [code] (apps/web/.env.example) |
| VITE_SENTRY_DSN (desktop and Chrome), SENTRY_DSN_* (release workflows) | Client crash reporting; Chrome also needs the user's consent toggle [code] (apps/desktop/.env.example; apps/extension/.env.example) |
| RUST_LOG, AGIWORKFORCE_LOG, AGI_PLAIN, AGI_SCREEN_READER | CLI logging and accessibility output [code] (apps/cli/.env.example) |
| AGI_ENFORCE_PRODUCTION_CONFIG | 1 turns production config findings (test key, loopback URL, placeholder) from warnings into a refused boot [code] (apps/web/lib/validate-env.ts:223-251) |

### Release
| Where | Names |
|---|---|
| Desktop signing and notarization (job environment, never VITE_) | APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, AGI_RELEASE_NOTARIZATION_RECEIPT [code] (apps/desktop/.env.example) |
| Workflow secrets (names only) | release-desktop: APPLE_*, TAURI_SIGNING_PRIVATE_KEY(_PASSWORD), SENTRY_*; build-windows-release: AZURE_*, TAURI_SIGNING_*; release-mobile: ASC_API_KEY_ID, ASC_API_KEY_ISSUER_ID, ASC_API_PRIVATE_KEY_BASE64, EXPO_TOKEN, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64; release-cli: AGI_CLI_RELEASE_SIGNING_KEY; deploy-production: VERCEL_*, AGI_DATABASE_URL, PAGER_WEBHOOK_URL; deploy-signaling-server: FLY_API_TOKEN, RAILWAY_TOKEN [code] (grep of secrets.* in .github/workflows) |
| Chrome release variables | CHROME_EXTENSION_PUBLIC_KEY, CWS_EXTENSION_ID, CWS_PUBLISHER_ID, CWS_SERVICE_ACCOUNT, GCP_WORKLOAD_IDENTITY_PROVIDER [code] (.github/workflows/release-chrome-extension.yml) |
| VS Code release variables | OPEN_VSX_PUBLISH, VSCODE_MARKETPLACE_AZURE_CLIENT_ID, VSCODE_MARKETPLACE_AZURE_TENANT_ID [code] (.github/workflows/release-vscode-extension.yml) |
| Desktop release lookup on web | DESKTOP_GITHUB_OWNER/REPO, DESKTOP_CLOUD_GITHUB_OWNER/REPO, NEXT_PUBLIC_DOWNLOAD_URL_MAC/WINDOWS/LINUX [code] (apps/web/.env.example) |
| Mobile build | APP_ENV, EXPO_PUBLIC_APP_ENV (must match), GOOGLE_SERVICES_JSON, EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS, EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS, AGI_IOS_DEVELOPMENT_TEAM, EXPO_IOS_DEVELOPMENT_TEAM, EXPO_ENABLE_DETOX [code] (apps/mobile/.env.example) |
| Mobile Android link check | ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS; assetlinks route fails closed with 503 when unset [code] (apps/web/.env.example) |
| Web build | AGI_WEB_STANDALONE, AGI_NEXT_DIST_DIR, ANALYZE [code] (apps/web/.env.example) |

## Feature flags and switches (three kinds)

1. **Database flags.** Table table:feature_flags (per-user override rows, created in 0016_misc.sql) plus a definitions table added by migration 0211_feature_flag_targeting.sql. Definitions carry key, variants, default variant, rules, kill_switch, maturity, release channel, availability, owner, expiry [code] (apps/web/lib/feature-flags/flag-store.ts:20-33; apps/web/db/neon/0211_feature_flag_targeting.sql). Flag keys follow `^[a-z][a-z0-9_]*([.:-][a-z0-9_]+)*$` [code] (flag-definition.ts:49).
2. **Key families.** capability.<name> kill switches, model.<id>, provider.<name>, tenant.lockdown, routing.* (observed_health, canary, shadow, response_assessment, response_assessment_apply, canary.<slot>), decision.<kind>, rollout rings, billing.upgrades_open [code] (kill-switches.ts:9-12; routing-flags.ts:10-16; billing-upgrades.ts:4). Extra kill-switch capabilities: dictation, screen_share, in_app_purchase, desktop_update, fast_mode [code] (kill-switches.ts:17-23).
3. **Flag tunables (env).** FEATURE_FLAG_DEFINITION_CACHE_TTL_MS (0-300000, default 30000), FEATURE_FLAG_STALE_AFTER_DAYS (1-365, default 60), FEATURE_FLAG_STALE_CLEANUP_BATCH (1-200, default 25); a bad value keeps the default [code] (flag-config.ts:3-37).
4. **Env kill switches.** Defaults on: AGI_DURABLE_INITIAL_TURNS, AGI_CONTEXT_COMPACTION_ENABLED, AGI_MODEL_MEMORY_EXTRACTION, AGI_ROUTING_*, response caches, SUPPORT_AGENT_ENABLED, NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED, AGI_USER_SKILL_AUTHORING. Defaults off: AGI_DURABLE_CODE_TURNS, AGI_ARTIFACT_AI_ENABLED, SOFT_DELETED_RESOURCE_PURGE_ENABLED, AGI_SUPPORT_LIVE_HANDOFF_ENABLED, AGI_E2B_EXECUTION, CHAT_LARGE_FILES_ENABLED, MOBILE_IAP_ENABLED, STRIPE_CHECKOUT_ENABLED [code] (apps/web/.env.example comments).
5. **Build-time UI defaults.** NEXT_PUBLIC_COMPOSER_EDITOR (editor or textarea), NEXT_PUBLIC_MESSAGE_VARIANTS (on or off), NEXT_PUBLIC_FREE_LANE_UI (on or off); browser overrides by query parameter or localStorage [code] (apps/web/.env.example:866-890).
6. **Upgrade switch.** Paid upgrades are closed per account unless AGI_BILLING_WAITLIST_OPEN=1 or flag billing.upgrades_open serves the on variant for that user; any read failure answers closed [code] (apps/web/lib/feature-flags/billing-upgrade-gate.ts:12-36).

## Commands

Run from the repository root. These were not run for this page [unknown verification status].

| Command | What it does | Source |
|---|---|---|
| `pnpm env:doctor -- --scope <web\|desktop\|mobile\|extension\|cli\|signaling\|scanner\|all> --mode <development\|production>` | Checks the current shell environment against the app contract; exit 1 on any error; never prints values | scripts/env-doctor.mjs:664-707; package.json:192 [code] |
| `pnpm check:env-contract` (= env-doctor `--check-examples`) | Checks example files against source reads and credential handling | package.json:193 [code] |
| `pnpm check:config-keys` | Every web env key read must be classified in the registry, measured against baseline scripts/config/config-keys.json | package.json:308; scripts/check-config-keys.mjs:1-30 [code] |
| `pnpm check:client-bundle-secrets` | Fails a secret reaching client code | package.json:311 [code] |
| `pnpm check:feature-flags`, `pnpm check:kill-switch-readers`, `pnpm check:settings-precedence` | Flag, kill-switch and settings-order guards | package.json:227,321,322 [code] |
| `pnpm check:hardcoded-endpoints`, `pnpm check:secrets`, `pnpm check:model-id-literals`, `pnpm sync:models`, `pnpm sync:models:check` | No hardcoded endpoints, secrets, model IDs; model catalog regeneration | package.json:218,432; AGENTS.md section 4 [code][requirement] |
| `node scripts/check-env-drift.mjs --scope web --target production` | Compares the names present in Vercel production against the declared contract (missing, unsatisfied groups, forbidden present). Runs every 6 hours in CI with VERCEL_TOKEN | .github/workflows/env-drift.yml; scripts/check-env-drift.mjs:1-40 [code] |
| `pnpm check:llm-operability` | The whole guard chain; includes check:env-contract and check:config-keys | package.json:397 [code] |
| `node scripts/dev-db-ws-proxy.mjs` | Local WebSocket proxy so the Neon driver reaches a loopback Postgres | apps/web/.env.example:75-76 [code] |
| `pnpm models:families` | Show which model generation is live per family slot | AGENTS.md section 4 [requirement] |

Web tests must run through apps/web's own Vitest (AGENTS.md section 12). This project's rule is that heavy jobs run through scripts/dev/heavy-job.sh [requirement] (CLAUDE.md).

## Rules and traps

- **Never put a secret in a public name.** NEXT_PUBLIC_*, VITE_*, EXPO_PUBLIC_* are public. The registry refuses a secret exposed to the client at boot (`secret_exposed_to_client` is source-fatal) [code] (apps/web/lib/validate-env.ts:1790-1796).
- **What fails boot (web, production):** missing DATABASE_URL/AGI_DATABASE_URL, missing Clerk, Stripe or app URL critical vars, missing Redis REST credentials, missing any of five individual-plan Stripe Prices (BASIC USD and INR, PRO, MAX, MAX_20X) [code] (validate-env.ts:36-139). Missing Team, enterprise and INR Pro/Max Prices only warn: checkout stays closed [code] (validate-env.ts:100-118).
- **Boot throws only when** NODE_ENV is production and AGI_ALLOW_INVALID_ENV is not 1. The env-doctor treats AGI_ALLOW_INVALID_ENV-style hatches as dangerous [code] (instrumentation.ts:60-64). ACCOUNT_STATUS_FAIL_OPEN is an error in production, a warning elsewhere, and env-doctor also forbids it [code] (validate-env.ts:360-403; env-doctor.mjs productionForbiddenKeys).
- **Production forbidden values:** AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY=fail-open, and AGI_DURABLE_INITIAL_TURNS set to 0, false or off [code] (env-doctor.mjs web contract).
- **Test keys, loopback URLs and placeholders in a deployed environment** warn loudly by default; AGI_ENFORCE_PRODUCTION_CONFIG=1 makes them refuse the boot. It is a deliberate two-step so a bad deployment is visible before it is allowed to block [code] (validate-env.ts:223-251; apps/web/.env.example:104-108). Whether production sets it is [unknown].
- **Stripe mode:** Production must hold live keys and preview/development test keys; secret and publishable keys must share one mode [code] (validate-env.ts:319-370).
- **Checkout gates must match:** STRIPE_CHECKOUT_ENABLED and NEXT_PUBLIC_CHECKOUT_ENABLED [code] (env-doctor.mjs web scope). Keep false locally unless webhooks and prices exist [code] (apps/web/.env.local.example:30).
- **Encryption key shapes:** connector and GitHub token keys are exactly 64 hex characters; TOTP key at least 32 characters; CSRF_SECRET and CRON_SECRET at least 32 characters [code] (apps/web/.env.example:110-111; validate-env.ts descriptors). Use independent random values per purpose.
- **Development runtimes cannot reach a non-loopback database** unless AGI_ALLOW_REMOTE_DATABASE equals the sentence the refusal prints [code] (apps/web/.env.example:78-83).
- **OAuth callback isolation:** development must redirect to loopback; deployed must use https and the same host as NEXT_PUBLIC_APP_URL [code] (validate-env.ts:1846-1905).
- **Sandbox origins must differ from the app origin.** NEXT_PUBLIC_SANDBOX_ORIGIN equal to the app URL is rejected. Unset in production is drift in env-doctor [code] (apps/web/.env.example:524-531 region; env-doctor.mjs web required list).
- **WORKFLOW_NODE_HTTP=1 is required** wherever durable turns run, or on Node 24 no durable step runs and AGI Work silently falls back to the inline turn [code] (apps/web/.env.example:57 of the workflow comment; env-doctor.mjs web required lists).
- **Mobile:** APP_ENV and EXPO_PUBLIC_APP_ENV must be equal; production APP_ENV must be production; the Clerk key must be pk_live_ in production [code] (env-doctor.mjs mobile scope).
- **Egress allowlists:** CLI API hosts must be https and agiworkforce.com or a subdomain; a failing value is skipped, not sent. Desktop Electron main ignores AGI_CLOUD_APP_ORIGIN in a packaged build [code] (apps/cli/.env.example:14-19; apps/desktop/electron/config.ts:62-80).
- **CLI safety opt-outs remove protections** (AGIWORKFORCE_NO_SANDBOX, AGI_A2A_ALLOW_PRIVATE, AGI_POWERSHELL_ALLOW_UNSAFE, AGIWORKFORCE_VOICE_ALLOW_CLOUD); development only [code] (apps/cli/.env.example).
- **Execution boundary:** provider keys on web are managed-cloud keys (mode:cloud). CLI BYOK keys stay on the machine and go only to the issuing provider (mode:own-key). Local engines use no key (mode:local) [code] (apps/web/.env.example:307-321; apps/cli/.env.example BYOK block; packages/ai/providers/ollama/src/catalog.ts:6). Which app uses which mode at runtime is not established by this page.
- **Never hardcode a model ID** in config or code; use the generated catalog and family slots (packages/ai/model-registry/catalog/model-families.json) [requirement] (AGENTS.md section 4).
- **Lock files** are never hand-edited, and new root files must be registered in scripts/check-repo-organization.mjs [requirement] (AGENTS.md section 12).

## Where the canonical document is

| Question | Canonical home |
|---|---|
| Which names does the web app read, and why | file:apps/web/.env.example (documents every literal read; enforced by `check:env-contract`) |
| Is a web key secret or public, who owns it, where may it be set | `CONFIG_KEY_DESCRIPTORS` in file:apps/web/lib/validate-env.ts (rank 1 or 2 under AGENTS.md section 2) |
| What a production deployment must hold | `contracts` in file:scripts/env-doctor.mjs |
| Which optional features are on, given the keys | `OPTIONAL_FEATURES` in file:apps/web/lib/config/optional-features.ts |
| Local web dev values | file:apps/web/.env.local.example |
| Desktop, mobile, Chrome, CLI, signaling, scanner | the matching `.env.example` listed in Purpose |
| Feature flags and kill switches | file:apps/web/lib/feature-flags/ and table:feature_flags; vocabulary of maturity and channel in the types package (packages/contracts/types) |
| Free model promotion and free pools | file:apps/web/config/free-model-promotion.json, file:apps/web/config/free-pools.json |
| Model catalog and family slots | file:packages/ai/model-registry/catalog/models.curation.json, file:packages/ai/model-registry/catalog/model-families.json |
| VS Code user settings | `contributes.configuration` in file:apps/extension-vscode/package.json (keys under `agiWorkforce.`) |
| CLI file config | `~/.agiworkforce/config.toml` (default, ui, providers, telemetry, updates sections) via file:apps/cli/src/config.rs; project config merges but cannot set telemetry |
| Chrome extension managed policy | file:apps/extension/managed-schema.json and manifest.json |
| Mobile build config | file:apps/mobile/app.config.js, file:apps/mobile/eas.json |
| Desktop Electron main config | file:apps/desktop/electron/config.ts; packaging in file:apps/desktop/electron-builder.yml |
| Cron schedule | `crons` in file:vercel.json |
| CI, deploy and env drift | docs/development/ci-and-deploys.md, .github/workflows/env-drift.yml |
| Connector setup with exact names | docs/development/connectors-setup.md |
| Store product setup | docs/runbooks/mobile-store-products.md |
| Related knowledge-base pages | SYS-chat-turn-pipeline (turn routing and provider use); other page ids not verified here |

## Gaps in the documents

- **AGI_FREE_LANE_MODE is undocumented in the examples.** It is read through a constant (`FREE_LANE_MODE_ENV`) in apps/web/lib/services/free-lane/mode.ts:3, so the literal-read scan misses it. It appears in apps/web/.env.example only inside a comment at line 889, and it is not in `documentedKeys` in scripts/env-doctor.mjs [code]. Whether the config-key registry covers it is [unknown] (not in the secret()/published() list read).
- **Registry covers only part of the names.** about 143 descriptors versus several hundred names in the example file (for example AGI_ROUTE_*, AGI_ROLLOUT_*, AGI_STORAGE_*, AGI_EVENT_* do not appear in the descriptor list) [code]. Whether check:config-keys baseline (scripts/config/config-keys.json) covers them was not opened [unknown].
- **README environment table is incomplete.** README.md lines 246-250 list Desktop, Web, Mobile, Chrome extension and Signaling only; the CLI and upload-scanner also have tracked example files and env-doctor scopes [code].
- **No single document lists feature flags.** Flag definitions are database rows, so which flags exist in production is [unknown] from the repository alone. Only key families and prefixes are in code.
- **Release names for desktop and VS Code are scattered.** Names exist in workflows, but no one document lists them; docs/runbooks (desktop-electron-macos-release.md, vscode-marketplace-publish.md, chrome-web-store-publish.md) were not read for this page [unknown].
- **Desktop Rust/Tauri env reads** and the CLI's full env surface beyond .env.example (names reached by constants) were not enumerated. The CLI contract pins only AGI_PLUGIN_REGISTRY_URL by hand [code] (env-doctor.mjs cli.documentedKeys).
- **Plan naming.** Env names use basic, pro, max, max_20x, team, enterprise; how these map to the customer-facing plan names is not stated in the config files [unknown].

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Each app owns one tracked example file; web has both .env.example (deployment contract) and .env.local.example (local dev). CLI, signaling and upload-scanner also have .env.example files. | read in the code | `apps/web/.env.example:1-14`; `apps/cli/.env.example:1-10`; `services/signaling-server/.env.example:1-5`; `services/upload-scanner/.env.example:1-5` |
| The web app boots through a validator chain (validateEnvironment) that runs 15 checks including key registry, Stripe mode, OAuth callback isolation, optional features. | read in the code | `apps/web/lib/validate-env.ts:1907-1925`; `apps/web/instrumentation.ts:40-41` |
| Production boot throws on validation errors unless AGI_ALLOW_INVALID_ENV=1; outside production it logs and continues. | read in the code | `apps/web/instrumentation.ts:56-70` |
| AGI_ENFORCE_PRODUCTION_CONFIG=1 converts test-key, loopback and placeholder findings from warnings into a refused boot; findings are always logged and set a configuration gauge. | read in the code | `apps/web/lib/validate-env.ts:223-251` |
| The web config-key registry classifies keys as secret or published, with owner, allowed environments and validators; a secret exposed to client code or an incomplete descriptor always refuses boot. | read in the code | `apps/web/lib/validate-env.ts:650-660`; `apps/web/lib/validate-env.ts:1785-1815` |
| scripts/env-doctor.mjs defines contracts for 7 scopes: desktop, web, mobile, extension, cli, signaling, scanner; it reads process.env only and never prints values. | read in the code | `scripts/env-doctor.mjs:14-200`; `scripts/env-doctor.mjs:664-671` |
| Database URL is DATABASE_URL with alias AGI_DATABASE_URL; production also requires Redis REST credentials (UPSTASH_* or KV_REST_API_*). | read in the code | `apps/web/.env.example:72-74`; `scripts/env-doctor.mjs requiredGroups`; `apps/web/lib/validate-env.ts:120-133` |
| AGI_DATABASE_PROVIDER selects neon (default, WebSocket, edge) or postgres (TCP, not edge). | read in the code | `apps/web/.env.example:85-91` |
| A development or test runtime cannot connect to a non-loopback database unless AGI_ALLOW_REMOTE_DATABASE carries the exact sentence the refusal prints. | read in the code | `apps/web/.env.example:78-83`; `packages/platform/data-layer/src/environment-isolation.ts` |
| Identity provider is Clerk only; AGI_IDENTITY_PROVIDER defaults to clerk and no second adapter exists. | read in the code | `apps/web/.env.example:33-37` |
| CLERK_AUTHORIZED_PARTIES must list the Chrome extension origin or extension sign-in fails; unset it falls back to the origin of NEXT_PUBLIC_APP_URL. | read in the code | `apps/web/.env.example:40-45` |
| Web production requires five individual-plan Stripe Price IDs (BASIC USD, BASIC INR, PRO, MAX, MAX_20X); Team, enterprise and other INR prices only warn and keep that checkout closed. | read in the code | `apps/web/lib/validate-env.ts:82-118`; `apps/web/lib/validate-env.ts:129-139` |
| Stripe server and client checkout gates (STRIPE_CHECKOUT_ENABLED, NEXT_PUBLIC_CHECKOUT_ENABLED) must match; production needs live-prefixed Clerk and Stripe keys. | read in the code | `scripts/env-doctor.mjs:567-600` |
| Paid upgrades are open to an account only if AGI_BILLING_WAITLIST_OPEN=1 or the billing.upgrades_open flag serves 'on' for that user; any read failure answers closed. | read in the code | `apps/web/lib/server/billing-waitlist-access.ts:29`; `apps/web/lib/feature-flags/billing-upgrade-gate.ts:12-36`; `apps/web/lib/feature-flags/billing-upgrades.ts:4` |
| Native store purchases stay disabled (MOBILE_IAP_ENABLED=false) until real Apple and Google product ID maps and verification credentials are set. | read in the code | `apps/web/.env.example:280-305`; `apps/web/.env.local.example:36-40` |
| Runtime feature flags are database rows with variants, rules, kill-switch bit, maturity and channel; key families include capability.*, model.*, provider.*, tenant.lockdown, routing.*, decision.*, billing.upgrades_open. | read in the code | `apps/web/lib/feature-flags/kill-switches.ts:9-12`; `apps/web/lib/feature-flags/routing-flags.ts:10-16`; `apps/web/lib/feature-flags/flag-store.ts:20-33` |
| Flag tunables FEATURE_FLAG_DEFINITION_CACHE_TTL_MS, FEATURE_FLAG_STALE_AFTER_DAYS, FEATURE_FLAG_STALE_CLEANUP_BATCH have defaults 30000, 60, 25 and bounded ranges; bad values keep defaults. | read in the code | `apps/web/lib/feature-flags/flag-config.ts:3-37` |
| AGI_FREE_LANE_MODE accepts off, shadow, prefer, strict; default and invalid values resolve to off. It is read via a constant so the literal-read env contract scan does not see it. | read in the code | `apps/web/lib/services/free-lane/mode.ts:3-32`; `apps/web/.env.example:889` |
| Object storage is S3-compatible and provider-neutral (AGI_STORAGE_*), with Cloudflare R2 names kept as a fallback; a separate private bucket is required for generated media and attachments. | read in the code | `apps/web/.env.example (storage block)`; `packages/platform/object-storage/src/config.ts:7`; `apps/web/lib/validate-env.ts:494` |
| In production every upload is refused with no scanner configured unless UPLOAD_SCAN_REQUIRED=false; the scanner token must match on both sides and be at least 32 characters. | read in the code | `apps/web/.env.example:174-185`; `services/upload-scanner/.env.example` |
| OpenTelemetry export is off unless AGI_OTEL_EXPORTER_ENDPOINT is set; the same names serve web and signaling service. | read in the code | `apps/web/.env.example (observability block)`; `services/signaling-server/.env.example (OTEL block)` |
| Production environment drift is reconciled against env-doctor contracts every 6 hours by a CI workflow using Vercel API credentials. | read in the code | `.github/workflows/env-drift.yml:3-6,34-50`; `scripts/check-env-drift.mjs:9-35` |
| CLI reads configuration from ~/.agiworkforce/config.toml (override dir AGIWORKFORCE_HOME), merges project config, and never loads .env; telemetry is read from global config only. | read in the code | `apps/cli/src/config.rs:11-35,481`; `apps/cli/.env.example:1-3` |
| Mobile production builds use EAS environment variables (EXPO_NO_DOTENV=1); APP_ENV must equal EXPO_PUBLIC_APP_ENV and preview/production need a live Clerk key. | read in the code | `apps/mobile/eas.json base env`; `apps/mobile/.env.example:3-16`; `scripts/env-doctor.mjs mobile scope` |
| The free-model promotion JSON window ended 2026-10-24, before today's date 2026-11-24, so the file is a past window. | read in the code | `apps/web/config/free-model-promotion.json (startsAt, endsAt)` |
| VS Code settings live under agiWorkforce.* in package.json contributes.configuration (examples: apiEndpoint, model, cliPath, inlineCompletions.enabled, telemetryEnabled, memory.enabled). | read in the code | `apps/extension-vscode/package.json contributes.configuration` |
| Desktop Electron main ignores AGI_CLOUD_APP_ORIGIN when packaged and only accepts localhost or agiworkforce.com hosts. | read in the code | `apps/desktop/electron/config.ts:62-80,45-52` |
| Provider keys on the web server are managed-cloud keys; routing breakers, lockouts and canary/shadow stages are tuned by AGI_ROUTE_*, AGI_MODEL_LOCKOUT_*, AGI_CREDENTIAL_COOLDOWN_*, AGI_ROUTING_* names. | read in the code | `apps/web/.env.example:311-347,851-1003` |

## Open questions

- Does the production deployment set AGI_ENFORCE_PRODUCTION_CONFIG=1? The code allows either; the example calls it an owner decision.
- Which feature flags exist as database rows in production? Only key families are visible from code.
- Is AGI_FREE_LANE_MODE covered by the config-key registry or the scripts/config/config-keys.json baseline? It is missing from the example file's key list and from documentedKeys.
- How do the env price names (basic, pro, max, max_20x, team, enterprise) map to customer-facing plan names, given the product direction to rename plans?
- Which env names does the Tauri or Rust desktop code read, and does the desktop have a config file beyond .env and electron/config.ts?
- Which apps use mode:own-key at runtime beyond the CLI BYOK keys? Web BYOK handling (lib/byok-providers.ts) was not opened.
- The product choice on whether EEA blocking (AGI_BLOCK_EEA_TRAFFIC) runs in production is undecided in code; the example ties it to the EU representative question.
- None of the doctor, drift or guard commands were run for this page; their current pass state is unknown.

## Project documents found out of date

- `README.md (environment table, lines 246-250)`: The table of tracked example files lists Desktop, Web, Mobile, Chrome extension and Signaling only. The code says: apps/cli/.env.example and services/upload-scanner/.env.example are also tracked, and scripts/env-doctor.mjs defines cli and scanner scopes. (scripts/env-doctor.mjs contracts keys: desktop, web, mobile, extension, cli, signaling, scanner)
- `apps/web/.env.example (comment near NEXT_PUBLIC_FREE_LANE_UI, line 889)`: It refers to the server's AGI_FREE_LANE_MODE but never lists that name as an entry, although its header says every name the source reads appears there. The code says: AGI_FREE_LANE_MODE is read through FREE_LANE_MODE_ENV in apps/web/lib/services/free-lane/mode.ts and is not in documentedKeys in scripts/env-doctor.mjs. (apps/web/lib/services/free-lane/mode.ts:3,32; apps/web/.env.example:889; scripts/env-doctor.mjs web documentedKeys)
- `apps/web/config/free-model-promotion.json`: It describes a promotion window ending 2026-10-24, now past. The code says: The file is still the config the example points at (ANTHROPIC_PROMO_API_KEY comment). Whether code still loads an expired window is not established. (apps/web/config/free-model-promotion.json endsAt; apps/web/.env.example:313-315)
