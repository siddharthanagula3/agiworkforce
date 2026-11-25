---
id: "REQ-AREA-003"
type: "requirements"
title: "Requirement items: Authentication and onboarding screens"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 3. Authentication and onboarding screens

37 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S3.01

**Sign-in screen.** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F003-01 Sign in to your account](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Competitor trace: CAP-account-and-sign-in-01, CAP-account-and-sign-in-23

## S3.02

**Create-account screen.** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F003-02 Create an account and confirm your email](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)

## S3.03

**Email verification screen.** After sign-up the user must confirm their email address on a verification screen before the account is usable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-02 Create an account and confirm your email](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Competitor trace: CAP-account-and-sign-in-01

## S3.04

**Verification-code input.** A code-entry field accepts an emailed or authenticator code (with resend and one-time-code autofill) and verifies it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-02 Create an account and confirm your email](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Competitor trace: CAP-account-and-sign-in-01

## S3.05

**Magic-link confirmation.** The user can sign in by clicking an emailed link and sees a confirmation that the link signed them in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F003-03 Email sign-in by magic link](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Competitor trace: CAP-account-and-sign-in-01

## S3.06

**Password-reset request.** From sign-in the user can request a password reset and receives a reset code or link by email.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-04 Password reset](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Competitor trace: CAP-account-and-sign-in-02

## S3.07

**Password-reset completion.** After verifying the reset code the user sets a new password and is signed in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-04 Password reset](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Competitor trace: CAP-account-and-sign-in-02

## S3.08

**Social-provider sign-in choices.** Sign-in and sign-up offer social providers (e.g. Google, GitHub) that complete sign-in on this surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-05 Social and work sign-in](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Competitor trace: CAP-account-and-sign-in-03

## S3.09

**Enterprise SSO entry.** A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-05 Social and work sign-in](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Competitor trace: CAP-account-and-sign-in-14

## S3.10

**Organization-domain discovery.** Entering a work email discovers the organization's sign-in by the email domain and routes the user to it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-05 Social and work sign-in](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Competitor trace: CAP-account-and-sign-in-14

## S3.11

**Passkey enrollment.** A signed-in user can register a passkey for their account and see it listed (with rename/removal).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F003-06 Passkey sign-in and passkey setup](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Competitor trace: CAP-account-and-sign-in-05

## S3.12

**Passkey sign-in.** A user with a registered passkey can sign in with it instead of a password or code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop unverified, Mobile unverified
- Feature: [F003-06 Passkey sign-in and passkey setup](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Competitor trace: CAP-account-and-sign-in-05

## S3.13

**Multifactor authentication setup.** A user can enroll an authenticator (QR + setup key, confirm code, backup codes) and from then on sign-in asks for that second factor.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web UI_ONLY
- Feature: [F003-07 Two-step sign-in and recovery codes](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-account-and-sign-in-06

## S3.14

**Multifactor challenge.** At sign-in an account with MFA is challenged for its second factor (with alternatives such as backup codes) before a session is issued.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F003-07 Two-step sign-in and recovery codes](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-account-and-sign-in-06

## S3.15

**Recovery-code display and download.** When MFA is enabled (or codes are regenerated) the user is shown one-time recovery codes once and can copy, print or download them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F003-07 Two-step sign-in and recovery codes](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-account-and-sign-in-06

## S3.16

**Account-recovery flow.** A user who has lost their password, email or second factor can start and complete an account-recovery flow that restores access.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F003-07 Two-step sign-in and recovery codes](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-account-and-sign-in-21

## S3.17

**Account-linking flow.** A signed-in user can link another sign-in method (e.g. Google, GitHub) to the same account and see or unlink linked methods.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Feature: [F003-05 Social and work sign-in](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Competitor trace: CAP-account-and-sign-in-26

## S3.18

**Conflicting-account resolution.** When sign-up or provider sign-in hits an existing account (or sign-in hits none), the user is told and offered the right path (sign in instead, or create).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified
- Feature: [F003-01 Sign in to your account](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)

## S3.19

**Terms-acceptance screen.** Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome partial
- Feature: [F003-08 Terms acceptance and age check](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)

## S3.20

**Age or eligibility verification where applicable.** Where age limits apply, the user must confirm age or eligibility before use, and under-age users are blocked or restricted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F003-08 Terms acceptance and age check](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Competitor trace: CAP-account-and-sign-in-16, CAP-account-and-sign-in-17

## S3.21

**Profile setup.** During onboarding the user sets up basic profile details (at least the name the assistant uses) and they are saved to the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Competitor trace: CAP-account-and-sign-in-20

## S3.22

**Language and timezone setup.** During setup the user can choose or confirm their language and time zone (or they are detected and shown for change).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)

## S3.23

**Role or use-case selection.** Onboarding asks the user their role or intended use and uses the answer (e.g. to tailor replies or suggestions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)

## S3.24

**Personalization setup.** Onboarding lets the user set personalization (name to use, what they do, preferred style) that then shapes replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)

## S3.25

**Memory setup.** During setup the user is told about memory and chooses whether and how it is used, with the choice changeable later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done, Chrome done
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.26

**Import-from-another-assistant flow.** The user can bring memories or history over from another assistant (ChatGPT, Claude, Gemini) through a guided import flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.27

**Recommended-app connection flow.** New users are shown a few recommended apps/connectors (e.g. based on their role) and can connect them in a guided flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.28

**Recommended-plugin installation flow.** New users are offered recommended plugins/skills and can install them in a guided step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.29

**Desktop permission setup.** The app walks the user through the local permissions it needs (folders, commands, screen control) with guidance, and records the grants.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.30

**Browser-extension pairing.** The browser extension can be paired with the desktop app (or account) through a guided code/confirm step, with a way to unpair.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F003-11 Pair the browser extension and the phone](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)

## S3.31

**Mobile device pairing.** A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, VS Code done
- Feature: [F003-11 Pair the browser extension and the phone](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)

## S3.32

**Optional notification setup.** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F003-10 Memory, apps, permissions and notifications setup](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)

## S3.33

**Plan selection.** A user can compare plans and select one, reaching a real purchase for the chosen plan.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F003-12 Guest use, plans and trials](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)

## S3.34

**Trial activation.** A user can start a trial of a paid plan, sees it marked as a trial, and the trial ends (reverts or bills) on schedule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F003-12 Guest use, plans and trials](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)

## S3.35

**First-conversation introduction.** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)

## S3.36

**Resumable onboarding checklist.** New users get a checklist of setup steps whose progress is saved, so they can leave and resume it later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F003-09 Profile and first-chat setup](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)

## S3.37

**Guest experience and guest-to-account conversion.** Without an account the user can try the product (guest/local use), and later sign up with their guest work carried over or still available.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F003-12 Guest use, plans and trials](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Competitor trace: CAP-account-and-sign-in-22
