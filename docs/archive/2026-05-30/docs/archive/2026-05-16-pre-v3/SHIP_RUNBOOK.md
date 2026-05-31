# Ship runbook — paid Hobby + 3 listings

**Created:** 2026-05-08 after the marketing redesign shipped on `origin/main` at `5f454e1b2`.

**Premise:** The marketing site is fully redesigned, every legal/auth/help/marketing route on the new theme, production build clean. The four operational items below are what's between today and a real public ship of the paid Hobby tier + the three external listings. Each section is self-contained: exact commands, what to verify, what to do if it fails. None of these need engineering decisions — they need your credentials and a real terminal.

Order them by impact: **Stripe first** (unblocks paid revenue), then **listings** (in parallel, since each has 1–7 days of external review wait).

---

## 1 — Apply Stripe RPC migrations to production Supabase

**What's true today.** The canonical `supabase/migrations/` directory now contains:

- `20260505000006_stripe_integration.sql` — base Stripe tables + indexes.
- `20260505000007_stripe_webhook_idempotency.sql` — defines `process_stripe_event_idempotent` RPC.
- `20260506060000_lockdown_definer_functions.sql` — hardens the RPC's `SECURITY DEFINER` posture.

The webhook at `app/api/stripe-webhook/route.ts:1251` calls the RPC by name. Filesystem state matches the call site. **What's missing is the production-DB application** — until then, the first paid Hobby subscription will hit a missing-RPC error, and the webhook will return 500.

**Verify which migrations production has applied.** From repo root:

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db remote commit --dry-run    # shows pending migrations vs prod
```

If the three Stripe migrations show as pending — they need to be applied.

**Apply them.** Same shell:

```bash
supabase db push    # applies pending migrations to remote
```

This is **idempotent** if any are already partially applied (Postgres `CREATE OR REPLACE FUNCTION` semantics in the migration), but read the output carefully. If you see `already exists` errors, those are safe; if you see `permission denied` or `relation does not exist`, stop and investigate before retrying.

**Smoke-test the webhook.** From the Stripe Dashboard → Developers → Webhooks → `agiworkforce.com/api/stripe-webhook` endpoint:

1. Click **Send test webhook** → pick `customer.subscription.created` → send.
2. Open Vercel logs for the `/api/stripe-webhook` route.
3. Expected: 200 response, log line `process_stripe_event_idempotent: inserted` or similar.
4. Resend the same event. Expected on second send: 200 response, log line indicating the event was a duplicate (idempotency working).

If the webhook returns 500 with `function process_stripe_event_idempotent does not exist`, the migration didn't apply — re-run `supabase db push` and check `pg_proc` directly:

```bash
supabase db remote sql --remote-only "SELECT proname FROM pg_proc WHERE proname = 'process_stripe_event_idempotent';"
```

**Update the SSOT.** Once the smoke-test passes, edit `AGI_WORKFORCE.md` line ~188:

```diff
- **Paid Hobby launch: NO-GO** until Stripe RPC migration applied + verified against production DB.
+ **Paid Hobby launch: GO** as of 2026-05-XX. Stripe RPC verified end-to-end via test webhook.
```

That single line change is what unlocks the marketing claim that's already on `/pricing`.

**Time budget:** 30–60 minutes including the smoke-test.

---

## 2 — Chrome Web Store submission

**Artifact.** `apps/extension/extension.zip` exists, last built 2026-05-05, 116,792 bytes, 30 files, no source maps. **Rebuild before submission to capture any recent fixes:**

```bash
pnpm --filter @agiworkforce/extension build
pnpm --filter @agiworkforce/extension package
ls -la apps/extension/extension.zip      # verify size + date
unzip -l apps/extension/extension.zip    # spot-check no source maps, no .DS_Store
```

**Listing copy** — paste into the Chrome Web Store Developer Dashboard.

```
Name (max 75 chars):
AGI Workforce — multi-provider AI for every webpage

Short description (max 132 chars):
A side panel for any tab. Read the page, ask a question, get a tool call back. 10+ AI providers in one chat thread. BYOK supported.

Detailed description:
AGI Workforce is the side panel that lives on top of any tab. Read the page you're on,
ask a question, get a tool call back — and do it across ten cloud providers and two
local LLM runtimes, all in one chat history.

What it does
- Side panel chat alongside any webpage. Quick-access popup for one-off questions.
- Platform assistants: context-aware on Slack, Gmail, Google Calendar, Google Docs,
  GitHub.
- Job autofill: one-click application autofill on LinkedIn and Lever.

Where the work happens
The extension is the UI; your desktop is the brain. Native messaging on
localhost:8787 routes intent from the browser to the AGI Workforce desktop process.
Model traffic happens on your desktop with full BYOK or local-mode access. No model
runs in the browser. No keys leave the browser process.

Privacy
We do not train on your data. In BYOK mode your prompts go from your client to
the provider — we don't see, log, or store them. The extension speaks only to
your local desktop process and the active tab you've opened.

For more
- Pricing: https://agiworkforce.com/pricing
- Privacy: https://agiworkforce.com/privacy
- Source: https://github.com/siddharthanagula3/agiworkforce

Category:        Developer Tools
Languages:       English
Visibility:      Public
```

**Permissions justification** — paste into the "Single Purpose / Permission justification" fields.

```
Single purpose:
Provide multi-provider AI chat alongside any webpage, with optional bridge to a
local AGI Workforce desktop process for full computer-use capabilities.

activeTab: read the active tab's URL/title to ground the assistant's answer.
storage: persist user preferences and provider-key references locally (encrypted).
nativeMessaging: bridge to the AGI Workforce desktop process on localhost:8787.
sidePanel: render the chat panel.
host_permissions ("<all_urls>"): platform assistants need to attach on supported
sites (Slack, Gmail, Calendar, Docs, GitHub, LinkedIn, Lever) — not for telemetry.
```

**Screenshots needed** — five at 1280×800 OR ten at 640×400. Capture from the live extension on a laptop:

1. Side panel open on a Gmail thread, model picker visible.
2. Side panel open on a GitHub PR, agent reading the diff.
3. Popup mode on any page.
4. LinkedIn autofill working.
5. Settings panel showing provider list with BYOK keys listed (mask key prefixes!).

**Privacy practices form** — answers:

- "Does your extension collect personally identifiable information?" → **No** (BYOK keys stay local).
- "Does it transmit user data to remote servers?" → **Only to user-configured providers** (BYOK passthrough) **and the user's own localhost desktop**.
- "Is data encrypted in transit?" → **TLS 1.3**.

**Time budget:** 1–2 hours of form-filling + screenshotting + verification. CWS review is typically 1–3 days.

**Watch for:** the `nativeMessaging` permission triggers extra review. Per the SSOT memory, the `com.agiworkforce.browser.json` host manifest is currently absent from the repo — if CWS asks for proof of the native host, you'll need to ship the host manifest as part of the desktop installer (out of scope for the extension submission itself).

---

## 3 — VS Code Marketplace submission

**Artifact.** `apps/extension-vscode/agi-workforce-0.3.0.vsix`, 309,055 bytes, last built 2026-05-05. **Rebuild before submission:**

```bash
pnpm --filter agi-workforce build
pnpm --filter agi-workforce package        # produces a fresh .vsix
ls -la apps/extension-vscode/agi-workforce-*.vsix
```

**Publisher account.** Marketplace publishing requires a Personal Access Token from `https://dev.azure.com`. If you haven't set one up:

```bash
# Install vsce globally if not already
npm install -g @vscode/vsce

# Create publisher (one-time, if not yet created)
vsce create-publisher agi-workforce      # or your preferred publisher name

# Login with your PAT (Azure DevOps PAT with "Marketplace > Manage" scope)
vsce login agi-workforce
```

**Publish.**

```bash
cd apps/extension-vscode
vsce publish                              # publishes the version in package.json
# OR upload the .vsix manually at https://marketplace.visualstudio.com/manage
```

**Listing copy** is largely driven by `apps/extension-vscode/package.json` and `apps/extension-vscode/README.md`. Verify these read well before publishing:

- `displayName`: should be `AGI Workforce — Multi-provider AI`
- `description`: matches what the marketplace shows
- `categories`: include `["Programming Languages", "Snippets", "Other"]` or just `["Other"]` — VS Code is strict about categories
- `keywords`: `["ai", "byok", "multi-provider", "claude", "gpt", "gemini", "agent", "completions"]`
- `repository.url`: must be present
- `icon`: 128×128 PNG referenced in package.json
- `README.md` is the marketplace landing page — make sure it's the new-design voice (no banned phrases, no model IDs, no version numbers)

**Smoke-test after publish.**

1. Open VS Code → Extensions → search "AGI Workforce". Confirm it appears.
2. Install. Activate (`@agi` in Copilot Chat, or one of the slash commands).
3. Try `/explain` on a real selection. Confirm BYOK provider works.

**Time budget:** 30 minutes if your PAT is set up, 1–2 hours if not. Marketplace approval is usually instant for already-known publishers.

---

## 4 — Mobile App Store + Play Store

**Status from SSOT:** Expo build profiles (dev / preview / prod) ready. iOS bundle ID `com.agiworkforce.app`, iOS min 15.1 (SDK-derived). 43 screens. Cloud mode only — local mode is desktop-only.

**Build for stores via EAS.**

```bash
cd apps/mobile
pnpm eas build --platform ios --profile production
pnpm eas build --platform android --profile production
```

Each build takes ~15–30 minutes on EAS infrastructure. You'll get a signed `.ipa` and `.aab` artifact when done.

**Submit via EAS:**

```bash
pnpm eas submit --platform ios     # uses Apple App Store Connect creds
pnpm eas submit --platform android # uses Google Play Console creds
```

**Apple App Store Connect — listing copy:**

```
App name (max 30):
AGI Workforce

Subtitle (max 30):
Multi-provider AI dispatch

Promotional text (max 170):
Your phone runs the chat. Your desktop runs the agent. Switch between Claude, GPT,
Gemini and 7+ more providers in one thread.

Description (max 4000):
AGI Workforce is the mobile companion for the AGI Workforce desktop app. Compose a
task on your phone; your desktop runs it with full computer-use access — files,
browser, terminal, screen — and the trace streams back to your phone over Realtime.

What's inside
- Multi-provider AI: 10+ wired providers, switch mid-conversation, history travels.
- Bring Your Own Keys (BYOK): pay providers directly, zero markup, encrypted on
  device with biometric authentication.
- Cross-device: chats sync to desktop and web via Supabase Realtime (cloud mode).
- Dispatch: send a long-running task to your desktop, watch progress live.

What's not on mobile
Local mode (Ollama / LM Studio) is desktop-only — running an LLM on a phone is
neither practical nor a good idea.

Privacy
We do not train on your data. BYOK provider traffic goes from your client direct
to the provider. The mobile app speaks only to your account's Supabase instance
and your dispatched desktop.

Categories:        Productivity, Developer Tools
Age rating:        4+
Languages:         English
Pricing:           Free (with optional Hobby subscription via web)
```

**Privacy nutrition labels (Apple):**

- Data linked to user: contact info (email), identifiers (account ID), usage data (aggregated)
- Data not linked: prompts, responses, files (BYOK keeps them between you and the provider)
- Data not collected: location, contacts, browsing history

**Google Play — listing copy:** identical to Apple's description, plus:

- Short description (max 80 chars): `Multi-provider AI on your phone. Dispatch tasks to your desktop agent.`
- Content rating: Everyone
- Target audience: 13+
- Data safety form mirrors Apple's privacy nutrition labels

**Time budget:** 2 hours of form-filling per store + 1–7 days of review. **Both reviews can run in parallel.**

**Gating concern from SSOT:** "desktop has zero implementation of `dispatchHmac`/`dispatchSalt`; transitional unsigned-message path expires 2026-06-05." If you ship mobile with the unsigned path, you have until 2026-06-05 to ship the desktop listener; otherwise turn off Dispatch on mobile via feature flag for the launch window.

---

## What I am NOT recommending

- **Lawyer review of `/privacy` and `/terms`.** These are plain-language drafts I wrote during the redesign. They're reasonable but not lawyer-vetted. You don't need a lawyer for the marketing site to _exist_ — but you do need one before signing your first paid Enterprise MSA. The fact that paid signup is currently blocked (item 1) buys you time. Schedule the lawyer for after item 1 ships, before the first paying customer.
- **Chat product UI redesign.** Per your `A` decision earlier, the chat product keeps its own theme. That's the right call. Don't let scope creep here pull you back into a multi-day project right after a marketing redesign just shipped.

---

## Sequencing

```
Day 0 (today):    Apply Stripe migrations → smoke test → flip /pricing claim true.   (1 hour)
Day 0 (parallel): Submit CWS + VS Code Marketplace + start EAS builds for mobile.    (4 hours)
Day 1–7:          Wait on external review. Use the time to schedule lawyer review of
                  /privacy and /terms before paid customers come in.
Day ~7:           Listings live. Mobile listings need active App Store Connect work
                  (TestFlight beta, internal testing track on Play) before public push.
```

Net effect: **paid Hobby unblocked today**, three external listings in flight today, public on all three within a week.
