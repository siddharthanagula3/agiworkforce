---
id: "F086-07"
type: "feature"
title: "Security notices"
aliases: ["Security notices", "Security alerts", "Security notifications", "Account activity notifications", "S86.11", "new sign-in notice", "identity security events", "emailSecurityAlerts"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.11"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-authentication-and-identity", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "table:notifications", "table:user_settings", "table:account_security_enrollments", "file:apps/web/lib/services/account-activity-notifications.ts", "api:GET /api/notifications", "api:PUT /api/settings/preferences"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-07 Security notices

AGI tells the signed-in person, in the app and by email, when something security-related happens on the account: a new sign-in, a password change, a two-factor change, replaced backup codes and similar. The person can stop the emails in Settings, Notifications, unless Advanced Account Security is on. Built on web (and the web screens shown in Desktop).

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.11](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8611).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** When a security-relevant act happens, the server records an in-app notification with a link into Settings and, if email is allowed and configured, sends a plain email with the same text. One catalogue defines the title, message, severity and the Settings section each notice opens (apps/web/lib/services/identity-events/catalogue.ts:4-32, 49-60).

**Why it exists.** So an account holder can spot a takeover quickly. Each notice says what to do if the act was not theirs (apps/web/lib/services/identity-events/catalogue.ts:47). The product requires every surface to make trust boundaries knowable (doc: docs/product/requirements.md section 4.4).

**Who uses it.** Every signed-in account holder on web and Desktop (Desktop shows the hosted web app). Account holders with Advanced Account Security cannot turn email notices off in effect.

**Problems it solves**

- A person does not notice a stranger signing in.
- A password or two-factor change made by an attacker goes unseen.
- A person wants fewer emails but still wants in-app alerts.

**Use cases**

- Someone signs in on a new browser; within minutes the owner sees 'A new sign-in to your account' in the app and gets an email.
- The owner changes their password; a 'Your password was changed' notice appears and is emailed.
- The owner regenerates backup codes; a notice says the old codes no longer work.
- The owner switches Security alerts email to Off; later notices still show in the app.

## 2. User experience

**Where to find it**

- Web: Settings, Notifications, row 'Security alerts' with a select that offers Off or Email (apps/web/features/settings/sections/NotificationsSection.tsx:66-72, 98-115). The draft called this a toggle; the code renders a select element.
- Desktop: the same hosted web Settings, Notifications screen (doc: AGENTS.md section 5, public Desktop shows the hosted web app).
- Notices appear in the notification bell on web (apps/web/features/notifications/components/NotificationBell.tsx) and each opens a Settings section (apps/web/lib/services/account-activity-notifications.ts:47).
- Mobile, CLI, VS Code, Chrome: no preference control or notice display found in what was opened; the brief marks CLI, VS Code and Chrome missing (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.11).

**Before you start**

- Signed in with an account that has an email address on its profile (apps/web/lib/services/account-activity-notifications.ts:80-90).
- For emails: the server needs RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL set (names only) (apps/web/lib/services/notification-email-service.ts:10-15).

**Screens and controls**

- Notifications settings page, heading 'Notifications'; row heading 'Security alerts', helper 'Always shown in-app, including quiet hours.', expandable 'Delivery details' text 'Sign-in, password, email, two-factor and device changes. Advanced Account Security needs email.' (NotificationsSection.tsx:66-72).
- One select per row with options Off and Email (NotificationsSection.tsx:98-115).
- Status line shows 'Loading account settings...', 'Saving...', 'Saved' or an error, and a 'Retry loading' button after a load failure (NotificationsSection.tsx).

**Journey**

1. Open Settings, then Notifications.
2. Find 'Security alerts' and read the helper text.
3. Choose Email or Off in the select; it saves at once and the page re-reads the stored value (NotificationsSection.tsx, function setEventChannels).
4. Later, when a security act happens, a notice arrives in the bell; if email is allowed an email arrives too.
5. Open the notice; it goes to the Settings section named by the catalogue (Security or Account) (catalogue.ts:59, 68).

**What the person sees and gets**

- In-app notification with title and message, severity info, warning or success (catalogue.ts:52-60).
- Email with the title as subject, the message, a 'Review your account' link and a footer saying alerts are sent even during quiet hours (notification-email-service.ts:153-164).
- 'Save could not be confirmed. Latest account preferences loaded; review your selection before changing it again.' if a save fails (NotificationsSection.tsx).

**Settings**

- emailSecurityAlerts preference, default on (apps/web/features/settings/lib/notification-preferences.ts:1-7).
- Advanced Account Security enrolment overrides an Off choice for email (account-activity-notifications.ts:59-73, 90).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalogue of 27 security notice kinds with title, message, severity, settings section and audit type (apps/web/lib/services/identity-events/catalogue.ts:4-32).
- New-sign-in notice: first sighting of a session younger than 15 minutes raises new_sign_in once per session across processes using a key-value claim (apps/web/lib/server/session-sightings.ts:14, 23-47); called from the auth layer (apps/web/lib/api-auth.ts:199, 478, 520).
- Password change and backup-code regeneration announce a change after the change succeeds (apps/web/app/api/settings/password/route.ts:98-105; apps/web/app/api/settings/2fa/backup-codes/route.ts:65-72) through announceTwoFactorChange (apps/web/lib/server/two-factor-security-events.ts:26-36).
- Each notice is stored once per dedupe key and emailed only when newly stored (account-activity-notifications.ts:33-54; apps/web/lib/services/notification-service.ts:58-96).
- Email is skipped when the person opted out unless enrolled in Advanced Account Security (account-activity-notifications.ts:75-96).
- Notification failure never stops the audit write (apps/web/lib/services/identity-events/index.ts:68-77).
- Device sign-in approval and account-compromise containment record in-app notices (account-activity-notifications.ts:98-139).

**Incomplete**

- Nine catalogued notices are raised by nothing: new_device, new_location, passkey_added, passkey_removed, api_key_created, api_key_revoked, identity_linked, sso_connection_changed, account_deletion_scheduled (apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66).
- The device-approval and compromise-containment notices are in-app only; no email is sent for them (account-activity-notifications.ts:98-139).
- Email is silently not delivered when the transport variables are not set; the result is 'not_configured' and nothing is logged as a failure (notification-email-service.ts:145-151, 168).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- CLI, VS Code and Chrome have no notice display or preference in what was opened (brief S86.11).
- Mobile: no security-alert preference or feed was found in apps/mobile/src/features/settings; unknown whether the phone shows web notifications.

## 4. Required behaviour

**Established requirements**

- The user is told about security-relevant events (new sign-in, password or 2FA change, new device) and can control how. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.11)
- A new-sign-in notice is sent the first time a session is seen, if it started within the last 15 minutes. (source: apps/web/lib/server/session-sightings.ts:14, 25-47)
- Password and two-step changes send a change notice. (source: apps/web/app/api/settings/password/route.ts:98-105; apps/web/app/api/settings/2fa/backup-codes/route.ts:65-72)
- Each notice is recorded once per dedupe key, then emailed. (source: apps/web/lib/services/account-activity-notifications.ts:33-54)
- Email is skipped when the person has opted out, unless Advanced Account Security is on. (source: apps/web/lib/services/account-activity-notifications.ts:87-91)
- A failed preference lookup logs a warning and sends no email. (source: apps/web/lib/services/account-activity-notifications.ts:69-72, 92-95)
- Every surface must make trust boundaries knowable to the person. (source: doc: docs/product/requirements.md section 4.4)

**Acceptance criteria**

1. After signing in on a new session younger than 15 minutes, exactly one 'A new sign-in to your account' notice appears, and a second request on the same session creates no second notice.
2. Changing the password creates one 'Your password was changed' notice and, with email on, one email whose subject is that title.
3. With Security alerts set to Off and no Advanced Account Security, a security act creates the in-app notice and no email.
4. With Advanced Account Security enrolled and the preference Off, the email is still sent.
5. A session older than 15 minutes seen for the first time creates no notice.
6. If the preference lookup throws, the in-app notice exists, no email is sent and a warning is logged.
7. Replaying the same event with the same reference creates no duplicate notice or email.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because dedupe is per user, event and reference, two real password changes only produce two notices if each carries its own reference; the emit function generates a random reference when none is passed (identity-events/index.ts:72).
- [inferred] The 15-minute window means a long-lived session first seen later does not alert.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Raise the nine unraised notices or remove them from the catalogue so the promise matches the behaviour.
- [proposed] Show on the Security alerts row that email cannot be turned off under Advanced Account Security, instead of only in Delivery details.
- [proposed] Email the device-approval and compromise notices, or state why they are in-app only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | NotificationsSection | `apps/web/features/settings/sections/NotificationsSection.tsx` | Settings screen; Security alerts row with Off/Email select. |
| config | NOTIFICATION_DEFAULTS | `apps/web/features/settings/lib/notification-preferences.ts` | Defaults including emailSecurityAlerts true. |
| service | notification-preferences-client | `apps/web/features/settings/services/notification-preferences-client.ts` | Reads and saves notification preferences through the preferences endpoint. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores settings.notifications.emailSecurityAlerts in user_settings. |
| service | identity-events catalogue | `apps/web/lib/services/identity-events/catalogue.ts` | Defines the 27 event kinds and their copy. |
| service | emitIdentitySecurityEvent | `apps/web/lib/services/identity-events/index.ts` | Observes risk, notifies, writes audit for one event. |
| service | notifyIdentitySecurityEvent | `apps/web/lib/services/account-activity-notifications.ts` | Records the notification once and sends the email under preference rules. |
| service | noteSessionSighting | `apps/web/lib/server/session-sightings.ts` | Raises new_sign_in for the first sighting of a fresh session. |
| service | announceTwoFactorChange | `apps/web/lib/server/two-factor-security-events.ts` | Wrapper used by password and 2FA routes. |
| endpoint | /api/settings/password | `apps/web/app/api/settings/password/route.ts` | Raises password_changed after a change. |
| endpoint | /api/settings/2fa/backup-codes | `apps/web/app/api/settings/2fa/backup-codes/route.ts` | Raises backup_codes_regenerated. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | insertNotification with on conflict do nothing on (user_id, dedupe_key); feed listing. |
| table | public.notifications | `apps/web/lib/services/notification-service.ts` | In-app notices; unique dedupe_key per user. |
| service | sendSecurityAlertEmail | `apps/web/lib/services/notification-email-service.ts` | Builds and sends the transactional email with an idempotency key. |
| table | public.account_security_enrollments | `apps/web/lib/services/account-activity-notifications.ts` | Read to decide whether email is required. |
| table | public.user_settings | `apps/web/lib/services/account-activity-notifications.ts` | Holds the emailSecurityAlerts opt-out. |
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Shows the in-app notices. |
| endpoint | GET /api/notifications | `apps/web/app/api/notifications/route.ts` | Feed read for the bell. |
| test | security-event-coverage | `apps/web/lib/server/__tests__/security-event-coverage.test.ts` | Guards that every catalogued notice is raised or listed as unraised. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A request arrives with a session; the auth layer calls noteSessionSighting and the work runs after the response. | our servers | apps/web/lib/api-auth.ts:199, 478, 520; apps/web/lib/server/session-sightings.ts:49-72 |
| The identity provider is asked when the session started; older than 15 minutes means no notice; otherwise a key-value claim with a session-lifetime expiry decides whether this is the first sighting. | outside service | apps/web/lib/server/session-sightings.ts:29-37 |
| emitIdentitySecurityEvent records a risk observation, tries the notice, then writes an audit record. | our servers | apps/web/lib/services/identity-events/index.ts:53-94 |
| The notice is inserted in public.notifications with a dedupe key identity:<event>:<ref>; a duplicate stops the flow. | our servers | account-activity-notifications.ts:33-43; apps/web/lib/services/notification-service.ts:77 |
| The profile email and the opt-out are read; Advanced Account Security enrolment overrides an opt-out. | our servers | account-activity-notifications.ts:59-96 |
| The email is sent through the email transport with an idempotency key. | outside service | notification-email-service.ts:155-166 |
| The person opens the bell or the email link and lands in Settings. | device | account-activity-notifications.ts:47-52 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notification row (category security, severity, title, message, target, dedupe_key) | table public.notifications | Read by the web feed; no other surface path was opened | Retention not found in the code opened; withdrawNotification can delete by dedupe key (notification-service.ts) |
| emailSecurityAlerts preference | user_settings.settings.notifications | Account-wide through the preferences endpoint | Kept with account settings |
| Session-seen claim key | server key-value store, key prefix session-seen | Shared across server processes | Expires after the session absolute lifetime (session-sightings.ts:34-37) |
| Audit event for the security act | audit log through recordAuditEvent | Server only | unknown |

**Models and providers.** No AI model or inference provider takes part. The email transport is an outside service configured by environment variables (notification-email-service.ts:10-15).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the notice is addressed by user id and profile email (account-activity-notifications.ts:80-90). |
| Permissions | The preference is saved by the signed-in owner; no workspace-role rule found for this row. |
| Subscription | none found in the code |
| Limits and metering | none found in the code for notices; the feed has a page limit (notification-service.ts:25-26). |
| Feature flags | none found in the code; email delivery depends on RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL being set. |
| Model compatibility | Not applicable; no model is involved. |
| Provider restrictions | Email goes through the configured transactional email provider (named in the variable); no AI provider. |
| Local mode | No local path found. Notices are created on our servers for an account, so a person who uses only Local inference without an account gets none. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Select is disabled while the preference loads; status shows 'Loading account settings...'. | apps/web/features/settings/sections/NotificationsSection.tsx (editable flag and status line) |
| load error | Error text plus a 'Retry loading' button. | apps/web/features/settings/sections/NotificationsSection.tsx (retryLoad) |
| save failure | Latest stored preferences are re-read and a message asks the person to review. | apps/web/features/settings/sections/NotificationsSection.tsx (setEventChannels) |
| not signed in | 'Sign in to load account preferences.' | apps/web/features/settings/sections/NotificationsSection.tsx (status line) |
| opt-out lookup fails | Warning logged; no email; in-app notice stays. | account-activity-notifications.ts:92-95 |
| Advanced Account Security status unreadable | Treated as not required, so an opt-out wins. | account-activity-notifications.ts:69-72 |
| email not configured | No email; reason not_configured returned; no warning. | notification-email-service.ts:145-151, 168 |
| key-value store missing at sign-in | No notice now; the sighting is retried later because the remembered key is dropped. | session-sightings.ts:32-33, 60-62 |
| duplicate event | No second notice or email. | account-activity-notifications.ts:43; notification-service.ts:77 |
| accessibility | Each row is a labelled section with an aria-label select; details in a disclosure element. | apps/web/features/settings/sections/NotificationsSection.tsx (section and select markup) |
| offline, cancel, timeout | not handled in the code beyond the save and load failure paths above | looked in NotificationsSection.tsx and account-activity-notifications.ts; nothing else found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/session-sightings.test.ts`: Sighting dedupe, retries after provider or store failure, product-scoped notice, no notice without a native session.
- `apps/web/lib/services/__tests__/account-activity-notifications.test.ts`: Notices for every identity event, dedupe key and call-site sentence, device sign-in, compromise notice, settings sections exist.
- `apps/web/lib/services/identity-events/__tests__/identity-events.test.ts`: Emit notifies, audits and observes every event; audit survives notification failure; risk-signal event.
- `apps/web/lib/services/identity-events/__tests__/catalogue-destinations.test.ts`: Catalogue destinations.
- `apps/web/lib/server/__tests__/security-event-coverage.test.ts`: Every catalogued notice is raised or listed as unraised; each message says 'not you'.
- `apps/web/lib/services/__tests__/notification-email-service.test.ts`: Email content, not-configured guard, transport failure.
- `apps/web/features/settings/sections/NotificationsSection.permission.test.tsx`: Notifications settings controls including emailSecurityAlerts.
- `apps/web/features/settings/services/notification-preferences-client.test.ts`: Preference read and parse.
- `apps/web/app/api/settings/password/__tests__/route.test.ts`: Password route behaviour including the announcement.
- `apps/web/e2e/qa-settings-agent-ux.spec.ts`: Mentions emailSecurityAlerts in a browser spec; exact steps not opened.

**Test scenarios**

- **New sign-in notice**
  1. Sign in on a clean browser profile.
  2. Open the notification bell within 15 minutes.
  3. Reload and open it again.
  - Expected: One 'A new sign-in to your account' notice, not two.
- **Email opt-out**
  1. Set Settings, Notifications, Security alerts to Off.
  2. Change the password.
  3. Check the bell and the mailbox.
  - Expected: In-app 'Your password was changed' notice; no email.
- **Advanced Account Security override**
  1. Enrol the account in Advanced Account Security.
  2. Keep Security alerts Off.
  3. Regenerate backup codes.
  - Expected: In-app notice and an email.
- **Email transport missing**
  1. Run a test deployment without the email variables.
  2. Change the password.
  - Expected: In-app notice only; no failure logged.
- **Unraised notices**
  1. Add and remove a passkey; create and revoke an API key.
  - Expected: No in-app notice for these acts today (see gaps).

**Where to look when it fails**

- Log line '[session-sightings] new sign-in notice failed'.
- Log line '[notifications] security alert preference unreadable'.
- Log line '[notifications] advanced account security state unreadable'.
- Log line '[notifications] security alert email failed to send'.
- Log line '[identity-events] notification failed'.
- Table public.notifications by dedupe_key prefix identity:.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Nine catalogued notices are never raised, including passkey added or removed, API key created or revoked, new device and new location.** Affects: Web and Desktop account holders.. Evidence: apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66. Work needed: Raise each where the act happens or drop it from the catalogue.
- **No notice display or alert preference on CLI, VS Code, Chrome (and none found on mobile).** Affects: CLI, VS Code, Chrome, Mobile users.. Evidence: S86.11 brief; apps/mobile/src/features/settings searched. Work needed: Decide whether those surfaces show the web feed; add a read surface.
- **Device-approval and compromise notices are not emailed.** Affects: People who are away from the app when a device is approved.. Evidence: apps/web/lib/services/account-activity-notifications.ts:98-139. Work needed: Send email through the same preference rules.
- **Choosing Off for Security alerts looks effective but Advanced Account Security still emails; the only hint is inside Delivery details.** Affects: Web and Desktop users with Advanced Account Security.. Evidence: NotificationsSection.tsx:69-71; account-activity-notifications.ts:90. Work needed: Show the rule next to the control.
- **Silent skip of email when the transport is not configured.** Affects: Operators.. Evidence: notification-email-service.ts:145-151, 168. Work needed: Log or surface a deployment check.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-authentication-and-identity
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- table:notifications
- table:user_settings
- table:account_security_enrollments
- file:apps/web/lib/services/account-activity-notifications.ts
- api:GET /api/notifications
- api:PUT /api/settings/preferences

## Unknown

- Whether the phone shows the web notification feed or any security notice.
- Retention period of notification rows and audit events.
- Whether Desktop in-app notices also raise operating-system notifications.
- What the e2e spec qa-settings-agent-ux.spec.ts asserts about Security alerts (not opened).
- Quiet-hours behaviour in the feed (text says always shown; the quiet-hours logic was not opened).
