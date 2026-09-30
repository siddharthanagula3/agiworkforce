# Privacy disclosure placement

Verified: 2026-09-25 (America/Chicago)
Scope: Web account signup, current-terms review and the chat composer.

## Evidence

| Source                                                                                                                           | Evidence                                                                                                            | Constraints                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [ChatGPT](https://chatgpt.com/)                                                                                                  | Directly observed a signed-in new-chat screen without a large provider-training banner.                             | Existing Pro account, desktop web. Fresh signup, Free accounts and other regions were not observed. |
| [Claude](https://claude.ai/new)                                                                                                  | Directly observed a signed-in new-chat screen without a large provider-training banner.                             | Existing Pro account, desktop web. Fresh signup, Free accounts and other regions were not observed. |
| [ChatGPT data controls](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt)                                    | Documents model-training and other privacy controls in Settings, with account-wide preferences for signed-in users. | Available controls depend on account, plan and workspace. Documentation retrieved 2026-09-25.       |
| [Claude privacy controls](https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings) | Documents model-improvement controls under Settings > Privacy.                                                      | Consumer Free, Pro and Max; article dated 2026-08-03.                                               |
| [Gemini privacy hub](https://support.google.com/gemini/answer/13594961?hl=en)                                                    | Documents a dedicated privacy notice, data-use explanations and activity settings.                                  | Documentation only; no Gemini UI observation. Hub updated 2026-09-24.                               |

These observations establish the sampled screens, not the absence of notices
for every account, region or policy update. They are product-design evidence,
not a legal conclusion that a particular signup treatment is sufficient.

The founder also supplied a Grok desktop screenshot dated 2026-09-24 showing
an uncluttered, centered policy-update notice with a single acknowledgement
action and a separate sign-out option. This is screenshot evidence of that
notice only; its account, plan, rollout and persistence behavior are unknown.

## AGI implementation decision

The founder requested removal of the recurring chat banner and professional
policy wording at the existing one-time account checkpoint.

- `AuthLegalFooter` presents the shared provider-training disclosure with Data
  Use Guidelines and Acceptable Use Policy links during signup.
- `TermsGate` presents the same information when an account must review the
  current terms. The existing versioned, server-recorded agreement remains the
  authority. A current acceptance continues to skip the review step.
- The terms review uses centered AGI branding, policy links and a single
  **Agree and continue** action. It removes the bordered card, checkbox and
  version metadata from the screen. The arbitration and class-action-waiver
  wording stays visible before agreement; the policy version still comes from
  the existing server contract.
- Sign out is a separate exit action with pending and retry states. It clears
  unfinished signup consent without accepting the terms. The agreement button
  mounts the recorder only after deliberate activation. A browser marker never
  substitutes for the server-recorded agreement on this screen.
- Empty and active chats no longer mount `FreePlanTrainingNotice`. Its
  browser-local dismissal state is no longer written or required.
- Existing privacy, data-use and legal links remain accessible from the account
  menu and settings. Route-specific disclosures and permissions remain in place.
- Cookie/analytics preferences remain separate from terms acceptance. Closing
  an informational notice must never be treated as consent to analytics or as
  acceptance of terms.

Owners: `apps/web/features/auth`, `apps/web/app/signup/TermsGate.tsx`,
`apps/web/lib/compliance/free-plan-training-disclosure.ts`, and
`apps/web/lib/server/terms.ts`. The privacy-claims guard follows the disclosure
to both account entry surfaces and continues to check agreement with pricing.
