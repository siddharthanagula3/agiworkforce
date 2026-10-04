# AGI Workforce Signed-In Web Audit, 2026-10-03

Status: Current
Owner: Founder + web lead
Last updated: 2026-10-03

An external, browser-only audit of the signed-in web app, dated 3 October 2026,
22:28 to 22:51 UTC, on a Free-plan account in a cloud browser at 1180, 768 and
500 CSS pixels wide. It performed no action: no message was sent, no setting was
changed and no file was opened. Its authors had no repository access and did not
inspect signed-in ChatGPT or Claude.

This file registers 18 rows: 15 findings (`AF01` to `AF15`, the audit's `F01`
to `F15`) and 3 items (`AX01` to `AX03`) that the lead took from the audit's
screen-by-screen notes, which the audit did not number. The rows are 1 P1, 9 P2
and 8 P3. The audit's text for each is kept as evidence in
`audit/prior-audits/evidence/2026-10-03-signed-in-audit/findings.json`; the
screenshots are not in git.

Each row was mapped to the code on branch `fix/public-site-audit-2026-10-03`,
which equals production commit `74bece5d10` for the files concerned
(`ArtifactPreview.tsx` differs on the branch). The "State" column says how each
row reproduced: 15 rows were checked by a second reviewer; `AF09` and `AF13`
reproduce only partly, and `AF05`, `AF07` and `AF14` reproduce fully but were
not second-reviewed.

This file is the single owner of the rows below. A row is deleted in the commit
that closes it, and the file is deleted when nothing in it is open. The aggregate
register row is `WEB-SIGNED-IN-AUDIT-2026-10-03` in
`audit/registers/known-flaws.md`. The lead finding recorded at the end of this
file has its own row, `WEB-PROVIDER-TRAINING-SETTING-01`. Owner decisions the
rows need are in `audit/decisions/founder-decisions.md`, owner-only actions in
`audit/decisions/founder-actions.md`.

## What the audit does not prove

It is a presentation review. A menu it opened proves nothing about what the
control does. Signed-in browser checks cannot run in CI or locally: the signed-in
e2e harness needs a Clerk secret and a database, and
`apps/web/__tests__/web-e2e-ci-coverage.test.ts` forbids such specs in CI. Every
signed-in fix is therefore proved by component tests, and the browser pass
happens on a Preview deployment.

## What the code showed that the audit could not see

- `AF01`: artifacts are saved to the account automatically, and a shared chat carries its artifacts.
- `AF01`: a temporary chat's artifact content is posted to the sync endpoint and discarded by the server; `L14.1` fixes it.
- `AF15`: the AGI Code "Auto" hint promises that sandboxed code and page fetches run unasked, while Code sessions ask before running any program and refuse page fetches.
- `AF15`: "Skip approvals" is offered to a member whose workspace forbids it, and the server downgrades it.
- `AX03`: "Open image mode in chat" does nothing on a plan without image generation.
- `AF13`: shortcut hints are already platform-aware, so the audit's Linux observation is unproven.

## Open findings

The work-package column carries the labels of the remediation plan's packages
(`L14.1` is package 1 of lane 14) so a commit can cite them. The plan is a
working document of the fix branch and is not kept in this repository; the
"Start at" path is the durable anchor for each row. Lanes: 14 signed-in trust
statements, 15 new-chat composer, models and help, 16 signed-in pages and
settings, 17 AGI Code composer, 18 public discovery follow-ups, 19 provider-training
setting enforcement. Lanes 1 to 13 belong to
`audit/prior-audits/public-website-audit-2026-10-03.md`. A label marked
"(amended)" is a package of another lane that this row changes.

| ID   | Priority | Finding                                                                                                       | Screens                                                                 | State at 74bece5d10                                                                                                                                                                                                                | Start at                                                                    | Work packages                                                     |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| AF01 | P1       | Resolve conflicting artifact privacy guidance                                                                 | Artifacts pane, Settings privacy                                        | Push half fixed in code (`L14.1`): temporary-chat artifacts no longer leave the browser. The on-device filter cannot be reached in a shipped shell and does not survive a reload. Notice wording open (`L14.2`); Preview pass owed | `apps/web/features/onboarding/components/ArtifactPrivacyNotice.tsx`         | L14.1, L14.2                                                      |
| AF02 | P2       | Unify help access and stop composer obstruction                                                               | Blank chat `/` and `/chat`, Support open and closed, 1180, 768, 500     | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/support/lib/route-visibility.ts`                         | L15.11, L15.12, L15.13, L15.14                                    |
| AF03 | P2       | Shorten the free model notice without losing its meaning                                                      | New chat with the free model selected                                   | Reproduces, verified                                                                                                                                                                                                               | `packages/contracts/compliance/src/free-plan-training-disclosure.ts`        | L14.3, L14.4, L14.5, L10.10 (amended)                             |
| AF04 | P2       | Make the selected model fully legible                                                                         | Composer with OpenRouter Free Auto selected, 1180 and 500               | Logo lookup fixed in code (`L15.1`); trigger label, name and tooltip open (`L15.2`); Preview pass owed                                                                                                                             | `apps/web/features/chat/components/Composer/ComposerFooter.tsx`             | L15.1, L15.2                                                      |
| AF05 | P2       | Reduce competing onboarding rows                                                                              | Empty new chat                                                          | Reproduces                                                                                                                                                                                                                         | `apps/web/features/chat/components/NewChat/NewChatConnectorSuggestions.tsx` | L15.8                                                             |
| AF06 | P2       | Group project context with the composer                                                                       | New chat composer                                                       | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`            | L15.6                                                             |
| AF07 | P3       | Use one upgrade entry in the account area                                                                     | Expanded sidebar                                                        | Reproduces                                                                                                                                                                                                                         | `apps/web/shared/components/layout/SidebarPlanNudge.tsx`                    | L15.7                                                             |
| AF08 | P3       | Surface sources and artifacts when they have a clear role                                                     | Empty chat, sources and artifacts panes                                 | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/chat/pages/WebChatPage.tsx`                              | L15.9                                                             |
| AF09 | P3       | Clarify the two voice actions                                                                                 | Composer toolbar                                                        | Partly reproduces, verified                                                                                                                                                                                                        | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`           | L15.10                                                            |
| AF10 | P2       | Offer search recovery before project creation                                                                 | `/chat/projects` with a non-matching search                             | Reproduces, verified                                                                                                                                                                                                               | `packages/ui/unified-chat/src/components/ProjectGallery.tsx`                | L16.1                                                             |
| AF11 | P2       | Clarify model availability and catalog scope                                                                  | Model picker, All models view                                           | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/chat/components/Composer/FreeQuotaModelSection.tsx`      | L15.1, L15.4, L15.5                                               |
| AF12 | P2       | Organize settings and standardize page hierarchy                                                              | Settings at 1180 and 500; `/chat/study`, `/chat/images` titles          | Reproduces, verified                                                                                                                                                                                                               | `packages/ui/ui/src/settings-nav.ts`                                        | L16.5, L16.6, L16.7, L16.8, L16.9, L16.10, L16.11, L16.12, L16.13 |
| AF13 | P3       | Verify platform aware shortcut hints                                                                          | Navigation, account menu, Search Conversations dialog on Linux Chromium | Partly reproduces, verified                                                                                                                                                                                                        | `packages/ui/ui/src/platformKeys.ts`                                        | L16.4                                                             |
| AF14 | P3       | Bring the unused code workspace into one visual group                                                         | `/code` unused workspace                                                | Reproduces                                                                                                                                                                                                                         | `apps/web/features/code/CloudCodePage.module.css`                           | L17.4                                                             |
| AF15 | P2       | Explain the collapsed code approval mode                                                                      | `/code` approval menu opened read only                                  | Reproduces, verified                                                                                                                                                                                                               | `packages/contracts/types/src/tool-approval-policy.ts`                      | L17.1, L17.2, L17.3, L05.8 (amended)                              |
| AX01 | P3       | Model About panel shows empty price fields and an internal lifecycle label                                    | Model About panel                                                       | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`             | L15.3                                                             |
| AX02 | P3       | Connectors settings: empty Connected tab has no browse action and the catalog total reads like a result count | Settings, Connectors                                                    | Reproduces, verified                                                                                                                                                                                                               | `packages/ui/ui/src/directory/DirectoryGrid.tsx`                            | L16.2                                                             |
| AX03 | P3       | Images page introduction implies creating on the page; Schedules plan-gated empty card is oversized           | `/chat/images`, Schedules                                               | Reproduces, verified                                                                                                                                                                                                               | `apps/web/features/images/components/ImageStudio.tsx`                       | L16.3                                                             |

### What each row asks for

These are the first readings of each row, kept for the defect they describe.
Where a decision in `audit/decisions/founder-decisions.md` sets a different
default for the fix, the decision wins.

- `AF01`: The Artifacts pane notice says an artifact leaves the device only when published and inherits a local/BYOK/managed boundary. On hosted web every signed-in artifact is auto-pushed to the account, and local/BYOK do not exist there. Rewrite the notice as a three-part, test-backed statement.
- `AF02`: The floating Support widget is mounted once in the root layout and is hidden below 1280px only on /chat and /code. Signed-in "/" is a proxy rewrite to chat whose pathname stays "/", so the widget shows there at every width and covers the composer. Fix the route rule and the panel mode.
- `AF03`: The Free-plan chat notice joins five constants into one paragraph with a Q-and-A lead and a Settings instruction written as plain text, not a link. Shorten the constants in the compliance contract, add a Settings link, and give the dismissal a policy-version key so a wording change resurfaces it.
- `AF04`: The composer model trigger caps the name at 96px (140px from sm) and cuts "OpenRouter Free Auto" to "OpenRouter Fr…". Its accessible name is the fixed "Change model", and OpenRouter gets a bare grey dot because its provider key matches no logo. Fix the trigger label, name, tooltip and logo lookup.
- `AF05`: Empty new chat renders NewChatConnectorSuggestions (label, 3 chips, All connectors, X) under the topic chips on every visit until dismissed or 3 apps connected. Collapse to one optional link and keep the Plus menu and Settings routes; where the dismissal is stored is `L15-D3`. No component test exists.
- `AF06`: On Free (no AGI Work) the project picker is a detached "Project" pill in its own mt-2 row under the composer card. Paid AGI Work already attaches project, files and plugins in one bar. Give the Free pill the attached bar treatment; the selected chip and clear already exist.
- `AF07`: Free users see a "Free plan / Upgrade" pill and, 50-70px below it, an account button with a second "Upgrade" pill. Both come from one file, SidebarPlanNudge.tsx, and both shells render them. Fix: make SidebarPlanBadge return nothing for the Free tier; keep the nudge row and the menu item.
- `AF08`: Research-sources and Artifacts toggles are rendered unconditionally in the chat header, even on an empty new chat. Fix at WebChatPage: on an empty chat with nothing to show, fold them into a named Panels menu (as sm:hidden already does); show direct buttons with counts once output exists.
- `AF09`: Composer mic is named "Start voice input" with no tooltip; waveform is "Start voice mode" (title+aria, hardcoded English, bare filled circle). Both labels are accurate but vague. Rename the mic to Dictate, add a real tooltip to the mic, move strings to i18n; the waveform's name is subject to `L15-D6`, whose default keeps "Start voice mode".
- `AF10`: ProjectGallery shows "No projects match "x"." then always "Create one to group conversations..." even when the query is the cause. Split the empty state into filtered (Clear search, optional New) and genuinely empty (creation copy), and note search only covers loaded pages.
- `AF11`: Picker conflates two things: the paused provider free-quota pools and the always-listed fallback model (FREE_TRIAL_MODEL), and "All models 24" counts the whole catalogue while the rail counts only plan-admitted models. Fix copy and counts at ComposerFooter and ModelCatalogue.
- `AF12`: Settings rail is flat (20 items in 2 groups) and collapses to one horizontal strip below md; pane titles are h1 in some panes (Account, Billing, Privacy) and h2 text-h4 in others (General, Help); page titles mix text-h2/text-2xl. Add rail groups, list-then-detail narrow layout, one heading role.
- `AF13`: Hints are already platform-aware (Mac glyphs only when the browser reports Apple), so the audit's Linux observation is unproven. Real defect: two separate platform detectors drive hints versus bindings and can disagree. Collapse them into one, add a test, then verify on Linux/Windows/macOS.
- `AF14`: The empty AGI Code home pins the greeting near the top and the composer to the bottom because the greeting area is flex:1 with a 12vh top pad. The audit asks for greeting, notices and composer as one vertically centred block in the home state; `L17-D2` keeps today's layout by default.
- `AF15`: The Code composer trigger shows only the one-word shortLabel 'Auto' and its aria-label is the fixed string 'Approval mode', so neither sighted nor screen-reader users get the boundary without opening the menu. In Code sessions running a program asks first and page fetches do not exist, so the hint is false there and Code needs its own hint (`L17.1`).
- `AX01`: The model About card prints the raw registry lifecycle value ("promoted") under "Lifecycle stage" and shows "Not published" for unknown price, date and token fields. Drop or humanise the stage row, hide unpublished rows, and lead with plain-language guidance.
- `AX02`: Both halves reproduce. The Connected empty state is text only ("Choose All to browse the catalogue."), no button. The toolbar count renders "38,255 connectors" with no scope word. Fix: a Browse-all action in the shared DirectoryGrid empty state, and a "in the catalogue" count suffix.
- `AX03`: Two small items. Images: the intro always says "Describe an image, pick a style..." but on plans without image generation the page shows only a gate card with "Open image mode in chat". Schedules: the plan-gated empty card is py-16 with icon, heading and line, repeating the notice above it. Make both states-aware.

## Acceptance still open after the code fix

The code packages close the wording, layout and guard parts of these rows. Each
of the three also needs an owner step that code cannot take. The rule: **such a
row is narrowed, not deleted, until that step is done.**

| Row    | What the code fix leaves open                                                                                                                                               | The one step that closes it                                                                                                                         | Who   | Recorded in                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `AF02` | The Support launcher can leave the composer surfaces, but doing so changes decision 26 in `docs/decisions/README.md`                                                        | Answer `L15-D1`; the recommended default moves only the entry point to an "Ask support" row in the account menu and keeps the assistant mounted     | Owner | Item 35 in `audit/decisions/founder-decisions.md`         |
| `AF12` | The one heading role (`L16.5` to `L16.11`) is code; the rail groups (`L16.13`) and the list-then-detail layout below `md` (`L16.12`) are built only after the owner answers | Answer `L16-D2` (rail groups) and `L16-D3` (layout below `md`)                                                                                      | Owner | Items 36 and 37 in `audit/decisions/founder-decisions.md` |
| `AF14` | The grouped layout is built only if the owner wants it                                                                                                                      | Answer `L17-D2`; recommended: keep today's layout, which matches the Claude Code home recorded in `docs/research/leader-code-surface-2026-09-05.md` | Owner | Item 38 in `audit/decisions/founder-decisions.md`         |

## Lead finding: provider-training setting

Row `WEB-PROVIDER-TRAINING-SETTING-01` in `audit/registers/known-flaws.md`. It
came from a review of how the account setting "Only use models that do not train
on your chats" is enforced. The lead's working papers are `OPTOUT-COVERAGE.json`
(a path-by-path reading of 30 entry points) and `router-probe.json` (the router
run below); both live in the fix branch's working set, not in git, so the code
paths named here are the durable anchors.

Everything in this section describes the code at `74bece5d10`, the commit
production served on 2026-10-03, which is identical to the branch for every file
named. The commits that land lane 19 narrow it.

**What the setting is.** It is stored per user as `privacy.keepOutOfProviderTraining`
(`apps/web/features/settings/sections/PrivacySection.tsx`) and read through
`apps/web/lib/server/provider-training-opt-out.ts`. The main chat path enforces
it in `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`. In the
router it is a provider preference (`availableProviderIds`), not an admission
rule.

**What was executed.** `resolveAutoRoute` was run with the provider filter
restricted to six no-training providers (`openai`, `anthropic`, `google`, `qwen`,
`perplexity`, `together`). On the free lane, for `simple_chat` and for `coding`,
it still selected `openrouter-free` on `open_router`, with reason
`fallback_slot`. On Basic the filter was honoured. On Pro the selected route
honoured it, but the fallback chain in both Pro runs still lists `glm-5.3` on
`vercel_gateway`, which is outside that six-provider filter (its vendor, `zhipu`,
is recorded as unknown).

**What was only read.** Conversation titles, follow-up suggestions, memory
extraction and context compaction hard-code the free lane for every plan. The
support assistant routes on the viewer's plan (`apps/web/lib/support/agent/answer/model-route.ts`,
fed `context.plan.effectiveTier` in `apps/web/app/api/support/ask/route.ts`),
published-app calls on `planTier` (`apps/web/lib/services/artifact-runtime-service.ts`)
and code review on the installation owner's entitled tier
(`apps/web/lib/code-review/pipeline.ts`); on Free that is the same OpenRouter free
router. Code review does not read the setting at all. All seven build their
requests without the data-collection deny flag that the main chat path always
sets for an OpenRouter router (`requiresZeroDataRetention` in
`apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts`; the managed
default is `{ sort: 'price' }` in `apps/web/lib/services/provider-adapter-service.ts`).
AGI Code turns, chat failover and the credit-shortfall downgrade never read the
setting. On Free with the setting on, chat is refused because no Free model
qualifies, so the toggle text "On the Free plan this replaces the free models"
is false. The Free-plan notice and the pricing comparison cell for paid plans
("Trains on your content: No") state more than the code does.

**What the provider documents.** On 2026-10-03 the lead fetched
`https://openrouter.ai/docs/guides/routing/provider-selection`: `provider.data_collection`
takes `allow` or `deny` and defaults to `allow`, and `deny` uses only providers
that do not collect user data. The same filter exists as an account-wide privacy
setting. The video request documented at
`https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request`
has a `provider` passthrough field with no `data_collection` option, so a video
request cannot ask OpenRouter to deny data collection; with the setting on,
`L19.11` refuses it instead of sending a flag. The dated record of these pages
is `docs/research/provider-and-leader-page-checks-2026-10-03.md`.

**What is unknown.** Which of these paths occur in production: provider keys and
the OpenRouter account privacy settings are not readable from the repository.
Whether OpenRouter combines the request-level field and the account-level data
policy (the page states a combining rule only for `zdr`). Whether the provider
preferences are honoured by the free router alias; the page does not say. Whether
tool calls inside the chat tool loop reach vendors outside the provider
governance data. Whether a Free account can pass the AGI Code turn's reservation.

**The first fix.** `L19.0` and `L19.1` are on the branch and not deployed.
`L19.0`: every managed chat request the provider adapter sends to OpenRouter
denies data collection, and request metadata cannot relax it; this is the rule
the main chat path already applied. `L19.1`: `noTrainingOnly` is a hard
admission rule in the router, with the lead's probe as its first test; no caller
sets it yet. The later packages carry it to the side calls, AGI Code, code
review, media and voice routes. The three owner decisions are `L19-D1` (Free plan with the setting on),
`L19-D2` (the paid pricing cell) and `L19-D3` (background calls), grouped in item
40 of `audit/decisions/founder-decisions.md`. The corrective action that only the
owner can take is the dashboard setting in `audit/decisions/founder-actions.md`,
"[Routing] The zero-price OpenRouter router on paid plans".
