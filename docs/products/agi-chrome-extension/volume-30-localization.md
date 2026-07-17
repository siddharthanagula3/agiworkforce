# AGI Chrome Extension — Volume 30 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md`, and the real surface paths `apps/extension/src/side_panel.ts`, `apps/extension/src/side_panel.html`, `apps/extension/src/options.ts`, `apps/extension/src/content.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/webmcp.ts`, `apps/extension/src/features/content/in-page-panel/`. (Corrected 2026-07-11: `webmcp.ts` lives at the top level of `apps/extension/src/`, not under `features/content/` — that path held a duplicate fork deleted by commit `59c8f4650` for missing security fixes.)

## Overview & stance

This volume covers localization for the **AGI Browser Companion** — the permission-gated browser agent, not a consumer assistant. Two localization domains apply and must not be confused. **Chrome (extension) surface** = the extension's own UI (side panel, options, in-page panel): buttons, labels, dates, and number strings the extension renders. **Page content** = the untrusted, arbitrary-language text the agent reads from and acts on across sites. The product stance and trust boundary reshape both. The extension **holds no provider keys and runs no inference** (per `apps/extension/AGENTS.md`); any language work that needs a model — content translation, transliteration — must egress through the thin bridged chat (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the desktop native bridge, never a provider host contacted directly. Model choice for such calls is server-gated by plan (Free / Basic $7·₹399 / Pro $20 / Max $100 & $200 / Team $30-seat / Enterprise) and model IDs come only from `packages/contracts/types/src/models.json`. Localization must never become a covert exfiltration channel: page text sent for translation crosses the same allowlist + redaction gate as any other page capture. Today the extension ships **English-only UI** (`<html lang="en">` is hard-coded in `apps/extension/src/side_panel.html` and `options.html`); there is no `_locales/` directory and no `chrome.i18n` usage. Most parity here is therefore 🔭.

## RTL

Right-to-left layout is not yet supported in the extension UI. No `dir` attribute is set on the side panel, options page, or in-page panel roots, and layouts assume LTR flex flow. **🔭 Planned.** Target: set `dir="auto"` (or resolve from the negotiated UI locale) on UI roots; use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`) so mirroring is automatic; ensure the composer, drawer slide (`transform: translateX(...)` in `apps/extension/src/side_panel.ts`), and toggle affordances mirror. Requirement: rendered agent output and page-derived snippets carry `dir="auto"` so RTL page content (Arabic, Hebrew, Farsi) displays correctly regardless of UI direction.

## LTR

LTR is the only direction rendered today and it renders correctly: the side panel and options use standard LTR flex layouts and system font stacks (`apps/extension/src/side_panel.ts`, `apps/extension/src/options.ts`). **✅ Built** for LTR. Requirement carried forward: LTR must stay the tested default; when RTL lands, LTR must not regress. Mixed bidi runs (an LTR UI showing an RTL page quote, or vice versa) must isolate with Unicode bidi isolation (`dir="auto"` / `<bdi>`) so surrounding punctuation does not reorder — this is 🔭.

## Dates

The extension formats timestamps with locale-aware `Intl`-backed APIs but passes an **empty locale array**, so it uses the browser's runtime default locale — e.g. `new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` and `d.toLocaleDateString([], { month: 'short', day: 'numeric' })` (`apps/extension/src/side_panel.ts` message timestamps ~L2620, relative time ~L4283-4284, shortcut created-at ~L6897). **🟡 Partial** — the gap is that there is no explicit locale selection, no user override, and month/day formats are fixed option objects rather than fully locale-resolved. Target: resolve dates against the negotiated UI locale and expose a 12h/24h and short/long preference; never hand-roll `MM/DD` string concatenation.

## Time Zones

There is no explicit time-zone handling. `new Date()` and the `toLocale*` calls above resolve against the **host machine's time zone**, and scheduled recurring tasks fire via `chrome.alarms` (see `apps/extension/src/features/background/tasks.ts`) in host-local wall-clock time. **🟡 Partial.** Gap: no stored or displayed IANA zone, no DST-safe scheduling contract, no "task will next run at <time> <zone>" label. Target 🔭: persist an IANA zone with each scheduled task, render next-run times with an explicit zone abbreviation, and document DST rollover behavior. Time zone is device-scoped only — like all extension history it lives in `chrome.storage.local` and is never synced (canon: no consumer sync).

## Numbers

No `Intl.NumberFormat` usage exists in the extension source; numeric values (counts, durations, sizes) render via default string coercion. **🔭 Planned.** Target: format user-facing counts, byte sizes (e.g. the `MAX_CONTEXT_HTML_CHARS` 100 KB cap surfaced in UI), and durations with locale-aware grouping and units. Prices/entitlements are **not** in scope — there is no in-extension checkout or billing (canon); paywall copy is rendered from server `429 {kind:'paywall', requiredTier}` responses, so any currency/number formatting there is the server's responsibility, and INR values must never be invented in the client.

## Unicode

Unicode handling is the most mature area, driven by security rather than presentation. `sanitizePageText` strips invisible/deceptive Unicode via the single-source-of-truth `INVISIBLE_UNICODE_RE` (zero-width, bidi-override, and tag-block ranges `\u{E0000}-\u{E007F}`) then redacts secrets before any page text is sent to the model (`apps/extension/src/background/policy.ts` L437-449; applied in `apps/extension/src/content.ts` L107-111). WebMCP tool names are rejected if they carry visually deceptive Unicode or CSS metacharacters via `isValidToolName` (`apps/extension/src/webmcp.ts` L28, chrome-MED-5). Whitespace (including ` `) is collapsed in extraction paths (`content.ts` L108, `in-page-panel/pageActions.ts`). **✅ Built** for injection-defense sanitization. Gap 🔭: no NFC/NFKC normalization for _display_ consistency (composed vs decomposed forms) and no grapheme-cluster-aware truncation, so slicing (`.slice(0, TOOL_DESCRIPTION_MAX_CHARS)`) can split emoji/combining sequences.

## Fonts

The UI relies entirely on **OS-provided font stacks** — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` and monospace stacks (`'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace`) in `apps/extension/src/side_panel.ts` (~L303, L547), `apps/extension/src/features/content/in-page-panel/panelStyles.ts` L19, and `apps/extension/src/options.ts` L27. No web fonts are bundled or fetched: the MV3 CSP `default-src 'self'` with an enumerated `connect-src` (no remote `font-src`) blocks remote font loading (`apps/extension/manifest.json`, `MANIFEST_NOTES.md`). **✅ Built** — CJK, Cyrillic, Arabic, Indic glyph coverage inherits from the user's OS. Gap 🔭: no bundled fallback for hosts missing a script's glyphs (tofu risk); document that glyph coverage is a host responsibility.

## Translation

**Content** translation is built: the `/translate` slash command (`apps/extension/src/side_panel.ts` ~L2954, "translate to English; if English, to Spanish", plus free-form `/translate to French`) and the context-menu translate action (`side_panel.ts` ~L7251) route captured page text through the bridged chat to a model — the extension never translates locally and holds no keys. **✅ Built** (content translation). **UI-string** translation is not built: no `_locales/`, no `chrome.i18n.getMessage`. **🔭 Planned** — externalize all extension strings into message catalogs, negotiate locale from `chrome.i18n.getUILanguage()`, and keep translated strings device-local. Translation requests obey the egress rule: page text crosses the allowlist + redaction gate first, and model selection is plan-gated with IDs from `models.json` only.

## Repository map

- `apps/extension/src/side_panel.ts` — date/time formatting, `/translate`, context-menu translate, LTR layout, fonts.
- `apps/extension/src/side_panel.html`, `apps/extension/src/options.html` — hard-coded `lang="en"`.
- `apps/extension/src/options.ts`, `apps/extension/src/features/content/in-page-panel/panelStyles.ts` — font stacks.
- `apps/extension/src/background/policy.ts` — `INVISIBLE_UNICODE_RE`, `sanitizePageText`.
- `apps/extension/src/content.ts`, `apps/extension/src/features/content/in-page-panel/pageActions.ts` — whitespace/Unicode normalization on capture.
- `apps/extension/src/webmcp.ts` — `isValidToolName` (deceptive-Unicode rejection).
- `apps/extension/src/features/background/tasks.ts` — scheduled-task timing (host-local).
- `apps/extension/manifest.json`, `apps/extension/MANIFEST_NOTES.md` — CSP blocking remote fonts.

## Competitor notes

Claude for Chrome, ChatGPT, and Codex localize their own chrome via managed catalogs and ship model-driven content translation. AGI's deliberate divergence: the browser companion is **local-first and key-less** — content translation is a permission-gated, redaction-first capability that egresses only through the bridge/gateway, never a direct provider call, and the model is multi-provider and plan-gated (IDs from `models.json`). UI localization is device-scoped and never synced, unlike competitors' account-synced preferences. Unicode handling is hardened as an anti-prompt-injection surface (invisible-character stripping, deceptive-name rejection) rather than a pure display concern — a divergence rooted in the browser-agent threat model (`THREAT_MODEL.md`).

## Acceptance / Definition of Done

Production-ready when: UI strings are externalized and locale-negotiated; dates/times/numbers use the resolved locale with explicit user overrides; time zones are stored/displayed per scheduled task; RTL mirrors via logical properties without LTR regression; Unicode display normalization and grapheme-safe truncation land alongside the existing security sanitization.

- [ ] Build: `_locales/` catalogs exist; no user-facing string is hard-coded; RTL and LTR snapshots pass.
- [ ] Trust: content translation crosses allowlist + `sanitizePageText`; no provider host contacted from the extension; model IDs sourced from `models.json`; UI locale never synced (device-scoped `chrome.storage.local`).
- [ ] Security: `INVISIBLE_UNICODE_RE` + `isValidToolName` coverage retained; bidi-override and tag-block strips regression-tested; grapheme-safe truncation verified.

## Anti-patterns

- Do not translate or run inference in the extension, or contact a provider host directly — bridge/gateway only.
- Do not send page text to any translation model before the allowlist + redaction gate.
- Do not invent model IDs, INR prices, routes, or env vars; no `Plus`/`pro_plus`/`Hobby` tiers; never reference Supabase.
- Do not hand-roll date/number strings when `Intl` exists; do not slice UTF-16 mid-grapheme.
- Do not sync locale, time-zone, or history preferences; extension state stays device-scoped.
- Do not weaken invisible-Unicode stripping for "prettier" display — it is a prompt-injection defense.
