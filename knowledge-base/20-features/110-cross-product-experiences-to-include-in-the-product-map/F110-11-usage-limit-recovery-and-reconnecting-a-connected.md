---
id: "F110-11"
type: "feature"
title: "Usage limit recovery and reconnecting a connected account"
aliases: ["Usage limit recovery", "Usage exhaustion to alternative eligible path (S110.26)", "Disconnected integration to reconnect and resume (S110.27)", "Paywall card", "Inline paywall", "Notify me when it resets", "Switch to model", "Buy credits", "Connector connect card", "Reconnect <connector>"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S110.26", "S110.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "api:POST /api/usage/reset-reminder", "api:GET /api/connectors/oauth/start", "F110-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-11 Usage limit recovery and reconnecting a connected account

When usage runs out the apps show the next step: switch model if one is eligible, wait or be notified at reset, buy credits, upgrade, or use your own key. When a connected account expires, a connect or reconnect card appears and the person sends the request again, because the turn is not resumed automatically (by decision).

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.26](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11026), [S110.27](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11027).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a refusal into a way forward. The server sends a structured refusal (reason, reset time, recovery action, optional alternative model); the app renders a card or banner. For connectors, the tool result carries a connect request with a link so the person can reconnect and ask again.

**Why it exists.** The brief wants one-step recovery from usage exhaustion and a reconnect prompt when a connected account expires mid-task (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.26, S110.27).

**Who uses it.** Anyone who hits a plan or free-lane limit, and anyone whose connected app login has expired.

**Problems it solves**

- A dead-end error when usage is gone
- Not knowing when the limit resets
- Silent tool failures after an expired connection

**Use cases**

- A free user hits the daily limit on one model and presses 'Switch to <model>'.
- A paid user presses 'Buy credits' or 'Notify me when it resets'.
- A chat tool call says Gmail needs reconnecting; the user presses Reconnect Gmail and sends the message again.
- A CLI user sees a hint to run agi usage or use their own provider.

## 2. User experience

**Where to find it**

- Web (and desktop's hosted app): inline paywall card in the transcript (apps/web/features/chat/components/messages/ChatMessageList.tsx:782) and an account-wide banner above the composer with 'Notify me when it resets' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5104).
- Mobile: PaywallBottomSheet (apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:96).
- CLI: error text with a next step (apps/cli/src/errors.rs:397-420, 640-710).
- VS Code: error card with recovery buttons including switch model (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:364-480).
- Chrome: side panel error with a switch-model action (apps/extension/src/side_panel.ts:9755-9771).
- Connect card: web ToolTimeline (apps/web/features/chat/components/messages/ToolTimeline.tsx:206, 510), mobile message bubble, CLI notice (apps/cli/src/cloud/connectors.rs:16-66). No connect card found in VS Code or Chrome; VS Code's cited lines are MCP server reconnect code (webviewContent.ts:4618).

**Before you start**

- A refusal from the server carrying usage block data (reason, resets_at, recovery action, optional alternative_model).
- For the switch button: the server names an alternative model (freeLimitRecovery.ts:78-118).
- For top-up: recoveryAction 'top_up' and a non-free plan (WebChatPage.tsx:1819-1823).
- For connectors: a connector tool that returns the authorization-required result.

**Screens and controls**

- Card buttons: 'Switch to <model>', an upgrade or subscribe label from paywallRecoveryLabel ('Upgrade to <plan>', 'Subscribe to <plan>', 'Manage billing', 'View usage', 'Buy credits'), 'Use your own key', and 'Try later' or 'Not now' (InlinePaywallCard.tsx:181-190, 248-277). A free-capacity variant has 'Try again' (line 285).
- Composer banner: 'Notify me when it resets' (ChatComposerNew.tsx:5104, 5139), not offered on the desktop host (WebChatPage.tsx:1815-1817).
- Mobile sheet: title and primary action 'Manage billing', 'View plans', 'View upgrade options' or 'Contact Sales'; a 'standard model' choice via onChooseStandardModel (PaywallBottomSheet.tsx:143-150, 160-190).
- Connect card: 'Connect' or 'Reconnect' button for the named connector (packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:125).

**Journey**

1. A send is refused for usage.
2. The server returns the refusal with a code and recovery data.
3. The client stores it as an account usage block or message paywall (WebChatPage.tsx:1805-1832; ChatMessageList.tsx:709-800).
4. The person picks a button: switch model (sends again on that model), notify me (enables web push then posts to /api/usage/reset-reminder), buy credits, upgrade, own key, or try later.
5. Connector: a tool result with the key agi_connector_authorization_required arrives; the card shows Connect or Reconnect; the link opens /api/connectors/oauth/start?connectorId=<id> (packages/contracts/types/src/connector-connect-required.ts:1-3, 42-58).
6. After connecting, the person sends the request again to continue (apps/web/public/openapi.json:642; doc: docs/decisions/2026-09-27-founder-decisions.md:353-360).

**What the person sees and gets**

- Reminder outcomes: 'We will notify you when it resets.', 'Notifications are blocked for this site in your browser settings.', 'This browser cannot receive notifications.', 'The reminder could not be set. Try again in a minute.' (apps/web/features/chat/lib/usage-reset-reminder.ts:9-14).
- Server notification titled 'Reconnect <name>' when a stored connector token expires (apps/web/lib/connectors/oauth-access.ts:39-56).
- CLI: 'Run `agi usage` to see when the limit resets...' and a plan-excludes-model hint naming an alternative with --model (errors.rs:640-665).

**Settings**

- Free-limit reason codes and recovery options come from the server response; no user setting found.
- Browser notification permission for reset reminders (usage-reset-reminder.ts:17-24).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: usage block store, composer banner and inline card with reset label, top-up, upgrade, own-key and switch-model options (WebChatPage.tsx:1805-1832; InlinePaywallCard.tsx:69-300; freeLimitRecovery.ts:78-118).
- Web: reset reminder through web push and POST to /api/usage/reset-reminder (usage-reset-reminder.ts:17-37); a workflow sends the reminder (apps/web/lib/workflows/__tests__/send-usage-reset-reminder.test.ts exists).
- Mobile: paywall sheet with recovery actions and a standard-model choice (PaywallBottomSheet.tsx:96-190).
- CLI: UsageLimit and PlanExcludesModel errors with next-step hints (errors.rs:216-222, 640-710).
- VS Code: SWITCH_MODEL_CODES offer a switch-model action for failures including a spent free allowance (errorPresentation.ts:471-480).
- Chrome: side panel sets the error action to switch-model for most error codes and for quota presentations (side_panel.ts:9755-9771).
- Connectors: server builds the connect request with reason and link; web, mobile and CLI render it (connector-connect-required.ts:82-120; ToolTimeline.tsx:206-215, 510; connectors.rs:16-66).
- Server records a 'Reconnect <name>' notification when a refresh fails (oauth-access.ts:39-56).

**Incomplete**

- The reminder button is hidden on the desktop host (WebChatPage.tsx:1815-1817).
- CLI recovery is advice text, not a one-step action (errors.rs:640-710).
- Mobile sheet's native purchase actions depend on NATIVE_PURCHASES_AVAILABLE; when false the sheet says 'Not included in your plan' and shows no primary action (PaywallBottomSheet.tsx:116-123, 150-153; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3). The value comes from storePurchases.nativePurchases (not traced).
- The 'Reconnect and resume' half: nothing resumes the interrupted turn. By decision the user sends the request again (doc: docs/decisions/2026-09-27-founder-decisions.md:353-360), so S110.27's brief Should is overridden for resume.

**Present but disconnected or switched off**

- VS Code and Chrome: no managed connector connect card found (searches of apps/extension-vscode/src, apps/extension/src for the authorization key, connectUrl or the reader returned nothing).
- Mobile billing flag FEATURES.billing is false in the v1 phone build (apps/mobile/lib/v1FeatureFlags.ts:8), which affects purchase paths.

**Not available**

- Automatic resume of a turn after reauthorization on any app (decision).
- A reset reminder on mobile, CLI, VS Code, Chrome: not found.

## 4. Required behaviour

**Established requirements**

- When the user runs out of usage the product offers an eligible alternative (a named eligible model, a reset wait or a purchase) the user can take in one step. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.26)
- A reconnected connector does not resume the interrupted turn; the chat offers Reconnect and the person sends the request again; web and desktop do this. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:353-360)
- The switch-model choice appears only when an alternative model is known. (source: apps/web/features/chat/lib/freeLimitRecovery.ts:92-118; InlinePaywallCard.tsx:248-259)
- The connect link must be a same-origin path to /api/connectors/oauth/start for the same connector. (source: packages/contracts/types/src/connector-connect-required.ts:42-58)
- The client is told to open the link and send the request again; the link is null when the deployment cannot connect that connector. (source: apps/web/public/openapi.json:642)

**Acceptance criteria**

1. When a free-lane refusal names an alternative model, the card shows 'Switch to <that model>' and pressing it sends the message on that model.
2. When no alternative is named, no switch button shows.
3. When the reset time is unknown, the card shows no invented time.
4. 'Notify me when it resets' posts the reset instant to /api/usage/reset-reminder after notification permission; denied permission shows the blocked message.
5. On the desktop host the reminder button is absent.
6. A tool result with the authorization key and a valid link shows Connect or Reconnect; a result without isError true or with a link to another path shows no card.
7. After reconnecting, sending the request again completes the tool call; the old turn is not resumed.
8. In a Local or own-key chat no managed usage block appears for managed usage [inferred: refusals come from managed routes].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each app should show the same ladder of options named in InlinePaywallCard; labels differ per app today [inferred from the differing files].
- A reset time shown must always come from the server instant (card must not invent one, InlinePaywallCard.tsx:55-64).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a connect card to VS Code and Chrome, or record a decision that they stay out; the Chrome decision list mentions S110.27 (doc: docs/decisions/2026-09-27-founder-decisions.md:389).
- [proposed] Offer a reset reminder on mobile through its push channel.
- [proposed] Give the CLI a one-step switch (a prompt to rerun with the suggested model).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | InlinePaywallCard | `apps/web/features/chat/components/InlinePaywallCard.tsx` | Card with switch, upgrade, own key, try later and free-capacity variants. |
| service | resolveFreeLimitPaywallSlot | `apps/web/features/chat/lib/freeLimitRecovery.ts` | Builds the paywall slot incl. alternative model (lines 78-118). |
| screen | WebChatPage usage block | `apps/web/features/chat/pages/WebChatPage.tsx` | Account usage block and composer recovery props (lines 1805-1832). |
| component | ChatMessageList paywall | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Renders the inline card and handles switch model (lines 709-800). |
| component | ChatComposerNew banner | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Reset reminder control (lines 4744-4748, 5104). |
| service | requestUsageResetReminder | `apps/web/features/chat/lib/usage-reset-reminder.ts` | Web push opt-in and POST of the reset instant. |
| endpoint | POST /api/usage/reset-reminder | `packages/contracts/cloud-contracts/src/usage-reset-reminder.ts` | Path constant USAGE_RESET_REMINDER_PATH (line 3); route file not located. |
| component | PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile paywall sheet. |
| config | nativePurchaseAvailability | `apps/mobile/src/features/billing/nativePurchaseAvailability.ts` | NATIVE_PURCHASES_AVAILABLE (line 3). |
| service | CliError usage and plan hints | `apps/cli/src/errors.rs` | UsageLimit, PlanExcludesModel messages and hints (lines 216-222, 397, 640-710). |
| service | errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | VS Code recovery actions including switch model (lines 364-480). |
| component | Chrome side panel error action | `apps/extension/src/side_panel.ts` | switch-model action (lines 5957, 9755-9771). |
| schema | connector-connect-required | `packages/contracts/types/src/connector-connect-required.ts` | Reads and validates the connect request (lines 1-120). |
| component | ConnectorConnectCard | `packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx` | Shared Connect or Reconnect card (line 125). |
| component | ToolTimeline connect request | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Finds and renders the connect card (lines 206, 510). |
| service | connectorConnectSentences | `apps/mobile/src/features/chat/utils/connectorConnectSentences.ts` | Mobile headings Connect or Reconnect <name>. |
| service | CLI connectors reconnect | `apps/cli/src/cloud/connectors.rs` | Collects reconnect notices and prints them (lines 16-66). |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | Token refresh outcome and 'Reconnect <name>' notification (lines 39-69). |
| schema | openapi extension | `apps/web/public/openapi.json` | Documents the connector authorization result for API clients (line 642). |
| test | PaywallBottomSheet test | `apps/mobile/__tests__/PaywallBottomSheet.test.tsx` | Covers the mobile sheet. |
| test | usage-reset-reminder test | `apps/web/features/chat/lib/__tests__/usage-reset-reminder.test.ts` | Covers the reminder request. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The chat route refuses a send for usage and returns a coded error with reset time, recovery action and alternative model. | our servers | Client reads these fields in freeLimitRecovery.ts:78-118; the server producers (managed-usage-request-service.ts, free-quota-turn.ts) were found by search but not opened |
| The client stores the usage block and renders the card or banner. | device | WebChatPage.tsx:1805-1832; ChatMessageList.tsx:709-800 |
| Switch model: the client sends the same message with the alternative model id. | device and our servers | ChatMessageList.tsx:794 passes onSwitchModel; handler name handlePaywallSwitchModel (body not opened) |
| Reminder: the browser asks for push permission, then POSTs the reset instant; a workflow later sends the notification. | device and our servers | usage-reset-reminder.ts:17-37; send-usage-reset-reminder test exists |
| Connector: the server tool layer finds the stored grant unusable, records a notification and returns the authorization-required result. | our servers | oauth-access.ts:39-69; openapi.json:642 |
| The client validates the result and link and shows the card; the person authorizes with the outside provider in a browser and returns. | outside service | connector-connect-required.ts:42-120; CONNECTOR_OAUTH_START_PATH line 3 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage block (reason, reset instant, recovery action) | Client chat store (account usage block) | No | Cleared when a send is accepted (WebChatPage.tsx:1797-1803 comment) |
| Reset reminder request | Server (workflow queue) [inferred from the workflow test] | Server only | Not established |
| Reconnect notification | Notification service, deduped per connector per day | Visible in notifications | oauth-access.ts:47-54 dedupeKey |

**Models and providers.** The alternative model is whatever the server names; no model is fixed in the client. Free-limit models are labelled through freeModelLabel (freeLimitRecovery.ts:88-91). Own-key recovery points at a href from the server's recovery list (freeLimitRecovery.ts:97-98).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for managed usage; the CLI says 'Run `agi login` to use your AGI plan, or set the provider's own key.' when signed out (errors.rs:634-638). |
| Permissions | Connector authorization belongs to the signed-in user; the connect link is same-origin only. |
| Subscription | This feature reads plan state: next upgrade tier, top-up for non-free plans, top-up tier equal to the current tier (WebChatPage.tsx:1819-1823; freeLimitRecovery.ts:96-110). |
| Limits and metering | The refusal itself is the output of usage metering; limits live in the billing catalog and free-lane quota code (not opened in full). |
| Feature flags | FEATURES.billing false on the v1 phone build; NATIVE_PURCHASES_AVAILABLE; CONNECTOR_RELEASE_STATE coming_soon affects which connectors exist at all. |
| Model compatibility | The alternative must be eligible for the plan; the rule is on the server (free-quota-fallback.ts found by search; not opened). |
| Provider restrictions | Own-key route: 'Use your own key' appears when a BYOK recovery href is present. |
| Local mode | Local (on device) inference does not consume managed usage, so no usage block arises there [inferred]. In Local mode the CLI session refuses cloud features with a not-managed message instead. Connector tools need the cloud, so Local mode cannot show the connect card [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reset time unknown | No time shown; free-capacity card offers retry immediately. | InlinePaywallCard.tsx:55-64 |
| Countdown | Free-capacity card counts down on the wall clock and stops at zero. | InlinePaywallCard.tsx:285-330 |
| Push denied or unavailable | Messages in USAGE_RESET_REMINDER_COPY. | usage-reset-reminder.ts:9-24 |
| Reminder request fails | 'The reminder could not be set. Try again in a minute.' | usage-reset-reminder.ts:12, 30-36 |
| Upgrade not helpful | showUpgradeCta false hides the upgrade button. | InlinePaywallCard.tsx:84-85, 265-271 |
| Native purchases unavailable on phone | Sheet title 'Not included in your plan' with no primary action. | PaywallBottomSheet.tsx:116-123, 150-153 |
| Connector expired | Reason authorization_expired renders Reconnect; token refresh failure records a notification. | connector-connect-required.ts:7-12; oauth-access.ts:39-69 |
| Connector link null | Deployment cannot connect it; client must not offer a link. | openapi.json:642 |
| Untrusted link | Result rejected, no card. | connector-connect-required.ts:42-58 |
| Retry after reconnect | Manual resend; no automatic resume. | docs/decisions/2026-09-27-founder-decisions.md:353-360 |
| Accessibility | Mobile dismiss control has an accessibility label and 44 pt target; web card accessibility not reviewed. | PaywallBottomSheet.tsx:282-290 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/PaywallBottomSheet.test.tsx`: Mobile paywall sheet.
- `apps/mobile/__tests__/ConnectorConnectCardInPlace.test.tsx`: Mobile connector card.
- `packages/ui/unified-chat/src/components/__tests__/ConnectorConnectCard.test.tsx`: Shared connect card.
- `apps/web/features/chat/lib/__tests__/usage-reset-reminder.test.ts`: Reminder request outcomes.
- `apps/web/lib/workflows/__tests__/send-usage-reset-reminder.test.ts`: Reminder workflow.
- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: Connector token access and reconnect.
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: VS Code error presentation.
- `apps/web/features/chat/lib/free-model-handoff.test.ts`: Switching to a free model after a limit.

**Test scenarios**

- **Switch model from a free limit**
  1. Use a test account at the free daily limit.
  2. Send a message.
  3. Press the Switch button.
  - Expected: The message is sent on the named alternative.
- **No alternative known**
  1. Trigger a refusal without alternative_model.
  - Expected: No switch button; other options show.
- **Reset reminder**
  1. With a known reset time press 'Notify me when it resets' in a browser.
  2. Allow notifications.
  - Expected: 'We will notify you when it resets.' and a request to /api/usage/reset-reminder.
- **Expired connector**
  1. Expire a connector grant in a test database.
  2. Ask for a task that uses it.
  - Expected: Reconnect card with a /api/connectors/oauth/start link and a 'Reconnect <name>' notification.
- **Resend after reconnect**
  1. Reconnect.
  2. Send the request again.
  - Expected: The tool call succeeds; the earlier turn stays interrupted.
- **CLI usage limit**
  1. Trigger a usage-limit error in the CLI.
  - Expected: Error with reset time or 'Run agi usage' and a own-provider hint.

**Where to look when it fails**

- Error codes in free-limit recovery (FREE_LIMIT_REASON_BY_CODE) and CLI error kind 'usage_limit' (errors.rs:523).
- Notification rows titled 'Reconnect <name>'.
- Server log text of the reminder workflow (not opened).
- Response field agi_connector_authorization_required.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)
- VS Code: [70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md)
- Chrome: [70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **No connector connect card in VS Code and Chrome; the brief points at MCP reconnect code in VS Code.** Affects: VS Code, Chrome. Evidence: Searches found the reader only in web, mobile, shared UI and the CLI. Work needed: Add the shared card or record a decision.
- **No automatic resume after reconnect.** Affects: All apps. Evidence: docs/decisions/2026-09-27-founder-decisions.md:353-360. Work needed: None if the decision stands; update the brief's Should line.
- **Reset reminder only on web (not desktop host).** Affects: Desktop, mobile, CLI, VS Code, Chrome. Evidence: WebChatPage.tsx:1815-1817. Work needed: Decide per app.
- **No test file found for InlinePaywallCard itself.** Affects: Web. Evidence: File search by name returned only the mobile sheet test. Work needed: Add a component test for the card variants.
- **One-step recovery is advice only in the CLI.** Affects: CLI. Evidence: errors.rs:640-710. Work needed: Optional: add a rerun suggestion.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- api:POST /api/usage/reset-reminder
- api:GET /api/connectors/oauth/start
- F110-08

## Unknown

- Where the server decides alternative_model and the full set of refusal codes (found in free-quota-turn.ts, managed-usage-request-service.ts, free-quota-fallback.ts, not opened).
- Route file for /api/usage/reset-reminder.
- How Chrome renders a usage-limit card in detail (only the action selection was read).
- Value of storePurchases.nativePurchases for the shipping phone builds.
- What the VS Code and Chrome apps do when a managed connector tool needs reconnecting.
- handlePaywallSwitchModel behaviour (body not read).
