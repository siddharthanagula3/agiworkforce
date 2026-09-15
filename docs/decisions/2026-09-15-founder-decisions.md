# Founder decisions, 2026-09-15

Status: Current
Owner: Founder, recorded by Fable (architect)
Last updated: 2026-09-15

The founder's answers of 2026-09-15 to the open product, privacy, security,
reliability, billing, connector, QA and policy questions, in the living
decision model's shape (`2026-09-05-living-decision-model.md`). They close
D-2026-09-10-01 and D-2026-09-10-02 in `2026-09-10-managed-gateway-routes.md`.

## Governing rule

ChatGPT and Claude behaviour is the product benchmark; AGI Workforce shared
abstractions are the implementation; models and providers are interchangeable
underneath. For every product, UX, security, permission, account, billing,
client, connector, memory, project, artifact, research, voice, computer-use or
agentic decision: research what ChatGPT and Claude do first; where they
converge, that is the default unless there is a concrete reason not to; where
they differ, choose what fits our architecture; replicate the behavioural
pattern, never the proprietary implementation; never add an OpenAI, Anthropic,
Google, Vercel, OpenRouter, Clerk, database, cloud or model dependency because
a reference product uses it; keep model-specific behaviour behind the shared
provider and model abstractions so a provider is replaceable without a
redesign; prefer the AGI Workforce account, subscription, entitlements,
sessions, memory, projects, tools and cross-device identity over another AI
company's consumer subscription. A decision the leaders' common behaviour
answers is made autonomously and documented; `docs/work/founder-assistance.md`
holds only credentials, money, legal approval, signatures, external accounts,
irreversible production actions, and product choices without a useful leader
precedent.

Standing product rule: as polished and low-friction as ChatGPT and Claude
while model, provider and cloud neutral; one AGI subscription across web,
mobile, desktop, CLI, VS Code and the browser extension; safe read-only
operations automatic; consequential external actions ask; privacy never
silently weakened for cost or availability; unsupported or incomplete
capabilities hidden or clearly unavailable, never presented as working.

## D-2026-09-15-01 Tool approvals

- Decision: in the default, read-only mode, sandboxed code execution, web
  search, page fetch and read, local analysis and other non-mutating tools run
  without asking. External writes, purchases, messages, destructive actions,
  credential changes, consequential command execution on the user's real
  machine and other meaningful side effects keep asking.
- Why: ChatGPT and Claude run sandboxed code and search without a prompt;
  interrupting ordinary analysis reads as friction, not safety.
- Closes: D-2026-09-10-02.
- Follow-through: `apps/web/shared/types/toolApprovalPolicy.ts`, the
  Capabilities copy and banners, the CLI and VS Code read-only mode.

## D-2026-09-15-02 Auto-memory

- Decision: model-assisted automatic memory extraction is on
  (`AGI_MODEL_MEMORY_EXTRACTION=1`) on the cheapest reliable utility model
  through the neutral routing layer; temporary chats, Memory-off sessions,
  API and ZDR traffic and the other excluded surfaces stay excluded; usage is
  metered normally and extraction fails safe.
- Why: both leaders extract memories automatically; a regular-expression
  extractor is not the product.
- Closes: the AGI-29 founder question.

## D-2026-09-15-03 Localization

- Decision: offer English plus only languages that are complete and reviewed
  (Spanish may stay if it is complete); hide incomplete languages instead of
  showing a mostly English interface; every client follows the account
  language where supported with English as the deterministic fallback; the
  catalogue is shared, never hardcoded per client; further languages are
  model-translated, then human-reviewed, before they become selectable.
- Why: a half-translated interface reads as unfinished; the leaders ship only
  complete languages.
- Follow-through: the selectable set in the shared i18n package and the
  language control; the translation batch and its review loop; the client
  wiring in the release doc's F89.

## D-2026-09-15-04 Desktop product

- Decision: Electron is the public AGI Workforce desktop application.
  `/desktop`, downloads, documentation, release APIs and marketing describe
  Electron; Tauri is not a second public product; Tauri engine claims and the
  Tauri Linux AppImage leave the public default download flows; computer use
  is advertised only where the Electron implementation supports it; Tauri
  code stays only while it has internal value and never creates ambiguity.
- Why: one desktop story, like the leaders.
- Derived (leader precedent, decided autonomously): the installed application
  carries the surface name the site uses, AGI Desktop, the way the leaders'
  desktop apps carry their product names. The Electron package is currently
  named after the hosted trust mode, which overloads that term; the rename is
  an engineering item verified by a packaged build, not a copy change.

## D-2026-09-15-05 CLI authentication

- Decision: the ChatGPT-subscription OAuth flow built on OpenAI's client is
  removed. `agi login` authenticates the AGI Workforce account and uses its
  subscription; `agi login openai` (and each other provider) only enters that
  provider's API key under the optional Your Key path; VS Code and the CLI
  work from AGI Pro or Max without a separate OpenAI, Anthropic or Google
  subscription.
- Why: the AGI account is the identity; another company's consumer plan is
  not.

## D-2026-09-15-06 Zero-price OpenRouter routing

- Decision: keep the privacy-safe behaviour: explicit selections send
  `data_collection: deny`; training-enabled upstreams are never permitted
  because a plan is paid; without a privacy-compatible endpoint the route
  fails honestly or falls back; the company OpenRouter privacy settings match.
- Why: privacy is not a paid feature to be traded for cost.

## D-2026-09-15-07 Managed gateways

- Decision: routing stays provider-neutral and is never architected around one
  gateway. DeepSeek and Moonshot take option (b): their routes go through the
  managed routing harness with several transports and fallbacks rather than
  being deleted. A gateway serves managed customers only once its commercial
  terms permit the use case and its data handling meets requirements;
  unapproved routes stay unavailable.
- Closes: D-2026-09-10-01.

## D-2026-09-15-08 MiniMax and Groq

- Decision: no unservable model in the catalogue. Groq stays a backend
  provider option where it helps cost, latency or resilience, credentialed
  accordingly; no Groq-only models for the sake of count unless they pass the
  quality criteria. MiniMax stays out of managed production until its terms
  are reviewed and accepted, then joins through the neutral layer.

## D-2026-09-15-09 Managed Cloud plan-tier gate

- Decision: bind the calling surface into a trusted Clerk custom session
  claim; never trust the caller-controlled `x-agi-surface`; normal CLI,
  extension and IDE users do not mint extra credentials; the billing-bypass
  residual is not accepted.

## D-2026-09-15-10 Dispatch pairing

- Decision: QR stays the default pairing; manual pairing is manual entry
  verified by a short authentication string; relay-trusted manual pairing is
  out; a near-term `DISPATCH_HMAC_REQUIRED_AFTER` forces re-pairing once the
  secure implementation ships.

## D-2026-09-15-11 TLS pinning

- Decision: pin AGI-controlled production hosts with at least the issuing CA
  and root (never a leaf alone); never hard-pin OpenAI or Anthropic
  infrastructure; staged report-only rollout before enforcement, failing safe.

## D-2026-09-15-12 Minimum age

- Decision: refuse account creation and use below the legally applicable
  regional threshold at launch; no parental-consent system now; counsel
  confirms the thresholds and the region detection; verified parental consent
  can follow if the business needs younger users.

## D-2026-09-15-13 Moonshot identifier incident

- Decision: rotate the Moonshot credential if rotation is inexpensive, correct
  forward, and rewrite history only if an actual secret value is found to have
  been committed.

## D-2026-09-15-14 Mobile crash reporting

- Decision: enable production crash reporting (Sentry or the compatible
  abstraction) with aggressive scrubbing: no prompts, conversation content,
  attachments, keys or tokens, sensitive bodies or unnecessary PII; update the
  privacy and store disclosures; keep telemetry provider-neutral.

## D-2026-09-15-15 Local Desktop Tasks model

- Decision: the benchmark and validation system picks the smallest locally
  runnable model that passes the Desktop Tasks tools and agentic matrix on the
  16 GB target; pin its exact tag or digest; if none passes, Local Tasks stays
  disabled.

## D-2026-09-15-16 Search allowances

- Decision: Free 20 included searches per 30 days; paid interactive chat 300;
  API, CLI, VS Code, agents, AGI Work and deep research meter provider search
  cost by the existing policy; limits stay config and catalogue driven; the
  duplicate withdrawn migration is never applied.

## D-2026-09-15-17 Stripe live cutover

- Decision: prepare everything now; cut over only when the release-blocking
  billing, database and QA checks are green; the code catalogue is canonical;
  contradictory Stripe prices are retired; one real low-value checkout with
  provisioning and a refund verifies the cutover.

## D-2026-09-15-18 India

- Decision: no fragile India-specific recurring billing to claim worldwide
  support; until Razorpay, accountant and legal questions are resolved, Max
  15x and Team are invoice or assisted-sales only or unavailable for
  self-serve recurring purchase in India; no INR top-up conversion apart from
  the global credit economics; lower plans only through confirmed-compliant
  payment mechanisms.

## D-2026-09-15-19 Anthropic

- Decision: fund the production account with auto-reload and spend alerts;
  keep routing fallback and degradation regardless.

## D-2026-09-15-20 Connectors

- Decision: launch does not wait for every registration; Google Workspace,
  Microsoft 365, Slack, GitHub, Linear and the other ready, high-demand
  integrations come first; unregistered connectors show Needs setup, Coming
  soon or unavailable and never pretend to connect; one OAuth and MCP
  abstraction.

## D-2026-09-15-21 QA accounts

- Decision: dedicated QA accounts, never the founder's personal paid account,
  for destructive or metered tests; the QA user gets a normal
  native-compatible sign-in, a real or test workspace and a paid test
  entitlement; credentials gitignored and out of logs.

## D-2026-09-15-22 Preview versus production verification

- Decision: preview deployments first for destructive or uncertain checks;
  production deployment is approved once tests are green and release blockers
  cleared; unit or source coverage is never called production-verified.

## D-2026-09-15-23 Database migrations

- Decision: rehearse the pending sequence on a Neon branch; when rehearsal,
  status and dependent tests are clean, apply the required migrations to
  production in order before deploying code that depends on them; never apply
  duplicate or withdrawn migrations; preserve rollback.

## D-2026-09-15-24 Signed releases

- Decision: public CLI and Electron releases use the signed workflows; no
  advertised download or install path whose signatures or assets are missing;
  Homebrew and install docs point only at public, verifiable assets.

## D-2026-09-15-25 Policy revision dates

- Decision: update the privacy and cookie policy revision dates after the
  material corrections and re-consent once if the versioning mechanism
  requires it; counsel may review the notice mechanics afterwards.

## D-2026-09-15-26 Public event

- Decision: `AGI_EVENT_ENABLED=0` until a specific event; an event needs an
  explicit model allowlist, a hard global USD budget, a start instant and an
  end instant; fast, low-cost models for free access; paid entitlements
  independent of event switches.
