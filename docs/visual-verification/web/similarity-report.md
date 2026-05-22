# Web — 80% Similarity Acceptance Test

Status: Round 21 baseline
Owner: Platform lead
Last updated: 2026-05-22
Reference set: 5 most-recent screenshots from `~/Desktop/reference/ui/web/{claude-public/2026-05-15,claude-auth/2026-05-15,gemini,perplexity}/`

## Reference screenshots selected (5)

1. `claude-public/2026-05-15/010_claude-public_pricing_top.png` — Claude public pricing page (hero + plan table)
2. `claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png` — Claude sign-in entry (auth)
3. `perplexity/11_settings_account-profile-subscription-discord-system.png` — Perplexity settings → Account section
4. `perplexity/08_connectors_grid-gmail-drive-notion-github-slack-jira.png` — Perplexity connectors grid (Gmail/Drive/Notion/GitHub/Slack/Jira)
5. `gemini/01_home_empty-state-greeting-import-memory-banner.png` — Gemini home empty state (greeting + composer + import-memory banner)

## User-visible element checklist

| #   | Element                                                          | Reference present                           | AGI Workforce equivalent                                                                          | Status |
| --- | ---------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| 1   | Top navigation bar w/ product wordmark                           | yes (img 1, 5)                              | `apps/web/app/(marketing)/*` + `apps/web/app/layout.tsx`                                          | ✅     |
| 2   | Sign-in entry CTA (header)                                       | yes (img 2)                                 | `apps/web/app/login/page.tsx` + `apps/web/app/auth/**`                                            | ✅     |
| 3   | Hero / value-prop above the fold                                 | yes (img 1)                                 | `apps/web/app/page.tsx` (home route)                                                              | ✅     |
| 4   | Pricing page w/ plan cards (Free / Pro / Max)                    | yes (img 1)                                 | `apps/web/app/pricing/page.tsx`                                                                   | ✅     |
| 5   | Team & Enterprise CTA tier                                       | yes (img 1)                                 | `apps/web/app/enterprise/page.tsx` + `apps/web/app/contact-sales/page.tsx`                        | ✅     |
| 6   | Home empty state w/ greeting + composer                          | yes (img 5)                                 | `apps/web/app/chat/page.tsx` (EmptyChat)                                                          | ✅     |
| 7   | Composer (multiline textarea + send)                             | yes (img 5)                                 | `apps/web/app/chat/[sessionId]/**` Composer component                                             | ✅     |
| 8   | Composer attachment / plus menu                                  | yes (img 5)                                 | `apps/web/app/chat/**` PlusMenu / attachment chip                                                 | ✅     |
| 9   | Composer model selector dropdown                                 | yes (img 5 + claude/gemini composer pages)  | `apps/web/app/chat/**` ModelPicker (reads models.json)                                            | ✅     |
| 10  | Composer tools menu (web search / canvas / deep research)        | yes (img 5 implied; gemini 04 explicit)     | `apps/web/app/chat/**` tools chip — has web-search + canvas, missing deep-research separate entry | ⚠      |
| 11  | Settings → Account / Profile section                             | yes (img 3)                                 | `apps/web/app/settings/profile/page.tsx`                                                          | ✅     |
| 12  | Settings → Billing / Subscription                                | yes (img 3)                                 | `apps/web/app/settings/billing/page.tsx` + `apps/web/app/billing/page.tsx`                        | ✅     |
| 13  | Settings → Notifications                                         | yes (img 3 implies; perplexity 18 explicit) | `apps/web/app/settings/notifications/page.tsx`                                                    | ✅     |
| 14  | Settings → Privacy / Data                                        | yes (perplexity overall)                    | `apps/web/app/settings/privacy/page.tsx`                                                          | ✅     |
| 15  | Settings → Memory / Personalization                              | yes (perplexity 13-14)                      | `apps/web/app/settings/memory/page.tsx`                                                           | ✅     |
| 16  | Settings → Connections / Integrations                            | yes (img 4)                                 | `apps/web/app/settings/connections/page.tsx` + `apps/web/app/connectors/page.tsx`                 | ✅     |
| 17  | Connectors grid (Gmail / Drive / GitHub / Slack / Jira / Notion) | yes (img 4)                                 | `apps/web/app/connectors/page.tsx` + `apps/web/app/connectors/mcp-directory/`                     | ✅     |
| 18  | Projects list + detail                                           | yes (perplexity 6 spaces; chatgpt projects) | `apps/web/app/projects/page.tsx` + `apps/web/app/projects/[id]/page.tsx`                          | ✅     |
| 19  | Threads / chat history sidebar                                   | yes (gemini 01; perplexity 01)              | `apps/web/app/chat/**` Sidebar / RecentChats panel                                                | ✅     |
| 20  | Settings → Voice / Audio                                         | yes (perplexity 12; gemini settings)        | `apps/web/app/settings/voice/page.tsx`                                                            | ✅     |
| 21  | Settings → Usage / Credits panel                                 | yes (perplexity 20)                         | `apps/web/app/api/usage/**` route exists; no `apps/web/app/settings/usage/` UI page               | ❌     |
| 22  | Settings → Custom shortcuts (slash-trigger commands)             | yes (perplexity 16-17)                      | no equivalent — no `apps/web/app/settings/shortcuts/`                                             | ❌     |
| 23  | Footer w/ legal / docs / changelog links                         | yes (img 1)                                 | `apps/web/app/{docs,changelog,privacy,terms-of-service,cookies,dpa,legal}/`                       | ✅     |
| 24  | Auth signed-in user popover (account / preferences / log out)    | yes (perplexity 10)                         | `apps/web/app/profile/page.tsx` + AccountMenu component (header)                                  | ✅     |
| 25  | Connectors empty-state w/ paid-plan gate                         | yes (img 4 implies)                         | `apps/web/app/connectors/page.tsx` shows paid-plan banner when v1 waitlist gate active            | ✅     |

| Total elements | 25 | 22 covered (20 ✅ + 1 ⚠ + 2 ❌) | **84%** |

## Score: 84%

Pass: ✅ ≥80% threshold met.

- ✅ Pass: covered with equivalent UI (20 items)
- ⚠ Partial: present but visually divergent or feature-incomplete (1 item — composer tools menu missing dedicated deep-research entry)
- ❌ Miss: no equivalent (2 items — settings/usage UI page, settings/shortcuts page)

## Closure rounds needed

The surface is over 80%, but the two ❌ items are the natural R22+ targets if web slips back below threshold:

- Row 21 — ship `apps/web/app/settings/usage/page.tsx` (API + DB already exist under `apps/web/app/api/usage/**`)
- Row 22 — ship `apps/web/app/settings/shortcuts/page.tsx` (no API yet — needs schema + CRUD endpoint first)
- Row 10 (⚠) — add a discrete deep-research toggle in the composer tools chip (currently combined with web-search)

## Notes

- Reference set is current as of 2026-05-15; dated subdirs supersede any older captures.
- 6 of the 25 elements correspond to Round 18+ settings depth work; settings IA passes cleanly because `apps/web/app/settings/{profile,billing,notifications,privacy,memory,connections,voice,general,capabilities}/` are all present.
- Visual diff captures (PNG-vs-PNG pixel comparisons) are pending; the R31-R32 harness will run Playwright-based image diff against the 5 reference screenshots above. This R21 baseline is a structural/element parity score only.
- Round-17 / Round-18 viewport PNGs already in this directory (`round-17-chat-viewport.png`, `round-18-connectors-viewport.png`, etc.) provide the AGI side of future diffs.
