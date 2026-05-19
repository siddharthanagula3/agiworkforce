# Surface Verification — Working state of CLI, Desktop, Web, Mobile, Chrome ext, VS Code ext

This document defines what "working" means for each of the 6 shipping surfaces and how to verify it without booting the full product. Pair it with `scripts/verify-surfaces.sh` for the automated gate.

## Surface map

| Surface     | Source                   | Stack                                  | Verify command                                                 |
| ----------- | ------------------------ | -------------------------------------- | -------------------------------------------------------------- |
| CLI         | `apps/cli/`              | Rust + Ratatui TUI                     | `cargo test -p agiworkforce-cli` (~1016 tests)                 |
| Desktop     | `apps/desktop/`          | Tauri v2 + React (Vite) + Rust backend | `pnpm --filter @agiworkforce/desktop {typecheck,test}`         |
| Web         | `apps/web/`              | Next.js 14 (App Router)                | `pnpm --filter web {typecheck,test,build:next-only}`           |
| Mobile      | `apps/mobile/` + `ios/`  | Expo + RN 0.84.0                       | `pnpm --filter @agiworkforce/mobile {typecheck,test}`          |
| Chrome ext  | `apps/extension/`        | MV3 v1.2.0                             | `pnpm --filter @agiworkforce/extension {typecheck,test,build}` |
| VS Code ext | `apps/extension-vscode/` | v0.3.0, @agi participant               | `pnpm --filter agi-workforce {typecheck,test,build}`           |

Each surface produces a different artifact:

- CLI: `~/.cargo/bin/agiworkforce` (5.7MB arm64 binary)
- Desktop: `apps/desktop/src-tauri/target/release/bundle/{macos,linux,windows}/`
- Web: deployed to Vercel at `agiworkforce.com`
- Mobile: EAS build → App Store Connect / Google Play
- Chrome ext: `apps/extension/dist/` → `extension.zip` (~117KB compressed)
- VS Code ext: `*.vsix` → VS Code Marketplace

## What "working" means per surface

### CLI

Working if: `agiworkforce exec "Hello"` returns a streaming response from at least one provider; subcommands listed in `agiworkforce --help` all execute without panic.

22 subcommands (per `models.rs`); 12 named providers + Custom registry.

Smoke test:

```bash
cargo run -p agiworkforce-cli -- exec "say hi"
cargo run -p agiworkforce-cli -- --help | grep -c "^Commands:" # → 1
```

### Desktop

Working if: Tauri app boots; Onboarding wizard renders; user can sign in (cloud mode) OR pick local mode; chat sends + receives a reply; ModelSelector switches models.

Smoke test:

```bash
pnpm dev:desktop
# In the running app:
#   1. Pass onboarding (Local OR BYOK OR Hobby)
#   2. Send "hello" — verify streaming response
#   3. Open ModelSelector — verify all installed providers appear
#   4. (Pro+ tier) switch model mid-conversation — verify context preserved
```

### Web

Working if: `pnpm --filter web dev` boots Next on `localhost:3000`; landing page renders; `/chat` resolves to the dynamic route (NOT a desktop SPA shell — that's the bug we fixed); `/api/me` returns the user's plan tier.

Smoke test:

```bash
pnpm --filter web dev
# Browser:
#   localhost:3000        → marketing landing
#   localhost:3000/chat   → /chat dynamic route renders chat UI
#   localhost:3000/pricing → tier matrix renders
# curl:
#   curl localhost:3000/api/me   # → 401 unauth (expected without cookie)
```

### Mobile

Working if: Expo Metro bundler starts; iOS sim or Android emulator loads the app; Drawer navigation works; user can sign in or skip; chat sends.

Smoke test (from repo root):

```bash
pnpm --filter @agiworkforce/mobile dev
# In iOS sim or Android emulator:
#   1. Drawer opens (5-tab pivoted to drawer)
#   2. Sign in via Apple/Google/email
#   3. Send chat message
#   4. (Pro+ tier) switch model mid-conversation — verify ProPlusPaywall vs allowing switch
```

### Chrome extension

Working if: `pnpm --filter @agiworkforce/extension build` produces `extension.zip`; load unpacked into Chrome; side panel opens on action click; in-page floating launcher appears on every page; LinkedIn/Lever autofill works.

Smoke test:

```bash
pnpm --filter @agiworkforce/extension build
# In chrome://extensions/:
#   1. Enable Developer Mode
#   2. Load unpacked → apps/extension/dist/
#   3. Visit youtube.com — verify floating launcher appears
#   4. Click launcher — verify panel opens with "Summarize this video" action
#   5. Open side panel via toolbar — verify chat works
```

Bundle gate: must stay <160KB compressed (per locked plan).

### VS Code extension

Working if: `pnpm --filter agi-workforce build` produces a `.vsix`; install in VS Code via "Install from VSIX"; `@agi` chat participant responds; sidebar webview renders; History tree populates.

Smoke test:

```bash
pnpm --filter agi-workforce build
# In VS Code:
#   1. Cmd+Shift+P → "Install from VSIX..." → select the produced .vsix
#   2. Open Chat panel → @agi /explain — verify response
#   3. Cmd+Shift+A → AGI sidebar opens
#   4. (Pro+ tier) switch model in chat participant — verify upgrade prompt vs switch
```

## Cross-surface contracts

The 6 surfaces share these contracts — when a contract changes, all surfaces must be updated together.

| Contract                    | Owner                                                                                                                    | Consumers                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `models.json`               | `packages/types/src/models.json`                                                                                         | All surfaces — never hardcode model IDs (locked rule)                                                   |
| `ProviderAdapter` interface | `packages/types/src/provider-adapter.ts`                                                                                 | All surfaces that call LLMs directly                                                                    |
| `UIPlanTier` + `tierStore`  | `packages/types/src/design-system/user-identity.ts` + `packages/unified-chat/src/stores/tierStore.ts`                    | Desktop / Web / Chrome / VSCode → `useTierBridge`; Mobile has its own `apps/mobile/stores/tierStore.ts` |
| Anthropic Dispatch protocol | `apps/mobile/lib/dispatchHmac.ts` (wire format) + `apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs` (Rust impl) | Desktop ↔ Mobile (handoff); Web (read-only display)                                                     |
| Agent SDK protocol          | `packages/types/src/{agent,a2a,council}.ts`                                                                              | CLI ↔ Desktop ↔ Web (all coordinator-mode handlers)                                                     |
| Stripe webhook contract     | `apps/web/app/api/stripe-webhook/route.ts` + `process_stripe_event_idempotent` RPC                                       | Web only (single ingress)                                                                               |

## Pro+ tier verification (multi-provider in-thread switch)

Pro+ is the locked differentiator. Verify each surface honours the gate:

1. **Desktop**: `useTierBridge` reads tier from `useUnifiedAuthStore.plan` → pushes into `useTierStore`. ModelSelector consults `selectProviderSwitchGate`. Below `pro_plus`, cross-provider switch fires `onProPlusRequired`.
2. **Web**: `apps/web/shared/hooks/use-tier-bridge.ts` reads tier from `useBillingData()` → pushes into `useTierStore`. Same gate.
3. **Mobile**: `apps/mobile/services/tierGuard.ts` mirrors the gate logic. ModelPicker shows `ProPlusPaywall` instead of switching when blocked.
4. **VS Code**: `apps/extension-vscode/src/services/{tierResolver,providerSwitchGuard}.ts`. Cross-provider switch on tier < pro_plus shows `vscode.window.showInformationMessage` with billing link.
5. **Chrome ext**: in-page panel + side panel both read tier from desktopBridge or `chrome.storage.local`. Same guard logic.
6. **CLI**: `agiworkforce exec --model X` — checks tier via local config; below `pro_plus` warns on cross-provider invocation in same session.

## Production verification (live state)

Run `mcp__supabase__list_migrations` to see currently-applied migrations. Run `mcp__stripe__list_products` + `mcp__stripe__list_prices` to see the live tier products + prices. Both should match the locked tier matrix from `PRICING.md`.

As of 2026-05-08:

- Stripe Pro+ product `prod_UTTTGQ9T01Ukge` with $49.99/mo + $499.88/yr — **active**
- Stripe Hobby product `prod_TeFMHLjQt0sgMy` with $10/mo + $59.88/yr — **active**
- Supabase `subscriptions.plan_tier` includes `pro_plus` — **active**
- Supabase `token_credits.flagship_daily_tokens` + `flagship_daily_reset_at` — **active**
- Supabase `increment_usage(uuid, integer, text, boolean)` RPC — **active**
- Supabase RLS on 19 user-scoped tables — **active** (≥1 policy each)

## When a surface breaks

1. Run `scripts/verify-surfaces.sh fast <surface>` to localise the failure.
2. Check `audit/AUDIT_2026-05-03.md`, `audit/AUDIT_REPORT_2026-05-01.md`, and `audit/FIX_QUEUE.md` for any open P0 against that surface.
3. If the failure is in shared code, check `ARCHITECTURE.md` for the abstraction the surface relies on.
4. Use the dedicated subagent (`<surface>-engineer`) to debug — they own the surface and have the full context.
