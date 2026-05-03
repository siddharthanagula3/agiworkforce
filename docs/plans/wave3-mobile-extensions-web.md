# Wave 3 — Mobile + Extensions + Web Polish

> 4-6 weeks. Submits mobile to App Store + Play, Chrome ext to Web Store, VS Code ext to Marketplace. Launches Hobby tier. Pro/Max waitlist page live.

## Pre-requisites (block start)

- [ ] CLI v1.0 launched (Wave 1 done)
- [ ] Desktop v1.0 launched (Wave 2 done)
- [ ] Apple Developer Program membership active ($99/yr)
- [ ] Google Play Developer account active ($25 one-time)
- [ ] Stripe Hobby price configured (`scripts/create-hobby-price.js`)

## Mobile (iOS App Store + Google Play) — 3-4 weeks

### iOS

1. Register bundle ID `com.agiworkforce.app` in Apple Developer
2. Create distribution provisioning profile
3. Set Apple Team ID in EAS Build settings
4. App Store listing in App Store Connect:
   - Name: AGI Workforce
   - Subtitle: Multi-provider AI agent companion
   - Category: Productivity (primary), Developer Tools (secondary)
   - Screenshots (6 required): empty state, dispatch view, settings, model picker, voice input, agent task list
   - Description: emphasize Dispatch (mobile→desktop) + multi-provider
   - Privacy policy URL: agiworkforce.com/privacy
   - App Privacy questionnaire: declare data collected (email, device ID, usage analytics)
   - Age rating: 4+ (no objectionable content)
5. Build: `eas build --platform ios --profile production`
6. Upload .ipa to App Store Connect via Xcode organizer or Transporter
7. Submit for review (typical: 1-7 days)
8. After approval: release manually, monitor crash reports

### Android

1. Create app in Google Play Console
2. App content: privacy policy, app access (no restricted access), ads (none), content rating (Everyone), target audience (13+), news app (no), data safety questionnaire
3. Set up Google Play account in EAS
4. Build: `eas build --platform android --profile production`
5. Upload .aab to Google Play Console internal testing track
6. Promote to closed testing → open testing → production
7. Each promotion is gated on review (typical: 1-3 days)

### What's already done (verified by audit)

- Drawer navigation working
- Auth + Push + Realtime + Deep linking LIVE
- MMKV encryption + biometric unlock
- Dispatch implementation matches Anthropic Dispatch parity (597 LOC + 181 LOC realtime)
- iOS native bundle + privacy manifest configured
- EAS build profiles ready

### What's NOT done (must do)

- App Store / Play listing copy + screenshots
- Apple Developer Team ID in EAS
- Google Play account in EAS
- TestFlight beta with 5-10 testers before public submission

## Chrome Extension (Web Store) — 1-2 weeks

### What's already done

- Manifest v3 v1.2.0, dist/ + extension.zip (87K) ready
- LinkedIn + Lever autofill modules
- 14 test suites
- P0 audit fixes landed (sender allowlist + same-tab DOM)

### Submission steps

1. Create Chrome Web Store developer account ($5 one-time)
2. Listing copy:
   - Name: AGI Workforce Browser
   - Description: Multi-provider AI assistant in your browser sidebar
   - Category: Productivity
   - Screenshots: sidebar empty state, model selector, attachment menu, action mode toggle (5 required)
   - Privacy policy: agiworkforce.com/privacy
   - Permissions justification: explain why nativeMessaging, sidePanel, tabs, etc.
3. Upload extension.zip
4. Submit for review (typical: 1-3 business days)
5. After approval: enable in Chrome Web Store

## VS Code Extension (Marketplace) — 3-7 days

### What's already done

- v0.3.0, out/extension.js compiled
- 54+ commands, 11 settings, 11 keybindings
- @agi chat participant (explain/fix/refactor/tests/docs/model)
- 13 providers, 30 source files, 9-12 test suites

### Submission steps

1. Create Visual Studio Marketplace publisher account
2. Run: `vsce package` to generate `.vsix`
3. Upload via `vsce publish` or web UI
4. Listing copy:
   - Name: AGI Workforce
   - Display name: AGI Workforce
   - Description: Multi-provider AI agent for VS Code
   - Categories: AI, Programming Languages, Snippets
   - README.md with screenshots + demo gif
5. Marketplace review is automated for non-commercial content (typical: minutes-hours)

## Web Polish (Hobby tier launch + remaining audit P1s)

### WEB-4: Stripe webhook body-read fragility

`apps/web/app/api/stripe-webhook/route.ts` — middleware in `proxy.ts:92-99` may consume request body before route handler can read raw bytes for HMAC validation. Fix: explicit `bodyParser: false` in route config + E2E test that proves `constructEvent` succeeds end-to-end with realistic webhook payload.

### WEB-11: CSP unsafe-inline removal

`apps/web/proxy.ts:20` has `style-src 'unsafe-inline'`. Sweep for `style={{ ... }}` props in `apps/web/`, convert to Tailwind classes or CSS variables. Generate CSP-compatible SHA-256 hash list for unavoidable static `<style>` blocks. Drop `'unsafe-inline'` from style-src.

### Hobby tier launch

1. Run `node scripts/create-hobby-price.js` → creates Stripe $5/mo price (verify amount in Stripe dashboard)
2. Update `apps/web/app/pricing/page.tsx` to surface Hobby tier "Coming Soon" → "Get Started"
3. Wire `/api/checkout` to Hobby price ID
4. Add credit balance UI to chat composer (top-right `$X.XX / $5.00 today`)
5. Add billing history page at `/billing/invoices` (Stripe Customer Portal link)
6. Run `node scripts/test-hobby-plan.js` to verify end-to-end
7. Email existing waitlist users (if any) with launch announcement

### Pro/Max waitlist page

1. New route: `apps/web/app/waitlist/page.tsx`
2. Form: email + name + use-case (textarea) + tier interest (Pro / Max)
3. Backend: append to Supabase `waitlist` table (create migration if not exists)
4. Confirmation email via Supabase auth (existing template)
5. Link from `apps/web/app/pricing/page.tsx` Pro/Max tiers

### Observability

Per `docs/audit/AUDIT_2026-05-03.md` follow-ups:

- Wire Sentry breadcrumbs end-to-end across web → api-gateway → signaling-server
- Add Vercel Analytics + Web Vitals dashboards
- Add Datadog or BetterStack for api-gateway + signaling-server logs
- Set up uptime monitoring (BetterStack / UptimeRobot)
- Daily anomaly digest email

## Timeline

| Week | What                                                                  |
| ---- | --------------------------------------------------------------------- |
| 1    | Mobile App Store + Play submissions (iOS first, Android in parallel)  |
| 2    | Mobile review + Chrome ext submission + VS Code ext submission        |
| 3    | Web WEB-4 + WEB-11 fixes + Hobby tier wire-up                         |
| 4    | Hobby tier launch (after Stripe verification) + Pro/Max waitlist live |
| 5    | Observability layer + Sentry breadcrumbs end-to-end                   |
| 6    | Buffer for review iterations + emergency patches                      |

## Success criteria

- [ ] AGI Workforce mobile in iOS App Store (live, not just submitted)
- [ ] AGI Workforce mobile in Google Play Store (live)
- [ ] AGI Workforce Browser in Chrome Web Store
- [ ] AGI Workforce in VS Code Marketplace
- [ ] Hobby tier ($5/mo) signups working end-to-end (signup → Stripe → credit grant → first chat call)
- [ ] Pro/Max waitlist collecting signups
- [ ] All P1 audit findings closed (25/25)
- [ ] No new P0 findings introduced
- [ ] Sentry receiving events from all 6 surfaces
- [ ] First 100 paying users (any combination of Hobby + future Pro/Max) onboarded
