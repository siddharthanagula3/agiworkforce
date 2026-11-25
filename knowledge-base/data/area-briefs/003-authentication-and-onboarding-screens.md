# Area 3. Authentication and onboarding screens

37 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S3.01 Sign-in screen.
- Should: The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/login/page.tsx:51; apps/web/features/auth/IdentityAuthAdapter.tsx:316; apps/mobile/app/(auth)/login.tsx:207; apps/mobile/src/integrations/clerk.ts:67; apps/cli/src/lib.rs:3936; apps/cli/src/oauth.rs:451; apps/cli/src/auth.rs:903; apps/extension-vscode/src/core/commandSetup.ts:1035

## S3.02 Create-account screen.
- Should: A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/signup/page.tsx:43; apps/web/features/auth/IdentityAuthAdapter.tsx:301; apps/mobile/app/(auth)/login.tsx:207; apps/mobile/src/integrations/clerk.ts:67; apps/web/features/auth/authRoutes.ts:47; apps/web/features/auth/authRoutes.ts:32; apps/web/features/auth/authRoutes.ts:80

## S3.03 Email verification screen.
- Should: After sign-up the user must confirm their email address on a verification screen before the account is usable.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthFlow.tsx:215; apps/web/features/auth/IdentityAuthAdapter.tsx:290; apps/web/features/auth/IdentityAuthAdapter.tsx:336

## S3.04 Verification-code input.
- Should: A code-entry field accepts an emailed or authenticator code (with resend and one-time-code autofill) and verifies it.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthCodeStep.tsx:88; apps/web/features/auth/IdentityAuthAdapter.tsx:336

## S3.05 Magic-link confirmation.
- Should: The user can sign in by clicking an emailed link and sees a confirmation that the link signed them in.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S3.06 Password-reset request.
- Should: From sign-in the user can request a password reset and receives a reset code or link by email.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthPasswordStep.tsx:84; apps/web/features/auth/IdentityAuthAdapter.tsx:414

## S3.07 Password-reset completion.
- Should: After verifying the reset code the user sets a new password and is signed in.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthNewPasswordStep.tsx:28; apps/web/features/auth/IdentityAuthAdapter.tsx:405

## S3.08 Social-provider sign-in choices.
- Should: Sign-in and sign-up offer social providers (e.g. Google, GitHub) that complete sign-in on this surface.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthProviderButtons.tsx:26; apps/web/features/auth/IdentityAuthAdapter.tsx:441; packages/client/client-runtime/src/authProviders.ts:17; apps/desktop/electron/windowPolicy.ts:16

## S3.09 Enterprise SSO entry.
- Should: A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthFlow.tsx:275; apps/web/features/auth/IdentityAuthAdapter.tsx:267; apps/web/features/auth/IdentityAuthAdapter.tsx:185; apps/desktop/electron/browserSignIn.ts:18; apps/desktop/electron/main.ts:648; apps/web/features/auth/IdentityAuthAdapter.tsx:189; apps/web/app/auth/desktop/DesktopSignInHandoff.tsx:65; apps/web/app/api/auth/desktop/grant/route.ts:19

## S3.10 Organization-domain discovery.
- Should: Entering a work email discovers the organization's sign-in by the email domain and routes the user to it.
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthFlow.tsx:275; apps/web/features/auth/IdentityAuthAdapter.tsx:267; apps/web/lib/services/organization-verified-domains.ts:7; apps/web/features/auth/IdentityAuthAdapter.tsx:189; apps/desktop/electron/browserSignIn.ts:28; apps/web/features/desktop-host/components/DesktopBrowserSignIn.tsx:33

## S3.11 Passkey enrollment.
- Should: A signed-in user can register a passkey for their account and see it listed (with rename/removal).
- Status: web done, desktop unverified
- Code: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:35; apps/web/lib/identity/client.ts:149; apps/web/features/settings/sections/SecuritySection.tsx:103

## S3.12 Passkey sign-in.
- Should: A user with a registered passkey can sign in with it instead of a password or code.
- Status: web done, desktop unverified, mobile unverified
- Code: apps/web/features/auth/AuthMethodPicker.tsx:15; apps/web/features/auth/IdentityAuthAdapter.tsx:424

## S3.13 Multifactor authentication setup.
- Should: A user can enroll an authenticator (QR + setup key, confirm code, backup codes) and from then on sign-in asks for that second factor.
- Status: web done, desktop done
- Code: apps/web/app/api/settings/2fa/verify/route.ts:26; apps/web/lib/mfa-policy-gate.ts:70

## S3.14 Multifactor challenge.
- Should: At sign-in an account with MFA is challenged for its second factor (with alternatives such as backup codes) before a session is issued.
- Status: web done, desktop done, mobile partial
- Code: apps/web/app/api/settings/2fa/verify/route.ts:26; apps/web/lib/mfa-policy-gate.ts:70; apps/mobile/app/(auth)/login.tsx:207; apps/mobile/src/features/settings/account-security/service.ts:70
- Unfinished: mobile: Owner: enable Authenticator and Backup codes in the Clerk Dashboard, then a live second-factor sign-in check; code path (MobileSignIn onNativeFallback) unchanged.

## S3.15 Recovery-code display and download.
- Should: When MFA is enabled (or codes are regenerated) the user is shown one-time recovery codes once and can copy, print or download them.
- Status: web done, desktop done
- Code: apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx:245; apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx:301; apps/web/app/api/settings/2fa/backup-codes/route.ts:45

## S3.16 Account-recovery flow.
- Should: A user who has lost their password, email or second factor can start and complete an account-recovery flow that restores access.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/auth/AuthSecondFactorStep.tsx:130; apps/web/features/auth/AuthPasswordStep.tsx:96; apps/web/app/recover/page.tsx:36; apps/web/lib/support/tickets/recovery.ts:56; apps/web/lib/support/tickets/recovery.ts:67; apps/web/lib/support/tickets/recovery.ts:116; apps/web/lib/support/tickets/recovery.ts:121; apps/web/features/admin/components/SupportTicketQueuePanel.tsx:261

## S3.17 Account-linking flow.
- Should: A signed-in user can link another sign-in method (e.g. Google, GitHub) to the same account and see or unlink linked methods.
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/settings/sections/SecuritySection.tsx:126; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216

## S3.18 Conflicting-account resolution.
- Should: When sign-up or provider sign-in hits an existing account (or sign-in hits none), the user is told and offered the right path (sign in instead, or create).
- Status: web done, desktop done, mobile unverified
- Code: apps/web/features/auth/AuthEmailStep.tsx:80; apps/web/features/auth/IdentityAuthAdapter.tsx:301; apps/web/lib/auth/error-taxonomy.ts:54

## S3.19 Terms-acceptance screen.
- Should: Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.
- Status: web done, desktop done, mobile done, chrome partial, api partial
- Code: apps/web/lib/server/terms.ts:10; apps/web/lib/server/terms.ts:93; apps/web/app/login/complete/page.tsx:64; apps/mobile/src/features/auth/store/termsAcceptanceStore.ts:87
- Unfinished: chrome: after Codex commits: apply post-codex/w-auth-S3.19-mobile-terms-acceptance.patch, remove 'mobile' from TERMS_GATE_EXEMPT_SURFACES in auth-gate.ts, and make Codex's GET /api/terms/accept report the standing (readTermsStanding) instead of strict current, or mobile sign-in hard-blocks every revision | api: after Codex commits: apply post-codex/w-auth-S3.19-mobile-terms-acceptance.patch, remove 'mobile' from TERMS_GATE_EXEMPT_SURFACES in auth-gate.ts, and make Codex's GET /api/terms/accept report the standing (readTermsStanding) instead of strict current, or mobile sign-in hard-blocks ever

## S3.20 Age or eligibility verification where applicable.
- Should: Where age limits apply, the user must confirm age or eligibility before use, and under-age users are blocked or restricted.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/app/(public)/age-gate.tsx:205; apps/mobile/src/features/auth/services/ageGate.ts:128; apps/mobile/src/features/auth/services/rootRouting.ts:25

## S3.21 Profile setup.
- Should: During onboarding the user sets up basic profile details (at least the name the assistant uses) and they are saved to the account.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:143; apps/web/features/onboarding/components/OnboardingWizard.tsx:78; apps/web/features/onboarding/lib/onboarding-preferences.ts:58; apps/mobile/app/(public)/onboarding.tsx:292

## S3.22 Language and timezone setup.
- Should: During setup the user can choose or confirm their language and time zone (or they are detected and shown for change).
- Status: not applicable anywhere

## S3.23 Role or use-case selection.
- Should: Onboarding asks the user their role or intended use and uses the answer (e.g. to tailor replies or suggestions).
- Status: web done, desktop done, mobile done
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:158; apps/web/features/onboarding/components/OnboardingWizard.tsx:201; apps/web/features/onboarding/lib/onboarding-preferences.ts:58; apps/mobile/app/(public)/onboarding.tsx:293

## S3.24 Personalization setup.
- Should: Onboarding lets the user set personalization (name to use, what they do, preferred style) that then shapes replies.
- Status: web done, desktop done
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:143; apps/web/features/onboarding/components/OnboardingWizard.tsx:158; apps/web/features/onboarding/components/OnboardingWizard.tsx:36; apps/web/features/onboarding/lib/onboarding-preferences.ts:58

## S3.25 Memory setup.
- Should: During setup the user is told about memory and chooses whether and how it is used, with the choice changeable later.
- Status: cli done, vscode done, chrome done
- Code: apps/cli/src/onboarding.rs:973; apps/extension-vscode/package.json:797; apps/extension/src/side_panel.ts:8463; apps/extension/src/side_panel.ts:8565; apps/extension/src/side_panel.ts:11117; apps/extension/src/features/cloud-bridge/memoryClient.ts:251

## S3.26 Import-from-another-assistant flow.
- Should: The user can bring memories or history over from another assistant (ChatGPT, Claude, Gemini) through a guided import flow.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/MemorySection.tsx:205; apps/web/features/settings/components/ImportMemoryDialog.tsx:19; apps/web/features/settings/components/ImportMemoryDialog.tsx:81; apps/web/app/api/memory/import/route.ts:184; apps/mobile/app/(app)/settings/memory-import.tsx:116; apps/mobile/src/features/memory/services/memoryImport.ts:58

## S3.27 Recommended-app connection flow.
- Should: New users are shown a few recommended apps/connectors (e.g. based on their role) and can connect them in a guided flow.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:228; apps/web/features/settings/components/WebSettingsModal.tsx:255

## S3.28 Recommended-plugin installation flow.
- Should: New users are offered recommended plugins/skills and can install them in a guided step.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S3.29 Desktop permission setup.
- Should: The app walks the user through the local permissions it needs (folders, commands, screen control) with guidance, and records the grants.
- Status: desktop done, cli done
- Code: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:152; apps/desktop/electron/runtime/systemPermissions.ts:48; apps/web/features/settings/sections/CapabilitiesSection.tsx:88; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:278; apps/cli/src/onboarding.rs:156; apps/cli/src/onboarding.rs:716

## S3.30 Browser-extension pairing.
- Should: The browser extension can be paired with the desktop app (or account) through a guided code/confirm step, with a way to unpair.
- Status: desktop done, chrome done
- Code: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:86; apps/desktop/electron/runtime/dispatcher.ts:924; apps/extension/src/side_panel.ts:7321; apps/extension/src/features/native-bridge/pairing.ts:304

## S3.31 Mobile device pairing.
- Should: A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account.
- Status: desktop done, mobile done, vscode done
- Code: apps/web/features/desktop-host/components/RemoteControlSection.tsx:50; apps/desktop/electron/runtime/dispatcher.ts:870; apps/mobile/services/manualPairing.ts:165; apps/mobile/lib/dispatchHmac.ts:316; apps/mobile/stores/connectionStore.ts:620; apps/mobile/__tests__/connection-control-session.test.ts:177; apps/extension-vscode/src/features/remote-control/index.ts:154; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:173

## S3.32 Optional notification setup.
- Should: The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:1716; apps/web/features/chat/pages/WebChatPage.tsx:5615; apps/desktop/electron/permissionPolicy.ts:3; apps/mobile/src/features/settings/notifications/index.tsx:415; apps/mobile/services/notifications.ts:121; apps/cli/src/onboarding.rs:979; apps/cli/src/config.rs:1138; apps/extension/src/options.ts:1040

## S3.33 Plan selection.
- Should: A user can compare plans and select one, reaching a real purchase for the chosen plan.
- Status: not applicable anywhere

## S3.34 Trial activation.
- Should: A user can start a trial of a paid plan, sees it marked as a trial, and the trial ends (reverts or bills) on schedule.
- Status: not applicable anywhere

## S3.35 First-conversation introduction.
- Should: New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:228; apps/web/features/onboarding/components/OnboardingWizard.tsx:36; apps/web/features/chat/pages/WebChatPage.tsx:1033; apps/mobile/app/(public)/onboarding.tsx:447; apps/mobile/app/(public)/onboarding.tsx:232; apps/cli/src/onboarding.rs:57; apps/cli/src/onboarding.rs:695; apps/cli/src/onboarding.rs:811

## S3.36 Resumable onboarding checklist.
- Should: New users get a checklist of setup steps whose progress is saved, so they can leave and resume it later.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:671; apps/extension-vscode/package.json:680; apps/extension-vscode/src/core/commandSetup.ts:1035

## S3.37 Guest experience and guest-to-account conversion.
- Should: Without an account the user can try the product (guest/local use), and later sign up with their guest work carried over or still available.
- Status: web missing, desktop missing, mobile done, cli done, vscode done, chrome missing
- Code: apps/mobile/app/(auth)/login.tsx:158; apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts:28; apps/cli/src/onboarding.rs:856; apps/cli/src/lib.rs:3936; apps/cli/src/oauth.rs:451; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1128; apps/extension-vscode/src/core/commandSetup.ts:1035; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:132
