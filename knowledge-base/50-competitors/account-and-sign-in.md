---
id: "COMP-account-and-sign-in"
type: "competitor-trace"
title: "Account and sign-in"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Account and sign-in: competitors to requirements

Claude and ChatGPT document sign-in, verification, sessions, security and age rules in depth; Claude Code and Codex add terminal sign-in. AGI covers the common core on web: code, password, social, passkeys, authenticator, sessions, SSO and 18+. Gaps: no sign-in everywhere on CLI, VS Code and Chrome, no ID age check, no phone or push factors, no second account, no guest chat, and no admin sign-in limits.

**How the products divide this topic.** Evidence date for all competitor claims: 2026-11-22, from the saved catalogue only. Claude (support.claude.com) is the chat product: Google, emailed link and SSO sign-in, no password, 28-day web session, active sessions page, 18+ with Yoti or Persona age checks, phone verification at sign-up. Claude Code (code.claude.com) is the separate coding tool: browser login, /login, /logout, setup-token for CI, managed login restrictions, gateway SSO, cloud-provider credentials. It connects to the chat product because a Pro, Max, Ultra, Team or Enterprise claude.ai login is the main way in and the Free plan has no Claude Code access. ChatGPT (help.openai.com) is the chat product: password, Google, Microsoft, Apple, phone-only sign-up, MFA by app, push, SMS or passkey, Advanced Account Security, active sessions, two-account switcher, age prediction with Persona. Codex (learn.chatgpt.com/docs) is the separate coding tool: Sign in with ChatGPT or an API key, device code, access tokens, workspace locks; it shares the ChatGPT account. Plan limits: enterprise SSO, SCIM, admin sign-in locks and account-switching switches are Team, Business or Enterprise only; Advanced Account Security is documented for personal accounts on Free, Go, Plus and Pro. Many pages carry region limits (phone-only sign-up is rolling out in some regions; Italy age check). AGI line numbers below were checked on 2026-11-24 where given as path:line; comparison CSV line numbers drift, so rows cited only by file name were not re-checked. Sign-in is separate from payment: Local chat on mobile and desktop needs no account (requirements.md M-US-002 and decisions 2026-11-13), and Managed Free needs sign-in.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-account-and-sign-in-01](#cap-account-and-sign-in-01) | Passwordless email sign-in | yes | partly | partly built | seen working by a person |
| [CAP-account-and-sign-in-02](#cap-account-and-sign-in-02) | Email and password sign-in, reset and add password | no | yes | built | code inspected only |
| [CAP-account-and-sign-in-03](#cap-account-and-sign-in-03) | Social sign-in (Google, Apple, Microsoft, GitHub) | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-04](#cap-account-and-sign-in-04) | Phone number sign-up and phone verification | yes | partly | not built | not verified |
| [CAP-account-and-sign-in-05](#cap-account-and-sign-in-05) | Passkeys for sign-in and as a second step | unknown | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-06](#cap-account-and-sign-in-06) | Two-step verification (authenticator, SMS, push) and backup codes | unknown | yes | partly built | not verified |
| [CAP-account-and-sign-in-07](#cap-account-and-sign-in-07) | Hardened account mode (Advanced Account Security) and recovery keys | unknown | yes | built | code inspected only |
| [CAP-account-and-sign-in-08](#cap-account-and-sign-in-08) | Login verification for new devices and push approval | unknown | yes | partly built | seen working by a person |
| [CAP-account-and-sign-in-09](#cap-account-and-sign-in-09) | Active sessions list with remote sign-out | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-10](#cap-account-and-sign-in-10) | Log out of all devices | yes | yes | partly built | seen working by a person |
| [CAP-account-and-sign-in-11](#cap-account-and-sign-in-11) | Session lifetime and renewal | yes | unknown | partly built | seen working by a person |
| [CAP-account-and-sign-in-12](#cap-account-and-sign-in-12) | Several accounts on one device | partly | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-13](#cap-account-and-sign-in-13) | Personal and work accounts: join, discover, migrate | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-14](#cap-account-and-sign-in-14) | Enterprise single sign-on, domain verification and directory sync | yes | yes | built | code inspected only |
| [CAP-account-and-sign-in-15](#cap-account-and-sign-in-15) | Admin limits on how and where people sign in | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-16](#cap-account-and-sign-in-16) | Age requirement and server-held age decision | yes | yes | partly built | seen working by a person |
| [CAP-account-and-sign-in-17](#cap-account-and-sign-in-17) | Age verification by selfie or ID, and teen experience | yes | yes | not built | not verified |
| [CAP-account-and-sign-in-18](#cap-account-and-sign-in-18) | Verified access programs (identity checks for sensitive capabilities) | yes | yes | not built | not verified |
| [CAP-account-and-sign-in-19](#cap-account-and-sign-in-19) | Delete account and reuse of email or phone | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-20](#cap-account-and-sign-in-20) | Change email, name and profile | partly | yes | built | code inspected only |
| [CAP-account-and-sign-in-21](#cap-account-and-sign-in-21) | Account recovery, compromised account and bans | yes | yes | partly built | not verified |
| [CAP-account-and-sign-in-22](#cap-account-and-sign-in-22) | Use without an account | unknown | yes | partly built | not verified |
| [CAP-account-and-sign-in-23](#cap-account-and-sign-in-23) | Terminal and editor sign-in (browser, device code, headless) | yes | yes | built | code inspected only |
| [CAP-account-and-sign-in-24](#cap-account-and-sign-in-24) | Credentials for automation (tokens, API keys, storage) | yes | yes | partly built | code inspected only |
| [CAP-account-and-sign-in-25](#cap-account-and-sign-in-25) | Use the assistant account to sign in elsewhere | unknown | yes | not built | not verified |
| [CAP-account-and-sign-in-26](#cap-account-and-sign-in-26) | Linked sign-in methods, security history and device lock | unknown | unknown | built | code inspected only |
| [CAP-account-and-sign-in-27](#cap-account-and-sign-in-27) | Supported regions and one-person-per-account rule | yes | yes | partly built | not verified |

## CAP-account-and-sign-in-01 Passwordless email sign-in

Sign up or sign in with a one-time emailed code or link, with no password.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account): Continue with email sends a login link; opened on another device it shows a verification code to enter. Claude accounts cannot have a password. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification](https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification): Accounts sign in by password, Google, Microsoft, Apple, temporary code or tenant SSO. The code is a recovery or verification step, not the main path. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S3.04). Email one-time code sign-in works on every surface that has a sign-in screen, with resend and autofill.

**With different models, providers and the one subscription.** Identity is independent of model and provider. The account resolves one subscription entitlement on every app. Local chat needs no code.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web built (email code). Mobile sends a code, not a link. Desktop uses the web page in the system browser. CLI, VS Code, Chrome use browser or device hand-off. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.01, S3.03, S3.04, S3.05
- Comparison list ids: MP5; rows without an id: web:Sign in with an emailed code (no password)
- Code: `apps/web/features/auth/IdentityAuthAdapter.tsx (email_code strategy, line 40)`; `apps/web/features/auth/AuthCodeStep.tsx`; `apps/mobile/src/features/auth/components/MobileSignIn.tsx`; `apps/desktop/electron/browserSignIn.ts:47`

**Gap.** No emailed secure link with cross-device code (S3.05 missing on all six apps). Mobile code step is unverified in the ledger (S3.03, S3.04).

**Acceptance criteria**

1. Enter an email on the login page; a six-digit code arrives and signs in.
2. A wrong code shows a plain recovery message and the right code then works.
3. Resend returns a new code and the old one stops working.
4. On mobile the same code flow signs in.

**Verification: seen working by a person.** scorecards/web.csv W-1 subscribed and free: signed in with the emailed code, a wrong code showed a clear message, the right code reached /chat. Public sign-up form not tested (Turnstile blocked, defects csv W-1 free setup_limit). Mobile not seen.

## CAP-account-and-sign-in-02 Email and password sign-in, reset and add password

Sign in with email and password, reset a forgotten password by email, and add or change a password later.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account): Claude accounts cannot have a dedicated password; sign-in is Google, email link or SSO.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/4936828-resetting-or-changing-your-chatgpt-password](https://help.openai.com/en/articles/4936828-resetting-or-changing-your-chatgpt-password): Forgot password link emails a reset; Settings > Account adds or updates a password, shared with the API Platform. Apps: web.
  - [https://help.openai.com/en/articles/4936824-changing-your-account-sign-in-method](https://help.openai.com/en/articles/4936824-changing-your-account-sign-in-method): An email and password account can also sign in with Google, Microsoft or Apple when the email matches. Apps: web.

**AGI requirement** (stated requirement; source: ledger S86.02 (Should line); docs/product/definition.md line 281 account settings). Password is optional: an account can add, change and reset one on web and mobile.

**With different models, providers and the one subscription.** No effect on model choice or entitlement. Local mode needs none.

**Current implementation, as this trace read it on 2026-11-24: built.** Web built (reset page, password editor, Add password). Mobile has Set or Change password. Desktop reuses web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.06, S3.07, S86.02
- Comparison list ids: none matched; rows without an id: web:Sign in with email and password; web:Add a password to an account made with a social login; web:Forgot password: reset by an emailed link; web:Set or change a password in the app (mobile)
- Code: `apps/web/app/auth/reset-password/layout.tsx`; `apps/web/features/settings/components/Settings/PasswordEditor.tsx`; `apps/mobile/src/features/settings/account-security/index.tsx`

**Gap.** Mobile reset is unverified in the ledger. Review accounts need password sign-in (owner memory, 2026-11-20); not re-checked.

**Acceptance criteria**

1. From Security, set a password on an account made with a social login.
2. Sign out; sign in with email and password.
3. Use Forgot password; a reset link or code arrives and a new password signs in.
4. On mobile, Change password works for a password account.

**Verification: code inspected only.** Comparison CSV and ledger by code reading; no scorecard row covers password sign-in.

## CAP-account-and-sign-in-03 Social sign-in (Google, Apple, Microsoft, GitHub)

Continue with a third-party identity, including Apple Hide My Email relay addresses.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account): Continue with Google on web, desktop and mobile; Apple Hide My Email accounts use the relay address with the email option on other devices. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt): Sign in with email and password or Continue with Google, Microsoft or Apple; the wrong method gives an error. Apple Hide My Email relay accounts need that address; Android uses a browser flow. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: ledger S3.08 (Should line); decisions D-2026-09-05-04 (provider catalogue in client-runtime)). Offer Google and Apple at least, plus any provider the owner enables, driven by one configured list; Apple on iPhone is native.

**With different models, providers and the one subscription.** Sign-in provider is unrelated to model provider. Same entitlement whichever method signs in.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web default list is Google and GitHub; Apple and Microsoft appear only when AGI_AUTH_PROVIDERS lists them (production value not visible). Mobile: Google, GitHub, Apple on iPhone only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.08
- Comparison list ids: MP1, WP13, WP4; rows without an id: web:Sign in with Google; web:Sign in with GitHub; mobile:Continue with Apple on iPhone
- Code: `packages/client/client-runtime/src/authProviders.ts:17 (DEFAULT_AUTH_PROVIDER_IDS google, github)`; `apps/web/features/auth/authProviderConfig.ts`; `apps/mobile/src/features/auth/services/loginProviders.ts`

**Gap.** Apple (web) and Microsoft not on by default; Microsoft absent on mobile; Android has no Apple. Regional logins such as Kakao (W8) missing.

**Acceptance criteria**

1. Login page shows Google and the configured providers, same list on sign-up.
2. Signing in with Apple Hide My Email on iPhone, then on another device with email code, reaches the same account.
3. Matching email via two methods lands on one account or shows a clear link prompt.

**Verification: code inspected only.** Not on any scorecard row; Turnstile blocked social flows in headless tests.

## CAP-account-and-sign-in-04 Phone number sign-up and phone verification

A phone number either completes sign-up (phone-only) or is demanded as a verification step.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8287232-verify-your-phone-number](https://support.claude.com/en/articles/8287232-verify-your-phone-number): A six-digit SMS code from a supported-location number is required at sign-up; no VoIP, landlines or app numbers; limited accounts per number. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10388702-phone-only-signups](https://help.openai.com/en/articles/10388702-phone-only-signups): Eligible new users in some regions can sign up with only a phone number; an email can be linked later; a deleted account frees the number after 30 days. Apps: web.
  - [https://help.openai.com/en/articles/8983040-what-does-phone-verification-look-like](https://help.openai.com/en/articles/8983040-what-does-phone-verification-look-like): Phone verification is not required for ChatGPT but may be asked for Codex in the desktop app and is mandatory for the first API key. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Not required. AGI asks for no phone number; any phone factor would be a proposal needing an owner decision.

**With different models, providers and the one subscription.** Abuse limits on Free quotas must come from the subscription system, not from a phone number. Local needs none.

**Current implementation, as this trace read it on 2026-11-24: not built.** No phone number at sign-up on any app; flagged as an advantage on web, N/A on desktop, missing on mobile account page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M1, W11; rows without an id: web:Phone number required to sign up; desktop:Phone number required to continue
- Code: `searched in comparison-web.csv: no phone verification code in apps/web/features/auth` (not found)

**Gap.** No phone-only sign-up and no phone verification. Whether to match is an owner choice.

**Acceptance criteria**

1. Sign-up on web and mobile completes with no phone prompt.
2. If the owner adds phone sign-up, a code from an unsupported number type is refused with a plain message.

**Verification: not verified.** Sign-up form blocked in tests (defects csv W-1 setup_limit).

## CAP-account-and-sign-in-05 Passkeys for sign-in and as a second step

Register passkeys or hardware keys, list and remove them, and sign in with one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001039-passkeys-to-secure-your-openai-account](https://help.openai.com/en/articles/20001039-passkeys-to-secure-your-openai-account): Settings > Security > Passkeys > Add passkey (Face ID, Touch ID, PIN or a hardware key); passkeys work for sign-in and MFA. Apps: web.

**AGI requirement** (stated requirement; source: ledger S3.11, S3.12, S86.03 (Should lines)). A user can add, rename and remove passkeys and sign in with one on web, desktop and mobile.

**With different models, providers and the one subscription.** None. Identity only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: panel to add, list, remove built; sign-in button appears only when passkey is in AGI_AUTH_PROVIDERS. Mobile lists and removes; adding opens web; no passkey sign-in. Desktop unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.11, S3.12, S86.03
- Comparison list ids: M7, MP4, WP12; rows without an id: web:Add and manage passkeys
- Code: `apps/web/features/settings/components/Settings/PasskeysPanel.tsx`; `apps/web/features/auth/authProviderConfig.ts`; `apps/mobile/src/features/settings/account-security/PasskeysSection.tsx`

**Gap.** Mobile passkey sign-in and in-app enrollment missing (S86.03 mobile missing). Production setting for web sign-in not visible.

**Acceptance criteria**

1. Add a passkey in Security; it is listed and removable.
2. Sign out; sign in with the passkey from the login page.
3. On mobile, a registered passkey is listed and can be removed.

**Verification: code inspected only.** Comparison CSV and ledger; no human run.

## CAP-account-and-sign-in-06 Two-step verification (authenticator, SMS, push) and backup codes

A second factor at sign-in with recovery codes, set up and turned off by the user.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa](https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa): MFA can use an authenticator app, push approval, a six-digit SMS or WhatsApp code, or a passkey. Apps: web.
  - [https://help.openai.com/en/articles/4936824-changing-your-account-sign-in-method](https://help.openai.com/en/articles/4936824-changing-your-account-sign-in-method): MFA is bound to the login method; to switch method, turn MFA off, sign in with the new method and turn it on again. Apps: web.

**AGI requirement** (stated requirement; source: ledger S3.13, S3.14, S3.15, S86.04, S86.05 (Should lines)). Authenticator-app second factor with backup codes on every app that has accounts; a workspace may require it for all members.

**With different models, providers and the one subscription.** None for models. Required-MFA policy follows the workspace subscription; Local chat unaffected.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built (app codes, backup codes). Mobile has authenticator setup and codes; live second-factor sign-in check is an open owner item. No SMS, WhatsApp or push on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.13, S3.14, S3.15, S86.04, S86.05
- Comparison list ids: M5, M8, W13, W14; rows without an id: web:Two-step sign-in with an authenticator app; mobile:Two-step sign in with an authenticator app
- Code: `apps/web/features/settings/sections/SecuritySection.tsx`; `apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx`; `decisions 2026-09-27 D-2026-09-28-01 (paid auth plan not yet bought; ledger S3.14 'Unfinished' says enable in Clerk Dashboard)` (not found)

**Gap.** SMS, WhatsApp and push factors missing. The 2026-09-28 decision says authenticator controls may show Temporarily unavailable until the vendor plan is bought; current state in production not verified.

**Acceptance criteria**

1. Enrol an authenticator; sign-in then asks for the code.
2. Backup codes display once, can be copied, and one works at sign-in.
3. Turn the second factor off and sign in without it.
4. On mobile, complete a second-factor sign-in live.

**Verification: not verified.** No scorecard covers MFA; ledger notes the mobile live check is outstanding.

## CAP-account-and-sign-in-07 Hardened account mode (Advanced Account Security) and recovery keys

Optional mode that requires passkeys or hardware keys only, issues recovery keys and adds a waiting period for recovery.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001221-advanced-account-security](https://help.openai.com/en/articles/20001221-advanced-account-security): Optional setting requiring at least two passkeys or FIDO security keys, one cross-device; single-use recovery keys start recovery that unlocks after 48 hours. Plans: Free, Go, Plus, Pro (personal accounts). Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001259-troubleshooting-openai-daybreak](https://help.openai.com/en/articles/20001259-troubleshooting-openai-daybreak): Not offered to enterprise-managed accounts or accounts tied to a verified claimed domain. Plans: Enterprise, Business. Apps: web.

**AGI requirement** (stated requirement; source: ledger S86.26 (Should line)). A hardened account-security mode exists with a stated recovery wait and an undo window, on every surface that has accounts.

**With different models, providers and the one subscription.** No effect on models. Entitlement unchanged.

**Current implementation, as this trace read it on 2026-11-24: built.** Web panel built (turning on emails a 48-hour undo link); mobile row opens the web page in an in-app browser. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.26
- Comparison list ids: MP2; rows without an id: web:Advanced Account Security
- Code: `apps/web/features/account-security/components/AdvancedAccountSecurityPanel.tsx:65 (UNDO_HOURS)`

**Gap.** Mobile has no mode of its own, only a web hand-off.

**Acceptance criteria**

1. Turn the mode on from web Security; the undo email arrives.
2. Undo within the window restores the previous state.
3. Mobile shows the state and opens the web page.

**Verification: code inspected only.** Comparison CSV only.

## CAP-account-and-sign-in-08 Login verification for new devices and push approval

An extra emailed code or push approval when a login comes from a new device or unusual place, plus temporary lockout after repeated failures.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9889414-why-am-i-being-asked-to-verify-my-login](https://help.openai.com/en/articles/9889414-why-am-i-being-asked-to-verify-my-login): A new device, unusual location or sensitive change triggers a six-digit emailed code; the signed-in mobile app can get a push to approve or deny. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt): Repeated failed codes can trigger a temporary lockout. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Risky sign-ins get an extra check or at least a visible alert; repeated failures lock briefly.

**With different models, providers and the one subscription.** None.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web records and labels a new-device sign-in and can email an alert; no extra code step; lockout covers only the advanced-security enrolment code (5 tries, 60 minutes). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.11
- Comparison list ids: M5, WP14, WP9
- Code: `apps/web/app/api/settings/activity/activity-presentation.ts`; `packages/contracts/cloud-contracts/src/account-security.ts`

**Gap.** No new-device code; no push approval; ordinary sign-in lockout left to the identity vendor.

**Acceptance criteria**

1. A sign-in from a new browser appears in Security activity and triggers an alert email.
2. Five wrong codes in a row show a lockout message with a wait time.

**Verification: seen working by a person.** Partial: scorecards W-1 free showed a 'A new sign-in to your account' notification on first sign-in (defects csv lists it as unread on first-ever sign-in). Lockout not seen.

## CAP-account-and-sign-in-09 Active sessions list with remote sign-out

A list of signed-in devices and browsers with place and last active time, and a way to end any one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13124001-managing-your-active-sessions](https://support.claude.com/en/articles/13124001-managing-your-active-sessions): Settings > Account lists devices and browsers with approximate location, last active time and a Current marker; a three-dot menu ends a session after confirmation. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt](https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt): Settings > Security > Active sessions shows device, app, approximate location and sign-in time; log out of one session or all. Plans: All plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 281; ledger S86.06). Active sessions with device, location, created and last active, with per-session sign-out, on web, desktop and mobile; CLI and extensions are listed or revocable from the account.

**With different models, providers and the one subscription.** None.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile built. CLI can only list devices read-only (no revoke); VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.06, S86.07, S86.08
- Comparison list ids: CP8; rows without an id: web:Active sessions list with sign-out per session; mobile:Active sessions
- Code: `apps/web/features/settings/sections/AccountSection.tsx:632 (Active sessions heading)`; `apps/mobile/src/features/settings/account-security/index.tsx`; `apps/cli/src/cloud/devices.rs (no revoke call)`

**Gap.** No sign-out of one CLI, VS Code or Chrome sign-in from the device list (CP8).

**Acceptance criteria**

1. Account pane shows device, location, created and last active.
2. Revoking another session makes that device ask for sign-in again.
3. Mobile lists sessions and signs one out after confirm.
4. A CLI sign-in appears in the list and can be revoked.

**Verification: code inspected only.** Comparison CSV; not on web scorecard.

## CAP-account-and-sign-in-10 Log out of all devices

One action that ends every session and credential for the account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions): Settings > Account > Log Out signs out every browser, mobile device, desktop app and Claude Code sign-in; removing a Claude Code token is separate. Apps: web, desktop, ios, android, cli, chrome, slack.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9243857-how-do-i-log-out-of-all-of-my-devices](https://help.openai.com/en/articles/9243857-how-do-i-log-out-of-all-of-my-devices): Settings, Security, Log out all ends the current session at once and others within 30 minutes. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 281; ledger S86.10). Account settings include log out of all devices, and it also ends CLI, VS Code, Chrome and desktop credentials.

**With different models, providers and the one subscription.** Ends sessions only; Local chats on a device stay on that device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile built. CLI logout clears this machine only; VS Code and Chrome sign out this browser or editor only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.09, S86.10
- Comparison list ids: C10, X1; rows without an id: web:Log out of all devices
- Code: `apps/web/features/settings/sections/SecuritySection.tsx:120`; `apps/cli/src/lib.rs (logout clears local sign-in)`

**Gap.** Need proof that web sign-out-all ends CLI, VS Code and Chrome credentials; no sign-out-everywhere action in CLI or extension.

**Acceptance criteria**

1. After Log out of all devices on web, a second browser, the phone and the CLI all ask to sign in.
2. CLI and Chrome offer a sign-out-everywhere action or point to the web page.

**Verification: seen working by a person.** scorecards W-1: log out went to the public home page and /chat signed out redirected to /login. The all-devices action itself was not run.

## CAP-account-and-sign-in-11 Session lifetime and renewal

How long a sign-in lasts and how it renews, including idle timeout and expiry handling.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions): A claude.ai session lasts 28 days from last activity and is refreshed each hour of use. Apps: web.
  - [https://code.claude.com/docs/en/authentication.md](https://code.claude.com/docs/en/authentication.md): Claude Code warns three days before login expiry and /login renews; sessions on one machine share a saved login. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; owner decisions 2026-11-11 recorded in owner memory, not in docs/decisions). Sessions have a stated lifetime and a quiet recovery when they end; the owner kept the identity vendor's 7-day limit and wants phone sessions to last until sign-out.

**With different models, providers and the one subscription.** Same session rules for every provider route; Local chat never needs a session.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: up to 7 days with user-set idle timeout; /session-expired and /recover pages. Mobile: session timeout row. CLI: file lock shares login across sessions. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.06
- Comparison list ids: CP1, WP16; rows without an id: web:Account recovery and expired-session recovery pages; mobile:Choose how long a session lasts
- Code: `apps/web/lib/auth/session-policy.ts:57 (absolute and idle bounds)`; `apps/web/app/session-expired/page.tsx`; `apps/cli/src/auth.rs:543 (lock)`

**Gap.** CLI auth-status gives no pre-expiry warning and no JSON (CP1). Web session shorter than Claude's 28 days by owner choice.

**Acceptance criteria**

1. After the idle timeout the web app shows the expired-session page and returns to the same chat after sign-in.
2. Reloading keeps the session.
3. CLI auth-status shows expiry.

**Verification: seen working by a person.** scorecards W-1 subscribed: a reload stayed signed in; sign out and back in returned the same account and chat. Expiry not seen.

## CAP-account-and-sign-in-12 Several accounts on one device

Stay signed in to two accounts (for example personal and work) and switch without logging out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization](https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization): The initials menu in the lower left lists personal and organization accounts with a checkmark on the active one. Plans: Team, Enterprise. Apps: web, desktop.
  - [https://code.claude.com/docs/en/authentication.md](https://code.claude.com/docs/en/authentication.md): Claude Code keeps separate logins per config directory (CLAUDE_CONFIG_DIR). Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001068-using-multiple-chatgpt-accounts-on-web-and-mobile](https://help.openai.com/en/articles/20001068-using-multiple-chatgpt-accounts-on-web-and-mobile): Stay signed in to two ChatGPT accounts and switch without logging out. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console](https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console): Enterprise owners enable account switching so members keep separate accounts. Plans: Enterprise. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). A person can hold more than one signed-in account on mobile and web, with separate chats, files and entitlements, and an owner switch for managed workspaces.

**With different models, providers and the one subscription.** Each account carries its own entitlement and quota; usage never mixes across accounts; Local chats stay with the device profile.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile built (Cloud accounts card; depends on a multi-session setting in the sign-in service). Web missing. CLI moves config folder but keyring is shared. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP7, M4, MP3, W12, W17; rows without an id: mobile:Add another account
- Code: `apps/mobile/src/features/accounts/components/DeviceAccountsCard.tsx`; `apps/cli/src/auth.rs:143`

**Gap.** No web account switcher; no admin switch; CLI accounts not isolated.

**Acceptance criteria**

1. On mobile add a second account and switch; each shows its own chats and plan.
2. On web the same.
3. CLI with a second config folder keeps a separate login.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-13 Personal and work accounts: join, discover, migrate

Join a team by invite, link, admin add or work-email domain, and move a personal account's content into the team.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13566435-find-and-join-a-team-or-enterprise-organization](https://support.claude.com/en/articles/13566435-find-and-join-a-team-or-enterprise-organization): Join via discovery, invite link, email invite or admin add; keep both accounts or use the org only. Plans: Team, Enterprise.
  - [https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization](https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization): Bring what you can or Start fresh; custom skills, connections and some items do not move. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10479654-onboarding-employees-with-existing-chatgpt-accounts](https://help.openai.com/en/articles/10479654-onboarding-employees-with-existing-chatgpt-accounts): Employees keep a personal workspace or merge it; enterprise migration has a 7-day deadline, deactivates the personal workspace with no undo, and GPTs become private. Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (irreversible actions name the consequence)). Email invites exist now; add join-by-domain, invite link and a move-personal-content flow that names what is lost before it runs.

**With different models, providers and the one subscription.** Moving into a team switches the entitlement source to the workspace; the flow says so and keeps Local data on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has email invites and workspace switching; no invite link, domain discovery or move flow. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W2, W7, WP2; rows without an id: web:Switch between personal and team workspaces
- Code: `apps/web/app/invite/page.tsx`; `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx`

**Gap.** Invite link, domain discovery and move-personal-account flow missing.

**Acceptance criteria**

1. Invite by email; the accept page joins the workspace.
2. A work-email user can find and request to join the domain's workspace.
3. The move flow lists what will not move and offers start fresh.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-14 Enterprise single sign-on, domain verification and directory sync

SAML or OIDC SSO, verified domains, SCIM provisioning and just-in-time membership.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13917894-okta-sso-setup](https://support.claude.com/en/articles/13917894-okta-sso-setup): SAML or OIDC with email attribute; SCIM is Enterprise and eligible Console orgs while Team uses just-in-time provisioning. Plans: Team, Enterprise, Console. Apps: web.
  - [https://support.claude.com/en/articles/13917817-google-workspace-sso-scim-email-mismatch](https://support.claude.com/en/articles/13917817-google-workspace-sso-scim-email-mismatch): SSO logins match provisioned seats by exact email. Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11489188-setting-up-single-sign-on-sso-for-chatgpt-business](https://help.openai.com/en/articles/11489188-setting-up-single-sign-on-sso-for-chatgpt-business): Owner verifies domains and sets up SAML or OIDC under Workspace settings. Plans: Business. Apps: web.
  - [https://learn.chatgpt.com/docs/enterprise/user-lifecycle.md](https://learn.chatgpt.com/docs/enterprise/user-lifecycle.md): Members are added by manual invite, automatic account creation or SCIM (Codex and ChatGPT workspace docs). Plans: Enterprise, Edu, Business. Apps: web.

**AGI requirement** (stated requirement; source: decisions D-2026-09-28-10; ledger S3.09, S3.10). SSO with domain verification, SCIM and just-in-time membership work in the web admin; desktop completes SSO in the system browser.

**With different models, providers and the one subscription.** Workspace entitlement and policy apply after SSO on every app; managed policy can limit providers.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built; mobile unverified; CLI and VS Code have no company sign-in. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.09, S3.10
- Comparison list ids: V1; rows without an id: web:Single sign-on with SAML or OIDC and domain verification; web:SCIM directory provisioning; web:Just-in-time membership on first SSO sign-in
- Code: `apps/web/app/api/admin/sso/route.ts`; `apps/web/lib/server/sso/jit-provisioning.ts`; `apps/web/app/admin/directory-sync/page.tsx`

**Gap.** Mobile unverified. Docs wire-or-cut.md line 47 defers first-party SSO runtime as a Phase 3 enterprise decision, while the comparison reads it as built; one of them is stale and was not reconciled.

**Acceptance criteria**

1. Owner verifies a domain and adds an identity provider; a user of that domain signs in through it.
2. A first SSO sign-in grants membership and is logged.
3. SCIM create and remove change membership.

**Verification: code inspected only.** Comparison CSV; no live identity provider run recorded.

## CAP-account-and-sign-in-15 Admin limits on how and where people sign in

Managed settings that force a login method, a single organisation or workspace, and block personal accounts or keys; require MFA for all members.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/authentication.md](https://code.claude.com/docs/en/authentication.md): forceLoginMethod (claudeai, console or gateway) and forceLoginOrgUUID restrict login; managed key rejects other organisations at startup. Plans: Team, Enterprise. Apps: cli.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): forceLoginOrgUUID limits which claude.ai organisations may sign in on Desktop. Plans: Team, Enterprise. Apps: desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/managed-configuration.md](https://learn.chatgpt.com/docs/enterprise/managed-configuration.md): Local requirements or macOS MDM can limit login to ChatGPT, API or both and allow only approved workspaces. Plans: Enterprise. Apps: cli, desktop.
  - [https://learn.chatgpt.com/docs/enterprise/security-cookbook.md](https://learn.chatgpt.com/docs/enterprise/security-cookbook.md): Restrict Codex sign-in to a company workspace UUID and reject personal accounts. Plans: Enterprise. Apps: cli, ide, desktop.

**AGI requirement** (stated requirement; source: decisions 2026-09-27 D-2026-09-28-01 (workspace require-MFA); definition.md one entitlement per account). An owner can require two-step sign-in for every member; managed policy can restrict login method and workspace on CLI, VS Code and desktop.

**With different models, providers and the one subscription.** A policy limiting sign-in must not silently block Local use; it limits Cloud access only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop enforce Require MFA on every request. No forced login method or workspace on CLI, VS Code or desktop device policy. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C1, C11, DP1, V1; rows without an id: web:Require two-step sign-in for every workspace member
- Code: `apps/web/app/api/settings/organization/policy/route.ts:73 (requireMfa)`; `apps/cli/src/platform/policy/managed.rs:36-48 (no sign-in keys)`

**Gap.** No managed login-method or workspace restriction on any developer surface.

**Acceptance criteria**

1. With Require MFA on, a member without a second factor is stopped on the next request.
2. A managed setting can limit CLI sign-in to one workspace and rejects a personal account.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-16 Age requirement and server-held age decision

A minimum age (18 for Claude; 13 with parental consent for ChatGPT) confirmed before use.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8114491-get-started-with-claude](https://support.claude.com/en/articles/8114491-get-started-with-claude): Claude is usable only by people aged 18 or older and from supported locations. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction](https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction): The mobile app blocks sign-up or sign-in when the App Store or Play Store reports under 18; fixes go through Apple or Google. Apps: ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages](https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages): Not meant for under-13s; 13 to 18 need parent or guardian permission.

**AGI requirement** (inferred; source: competitor parity; owner decision 2026-11-20 recorded in owner memory (not found in docs/product or docs/decisions)). Every surface requires 18 or over, and Cloud opens only when the server holds an adult decision for the account.

**With different models, providers and the one subscription.** Applies to Cloud and sign-in. Local on-device chat on a phone or desktop needs no account, so no age gate by account; whether Local needs an age notice is not decided.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile built: age step, server decision. Desktop uses web. CLI, VS Code, Chrome rely on the same account. Ledger S3.20 lists web, desktop, CLI, VS Code, Chrome as missing, which contradicts the comparison and the web scorecard; code wins. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.20
- Comparison list ids: none matched; rows without an id: web:Minimum age 18 with a server-held decision; mobile:Minimum age 18 at account creation; mobile:Age row in the Account card
- Code: `apps/web/app/chat/layout.tsx`; `packages/contracts/cloud-contracts/src/adult-eligibility.ts:5 (surfaces web-signup, web-login, mobile-auth)`; `apps/mobile/app/(public)/age-gate.tsx`

**Gap.** Ledger S3.20 is out of date or wrong. Under-18 behavior on web was not tried by a person.

**Acceptance criteria**

1. A new account must give an age before /chat opens; opening /chat early returns to the age step.
2. An under-18 answer blocks Cloud with a plain message and no account data kept beyond the decision.
3. Mobile blocks when the store age signal is under 18.

**Verification: seen working by a person.** scorecards W-1 free: empty age shows the error, /chat redirects to the age step, 34 accepted. Under-18 not tried.

## CAP-account-and-sign-in-17 Age verification by selfie or ID, and teen experience

Prove adulthood with a face check or government ID to restore access; teen protections and parental controls.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15171100-age-assurance-on-claude](https://support.claude.com/en/articles/15171100-age-assurance-on-claude): 18+ confirmed at sign-up; accounts with minor signals are disabled and reinstated after verification by facial age estimation or ID through Yoti or Persona. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12652064-age-prediction-in-chatgpt](https://help.openai.com/en/articles/12652064-age-prediction-in-chatgpt): Settings > Account > Age > Verify age lets adults confirm with Persona selfie or ID. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt](https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt): A parent and a teen link accounts by phone or email; the teen experience ends at 18. Plans: All plans. Apps: web.
  - [https://help.openai.com/en/articles/8411987-why-am-i-being-asked-to-verify-my-age](https://help.openai.com/en/articles/8411987-why-am-i-being-asked-to-verify-my-age): Where legally required, age is checked with a live selfie or ID; missing it can deactivate the account.

**AGI requirement** (proposed; source: competitor parity; comparison row 'Off by decision' for teen experience). Teen accounts and parental controls are off by decision. Selfie or ID age proof to restore a wrongly blocked adult is a choice for the owner.

**With different models, providers and the one subscription.** Any vendor check must be provider-neutral and not tied to a model route; Local chat unaffected.

**Current implementation, as this trace read it on 2026-11-24: not built.** No selfie or ID flow on any app; teen experience off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.20
- Comparison list ids: M2, W5; rows without an id: web:Teen experience and parental controls
- Code: `packages/contracts/cloud-contracts/src/adult-eligibility.ts (declared, on-device, platform signal only)`

**Gap.** A wrongly blocked adult has no appeal path by age proof.

**Acceptance criteria**

1. If the owner builds it, a blocked adult can verify and regain access with no ID image kept by AGI.
2. Teen protections stay absent and no teen account type exists.

**Verification: not verified.** Not built.

## CAP-account-and-sign-in-18 Verified access programs (identity checks for sensitive capabilities)

Application with ID check that unlocks fewer safeguards for security or life-science work.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14604842-cyber-verification-program](https://support.claude.com/en/articles/14604842-cyber-verification-program): Verified security professionals get fewer cyber-safeguard interruptions in three tiers via a Verification Portal with government ID and selfie. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/14328960-identity-verification-on-claude](https://support.claude.com/en/articles/14328960-identity-verification-on-claude): Some capabilities prompt for individual or business verification through Persona. Plans: all. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001258-openai-daybreak-trusted-access-for-cyber-overview](https://help.openai.com/en/articles/20001258-openai-daybreak-trusted-access-for-cyber-overview): Individual access needs age 18+, a paid plan, Advanced Account Security and a hardware key. Plans: Paid plans. Apps: web.
  - [https://learn.chatgpt.com/docs/cyber-safety.md](https://learn.chatgpt.com/docs/cyber-safety.md): Trusted Access for Cyber: individuals and organisations apply; access tied to identity (Codex docs). Plans: Individuals, Enterprise. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Owner choice; not required today.

**With different models, providers and the one subscription.** Safeguard levels are set by the model provider and AGI policy, so a verified tier would map to routes, not to one vendor's program.

**Current implementation, as this trace read it on 2026-11-24: not built.** None. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W4
- Code: `searched: cyber verification, trusted access in apps/web (comparison W4)` (not found)

**Gap.** No verified tier.

**Acceptance criteria**

1. Only if built: an applicant submits and a decision shows in account settings.

**Verification: not verified.** Not built.

## CAP-account-and-sign-in-19 Delete account and reuse of email or phone

Permanent deletion with a clear rule on when the same email or number can sign up again.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9028421-delete-your-claude-account](https://support.claude.com/en/articles/9028421-delete-your-claude-account): Delete via Settings Account on web, Settings Profile on iOS, Profile Account Actions on Android; irreversible. Apps: web, ios, android.
  - [https://support.claude.com/en/articles/12109679-creating-a-new-account-after-deletion](https://support.claude.com/en/articles/12109679-creating-a-new-account-after-deletion): A deleted account's email may be blocked from new signup for 30 days, permanently if the old account was disabled. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9019931-creating-a-new-chatgpt-account-after-deletion](https://help.openai.com/en/articles/9019931-creating-a-new-chatgpt-account-after-deletion): Wait 30 days to reuse the email; the new account has no old chats or memories. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): A deleted consumer account's phone number is released after 30 days.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 281; AGENTS.md section 9). Deletion is scheduled with a cancel window and names what is lost; the email reuse rule is stated.

**With different models, providers and the one subscription.** Deletion must stop the paid subscription or warn about it; Local data on devices is not touched unless the user says so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile built with scheduled deletion and cancel; no stated email reuse rule. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W3; rows without an id: web:Delete account; mobile:Delete the account
- Code: `apps/web/features/settings/sections/AccountSection.tsx`; `apps/web/app/api/user/delete-account/route.ts`

**Gap.** Email reuse rule (30-day wait) not stated or coded.

**Acceptance criteria**

1. Delete shows what is lost, schedules deletion and a Cancel works before the deadline.
2. The account page states when the email can sign up again.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-20 Change email, name and profile

Change the account email with ownership check, name and photo.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8452276-how-do-i-change-the-email-address-associated-with-my-account](https://support.claude.com/en/articles/8452276-how-do-i-change-the-email-address-associated-with-my-account): The email on a Claude account is fixed; switching needs support after cancelling any paid plan. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/4936827-changing-your-openai-account-email-address](https://help.openai.com/en/articles/4936827-changing-your-openai-account-email-address): Change email in Settings > Account > Email on web, verified by code; signs you out of all devices. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Change email with an ownership check on web; mobile hands off to web.

**With different models, providers and the one subscription.** Entitlement stays with the account across an email change.

**Current implementation, as this trace read it on 2026-11-24: built.** Web built; mobile confirm dialog then web page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.21
- Comparison list ids: none matched; rows without an id: web:Change email address; mobile:Change email: confirm dialog
- Code: `apps/web/features/settings/components/EmailAddress*` (not found); `apps/mobile/src/features/settings/cloud-account/index.tsx`

**Gap.** No username (W16).

**Acceptance criteria**

1. Change email sends a code to the new address; signing in works with the new email.
2. Other devices are signed out after the change.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-21 Account recovery, compromised account and bans

Getting back in after lost factors, reporting a compromised account, and suspension appeals.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals): Banned users can log in to file an appeal, export data or delete the account. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8485685-im-seeing-unrecognized-activity-on-my-openai-account](https://help.openai.com/en/articles/8485685-im-seeing-unrecognized-activity-on-my-openai-account): Changing the password logs out all sessions within 30 minutes; Google or Microsoft users reset at that provider.
  - [https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa](https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa): If all MFA methods are lost, support verification grants a one-time login. Apps: web.

**AGI requirement** (stated requirement; source: ledger S3.16 (Should line)). A person who lost a password, email or factor can recover; a compromised account can be reported and sessions ended from a screen.

**With different models, providers and the one subscription.** None.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web recover page and bot-checked support request built; suspension appeal page exists; compromise API has no screen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.16
- Comparison list ids: W9, WP8; rows without an id: web:Getting back in when every two-step method is lost
- Code: `apps/web/app/recover/page.tsx`; `apps/web/app/api/settings/security/compromise/route.ts:1`; `apps/web/features/auth/SuspensionAppeal.tsx`

**Gap.** Compromise route is dead code; data export not reachable when suspended.

**Acceptance criteria**

1. Report compromised account ends all sessions and shows steps.
2. Recover page restores access after all factors are lost.
3. A suspended user can appeal and request export.

**Verification: not verified.** None seen.

## CAP-account-and-sign-in-22 Use without an account

Try the product or chat locally without signing in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6378407-deleting-your-chatgpt-account](https://help.openai.com/en/articles/6378407-deleting-your-chatgpt-account): Without logging in, ChatGPT supports one conversation at a time; signing in is needed to save. Plans: Free. Apps: web.
  - [https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq): Try without an account in supported regions. Plans: Free. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md lines 832 and M-US-002, 947; decisions 2026-11-13 line 96). Local chat on mobile and desktop works with no account. Managed Free requires sign-in.

**With different models, providers and the one subscription.** Local inference needs no entitlement. Moving a Local chat to a hosted model is an explicit fork with consent and a provider label (AGENTS.md section 6).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile and CLI and VS Code ledger shows guest done; web guest chat exists behind the guest.chat flag that nothing enables by default; desktop and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.37
- Comparison list ids: W15
- Code: `apps/web/lib/guest-chat/guest-chat-access.ts:34 (switch off by default)`; `apps/web/app/chat/layout.tsx`

**Gap.** Desktop local chat without sign-in marked missing in ledger S3.37; web guest chat off. Owner has not decided on web guest chat.

**Acceptance criteria**

1. Open the mobile app signed out; a Local chat works with an on-device model and no network.
2. Choosing Cloud while signed out opens sign-in and never moves the Local chat.
3. Desktop does the same.

**Verification: not verified.** No scorecard covers signed-out Local use.

## CAP-account-and-sign-in-23 Terminal and editor sign-in (browser, device code, headless)

Sign in to a coding tool through the browser, a copy-code flow over SSH or a device code.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/authentication.md](https://code.claude.com/docs/en/authentication.md): First launch opens a browser; c copies the URL and a pasted code finishes it; /logout and /login reset. Plans: Pro, Max, Ultra, Team, Enterprise, Console. Apps: cli.
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): Extension sign-in through the browser with any paid plan or Console account. Plans: paid. Apps: ide.
  - [https://code.claude.com/docs/en/setup.md](https://code.claude.com/docs/en/setup.md): The free claude.ai plan has no Claude Code access. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/auth.md](https://learn.chatgpt.com/docs/auth.md): codex login opens a browser; --device-auth for headless machines; desktop and IDE offer Sign in with ChatGPT or an API key. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 117 (one account, one entitlement); ledger S3.01). One AGI account signs in on CLI, VS Code and Chrome by device code or browser, with status and sign-out.

**With different models, providers and the one subscription.** The CLI works with Local and BYOK models without an AGI sign-in; the account adds Managed Cloud and the subscription. Switching modes is explicit.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI device code login, auth-status, /login, /logout; VS Code shares the CLI login and says where the approval page opens in remote windows; Chrome panel opens web sign-in. Cloud on CLI needs Pro or higher. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.01, S86.09
- Comparison list ids: CP5; rows without an id: cli:Sign in to the CLI with the subscription account; cli:Sign in from a machine without a browser; vscode:Sign in with your own subscription plan; chrome:Sign in with your product account
- Code: `apps/cli/src/auth.rs:1044 (login_agiworkforce)`; `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`; `apps/extension/src/features/cloud-bridge/clerkAuth.ts`

**Gap.** Free and Basic accounts cannot use the CLI Cloud (CP5), matching Claude Code and not Codex.

**Acceptance criteria**

1. agi login prints a link and device code; approving in the browser signs in.
2. In an SSH or container session the same flow works.
3. VS Code shows the same account as the CLI.
4. /logout clears the login.

**Verification: code inspected only.** Comparison CSV and ledger.

## CAP-account-and-sign-in-24 Credentials for automation (tokens, API keys, storage)

Long-lived tokens or keys for CI and scripts, credential precedence and where logins are stored.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/authentication.md](https://code.claude.com/docs/en/authentication.md): claude setup-token prints a one-year OAuth token for CI as CLAUDE_CODE_OAUTH_TOKEN; credentials in the macOS Keychain or a 0600 file; an API key in the environment overrides the subscription login. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/access-tokens.md](https://learn.chatgpt.com/docs/enterprise/access-tokens.md): Enterprise admins can let members create access tokens for CODEX_ACCESS_TOKEN automation. Plans: Business, Enterprise. Apps: cli.
  - [https://learn.chatgpt.com/docs/auth.md](https://learn.chatgpt.com/docs/auth.md): Login cache in file, OS keyring, auto or memory. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity; ledger S86.14). API keys and a documented environment token exist; credential storage is the OS keyring; precedence between key and login is shown to the user.

**With different models, providers and the one subscription.** A token for AGI Cloud draws on the same subscription quota as the account; provider keys in BYOK never share it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI reads AGIWORKFORCE_JWT before saved login; keyring with file fallback; web API keys manager; no setup-token style command and no admin control over who creates keys. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.14
- Comparison list ids: CP2, CP4, DP3, VP1; rows without an id: cli:A credential set in the environment is used instead of the stored sign-in
- Code: `apps/cli/src/tier_cache.rs:99`; `apps/cli/src/auth.rs:697`

**Gap.** No one-command long-lived token; no in-memory or file choice; no admin limit on key creation.

**Acceptance criteria**

1. A documented command or variable authenticates a script with no browser.
2. The CLI shows which credential is in use.
3. Keys are listed masked and can be revoked.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-25 Use the assistant account to sign in elsewhere

The account acts as an identity provider for partner apps, with a list of connections to revoke.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites): Sign in to participating apps with a ChatGPT account, sharing only name, email and picture; Settings > Security and login > Login connections lists and removes them. Plans: All plans. Apps: web, desktop, ios, android.
  - [https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md](https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md): Developer program for Sign in with ChatGPT. Plans: Plus, Pro (limited trial). Apps: web, desktop.

**AGI requirement** (proposed; source: competitor parity). Owner choice; not required.

**With different models, providers and the one subscription.** Would conflict with model-agnostic positioning if usage of the plan by other apps is offered; needs a decision.

**Current implementation, as this trace read it on 2026-11-24: not built.** None. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M6, W10
- Code: `searched: oauth provider, authorize application in apps/web` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. Only if built: partner sign-in shares name and email only and the user can revoke it.

**Verification: not verified.** Not built.

## CAP-account-and-sign-in-26 Linked sign-in methods, security history and device lock

One list of how an account can sign in with last used dates, a security activity log, and an on-device app lock.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: ledger S86.01, S3.17, S86.11). Users see every sign-in method, can link or remove one, review recent security events, and lock the mobile app with the device biometric.

**With different models, providers and the one subscription.** App lock protects local chats on the device without touching model or account routing.

**Current implementation, as this trace read it on 2026-11-24: built.** Web built; mobile lists methods with last used date, history and app lock; linking missing on mobile (S3.17). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S3.17, S86.01, S86.11
- Comparison list ids: WP11; rows without an id: web:Security history of sign-ins and changes; mobile:List of linked sign-in methods with last used date; mobile:Require Face ID switch
- Code: `apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx`; `apps/web/features/settings/components/AuditLogPanel.tsx`; `apps/mobile/src/features/auth/components/AppLockOffer.tsx`

**Gap.** Same-email merge on web unverified (WP11); security notices missing on CLI, VS Code and Chrome.

**Acceptance criteria**

1. Security lists each method with last used date.
2. Security history shows a new sign-in and a password change.
3. App lock requires Face ID to open the mobile app.

**Verification: code inspected only.** Comparison CSV.

## CAP-account-and-sign-in-27 Supported regions and one-person-per-account rule

Stated list of countries where sign-up works and a rule on account sharing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8461763-where-can-i-access-claude](https://support.claude.com/en/articles/8461763-where-can-i-access-claude): A published list of supported countries and territories. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7947663-chatgpt-and-openai-api-supported-countries-and-territories](https://help.openai.com/en/articles/7947663-chatgpt-and-openai-api-supported-countries-and-territories): Works only in a published list of about 190 countries and territories. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/10471989-openai-account-sharing-policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy): An account is for one individual; several devices are fine.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 4 keeps regions in configuration). Terms state the one-person rule; any region block is explained in the app.

**With different models, providers and the one subscription.** A region block affects Cloud only; Local on-device chat is not region-gated by AGI.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Terms hold users responsible for credentials; no one-person or named-seat rule; no country list in the app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP3; rows without an id: mobile:Supported countries and territories list
- Code: `apps/web/app/terms/page.tsx`

**Gap.** No stated one-person rule or country list.

**Acceptance criteria**

1. Terms state one person per account and that multiple devices are fine.
2. A blocked region sees a plain reason.

**Verification: not verified.** Not checked.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to add phone-number sign-up or phone verification, which only Claude (verification at sign-up) and ChatGPT (phone-only sign-up in some regions) document.
- Whether to add SMS, WhatsApp and push approval as second factors, which only ChatGPT documents.
- Whether to build selfie or government-ID age proof for a wrongly blocked adult, or keep age as declared, on-device or store signal only.
- Whether web Guest chat without sign-in should be turned on, and whether desktop Local chat should need no account.
- Whether to offer sign-in with an AGI account for partner apps, which only ChatGPT documents.
- Whether to build verified access programs (security, life sciences).
- Whether web sessions should stay at the vendor's 7 days or move toward Claude's 28 days.
- Whether CLI and VS Code get managed login restrictions and company SSO (Claude Code and Codex both have them).
- Whether to build two-account switching on web and an admin switch for it.
- Whether join-by-domain, invite link and a move-personal-account flow are wanted.

## Could not establish

- Whether Claude documents passkeys, two-step sign-in methods, new-device login checks or sign-in without an account: the catalogue has no such lines, so has is unknown.
- Whether ChatGPT has a documented session lifetime: none in the catalogue.
- Production value of AGI_AUTH_PROVIDERS and whether the authenticator plan is live: not visible in the code or the scorecards.
- The 18-and-over owner decision (2026-11-20) and the 7-day session decision appear only in the owner's memory file and the comparison CSV, not in docs/product or docs/decisions.
- Ledger S3.20 (age check missing on web) conflicts with the comparison CSV and the web scorecard; not reconciled.
- docs/decisions/wire-or-cut.md line 47 defers first-party SSO runtime, while the comparison marks SSO as built; not reconciled.
- Comparison CSV line numbers have drifted from the current tree; only paths cited with a line number here were checked on 2026-11-24.
- No person has run sign-up (blocked by Cloudflare Turnstile in headless tests), social sign-in, passkeys, MFA, SSO, log out of all devices, account deletion or any non-web app.
- The catalogue holds only vendor help pages; Claude Code Desktop and mobile hand-off details beyond the listed rows were not read.
