# AI Chat Ecosystem Inventory Checklist

Status: Current research snapshot
Owner: Product research
Verified: 2026-09-25
Coverage: supplied inventory through 2026-09-24; repository at `main` commit `21d43953`

**Reference target: the combined product surface of ChatGPT, Claude, Perplexity,
Gemini, and Grok through September 24, 2026.** The inventory separates
user-facing products, interface components, model capabilities, execution
systems, platform integrations, and commercial infrastructure. It is a
**candidate capability list**, not a claim that every competitor offers every
item.

This copy records, item by item, whether this repository implements each
candidate today. Implementation status here comes from code, per `AGENTS.md`
§2. Competitor behavior still comes from
`docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md` and
`docs/product/competitive-guidance.md`. Where this file and code disagree, the
code wins and this file is wrong.

## How to read the marks

| Line                              | Meaning                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[x]` Item. **Surfaces** · `path` | Production code implements the item as worded and it is reachable on at least one named surface. The cited path is where to confirm it.                                                                   |
| `[ ]` Item. **Partial:** note     | A real foundation exists but the item as worded is incomplete: backend without UI, UI without backend, off by default, only some named sub-parts, or a stub. The note says what is there and what is not. |
| `[ ]` Item. **Not found.**        | Searched across `apps/`, `packages/`, `crates/` and `services/` under several naming conventions and found no implementation.                                                                             |

Surfaces: Web, Desktop (Electron), Mobile, Chrome, VS Code, CLI, Server
(API routes and server libraries), Shared (`packages/*`, `crates/*`).

## Method and limits

- Each section was read against the code by a separate audit pass. Documents,
  specs, plans, tests on their own, and type definitions with no consumer were
  treated as leads, never as evidence.
- Every checked item cites a path. Every backticked repository path in this
  file was checked to exist at the commit above. Item wording was checked
  against the supplied inventory, so no item was dropped or reworded.
- This is a static reading of the source. It does not prove an item works in a
  running build, is enabled in production, or is live for a particular plan,
  region or account. `docs/work/implementation-status.md`, `PRODUCT_GAPS.md`
  and `ACTIVE_ISSUES.md` own launch quality and defects.
- Many Neon migrations under `apps/web/db/neon/` still carry a "NOT YET
  APPLIED" header, including early ones that later migrations build on, so the
  header does not show production state. Whether a migration has been applied
  was not assessed; an item backed by committed schema and wired code is
  counted.
- Most §56 integration families run through a generic remote MCP proxy, and
  the vendor's own server defines the operations at runtime. A family is
  checked when a default endpoint for a vendor that provides that operation is
  registered in `apps/web/lib/connectors/mcp-endpoints.ts`. A catalog entry
  that needs the operator to supply the server is Partial.
- `apps/desktop/src-tauri` is retained internal code that the public Electron
  desktop cannot reach, so a capability found only there is Partial.
- A check means "implemented somewhere", not "on every surface". The surfaces
  named on each line are the ones confirmed.
- Partial and Not-found lines are candidates, not commitments. Choosing among
  them follows `docs/product/competitive-guidance.md` and the registers in
  `PRODUCT_GAPS.md`.

## Summary

2014 of 3423 items are implemented, 417 are partial and 992 have no
implementation. The tables in §75, §77, §80 and §104 are not counted; each
carries a "This repository" column instead. The §104 decision-slot list below
its table is counted.

| Section                                                              |  Checked | Partial | Not found |    Items |
| -------------------------------------------------------------------- | -------: | ------: | --------: | -------: |
| 2. Public website and acquisition screens                            |       30 |       2 |         8 |       40 |
| 3. Authentication and onboarding screens                             |       23 |       7 |         7 |       37 |
| 4. Signed-in application destinations                                |       33 |       7 |         4 |       44 |
| 5. Application shell and navigation components                       |       32 |       3 |         4 |       39 |
| 6. Visual foundations and spacing conventions                        |       34 |       1 |         0 |       35 |
| 7. Layout systems                                                    |       23 |       2 |         7 |       32 |
| 8. Basic interactive elements                                        |       44 |       4 |         2 |       50 |
| 9. Compound interface components                                     |       30 |       3 |         5 |       38 |
| 10. Modal and dialog inventory                                       |       41 |       3 |         4 |       48 |
| 11. Accessibility and localization components                        |       25 |       1 |         2 |       28 |
| 12. New-chat experience                                              |       16 |       2 |         6 |       24 |
| 13. Composer text interaction                                        |       31 |       1 |         9 |       41 |
| 14. Attachment intake components                                     |       25 |       6 |         5 |       36 |
| 15. Model-selector interface                                         |       32 |       1 |         2 |       35 |
| 16. User-message components                                          |       12 |       5 |         5 |       22 |
| 17. Assistant-message components                                     |       31 |       3 |         6 |       40 |
| 18. Conversation-level controls                                      |       22 |       1 |         5 |       28 |
| 19. Streaming and response-presentation states                       |       23 |       4 |         2 |       29 |
| 20. Markdown and text rendering                                      |       27 |       0 |         3 |       30 |
| 21. Code blocks and executable code presentation                     |       16 |       5 |         9 |       30 |
| 22. Rich answers and structured result widgets                       |       17 |       2 |        19 |       38 |
| 23. Project workspace                                                |       21 |       6 |        11 |       38 |
| 24. Library and file-management experience                           |       12 |       9 |        19 |       40 |
| 25. File previews and readers                                        |        8 |      10 |        13 |       31 |
| 26. Artifact container and panel                                     |       28 |       1 |        11 |       40 |
| 27. Document and writing editor                                      |        8 |       7 |        26 |       41 |
| 28. Code Canvas and application preview                              |       14 |       5 |        13 |       32 |
| 29. Spreadsheet and data-analysis workspace                          |        2 |       7 |        31 |       40 |
| 30. Presentation workspace                                           |        2 |       3 |        28 |       33 |
| 31. PDF and document-transformation products                         |        4 |       2 |        19 |       25 |
| 32. Design workspace                                                 |        3 |       3 |        28 |       34 |
| 33. Generated Sites and published applications                       |        8 |       2 |        20 |       30 |
| 34. Search experiences                                               |       18 |       6 |         8 |       32 |
| 35. Research workspace                                               |       21 |       7 |         6 |       34 |
| 36. Sources and grounding interface                                  |       14 |       4 |         7 |       25 |
| 37. Notebook and knowledge-workspace product                         |        6 |       8 |        25 |       39 |
| 38. Learning and study products                                      |        7 |       5 |        23 |       35 |
| 39. Memory product                                                   |       24 |       2 |         6 |       32 |
| 40. Instructions, preferences, and personal style                    |       16 |       4 |        10 |       30 |
| 41. Temporary and private experiences                                |       11 |       2 |         7 |       20 |
| 42. Proactive assistance, briefings, and reflection                  |        9 |       5 |        11 |       25 |
| 43. Image and visual understanding                                   |       12 |       4 |         4 |       20 |
| 44. Image-generation studio                                          |       17 |      10 |         9 |       36 |
| 45. Image editor                                                     |        5 |       9 |        23 |       37 |
| 46. Video-generation studio                                          |       12 |       4 |        21 |       37 |
| 47. Video editing and media continuity                               |        0 |       0 |        27 |       27 |
| 48. Voice conversation interface                                     |       28 |       6 |         7 |       41 |
| 49. Dictation, transcription, and recording                          |       11 |       4 |        15 |       30 |
| 50. Audio overviews, speech generation, and music                    |        3 |       1 |        28 |       32 |
| 51. Voice-agent builder and telephony extensions                     |        0 |       0 |        25 |       25 |
| 52. Custom-assistant builder                                         |        0 |       8 |        33 |       41 |
| 53. Skill creation and management                                    |       12 |       6 |        18 |       36 |
| 54. Plugin marketplace and customization                             |       21 |      12 |         7 |       40 |
| 55. Connector setup and account management                           |       21 |       6 |         5 |       32 |
| 56. Concrete integration families                                    |       17 |      21 |         9 |       47 |
| 57. Tool catalog and invocation experience                           |       27 |       9 |         2 |       38 |
| 58. MCP and interactive extension products                           |       16 |       2 |        10 |       28 |
| 59. Approvals and human-in-the-loop UI                               |       23 |       6 |         2 |       31 |
| 60. Agentic work product                                             |       25 |       4 |         5 |       34 |
| 61. Persistent agents and agent rosters                              |       10 |       3 |        11 |       24 |
| 62. Multi-agent and multi-model interfaces                           |        7 |       2 |        19 |       28 |
| 63. Routines, schedules, and triggers                                |       21 |       5 |         9 |       35 |
| 64. Browser-assistant experience                                     |       18 |       7 |         7 |       32 |
| 65. Computer-use experience                                          |       19 |       9 |         1 |       29 |
| 66. Coding-workspace frontend                                        |       29 |       3 |         9 |       41 |
| 67. Coding capabilities and developer workflows                      |       32 |       6 |         1 |       39 |
| 68. Session continuity and remote-session product                    |       17 |       6 |         7 |       30 |
| 69. Web application                                                  |       18 |       1 |         1 |       20 |
| 70. Desktop application                                              |       25 |       3 |         4 |       32 |
| 71. Mobile application                                               |       25 |       1 |         6 |       32 |
| 72. CLI and terminal application                                     |       36 |       1 |         0 |       37 |
| 73. VS Code and IDE extension                                        |       28 |       2 |         0 |       30 |
| 74. Browser extension                                                |       17 |       4 |         7 |       28 |
| 75. Platform capability differences to represent explicitly          |    table |         |           |          |
| 76. Model-capability registry                                        |       19 |       8 |        11 |       38 |
| 77. Feature capability is not always native model capability         |    table |         |           |          |
| 78. UI gating and adaptation components                              |       23 |       5 |         0 |       28 |
| 79. Routing and model-neutral orchestration                          |       28 |       3 |         0 |       31 |
| 80. What can vary by tier                                            |    table |         |           |          |
| 81. Free / Basic / Pro / Max 5x / Max 15x planning structure         |       24 |       3 |         1 |       28 |
| 82. Usage dashboard and limit UI                                     |       18 |       8 |         7 |       33 |
| 83. Billing and subscription screens                                 |       26 |       5 |         2 |       33 |
| 84. General and appearance settings                                  |       14 |       4 |         8 |       26 |
| 85. Personalization and data settings                                |       16 |       2 |         8 |       26 |
| 86. Security and connected-access settings                           |       18 |       4 |         4 |       26 |
| 87. Enterprise administration screens                                |       30 |       5 |         5 |       40 |
| 88. Support, trust, and policy product                               |       19 |       2 |         6 |       27 |
| 89. Account and access components                                    |       23 |       1 |         0 |       24 |
| 90. Conversation and synchronization components                      |       20 |       2 |         1 |       23 |
| 91. Model and inference components                                   |       28 |       2 |         2 |       32 |
| 92. Tool-calling and agent-loop components                           |       29 |       1 |         0 |       30 |
| 93. Search, retrieval, and context components                        |       29 |       1 |         1 |       31 |
| 94. Memory and personalization components                            |       18 |       2 |         2 |       22 |
| 95. File and Library components                                      |       16 |       4 |         8 |       28 |
| 96. Artifact and generated-application components                    |       14 |       1 |        13 |       28 |
| 97. Media and realtime components                                    |       17 |       1 |        12 |       30 |
| 98. Integration and extensibility components                         |       25 |       0 |         4 |       29 |
| 99. Coding and local-runtime components                              |       24 |       0 |         6 |       30 |
| 100. Commercial and administrative components                        |       27 |       1 |         0 |       28 |
| 101. Shared package boundaries                                       |       37 |       1 |         0 |       38 |
| 102. Runtime inventory                                               |       28 |       1 |         3 |       32 |
| 103. Data and persistence categories                                 |       36 |       1 |         1 |       38 |
| 104. Named technology options, not claims about competitor internals |       24 |       0 |         3 |       27 |
| 105. Developer platform and console                                  |        8 |       4 |        18 |       30 |
| 106. Office, collaboration-channel, and email surfaces               |        2 |       3 |        20 |       25 |
| 107. Discovery, social, and public-content products                  |        4 |       2 |        17 |       23 |
| 108. Specialist workspaces                                           |        0 |       3 |        32 |       35 |
| 109. Optional native and ambient extensions                          |        5 |       6 |        14 |       25 |
| 110. Cross-product experiences to include in the product map         |       10 |       5 |        15 |       30 |
| **All sections**                                                     | **2014** | **417** |   **992** | **3423** |

## 1. What is publicly established about competitor technology

Similar interfaces do not establish identical implementations. These are
**specific disclosed parts of their stacks**, not complete manifests of their
private applications. This table is reproduced as supplied and was not
re-verified in this pass. The supplied copy cited sources through
chat-export markers that do not resolve outside that conversation, so they are
omitted here; re-source a row from a first-party page before relying on it.

| Product or subsystem                   | Publicly documented technology or architecture                                                                                                                                                                       | What this establishes                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI Codex runtime**               | Rust-defined protocol; a shared agent core; App Server communication using a bidirectional JSON-RPC-style protocol; local process integration and hosted HTTP/event-stream arrangements.                             | A concrete precedent for sharing an agent runtime across different interfaces. It does not establish that every interface has the same frontend implementation. |
| **ChatGPT/OpenAI data infrastructure** | PostgreSQL, Azure PostgreSQL Flexible Server, PgBouncer, Kubernetes deployments around connection pooling, and Azure Cosmos DB for selected sharded workloads.                                                       | First-party evidence about production data infrastructure, not a requirement to reproduce OpenAI’s scale or topology.                                           |
| **ChatGPT interactive app/plugin UI**  | Sandboxed embedded UI connected to an MCP server; structured messaging between the embedded UI and its host.                                                                                                         | An implementation pattern for interactive third-party experiences within conversations. This is distinct from the main ChatGPT website’s private frontend.      |
| **Claude Code**                        | Bun is part of the infrastructure underpinning Claude Code.                                                                                                                                                          | Evidence about its runtime infrastructure, not proof that all Claude applications and services use Bun.                                                         |
| **Claude Cowork execution**            | Cloud sessions use isolated sandboxes and externally enforced egress. Existing local desktop execution separates the native agent loop from Linux-VM code execution using Apple Virtualization.framework or Hyper-V. | A useful separation between the agent loop, host tools, isolated code execution, and cloud services.                                                            |
| **Gemini CLI**                         | The public package identifies TypeScript/Node tooling, React, Ink, model and MCP SDKs, schema validation, terminal highlighting, Git integration, and test dependencies.                                             | Direct evidence for the CLI package. It does not establish the consumer Gemini website’s complete stack.                                                        |
| **Grok Build**                         | Public Rust CLI/TUI and agent runtime; separate crates for terminal UI, agent execution, tools, workspace/VCS/checkpoints, configuration, MCP, Markdown, and sandboxing; editor integration through ACP.             | Direct evidence for a modular coding-agent implementation.                                                                                                      |
| **Perplexity Computer execution**      | Perplexity describes its SPACE execution infrastructure using Firecracker-based microVMs and controlled execution boundaries.                                                                                        | First-party reported sandbox architecture, not an independently inspected security guarantee or a complete Perplexity stack.                                    |

**Not established by the sources reviewed:** complete private
React/Angular/Next.js usage across every website; exact state-management
libraries; all database assignments; all internal services; exact editor
packages; every queue, vector database, cloud dependency, or CSS measurement.

---

# A. Product surfaces and screen inventory

## 2. Public website and acquisition screens

- [x] Product homepage. **Web** · `apps/web/app/page.tsx`
- [x] General assistant product page. **Web** · `apps/web/app/features/ai-chat/page.tsx`
- [x] Research product page. **Web** · `apps/web/app/features/deep-research/page.tsx`
- [x] Agentic work product page. **Web** · `apps/web/app/agi-work/page.tsx`
- [x] Coding-agent product page. **Web** · `apps/web/app/agi-code/page.tsx`
- [ ] Image-generation product page. **Not found.**
- [ ] Video-generation product page. **Not found.**
- [ ] Voice product page. **Not found.**
- [x] Desktop application page. **Web** · `apps/web/app/desktop/page.tsx`
- [x] Mobile application page. **Web** · `apps/web/app/mobile/page.tsx`
- [x] CLI installation page. **Web** · `apps/web/app/cli/page.tsx`
- [x] IDE extension page. **Web** · `apps/web/app/vscode-extension/page.tsx`
- [x] Browser extension page. **Web** · `apps/web/app/chrome-extension/page.tsx`
- [x] Integration directory. **Web** · `apps/web/app/integrations/page.tsx`, `apps/web/app/connectors/mcp-directory/page.tsx`
- [x] Plugin marketplace. **Web** · `apps/web/app/plugins/page.tsx`
- [x] Skill directory. **Web** · `apps/web/app/skills/page.tsx`, `apps/web/app/skills/SignedOutSkills.tsx`
- [ ] Template gallery. **Not found.**
- [ ] Custom-assistant directory. **Not found.**
- [ ] Individual integration detail pages. **Not found.**
- [x] Individual plugin detail pages. **Web** · `apps/web/app/plugins/[id]/page.tsx`
- [ ] Individual template preview pages. **Not found.**
- [x] Consumer pricing page. **Web** · `apps/web/app/pricing/page.tsx`
- [x] Team pricing page. **Web** · `apps/web/app/pricing/page.tsx` (business/Team tab), `apps/web/app/teams/page.tsx`
- [x] Enterprise product page. **Web** · `apps/web/app/enterprise/page.tsx`
- [x] Plan-comparison table. **Web** · `apps/web/app/pricing/page.tsx` (`compareRows`/full comparison table)
- [x] Usage and credit explanations. **Web** · `apps/web/app/pricing/page.tsx` (per-tier `usageCapacity` rows)
- [x] Download center with platform selection. **Web** · `apps/web/app/download/page.tsx`
- [x] Changelog and release notes. **Web** · `apps/web/app/release-notes/page.tsx`, `apps/web/app/changelog/page.tsx`
- [x] Product announcement pages. **Web** · `apps/web/app/release-notes/ReleaseNotesPage.tsx`, `apps/web/app/blog/[slug]/page.tsx`
- [x] Documentation portal. **Web** · `apps/web/app/docs/page.tsx`
- [x] Help center. **Web** · `apps/web/app/help/page.tsx`, `apps/web/app/help/[slug]/page.tsx`
- [x] Service-status page. **Web** · `apps/web/app/status/page.tsx`
- [x] Trust and security center. **Web** · `apps/web/app/trust/page.tsx`, `apps/web/app/security/page.tsx`
- [x] About and company information. **Web** · `apps/web/app/about/page.tsx`
- [x] Contact and support page. **Web** · `apps/web/app/contact/page.tsx`, `apps/web/app/support/page.tsx`
- [ ] Enterprise contact form. **Partial:** page names what to include but is a mailto link, no submitted form fields · `apps/web/app/contact-sales/page.tsx`
- [ ] Partner and developer submission forms. **Not found:** page states "no partner program yet: no application form" · `apps/web/app/partners/page.tsx`
- [x] Privacy, terms, cookies, and accessibility pages. **Web** · `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/cookies/page.tsx`, `apps/web/app/accessibility/page.tsx`
- [ ] Regional and language selectors. **Partial:** language selector exists only in signed-in Settings, no control on public pages, no region/country selector · `apps/web/features/settings/components/LanguageSelector.tsx`
- [x] Logged-out previews of shareable content. **Web** · `apps/web/app/share/[token]/page.tsx`

Section tally: 30 of 40 checked; 2 partial; 8 not found.

## 3. Authentication and onboarding screens

- [x] Sign-in screen. **Web** · `apps/web/app/login/page.tsx`, `apps/web/features/auth/AuthFlow.tsx`
- [x] Create-account screen. **Web** · `apps/web/app/signup/page.tsx`
- [x] Email verification screen. **Web** · `apps/web/features/auth/identityAuthAdapter.tsx` (`verifications.sendEmailCode`/`verifyEmailCode`), `apps/web/features/auth/AuthCodeStep.tsx`
- [x] Verification-code input. **Web** · `apps/web/features/auth/AuthCodeStep.tsx`
- [ ] Magic-link confirmation. **Not found:** sign-in/verification uses one-time codes only, no clickable email link.
- [x] Password-reset request. **Web** · `apps/web/features/auth/identityAuthAdapter.tsx` (`resetPasswordEmailCode.sendCode`)
- [x] Password-reset completion. **Web** · `apps/web/features/auth/identityAuthAdapter.tsx` (`resetPasswordEmailCode.submitPassword`), `apps/web/features/auth/AuthNewPasswordStep.tsx`
- [x] Social-provider sign-in choices. **Web** · `apps/web/features/auth/AuthProviderButtons.tsx`, `packages/client/client-runtime/src/authProviders.ts` (Google, GitHub, Microsoft, Apple)
- [x] Enterprise SSO entry. **Web** · `apps/web/features/auth/identityAuthAdapter.tsx` (`ENTERPRISE_SSO_STRATEGY`, `signIn.sso`)
- [x] Organization-domain discovery. **Web** · `apps/web/features/auth/identityAuthAdapter.tsx` (routes to `startEnterpriseSso` when the email's first factor is enterprise SSO)
- [x] Passkey enrollment. **Web** · `apps/web/features/settings/components/Settings/PasskeysPanel.tsx`
- [ ] Passkey sign-in. **Partial:** `signIn.passkey({flow:'discoverable'})` wired in, but feature-flagged off unless `AGI_AUTH_PROVIDERS` includes "passkey" · `apps/web/features/auth/identityAuthAdapter.tsx`, `packages/client/client-runtime/src/authProviders.ts`
- [x] Multifactor authentication setup. **Web** · `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx`
- [x] Multifactor challenge. **Web** · `apps/web/features/auth/AuthSecondFactorStep.tsx`, `apps/web/features/auth/StepUpDialog.tsx`
- [x] Recovery-code display and download. **Web** · `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx` (backup-codes list + `.txt` download)
- [x] Account-recovery flow. **Web** · `apps/web/features/auth/AccountAccessNotice.tsx` (locked/suspended-account notice with recovery path), plus password-reset and backup codes above
- [ ] Account-linking flow. **Not found:** no settings UI to add a second sign-in provider/method to an existing account.
- [ ] Conflicting-account resolution. **Partial:** sign-up shows an "email already has an account" notice and offers "Log in instead," no account-merge UI · `apps/web/lib/auth/error-taxonomy.copy.ts`
- [x] Terms-acceptance screen. **Web** · `apps/web/app/signup/TermsGate.tsx`
- [ ] Age or eligibility verification where applicable. **Not found.**
- [x] Profile setup. **Web** · `apps/web/features/onboarding/components/OnboardingWizard.tsx` (preferred name, work description)
- [ ] Language and timezone setup. **Partial:** language selector exists in Settings (not in onboarding); no timezone setting anywhere · `apps/web/features/settings/components/LanguageSelector.tsx`
- [x] Role or use-case selection. **Web** · `apps/web/features/onboarding/components/OnboardingWizard.tsx` (`WORK_DESCRIPTIONS`, `ONBOARDING_USE_CASES`)
- [x] Personalization setup. **Web** · `apps/web/features/onboarding/components/OnboardingWizard.tsx` ("Your name and the work you described shape how replies are written")
- [ ] Memory setup. **Partial:** account Memory section exists in Settings, not surfaced as an onboarding step · `apps/web/features/settings/sections/MemorySection.tsx`
- [x] Import-from-another-assistant flow. **Web** · `apps/web/features/settings/components/ImportMemoryDialog.tsx` (imports from ChatGPT, Claude, Gemini, Copilot)
- [ ] Recommended-app connection flow. **Not found.**
- [ ] Recommended-plugin installation flow. **Not found.**
- [ ] Desktop permission setup. **Partial:** macOS Screen Recording/Accessibility checks and in-app prompts exist for computer-use, not a general onboarding step · `apps/desktop/electron/runtime/computerUseService.ts`
- [x] Browser-extension pairing. **Web** · `apps/web/app/auth/chrome-extension/page.tsx`
- [x] Mobile device pairing. **Web, Desktop, Mobile** · `apps/web/app/pair/pair-body.tsx`, `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx`, `apps/mobile/app/(app)/companion/index.tsx`
- [ ] Optional notification setup. **Partial:** notification preferences exist in Settings, not offered as an onboarding step · `apps/web/features/settings/sections/NotificationsSection.tsx`
- [x] Plan selection. **Web** · `apps/web/app/pricing/page.tsx` (per-tier checkout/upgrade CTAs)
- [ ] Trial activation. **Not found:** no trial concept in pricing/billing.
- [x] First-conversation introduction. **Web** · `apps/web/features/onboarding/components/StarterPrompts.tsx` (finishes onboarding into `/chat?starterPrompt=`)
- [ ] Resumable onboarding checklist. **Partial:** onboarding wizard persists/resumes and can be skipped, but is a 2-step wizard, not a multi-item checklist · `apps/web/features/onboarding/lib/onboarding-preferences.ts`
- [ ] Guest experience and guest-to-account conversion. **Not found:** `/chat` is a protected route requiring sign-in, no unauthenticated guest chat · `packages/contracts/types/src/product-routes.ts`

Section tally: 23 of 37 checked; 7 partial; 7 not found.

## 4. Signed-in application destinations

- [x] New-chat home. **Web** · `apps/web/app/chat/page.tsx`
- [x] Existing conversation. **Web** · `apps/web/app/chat/[sessionId]/page.tsx`
- [x] Conversation search. **Web** · `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
- [x] Archived conversations. **Web** · `apps/web/app/settings/archived/page.tsx`, `apps/web/features/settings/sections/ArchivedChatsSection.tsx`
- [x] Pinned conversations. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (pinned sessions section)
- [x] Projects index. **Web** · `apps/web/app/chat/projects/page.tsx`
- [x] Project overview. **Web** · `apps/web/app/chat/projects/[id]/page.tsx`
- [x] Project conversations. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (`chats` tab)
- [x] Project files and sources. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (`sources` tab)
- [x] Project instructions. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (`project.instructions`)
- [ ] Project members. **Partial:** `memberCount` surfaced and workspace admins see sharing grants, no per-project add/remove-member UI · `apps/web/app/chat/projects/[id]/page.tsx`, `apps/web/app/workspace/sharing/page.tsx`
- [ ] Project Memory. **Partial:** project-scoped memory exists behind a scope toggle in project settings; no dedicated project memory view · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`, `apps/web/db/neon/0135_project_scoped_memory.sql`
- [x] Work-task home. **Web** · `apps/web/app/tasks/page.tsx`
- [x] Active-task dashboard. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` (default "Active" filter)
- [x] Task details and transcript. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [x] Approvals inbox. **Web** · `apps/web/features/chat/components/approvals/ApprovalInbox.tsx`
- [x] Scheduled-task manager. **Web** · `apps/web/app/chat/schedules/page.tsx`
- [x] Routine details. **Web** · `apps/web/features/schedules/components/ScheduleRunHistory.tsx`
- [x] Coding-session home. **Web** · `apps/web/app/code/page.tsx`
- [x] Coding-session workspace. **Web** · `apps/web/app/code/[sessionId]/page.tsx`
- [ ] Remote devices. **Partial:** "Active sessions" device list with revoke exists in account settings, no remote-machine management surface · `apps/web/features/settings/sections/AccountSection.tsx`
- [ ] Remote-session viewer. **Not found.**
- [x] Library. **Web** · `apps/web/app/chat/library/page.tsx`
- [ ] Shared-with-me resources. **Not found:** no inbox of content shared by others; only direct share links.
- [x] Artifact gallery. **Web** · `apps/web/app/gallery/page.tsx`
- [x] Artifact editor. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [ ] Image studio. **Not found:** image generation is an inline chat capability, no standalone creation canvas.
- [x] Image collection. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`images` tab)
- [ ] Video studio. **Not found:** video generation is an inline chat capability, no standalone studio surface.
- [ ] Media job history. **Partial:** generation jobs have queued/processing/failed states tracked inline per message, no aggregated job-history page · `apps/web/features/media/services/media-api-service.ts`
- [x] Notebook workspace. **Web** · `apps/web/features/code/CloudCodePage.tsx` (`NotebookPanel` for notebook-runtime sessions), `apps/web/features/notebook/NotebookPanel.tsx`
- [x] Research report reader. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx`
- [ ] Custom-assistant manager. **Partial:** Desktop settings lists custom agents, but its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentsList.tsx`
- [ ] Custom-assistant builder. **Partial:** Desktop agent editor exists, but its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [x] Skills manager. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx`, `apps/web/features/skills/services/skills-catalog.ts`
- [x] Plugins manager. **Web** · `apps/web/features/plugins/hooks/use-plugins-settings-adapter.ts`
- [x] Connected accounts. **Web** · `apps/web/app/settings/connections/page.tsx`
- [x] Model catalog. **Web** · `apps/web/app/models/page.tsx`
- [x] Usage dashboard. **Web** · `apps/web/app/settings/usage/page.tsx`, `apps/web/app/workspace/usage/page.tsx`
- [x] Billing settings. **Web** · `apps/web/app/settings/billing/page.tsx`, `apps/web/app/billing/page.tsx`
- [x] Personal settings. **Web** · `apps/web/app/settings/profile/page.tsx`, `apps/web/app/settings/general/page.tsx`
- [x] Workspace administration. **Web** · `apps/web/app/workspace/page.tsx` (+ `apps/web/app/workspace/people/page.tsx`, `roles/`, `policy/`)
- [ ] Developer console. **Partial:** API-key management exists in Settings, no unified console for usage-by-key, logs, or webhooks · `apps/web/features/settings/components/Settings/ApiKeys.tsx`
- [x] Help and feedback. **Web** · `apps/web/app/help/page.tsx`, `apps/web/lib/support/help-entry-points.ts`

Section tally: 33 of 44 checked; 7 partial; 4 not found.

## 5. Application shell and navigation components

- [x] Application header. **Web** · `packages/ui/unified-chat/src/components/ConversationHeader.tsx`, `packages/ui/unified-chat/src/components/ProjectHeader.tsx`
- [x] Product or mode switcher. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (Chat/AGI Work `workMode` toggle)
- [ ] Account switcher. **Partial:** switching accounts is sign-out-then-sign-in-again, no persistent multi-account quick-switch · `apps/web/app/auth/device/page.tsx` (`onSwitchAccount`)
- [x] Workspace switcher. **Web** · `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx`
- [x] Sidebar expand/collapse control. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (`onToggleCollapse`)
- [ ] Sidebar resize handle. **Not found:** sidebar width is fixed by collapsed state, no drag-resize.
- [x] Sidebar search input. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (`onOpenSearch`)
- [x] New-chat action. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (`onNewChat`)
- [x] Pinned-item section. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (pinned chats and pinned projects)
- [x] Recent-item section. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx`
- [x] Project-grouped recents. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (expandable project row lists its own sessions)
- [x] Date-grouped recents. **Web** · `packages/ui/ui/src/sidebar/temporal.ts` (Today/Yesterday buckets)
- [x] Conversation row. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx`
- [x] Project row. **Web** · `packages/ui/ui/src/sidebar/Sidebar.tsx` (project row component)
- [x] Task row. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Resource-type icon. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`iconKindFor`)
- [x] Running-task indicator. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx` (`session.runState === 'running'`)
- [ ] Needs-input indicator. **Partial:** `awaiting_input` surfaces as an inline approval card in Tasks, no distinct sidebar-row badge · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Unread-result indicator. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx` (`session.unread`, mark-as-unread menu item)
- [x] Item overflow menu. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx` (share/rename/pin/unread/archive/delete/move menu)
- [x] Inline rename field. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx` (`setIsRenaming`)
- [ ] Drag-to-reorder interaction. **Not found:** no draggable reordering anywhere in the sidebar.
- [ ] Drag-to-move-into-Project interaction. **Partial:** "Move to project" exists as a click menu action, not a drag interaction · `packages/ui/ui/src/sidebar/SessionItem.tsx`
- [x] Breadcrumb navigation. **Web** · `packages/ui/ui/src/primitives/Breadcrumb.tsx` (used in `packages/ui/unified-chat/src/components/library/LibraryView.tsx` folder path)
- [ ] Back and forward navigation. **Not found:** no in-app back/forward control beyond the browser's native history.
- [x] Global command palette. **Web** · `apps/web/shared/components/CommandPalette/CommandPalette.tsx`, `packages/ui/unified-chat/src/components/CommandPalette.tsx`
- [x] Keyboard-shortcut help. **Web** · `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx`
- [x] Notification center. **Web** · `apps/web/features/notifications/components/NotificationBell.tsx`
- [x] User/profile menu. **Web** · `apps/web/shared/components/layout/AccountMenuItems.tsx`
- [x] Help menu. **Web** · `apps/web/shared/components/layout/AccountMenuItems.tsx` (`onOpenHelp`)
- [x] Upgrade entry. **Web** · `apps/web/shared/components/layout/AccountMenuItems.tsx` (`showUpgrade`/`onUpgrade`)
- [x] Connection-status indicator. **Web** · `apps/web/shared/components/OfflineIndicator.tsx`
- [x] Offline indicator. **Web** · `apps/web/shared/components/OfflineIndicator.tsx`
- [x] Release/update indicator. **Desktop** · `apps/desktop/src/features/updates/UpdateDialog.tsx`, `apps/desktop/src/features/updates/UpdateChecker.tsx`
- [x] Mobile navigation drawer. **Mobile** · `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/src/features/drawer/components/DrawerContent.tsx`
- [ ] Mobile bottom navigation. **Not found:** Expo Router's tab bar is explicitly hidden (`tabBar={() => null}`) in favor of the drawer · `apps/mobile/app/(app)/(tabs)/_layout.tsx`
- [x] Tablet split-navigation layout. **Mobile** · `apps/mobile/src/shared/hooks/useTabletLayout.ts` (`usesPersistentDrawer`), `apps/mobile/app/(app)/_layout.tsx`
- [x] Resource deep links. **Web** · `apps/web/app/chat/[sessionId]/page.tsx`, `apps/web/app/code/[sessionId]/page.tsx`, `apps/web/app/chat/projects/[id]/page.tsx`
- [x] Route-level loading and unavailable-resource screens. **Web** · `apps/web/app/chat/loading.tsx`, `apps/web/app/chat/not-found.tsx`, `apps/web/app/not-found.tsx`

Section tally: 32 of 39 checked; 3 partial; 4 not found.

---

# B. Design system, layouts, and reusable UI

## 6. Visual foundations and spacing conventions

These are design decisions to define explicitly, not undocumented pixel values attributed to competitors.

- [x] Semantic background colors. **Shared** · `packages/ui/design-tokens/src/foundation.css`
- [x] Surface and elevated-surface colors. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--surface-page`, `--surface-elevated`, `--surface-subtle`)
- [x] Text and muted-text colors. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--text-primary`, `--text-secondary`, `--text-muted`)
- [x] Border and divider colors. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--border`, `--rule`, `--rule-subtle`)
- [x] Accent and selection colors. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--accent-text`, `--surface-selected`)
- [x] Success, warning, error, and information colors. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--success-text`, `--warning-text`, `--danger-text`, `--info-text`)
- [x] Typography families. **Shared** · `packages/ui/design-tokens/src/chat.css` (`--chat-font-sans/serif/mono`)
- [x] Heading scale. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--type-h1/h2/h3-*`)
- [x] Body-text scale. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--type-body-size`, `--type-body-small-size`)
- [x] Caption and metadata scale. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--type-caption-*`, `--type-metadata-*`)
- [x] Monospace typography. **Shared** · `packages/ui/design-tokens/src/chat.css` (`--chat-font-mono`), `foundation.css` (`--type-code-*`)
- [x] Line-height rules. **Shared** · `packages/ui/design-tokens/src/foundation.css` (a `--type-*-height` per role)
- [x] Paragraph spacing. **Web** · `apps/web/app/globals.css` (`.message-text p { @apply mt-3 mb-0 }`)
- [x] List indentation. **Web** · `apps/web/app/globals.css` (`.message-text ul, ol { @apply pl-7 }`)
- [x] Code-block padding. **Shared** · `packages/ui/unified-chat/src/components/markdown/codeBlock.css` (`padding: 14px 16px`)
- [x] Table-cell padding. **Shared** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`px-3 py-2` on td/th)
- [x] Conversation-turn spacing. **Web** · `apps/web/app/globals.css` (`.message-text > * { @apply mt-3 mb-0 }`)
- [ ] Message-to-toolbar spacing. **Partial:** ad hoc utility gaps in the message row, no named spacing token · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Composer internal padding. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (documented 48-52px parity band, `px-3 py-2` rows)
- [x] Page-edge gutters. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--gutter-compact/regular/wide`)
- [x] Sidebar row height. **Web** · `packages/ui/ui/src/sidebar/SessionItem.tsx` (`px-2 py-1.5` row)
- [x] Menu-item height. **Shared** · `packages/ui/ui/src/primitives/DropdownMenu.tsx` (`py-1.5` item rows)
- [x] Dialog padding. **Shared** · `packages/ui/ui/src/primitives/Dialog.tsx` (`p-6` on `DialogContent`)
- [x] Form-field spacing. **Shared** · `packages/ui/ui/src/primitives/FormField.tsx`
- [x] Icon sizes and stroke conventions. **Shared** · `packages/ui/icons/src/grid.ts` (`ICON_GRID.size`/`strokeWidth`), `packages/ui/icons/src/createIcon.tsx`
- [x] Button sizes and density variants. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (`xs`/`sm`/`default`/`lg`/`icon`)
- [x] Border-radius scale. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--corner-detail` … `--corner-hero`, `--corner-pill`)
- [x] Shadow and elevation scale. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--elevation-1..4`)
- [x] Layering and z-index rules. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--z-base` … `--z-skip-link`)
- [x] Motion durations and easing. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`--duration-*`, `--curve-*`)
- [x] Reduced-motion alternatives. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`@media (prefers-reduced-motion: reduce)`), `packages/ui/unified-chat/src/hooks/useReducedMotion.ts`
- [x] Light, dark, and system themes. **Shared** · `packages/ui/design-tokens/src/foundation.css` (`.dark` block), `packages/ui/ui/src/primitives/ThemeToggle.tsx` (light/dark/system cycle)
- [x] High-contrast treatment. **Web** · `apps/web/app/globals.css` (`@media (prefers-contrast: more)`, `@media (forced-colors: active)`, `data-contrast="more"`)
- [x] Selected, focused, hovered, pressed, and disabled states. **Shared** · `apps/web/app/globals.css` (`*:focus-visible` rules), `packages/ui/ui/src/primitives/Button.tsx` (`disabled:opacity-50`)
- [x] Brand assets and application icons. **Web, Desktop** · `apps/web/public/logo-512.png`, `apps/desktop/src-tauri/app-icon.png`

Section tally: 34 of 35 checked; 1 partial; 0 not found.

## 7. Layout systems

- [x] Centered new-chat layout. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`mx-auto w-full max-w-3xl px-4`)
- [x] Reading-width conversation layout. **Web, Shared** · `apps/web/features/chat/pages/WebChatPage.tsx`, `packages/ui/design-tokens/src/foundation.css` (`--measure-prose: 68ch`)
- [ ] Full-width data-analysis layout. **Not found.**
- [x] Conversation plus artifact split view. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [x] Conversation plus source-inspector split view. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (right-sidebar source list)
- [ ] Conversation plus browser split view. **Not found.**
- [x] Conversation plus code workspace. **Web** · `apps/web/features/code/CloudCodePage.tsx` (`CodeTranscript` + `CodeChangesPanel`)
- [ ] Multi-session tiled layout. **Not found.**
- [ ] Stacked-session layout. **Not found.**
- [ ] Resizable left sidebar. **Not found:** sidebar only collapses/expands between two fixed widths · `packages/ui/unified-chat/src/hooks/useSidebar.ts`
- [x] Resizable right inspector. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (drag handle + arrow-key resize, min/max clamp)
- [x] Collapsible secondary navigation. **Web** · `packages/ui/unified-chat/src/hooks/useSidebar.ts` (`sidebarCollapsed`)
- [ ] Dockable panels. **Not found.**
- [ ] Detachable desktop panels. **Not found.**
- [x] Full-screen editor. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`isFullscreen`, native Fullscreen API)
- [x] Full-screen report reader. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx`
- [x] Full-screen media viewer. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Floating companion window. **Desktop** · `apps/desktop/electron/quickAsk.ts` (frameless, always-on-top `BrowserWindow`)
- [ ] Compact companion mode. **Partial:** one fixed-size (480×620) floating panel, no separate compact/expanded state · `apps/desktop/electron/quickAsk.ts`
- [x] Persistent bottom composer. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Composer expansion for long prompts. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (auto-grow to `COMPOSER_MAX_HEIGHT_PX`, then scrolls)
- [x] Scrollable transcript independent from side panels. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (separate `overflow-y-auto` regions)
- [x] Sticky artifact toolbar. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (fixed header strip above scrollable body)
- [x] Sticky table headers. **Shared** · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` (`sticky top-0`)
- [x] Responsive panel stacking. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (inline panel on desktop, full-screen overlay on mobile)
- [x] Mobile bottom-sheet adaptation. **Mobile** · `apps/mobile/components/ui/bottom-sheet.tsx`
- [ ] Tablet two-column adaptation. **Partial:** only a binary mobile/desktop `matchMedia` split, no distinct tablet layout · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [x] Safe-area and virtual-keyboard accommodation. **Web, Mobile** · `apps/web/features/chat/components/Composer/soft-keyboard-inset.ts`, `apps/web/app/globals.css` (safe-area)
- [x] Minimum and maximum panel widths. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`, `packages/ui/ui/src/primitives/ResizeHandle.tsx` (`minWidth`/`maxWidth`)
- [x] Layout restoration between visits. **Web** · `packages/ui/unified-chat/src/stores/uiStore.ts` (`persist` middleware for `sidebarCollapsed`, `artifactPanelWidth`)
- [x] Window-size and monitor-change restoration. **Desktop** · `apps/desktop/electron/windowState.ts`
- [x] Print-specific layouts. **Web** · `apps/web/app/globals.css` (`@media print`, `data-print-scope="transcript"`)

Section tally: 23 of 32 checked; 2 partial; 7 not found.

## 8. Basic interactive elements

- [x] Primary buttons. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (`variant: 'default'`)
- [x] Secondary buttons. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (`variant: 'secondary'`)
- [x] Destructive buttons. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (`variant: 'destructive'`)
- [x] Icon-only buttons. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (`size: 'icon'`, auto `sr-only` label)
- [ ] Split buttons. **Not found.**
- [x] Toggle buttons. **Shared** · `packages/ui/ui/src/primitives/Toggle.tsx`
- [x] Button groups. **Shared** · `packages/ui/ui/src/primitives/ToggleGroup.tsx`
- [x] Text links. **Web** · `next/link` used across 38 files in `apps/web/features`, e.g. `apps/web/features/marketing/components/FlagshipSections.tsx`
- [x] Text inputs. **Shared** · `packages/ui/ui/src/primitives/Input.tsx`
- [x] Multiline inputs. **Shared** · `packages/ui/ui/src/primitives/Textarea.tsx`
- [x] Search fields. **Shared** · `packages/ui/ui/src/primitives/SearchInput.tsx`
- [x] Password fields. **Web** · `apps/web/features/auth` (native `type="password"` inputs)
- [x] One-time-code fields. **Shared** · `packages/ui/ui/src/primitives/InputOTP.tsx`
- [x] Checkboxes. **Shared** · `packages/ui/ui/src/primitives/Checkbox.tsx`
- [x] Radio groups. **Shared** · `packages/ui/ui/src/primitives/RadioGroup.tsx` (used in `apps/web/features/onboarding/components/OnboardingWizard.tsx`)
- [x] Switches. **Shared** · `packages/ui/ui/src/primitives/Switch.tsx` (15+ consumers)
- [x] Segmented controls. **Shared** · `packages/ui/ui/src/primitives/SegmentedControl.tsx`
- [x] Single-select menus. **Shared** · `packages/ui/ui/src/primitives/Select.tsx`
- [x] Searchable comboboxes. **Web** · `packages/ui/ui/src/primitives/useCombobox.ts`, consumed by `apps/web/shared/components/CommandPalette/CommandPalette.tsx`
- [x] Multiselect controls. **Web** · `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx` (`question.multiSelect`)
- [ ] Token/chip inputs. **Not found:** read-only chips exist (source/tool chips) but no removable tag/token entry field.
- [x] Numeric steppers. **Web** · `apps/web/features/settings/sections/WorkspacePolicySection.tsx` (native `type="number"` with `min`/`max`)
- [x] Sliders. **Shared** · `packages/ui/ui/src/primitives/Slider.tsx` (Radix Slider)
- [ ] Range sliders. **Partial:** `Slider.tsx` is built on Radix's range-capable primitive but no consumer passes a two-value range · `packages/ui/ui/src/primitives/Slider.tsx`
- [x] Date pickers. **Desktop** · `apps/desktop/src/features/reminders/ReminderDialog.tsx` (native `type="date"`)
- [x] Time pickers. **Desktop** · `apps/desktop/src/features/reminders/ReminderDialog.tsx` (native `type="time"`)
- [ ] Timezone pickers. **Partial:** free-text IANA-name input, no searchable list · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Color pickers. **Desktop** · `apps/desktop/src/features/settings/ThemeEditorDialog.tsx` (native `type="color"`)
- [x] File inputs. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (native `input[type="file"]`)
- [x] Upload dropzones. **Web** · `apps/web/features/chat/components/Composer/DragDropOverlay.tsx`
- [x] Tabs. **Desktop, Web** · `apps/desktop/src/features/git/GitPanel.tsx`, `packages/ui/ui/src/primitives/Tabs.tsx`
- [ ] Accordions. **Partial:** primitive exists, no rendering consumer found · `packages/ui/ui/src/primitives/Accordion.tsx`
- [x] Disclosure controls. **Shared** · `packages/ui/ui/src/primitives/Collapsible.tsx`
- [x] Dropdown menus. **Shared** · `packages/ui/ui/src/primitives/DropdownMenu.tsx`
- [x] Context menus. **Desktop** · `apps/desktop/src/features/code/FileTree.tsx` (`onContextMenu` right-click menu)
- [x] Nested menus. **Shared** · `packages/ui/ui/src/primitives/DropdownMenu.tsx` (`DropdownMenuSub`)
- [x] Tooltips. **Shared** · `packages/ui/ui/src/primitives/Tooltip.tsx` (13 consumers)
- [x] Popovers. **Shared** · `packages/ui/ui/src/primitives/Popover.tsx` (10 consumers)
- [ ] Hover cards. **Partial:** primitives exist on Web and Desktop, no rendering consumer found · `packages/ui/ui/src/primitives/HoverCard.tsx`, `apps/desktop/src/ui/HoverCard.tsx`
- [x] Badges. **Shared** · `packages/ui/ui/src/primitives/Badge.tsx` (15+ consumers)
- [x] Tags. **Shared** · `packages/ui/ui/src/primitives/Badge.tsx` (used as tags/chips throughout chat cards)
- [x] Avatars. **Shared** · `packages/ui/ui/src/primitives/Avatar.tsx`, used in `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Progress indicators. **Shared** · `packages/ui/ui/src/primitives/Progress.tsx`, `packages/ui/ui/src/primitives/Spinner.tsx`
- [x] Skeleton loaders. **Shared** · `packages/ui/ui/src/primitives/Skeleton.tsx`
- [x] Toasts. **Shared** · `packages/ui/ui/src/primitives/SonnerToaster.tsx` (36+ consumers via `sonner`)
- [x] Inline alerts. **Shared** · `packages/ui/ui/src/primitives/Alert.tsx`
- [x] Banners. **Web** · `apps/web/features/chat/components/InlinePaywallCard.tsx`, `apps/web/features/chat/lib/turn-failure-notice.ts`
- [x] Pagination controls. **Shared** · `packages/ui/ui/src/primitives/DataTable.tsx` (`getPaginationRowModel`)
- [x] Empty states. **Shared** · `packages/ui/ui/src/primitives/EmptyState.tsx`, consumed in `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [x] Error states. **Web** · `apps/web/shared/components/ErrorBoundary.tsx`, `apps/web/features/chat/components/ChatConversationBoundary.tsx`

Section tally: 44 of 50 checked; 4 partial; 2 not found.

## 9. Compound interface components

- [x] Searchable resource picker. **Web** · `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` (@-mention resource search)
- [x] Model picker. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Source picker. **Web** · `apps/web/features/projects/components/SourcesPanel.tsx`
- [x] Connected-account picker. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`
- [x] Workspace picker. **Web** · `apps/web/features/workspace-console/components/WorkspaceConsoleShell.tsx`
- [x] Project picker. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Repository picker. **Web** · `apps/web/features/code/components/CodeComposer.tsx` (repository list with search)
- [ ] Branch picker. **Partial:** branch is a free-text field defaulting to the repository default branch; no branch list or switcher · `apps/web/features/code/components/CodeComposer.tsx`
- [ ] Device picker. **Partial:** settings explicitly states trusted-device management is unavailable in the current surface · `apps/web/features/settings/sections/SecuritySection.tsx`
- [ ] Permission-scope picker. **Not found:** scopes are displayed (`ConnectorScopeList`) but not user-selectable.
- [x] Member and recipient picker. **Web** · `apps/web/features/settings/sections/TeamSection.tsx`
- [x] Recurrence editor. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx` (Frequency `<select>` plus advanced RFC 5545 rule field)
- [x] File browser. **Desktop** · `apps/desktop/src/features/code/FileTree.tsx`
- [x] Folder tree. **Desktop** · `apps/desktop/src/features/editing/FileTreeWithChanges.tsx`
- [x] Data table. **Web** · raw `<table>` grids e.g. `apps/web/features/admin/components/ServiceHealthPanel.tsx`; sortable/paginated primitive at `packages/ui/ui/src/primitives/DataTable.tsx`
- [x] Resource grid. **Shared** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`grid grid-cols-2 … lg:grid-cols-4`)
- [x] Media gallery. **Shared** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (aspect-square tiles)
- [ ] Image comparison slider. **Not found.**
- [x] Timeline. **Web** · `apps/web/features/chat/components/messages/ToolTimeline.tsx`
- [x] Activity feed. **Desktop** · `apps/desktop/src/features/governance/AuditLog.tsx`
- [x] Task board. **Desktop** · `apps/desktop/src/features/dynamic-canvas/DynamicCanvas.tsx` (draggable Kanban columns/cards)
- [x] Stepper. **Web, Desktop** · `apps/web/features/onboarding/components/OnboardingWizard.tsx`, `apps/desktop/src/features/onboarding/OnboardingWizard.tsx`
- [x] Multi-step setup wizard. **Web** · `apps/web/features/onboarding/components/OnboardingWizard.tsx`
- [ ] Split-pane container. **Not found:** layouts use fixed flex panes, not a generic resizable split-pane container.
- [ ] Docking layout manager. **Not found.**
- [x] Version-history panel. **Desktop** · `apps/desktop/src/features/artifacts/ArtifactVersionHistory.tsx`
- [x] Diff viewer. **Desktop** · `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx`, `apps/desktop/src/features/git/GitDiffViewer.tsx`
- [x] Source inspector. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx`
- [x] Usage meter. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [ ] Credit-balance card. **Not found:** (usage is shown as consumption meters, not a credit-balance card).
- [x] Permission summary. **Web** · `apps/web/features/connectors/components/ConnectorConsentSummary.tsx`
- [x] Approval card. **Shared** · `packages/ui/ui/src/primitives/ApprovalCard.tsx`, `apps/web/features/chat/components/approvals/ApprovalInbox.tsx`
- [x] Integration connection card. **Web** · `apps/web/features/connectors/components/ConnectorScopeList.tsx` (surfaced via `apps/web/features/settings/components/WebSettingsModal.tsx`)
- [x] Capability-warning card. **Mobile** · `apps/mobile/src/shared/components/FeatureUnavailable.tsx`
- [ ] Task-progress card. **Partial:** task cards show status/running indicators, no numeric progress · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Interactive result widget. **Web** · `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx`
- [x] Notification inbox. **Desktop** · `apps/desktop/src/features/notifications/NotificationCenter.tsx`
- [x] Keyboard-command palette. **Web** · `apps/web/shared/components/CommandPalette/CommandPalette.tsx`

Section tally: 30 of 38 checked; 3 partial; 5 not found.

## 10. Modal and dialog inventory

- [x] Create Project. **Web** · `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx`
- [x] Rename conversation. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`runSessionRowAction('rename', …)`)
- [x] Move conversation. **Web** · `packages/ui/ui/src/sidebar/Menu.tsx` ("Move to project" row action)
- [x] Duplicate resource. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (`/api/projects/:id/duplicate`)
- [x] Archive confirmation. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`updateConversation(id, { archived: … })`)
- [x] Delete confirmation. **Shared** · `packages/ui/ui/src/primitives/ConfirmAction.tsx` (`useConfirmAction`), used in `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Permanent-delete confirmation. **Web** · `apps/web/features/settings/sections/AccountSection.tsx` (type-to-confirm `AlertDialog`)
- [x] Share conversation. **Web** · `apps/web/features/chat/components/share/ShareConversationDialog.tsx`
- [x] Share file or folder. **Web** · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [x] Share artifact. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Publish generated application. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [x] Manage link access. **Web** · `apps/web/features/chat/components/share/ShareConversationDialog.tsx` ("Anyone with the link" option)
- [x] Invite member. **Web** · `apps/web/features/settings/sections/TeamSection.tsx`
- [x] Change member role. **Web** · `apps/web/features/workspace-console/components/WorkspaceRoles.tsx`
- [ ] Transfer ownership. **Not found.**
- [x] Select sources. **Web** · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [x] Upload from device. **Web** · native `input[type="file"]` in `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Connect external account. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`
- [x] Reauthorize connection. **Web** · `apps/web/features/connectors/hooks/use-connectors.ts`
- [x] Select among connected accounts. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`
- [ ] Install Plugin. **Partial:** backend install API and CLI-command instructions exist, no in-app install dialog · `apps/web/app/plugins/[id]/page.tsx`
- [ ] Review Plugin permissions. **Not found:** no scope/permission step surfaced before plugin install.
- [ ] Update Plugin. **Partial:** `/api/plugins/updates` backend exists, no confirmed update-prompt UI · `apps/web/app/api/plugins/updates/route.ts`
- [x] Skill import. **Web** · `apps/web/features/skills/services/skills-catalog.ts`, `apps/web/features/skills/hooks/use-skills-settings-adapter.tsx`
- [x] Skill edit. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx`
- [x] Model incompatibility warning. **Web** · `apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx`
- [x] Context-limit warning. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Usage-limit notice. **Web** · `apps/web/features/chat/stores/account-usage-block.ts`
- [x] Credit-purchase dialog. **Web** · `apps/web/features/billing/components/UpgradeConfirmDialog.tsx`
- [x] Upgrade comparison. **Web** · `apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx`
- [x] Cancel subscription. **Web** · `apps/web/features/settings/sections/BillingSection.tsx` (Stripe portal `openPortal('cancel')`)
- [x] Payment-method update. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Reauthentication challenge. **Not found:** account deletion uses type-to-confirm text, not a password/MFA step-up · `apps/web/features/settings/sections/AccountSection.tsx`
- [x] Microphone permission explanation. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Screen-sharing source selection. **Desktop** · `apps/desktop/electron/main.ts` (`desktopCapturer.getSources` + native chooser dialog)
- [x] Computer-control permission. **Desktop** · `apps/desktop/src/features/settings/ComputerUseConsentDialog.tsx`
- [x] Folder-access permission. **Desktop** · `apps/desktop/src/features/chat/FolderAccessConsentDialog.tsx`
- [x] Tool-action approval. **Web** · `apps/web/features/chat/components/approvals/ApprovalInbox.tsx`
- [x] Sensitive-data transfer approval. **Web** · `apps/web/features/chat/lib/localByokHandoff.ts` (local-to-BYOK handoff "ceremony"), wired in `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Remote-device pairing. **Desktop, Mobile** · `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx`, `apps/mobile/src/features/companion/components/QRScanner.tsx`
- [x] Unsaved-changes warning. **Desktop** · `apps/desktop/src/features/settings/SettingsPanel.tsx` (`hasUnsavedChanges`)
- [x] Edit-conflict resolution. **Desktop** · `apps/desktop/src/api/git.ts`
- [x] Export options. **Web** · `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- [x] Report-content dialog. **Web, Mobile** · `apps/web/features/admin/components/ContentReportQueuePanel.tsx`, `apps/mobile/src/features/chat/components/ReportFlagButton.tsx`
- [x] Feedback submission. **Web** · `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx`
- [ ] Diagnostic-sharing consent. **Not found.**
- [ ] Data-export request. **Partial:** self-service export runs from a Privacy settings row with inline status, not a request dialog · `apps/web/features/settings/sections/PrivacySection.tsx`
- [x] Account-deletion request. **Web** · `apps/web/features/settings/sections/AccountSection.tsx`

Section tally: 41 of 48 checked; 3 partial; 4 not found.

## 11. Accessibility and localization components

- [x] Accessible control labels. **Shared** · `packages/ui/ui/src/primitives/Button.tsx` (auto `sr-only` fallback label, `aria-label`)
- [x] Semantic heading hierarchy. **Web** · `apps/web/features/marketing/components/FlagshipSections.tsx` (`<h1>`/`<h2>` structure)
- [x] Keyboard navigation. **Shared** · `packages/ui/ui/src/primitives/useMenuKeyboard.ts`
- [x] Visible focus indicators. **Web** · `apps/web/app/globals.css` (`*:focus-visible` outline rules)
- [x] Focus management across dialogs. **Shared** · `packages/ui/ui/src/primitives/useDialogKeyboard.ts`, `packages/ui/ui/src/primitives/AccessibleDialog.tsx`
- [x] Focus restoration after panel closure. **Shared** · `packages/ui/ui/src/primitives/AccessibleDialog.tsx` (restores focus to trigger/previously active element)
- [x] Screen-reader announcements for completed events. **Shared** · `packages/ui/unified-chat/src/components/AgenticLoopStatusBar.tsx` (`role="status"` `aria-live="polite"`)
- [x] Non-spammy streaming announcements. **Shared** · `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx` (2s-throttled, word-bounded live region)
- [x] Accessible tool and approval status. **Shared** · `packages/ui/unified-chat/src/components/AgenticLoopStatusBar.tsx`
- [x] Touch equivalents for hover interactions. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`pointer-coarse:opacity-100`)
- [x] Alternatives to drag-only operations. **Web** · `packages/ui/ui/src/sidebar/Menu.tsx` ("Move to project" menu action alongside drag)
- [x] Text resizing. **Web** · `apps/web/shared/components/AppearancePreferences.tsx` (`data-chat-text-size` small/large)
- [x] Browser-zoom reflow. **Web** · `apps/web/app/globals.css` (`--agi-window-zoom`, 16px inputs to prevent iOS zoom-on-focus, fluid `clamp()` type scale)
- [x] Reduced motion. **Shared** · `packages/ui/design-tokens/src/foundation.css`, `packages/ui/unified-chat/src/hooks/useReducedMotion.ts`
- [x] Captions. **Web** · `apps/web/features/chat/components/Voice/VoiceCaptions.tsx`
- [x] Transcripts. **Web** · `apps/web/features/chat/components/Voice/voice-captions.ts`; conversation transcript itself at `apps/web/features/chat/pages/WebChatPage.tsx`
- [ ] Chart descriptions. **Not found:** `ChartArtifact.tsx` has no `aria-label`/description for its data.
- [ ] Data-table alternatives for charts. **Not found:** no toggle to view chart data as a table.
- [x] Right-to-left layouts. **Web, Desktop, Mobile** · `apps/web/app/i18n/index.ts`, `apps/desktop/src/i18n/index.ts`, `apps/mobile/src/i18n/index.ts` (`I18nManager.forceRTL`)
- [x] Mixed-direction text handling. **Shared** · `packages/ui/i18n/src/languages.ts` (`rtl` per-language flag applied per document, not a blanket `dir`)
- [x] Input-method composition support. **Shared** · `packages/ui/unified-chat/src/composer-editor/ime-composition.ts` (`isImeComposingKey`, keyCode 229 handling)
- [x] Locale-aware dates and numbers. **Web** · `apps/web/features/billing/lib/plan-display.ts` (`Intl.NumberFormat`/`Intl.DateTimeFormat`)
- [x] Currency formatting. **Web** · `apps/web/features/billing/lib/plan-display.ts` (`Intl.NumberFormat` `style: 'currency'`)
- [x] Pluralization. **Shared** · `packages/ui/i18n/locales/en/pricing.json` (`_one`/`_other` i18next ICU-style plural keys)
- [x] Translated error messages. **Shared** · `packages/ui/i18n/locales/en/errors.json` (219 keys, translated in `packages/ui/i18n/locales/ar/errors.json`, `de/errors.json`, etc.)
- [x] Platform-specific shortcut notation. **Shared** · `packages/ui/unified-chat/src/components/KeyboardShortcutsDialog.tsx` (Mac ⌘ vs Ctrl detection)
- [ ] Long-label and translated-copy layouts. **Partial:** `min-w-0`/`truncate` used ad hoc, one documented 320px-width case, no systematic long-copy test · `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Accessible terminal output mode. **CLI** · `apps/cli/src/output.rs` (`--plain`/`AGI_PLAIN`, explicitly distinct from `NO_COLOR`, designed for line-at-a-time screen-reader output)

Section tally: 25 of 28 checked; 1 partial; 2 not found.

---

# C. Chat, composer, messages, and rendering

## 12. New-chat experience

- [x] Empty conversation canvas. **Web** · `apps/web/features/chat/components/messages/ChatMessageList.tsx`
- [x] Personalized greeting where appropriate. **Web** · `packages/ui/unified-chat/src/lib/greeting.ts`, `apps/web/features/chat/components/GreetingBanner/useGreeting.ts`
- [ ] Neutral greeting when personalization is disabled. **Partial:** falls back to a nameless variant when no name is known; no explicit disable toggle · `packages/ui/unified-chat/src/lib/greeting.ts`
- [ ] Suggested prompts. **Partial:** `AdvancedEmptyState` is an unrendered stub; starter prompts exist only in onboarding · `packages/ui/unified-chat/src/components/AdvancedEmptyState.tsx`, `apps/web/features/onboarding/components/StarterPrompts.tsx`
- [ ] Task-category shortcuts. **Not found.**
- [ ] Recent Project shortcuts. **Not found.**
- [ ] Recent-file suggestions. **Not found.**
- [ ] Recommended Skills. **Not found.**
- [ ] Recommended connected apps. **Not found.**
- [x] Search entry. **Web** · `packages/ui/unified-chat/src/lib/slashCommands.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Research entry. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Image-creation entry. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Video-creation entry. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Voice entry. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Agentic-work entry. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Coding entry. **Web** · `packages/ui/unified-chat/src/lib/slashCommands.ts`
- [x] Temporary-chat control. **Web, Mobile** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`, `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx`
- [x] Default-model display. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Default-workspace display. **Web** · `apps/web/shared/components/layout/AccountMenuItems.tsx`, `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx`
- [x] Default-Project selection. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Mode explanation and examples. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] First-use feature education. **Web** · `apps/web/app/welcome/page.tsx`, `apps/web/features/onboarding/components/OnboardingWizard.tsx`
- [x] Resumption of an unsent draft. **Web** · `apps/web/features/chat/hooks/use-conversation-draft-sync.ts`
- [ ] Guest limitations and sign-in conversion. **Not found.**

Section tally: 16 of 24 checked; 2 partial; 6 not found.

## 13. Composer text interaction

- [x] Plain-text entry. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Multiline entry. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Automatic height growth. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Manual expansion. **Mobile** · `apps/mobile/src/features/chat/components/ChatInput.tsx`
- [x] Full-screen prompt editing. **Mobile** · `apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx`
- [x] Send button. **Web** · `apps/web/features/chat/components/Composer/SendButton.tsx`
- [x] Stop button. **Web** · `apps/web/features/chat/components/Composer/SendButton.tsx`
- [x] Enter-to-send preference. **Desktop** · `apps/desktop/src/stores/settings/chatPrefs.ts`, `apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx`
- [x] Newline shortcut. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Undo and redo. **Shared (Web)** · `packages/ui/unified-chat/src/composer-editor/extensions/index.ts`
- [x] Clipboard paste. **Web** · `packages/platform/utils/src/composerPaste.ts`
- [x] Rich-text paste normalization. **Shared** · `packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx`
- [x] Code-paste formatting. **Web, Shared** · `packages/platform/utils/src/composerPaste.ts`
- [x] Long-prompt handling. **Web, Shared** · `packages/platform/utils/src/composerPaste.ts`
- [x] Character or token indicators where useful. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Draft autosave. **Web** · `apps/web/features/chat/hooks/use-conversation-draft-sync.ts`
- [x] Draft recovery. **Web** · `apps/web/features/chat/hooks/use-conversation-draft-sync.ts`
- [x] Draft isolation by conversation. **Web** · `apps/web/features/chat/hooks/use-conversation-draft-sync.ts`
- [ ] Prompt history in terminal interfaces. **Not found:** Up/Down only move the multiline cursor or scroll chat · `apps/cli/src/tui/tui_app.rs`
- [ ] Prompt suggestions. **Partial:** component built but never imported by any app · `packages/ui/unified-chat/src/components/PromptSuggestionsDropdown.tsx`
- [ ] Prompt-template insertion. **Not found.**
- [x] Slash-command autocomplete. **Web** · `packages/ui/unified-chat/src/lib/slashCommands.ts`
- [x] Skill invocation. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [ ] Agent or assistant mention. **Not found.**
- [x] Project mention. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] File mention. **CLI** · `apps/cli/src/mentions.rs`
- [ ] Folder mention. **Not found:** folder can be attached but not `@`-mentioned in text.
- [ ] Repository mention. **Not found:** repo can be attached but not `@`-mentioned in text.
- [x] Browser-tab mention. **Chrome** · `apps/extension/src/side_panel.ts`
- [ ] Connected-app mention. **Not found.**
- [x] Context chips. **Web, Chrome** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/extension/src/side_panel.ts`
- [ ] Selected-source chips. **Not found.**
- [x] Selected-tool chips. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [ ] Output-format selection. **Not found.**
- [x] Attachment menu. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Dictation control. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Voice-conversation control. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Queued next prompt. **Web** · `apps/web/features/chat/components/Composer/SendButton.tsx`
- [x] Edit or cancel queued prompt. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Mid-task steering input. **Web, CLI** · `apps/web/features/chat/components/approvals/ApprovalInbox.tsx`, `apps/cli/src/app_server/developer_host.rs`
- [ ] Separate side question that does not modify the main task. **Not found.**

Perplexity’s September 21 update explicitly documents a read-only Side Chat using a snapshot of the main task context. That is a separate interaction from steering the running task or branching it.

Section tally: 31 of 41 checked; 1 partial; 9 not found.

## 14. Attachment intake components

- [x] Device file picker. **Web** · `apps/web/features/chat/hooks/use-attachments.ts`
- [x] Drag-and-drop intake. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Paste-image intake. **Web, Shared** · `packages/platform/utils/src/composerPaste.ts`
- [x] Camera capture. **Mobile** · `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`
- [x] Photo-library selection. **Mobile** · `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`
- [x] Screenshot capture. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Window capture. **Desktop** · `apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx`
- [ ] URL attachment. **Partial:** pasted URLs trigger ambient web-fetch, not a distinct attachment · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Cloud-file picker. **Mobile** · `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`, `apps/mobile/app/(app)/(tabs)/chat.tsx`
- [x] Library-file picker. **Mobile** · `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`
- [ ] Repository attachment. **Partial:** the shared `AttachmentMenu` has an "Add from GitHub" action, but no consumer passes its handler, so it never renders · `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- [x] Folder attachment. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [ ] Audio attachment. **Not found:** chat attachment MIME allowlist has no `audio/*` type · `packages/contracts/cloud-contracts/src/chat-attachments.ts`
- [ ] Video attachment. **Not found:** chat attachment MIME allowlist has no `video/*` type · `packages/contracts/cloud-contracts/src/chat-attachments.ts`
- [x] Multiple-file selection. **Web** · `apps/web/features/chat/hooks/use-attachments.ts`
- [x] Attachment thumbnail. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [x] File-type icon. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [x] Filename and file-size metadata. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [x] Upload progress. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [ ] Parsing progress. **Partial:** phases are "verifying"/"uploading"/"preparing", no distinct parsing label · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [x] Indexing progress. **Web** · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- [x] Ready-to-use state. **Web** · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- [x] Partial-extraction notice. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- [x] Unsupported-file notice. **Web** · `apps/web/features/chat/hooks/use-attachments.ts`
- [ ] Password-protected-file notice. **Partial:** extractor detects it with specific copy, live-send path returns a generic error instead · `apps/web/lib/server/office-document-text.ts`
- [x] Upload retry. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [ ] Upload cancellation. **Not found.**
- [x] Attachment removal. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [ ] Attachment replacement. **Not found:** attachments must be removed and re-added, not replaced in place.
- [x] Attachment preview. **Web** · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [ ] Duplicate-file treatment. **Not found.**
- [x] Per-file error display. **Web** · `apps/web/features/chat/hooks/use-attachments.ts`
- [ ] Batch-upload summary. **Partial:** refusals fold into the sent message text, no visible summary panel · `apps/web/lib/chat-attachment-policy.ts`
- [ ] File-retention explanation. **Partial:** an outbound-destination chip exists, no attachment retention duration stated · `apps/web/features/chat/components/Composer/AttachmentPreview.tsx`
- [x] Selected-model compatibility warning. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Alternative processing-path explanation. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`

Section tally: 25 of 36 checked; 6 partial; 5 not found.

## 15. Model-selector interface

- [x] Current-model label. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Provider label. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Model-family grouping. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Searchable model list. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Favorite models. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Recently used models. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Recommended models. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Automatic-selection option. **Web** · `apps/web/shared/stores/model-store.ts`
- [ ] Default-profile option. **Partial:** `getAutoRoutingProfiles` exists with no UI consumer · `packages/contracts/types/src/model-catalog.ts`
- [x] Explicit model selection. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Model description. **Web** · `apps/web/shared/stores/model-store.ts`
- [x] Input-modality badges. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Output-modality badges. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Tool-support badge. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Context-capacity information. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Relative speed information. **Web** · `apps/web/shared/stores/model-store.ts`
- [x] Relative usage or cost information. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Plan-eligibility information. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Preview or experimental badge. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Deprecated-model notice. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Temporary-unavailability state. **Web** · `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Reasoning-effort selector. **Web, CLI** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`, `apps/cli/src/tui/widgets/effort_picker.rs`
- [x] Fast-serving option where supported. **Web** · `packages/ai/model-registry/catalog/models.curation.json`, `apps/web/shared/stores/model-store.ts`
- [x] Response-length preference. **Web** · `apps/web/features/chat/components/Composer/StyleSelector.tsx`
- [ ] Advanced sampling controls where exposed. **Not found:** temperature/top_p exist only as provider-internal catalog metadata.
- [ ] Provider-route selection where exposed. **Not found:** `selectedRouteId` state has no picker UI consumer · `apps/web/shared/stores/model-store.ts`
- [x] Local-model selection. **Web** · `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx`
- [x] BYOK route selection. **Web** · `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx`
- [x] Sticky model preference. **Web** · `apps/web/shared/stores/model-store.ts`
- [x] Conversation-specific override. **Web** · `apps/web/shared/stores/web-chat-store.ts`
- [x] Per-turn model override. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Actual-serving-model disclosure. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Fallback disclosure. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Model-switch incompatibility dialog. **Web** · `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx`
- [x] Preserve-or-remove incompatible attachments choice. **Web** · `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx`

Section tally: 32 of 35 checked; 1 partial; 2 not found.

## 16. User-message components

- [ ] User identity/avatar. **Not found:** code comment states "No avatars: user messages read as a right-aligned bubble" · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Message text. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Attachment group. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [ ] Source and context chips. **Not found:** on the historical message itself (composer-side chips only).
- [x] Timestamp. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [ ] Edited-message indicator. **Partial:** version nav (prev/next + count) implies an edit, no "(edited)" label · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Copy action. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Edit action. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Resend action. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [ ] Branch-from-message action. **Partial:** branch is offered on assistant messages only, not user messages · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Message-version navigation. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Expand long message. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Collapse long message. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [ ] Delivery-pending state. **Partial:** only the send button shows a sending spinner, not the message bubble · `apps/web/features/chat/components/Composer/SendButton.tsx`
- [x] Delivery-failed state. **Web** · `apps/web/features/chat/hooks/use-turn-error-notice.ts`
- [x] Retry-send action. **Web** · `apps/web/features/chat/hooks/use-turn-error-notice.ts`
- [x] Queued-message state. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [ ] Draft versus submitted distinction. **Partial:** drafts are persisted per conversation, no visible "Draft" label · `apps/web/features/chat/hooks/use-conversation-draft-sync.ts`
- [ ] Voice-transcript attribution. **Not found.**
- [ ] Imported-message attribution. **Not found.**
- [ ] Group-conversation author identity. **Not found:** only AI-agent contribution attribution exists, not multi-human authorship.
- [ ] Message-level deep link. **Partial:** `?highlightMessage=<id>` scrolls/highlights, no visible "copy link" action · `apps/web/features/chat/pages/WebChatPage.tsx`

Section tally: 12 of 22 checked; 5 partial; 5 not found.

## 17. Assistant-message components

- [x] Assistant/model identity. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (line ~3144 `message-answered-by`), `packages/ui/unified-chat/src/components/ProvenanceFooter.tsx`
- [x] Streaming answer body. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx`
- [x] Working indicator. **Web, Desktop** · `apps/web/features/chat/components/messages/TypingIndicator.tsx`, `packages/ui/unified-chat/src/components/MessageBubble.tsx` (`StreamingThinkingStatus`)
- [x] Reasoning-summary or activity-summary disclosure. **Web, Desktop** · `packages/ui/unified-chat/src/components/ThinkingBlock.tsx`, `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx`
- [x] Tool-activity section. **Web, Desktop** · `apps/web/features/chat/components/messages/ToolTimeline.tsx`, `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx`
- [x] Source citations. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`, `packages/ui/unified-chat/src/components/CitationPill.tsx`
- [x] Sources footer. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (`SourcesControl`, line ~544)
- [x] Generated-file cards. **Web, Desktop** · `apps/web/features/chat/components/messages/DeliverableCard.tsx`, `packages/ui/unified-chat/src/components/GeneratedFileCard.tsx`
- [x] Artifact launch cards. **Web** · `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx`
- [x] Image results. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Audio results. **Not found.**
- [x] Video results. **Web** · `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx`
- [x] Interactive widgets. **Web** · `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx`
- [x] Follow-up suggestions. **Web** · `apps/web/features/chat/components/FollowUpSuggestions.tsx`, wired in `apps/web/features/chat/components/messages/ChatMessageList.tsx`
- [x] Copy plain text. **Web, Desktop** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`handleCopy`, line ~1592)
- [ ] Copy formatted answer. **Not found:** only `navigator.clipboard.writeText` of raw markdown found anywhere; no rich/HTML clipboard write.
- [x] Read aloud. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`onReadAloud`, "Read message aloud")
- [x] Stop read-aloud playback. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (same control toggles to "Stop reading message")
- [x] Regenerate answer. **Web, Desktop** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`onRegenerate`), `packages/ui/unified-chat/src/components/ActionBar.tsx`
- [x] Retry failed answer. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts`, `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Continue truncated answer. **Web** · `apps/web/features/chat/components/messages/ChatMessageList.tsx` (line ~1750, "Continue generating"), `packages/ui/unified-chat/src/lib/continue-generation.ts`
- [x] Rewrite with another model. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`onRegenerateWithModel`, "Try again with")
- [ ] Shorten answer. **Partial:** only a contextual `FollowUpSuggestions.tsx` chip ("make this more concise") for draft/article-like answers, not a universal control · `apps/web/features/chat/components/FollowUpSuggestions.tsx`
- [ ] Expand answer. **Not found.**
- [ ] Change tone. **Partial:** same contextual suggestion chip ("adjust the tone to be more formal"), draft-content only · `apps/web/features/chat/components/FollowUpSuggestions.tsx`
- [ ] Revise selected text. **Not found.**
- [x] Branch from answer. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`onBranch`)
- [x] Navigate answer variants. **Web** · `apps/web/features/chat/components/messages/VariantPager.tsx`
- [x] Positive feedback. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`rateResponse('up')`)
- [x] Negative feedback. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`rateResponse('down')`)
- [x] Report answer. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`reportMessage`, `/api/content-report`)
- [x] Share answer or conversation. **Web** · `apps/web/features/chat/components/share/ShareConversationDialog.tsx`
- [ ] Save answer to Project knowledge. **Partial:** works for the derived artifact, not the raw answer text itself · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`uploadProjectKnowledgeFile`)
- [ ] Save answer as a document. **Not found.**
- [ ] Export answer. **Not found:** only whole-conversation export found (see §18 Conversation export).
- [x] Actual-model and usage details. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`TokenUsageDisplay`, `totalDurationMs`, line ~3096)
- [x] Partial-result state. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`interrupted` cause: "The part that arrived is kept above")
- [x] Refusal state. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`isRefusalFinish`)
- [x] Interrupted state. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`isStoppedTurn`)
- [x] Empty-output error state. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`emptyResponse` cause)

Section tally: 31 of 40 checked; 3 partial; 6 not found.

## 18. Conversation-level controls

- [x] Automatic title. **Web** · `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts`
- [x] Manual rename. **Web** · `apps/web/features/chat/components/ConversationTitleMenu.tsx`
- [x] Pin and unpin. **Web** · `apps/web/shared/components/layout/sidebar-session-actions.ts`
- [x] Archive and restore. **Web** · `apps/web/features/chat/components/ConversationTitleMenu.tsx`, `apps/web/shared/components/layout/sidebar-session-actions.ts`
- [x] Delete. **Web** · `apps/web/features/chat/components/ConversationTitleMenu.tsx`, `apps/web/shared/components/layout/sidebar-session-actions.ts`
- [x] Duplicate. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`onFork`, "Duplicate as branch", line ~5471)
- [x] Move to Project. **Web** · `apps/web/features/chat/components/ConversationTitleMenu.tsx`
- [ ] Copy into Project. **Not found:** only move (which relocates) was found, no copy-while-keeping-original path.
- [x] Change conversation mode. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`workMode` toggle, chat ↔ agiwork)
- [x] Change privacy mode through an explicit flow. **Web, Desktop** · `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx`
- [x] Conversation search. **Web** · `apps/web/features/chat/components/messages/MessageSearch.tsx`
- [x] Jump between search matches. **Web** · `apps/web/features/chat/components/messages/MessageSearch.tsx`, `apps/web/features/chat/components/messages/ChatMessageList.tsx` (`goToMatch`)
- [ ] Conversation outline. **Not found.**
- [x] Jump to a turn. **Web** · `apps/web/features/chat/components/messages/ChatMessageList.tsx` (`goToMatch` / `listApiRef.current?.scrollToRow`)
- [x] Jump to latest. **Web** · `apps/web/features/chat/components/messages/ChatMessageList.tsx` (`scrollToBottomFast`)
- [ ] Scroll-position restoration. **Not found.**
- [x] Branch-tree navigation. **Web, Desktop** · `packages/ui/unified-chat/src/components/BranchNavigator.tsx`
- [x] Conversation export. **Web** · `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- [x] Conversation sharing. **Web** · `apps/web/features/chat/components/share/ShareConversationDialog.tsx`
- [x] Shared-link management. **Web** · `apps/web/features/settings/sections/SharedLinksSection.tsx`
- [ ] Conversation details inspector. **Not found.**
- [ ] Context and source inspector. **Partial:** a context/budget gauge and separate source-citation lists exist, no unified inspector combining both · `packages/ui/unified-chat/src/components/TokenCounter.tsx`
- [x] Usage summary. **Desktop** · `packages/ui/unified-chat/src/components/ConversationStatsPanel.tsx`, `apps/desktop/src/features/v3/DesktopShellV3.tsx`
- [ ] Conversation-level instructions. **Not found:** only Project-level custom instructions found, not per-conversation.
- [x] Conversation-level enabled tools. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`webSearchEnabled`/`codeExecutionEnabled` persisted per conversation via `getComposerToggles`)
- [x] Conversation-level connected accounts. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`disabledConnectorIdsByConversation`)
- [x] Active tasks associated with the conversation. **Web** · `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx`
- [x] Continuation on another device. **Mobile** · `apps/mobile/src/features/continuity/ContinuityOnboardingScreen.tsx`

Section tally: 22 of 28 checked; 1 partial; 5 not found.

## 19. Streaming and response-presentation states

- [ ] Request accepted. **Not found:** no distinct "accepted" status separate from the composer clearing and a generic "Preparing" indicator starting.
- [x] Waiting in queue. **Web** · `apps/web/features/chat/components/Composer/SendButton.tsx` (`QUEUED_CHIP_LABEL`), `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` (`'queued'` state)
- [ ] Preparing context. **Partial:** a generic "Preparing" pre-stream label exists, not context-specific · `apps/web/features/chat/components/messages/TypingIndicator.tsx`
- [x] Searching sources. **Web, Desktop** · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` ("Searching the web" / "Reading N sources")
- [x] Running code. **Web** · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` (code-execution category), `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx`
- [x] Calling a connected service. **Web, Desktop** · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` (connector/mcp tool category)
- [x] Waiting for approval. **Web, Desktop** · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` ("Needs approval"), `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Waiting for user input. **Web, Desktop** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` (`'awaiting_input'` state)
- [ ] Receiving first output. **Not found:** transitions directly from "Preparing" to text streaming with no distinct labeled state.
- [x] Streaming text. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx`
- [ ] Streaming structured output. **Partial:** `AgentActivityTimeline` entries populate live as tool/structured events stream in, no state labeled for this specifically · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx`
- [x] Building an artifact. **Web** · `apps/web/features/chat/hooks/use-streaming-artifact.ts` (`useStreamingArtifactSync`), wired in `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Generating media. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` ("Generating image"), `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx`
- [ ] Saving results. **Partial:** only a post-hoc failure notice for a failed save exists, no live "Saving…" indicator · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`metadataNotSaved`, line ~2748)
- [x] Completed. **Web, Desktop** · `packages/client/client-runtime/src/agentActivity.ts` (`AgentActivityRunStatus`)
- [x] Partially completed. **Web, Desktop** · `packages/client/client-runtime/src/agentActivity.ts` (`'partial'`)
- [x] Cancel requested. **Web** · `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx` ("Cancellation requested.")
- [x] Cancelled. **Web, Desktop** · `packages/client/client-runtime/src/agentActivity.ts` (`'cancelled'`)
- [x] Reconnecting. **Web** · `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` ("Reconnecting, attempt…")
- [x] Resuming existing work. **Web, Desktop** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` (`handleResume`/`resumePausedRun`)
- [x] Rate-limited. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`rateLimit` cause)
- [x] Budget exhausted. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`accountLimit`/`insufficient_credits`)
- [x] Authentication expired. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`sessionExpired`), `apps/web/lib/hooks/useChatStream.ts` (`isSessionExpiredError`)
- [ ] Required device unavailable. **Partial:** an `awaiting-device` "Waiting for your desktop" state exists, no distinct device-unavailable/offline error confirmed · `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx`
- [x] Provider unavailable. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`providerOutage` cause)
- [x] Failed with recoverable input. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`attachment`/`toolCall` causes)
- [x] Failed after useful partial output. **Web** · `apps/web/features/chat/lib/turn-error-notice.ts` (`interrupted` cause), `apps/web/features/chat/lib/continue-generation.ts` (`hasStreamError`)
- [x] Session restored after app restart. **Desktop** · `apps/desktop/src/hooks/useSessionPersistence.ts`
- [x] Background work continuing after UI closure. **Mobile, Web** · `apps/mobile/src/features/continuity/ContinuityOnboardingScreen.tsx`, `apps/web/lib/workflows/durable-stream-bounds.ts`

Section tally: 23 of 29 checked; 4 partial; 2 not found.

## 20. Markdown and text rendering

- [x] Paragraphs. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownParagraph`)
- [x] Headings. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (h1–h3 custom, h4–h6 default)
- [x] Bold, italic, and strikethrough. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` (`remark-gfm`)
- [x] Ordered lists. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownOrderedList`)
- [x] Unordered lists. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownUnorderedList`)
- [x] Nested lists. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownListItem`, standard remark AST nesting)
- [x] Task lists. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownTaskCheckbox`, `contains-task-list`)
- [x] Blockquotes. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`blockquote`)
- [x] Horizontal rules. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` (full CommonMark via `react-markdown`/remark pipeline, no override needed)
- [x] Inline code. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`CodeBlock`, unmatched-language branch)
- [x] Fenced code blocks. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`CodeBlock`)
- [x] Links. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownLink`)
- [x] Autolinks. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` (`remark-gfm`)
- [x] Footnotes where supported. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` (`DEFINITION_LABEL_PATTERN` footnote handling)
- [x] Tables. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`table`/`th`/`td`)
- [x] Wide-table scrolling. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`overflow-x-auto` table wrapper)
- [ ] Copy-table action. **Not found.**
- [ ] Download-table action. **Not found.**
- [x] Inline mathematical notation. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`rehype-katex` + `remark-math`)
- [x] Block mathematical notation. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`rehype-katex` + `remark-math`)
- [x] Escaped delimiters. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/preprocessMath.ts`
- [x] Partially streamed Markdown. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx`, `splitMarkdownBlocks.ts`
- [x] Incomplete code-fence handling. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` (`lineStartsInsideFence`), `apps/web/features/chat/components/messages/MessageBubble.tsx` (`closeUnterminatedFence`)
- [x] Sanitized embedded markup. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts`, `MarkdownContent.tsx` (`rehype-sanitize`)
- [x] Safe external-link handling. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`MarkdownLink`: `target=_blank rel=noopener`, tracking-param stripping, protocol-relative refusal)
- [x] Text selection across rendered blocks. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (standard DOM output, no `user-select` restriction found)
- [ ] Find-in-answer highlighting. **Not found:** `MessageSearch.tsx` scrolls to the matching message but does not highlight the matched text within it.
- [x] Print and export rendering. **Web** · `apps/web/features/chat/lib/print-conversation.ts`, `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- [x] Right-to-left content. **Web** · `packages/ui/i18n/src/languages.ts` (`rtl` flag), `apps/web/app/i18n/index.ts` (sets `document.documentElement.dir`)
- [x] Fallback rendering for unsupported blocks. **Web** · `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` (`card.fallback`)

Section tally: 27 of 30 checked; 0 partial; 3 not found.

## 21. Code blocks and executable code presentation

- [x] Language label. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`code-block-lang-label`)
- [x] Syntax highlighting. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` (Shiki), `shikiHighlighter.ts`
- [x] Copy code. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` (`CodeBlock`)
- [x] Download source file. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`handleDownload`, "Download source (.<language>)")
- [ ] Line numbers. **Not found.**
- [ ] Line wrapping. **Not found:** code blocks scroll horizontally (`overflow-x: auto`) with no wrap toggle · `packages/ui/unified-chat/src/components/markdown/codeBlock.css`
- [x] Expand/collapse. **Web** · `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` (`expanded` state)
- [x] Full-screen code view. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`isFullscreen`)
- [x] Highlighted changed lines. **Web, Desktop** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx` (`DiffLine` add/remove coloring)
- [x] Diff formatting. **Web, Desktop** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx` (`parseUnifiedDiff`, `FileDiff`)
- [ ] Error-line highlighting. **Not found.**
- [ ] Run-code action. **Partial:** an agentic "Run code" tool the model invokes exists (composer toggle), no manual per-block Run control · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [ ] Runtime/language selection where offered. **Not found.**
- [ ] Input parameters or stdin panel. **Not found.**
- [x] Output panel. **Web** · `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` (stdout)
- [x] Standard-error panel. **Web** · `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` (stderr)
- [ ] Execution-duration display. **Partial:** overall turn `totalDurationMs` is shown, not a per-execution duration · `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Exit-status display. **Web** · `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` (`returnCode` success/failure icon)
- [x] Generated-file output. **Web, Desktop** · `packages/ui/unified-chat/src/components/GeneratedFileCard.tsx`, `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Plot output. **Web** · `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` (inline base64 images)
- [ ] Retry execution. **Partial:** whole-turn Regenerate covers it, no execution-specific retry control.
- [ ] Stop execution. **Partial:** the general stream-stop control halts it, no execution-specific stop control.
- [ ] Reset runtime. **Not found.**
- [ ] Explain code. **Not found.**
- [x] Edit in Canvas. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (manual source `textarea`, line ~1864, with version history)
- [ ] Open in coding workspace. **Not found.**
- [x] Apply to repository. **CLI, VS Code** · `packages/tools/apply-patch/src/index.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`
- [ ] Dependency-installation status. **Not found.**
- [ ] Execution-permission explanation. **Partial:** a generic "This tool requires approval before execution." notice, no risk-specific reasoning · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Unsupported-runtime state. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` ("This free model cannot run code in the sandbox.")

Section tally: 16 of 30 checked; 5 partial; 9 not found.

## 22. Rich answers and structured result widgets

- [x] Citation chips. **Web, Desktop** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`
- [x] Source-preview cards. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (favicon/title/host/snippet card)
- [x] Search-result lists. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx`, `packages/ui/unified-chat/src/components/WebSearchCard.tsx`
- [ ] News cards. **Not found.**
- [ ] Image carousels. **Not found:** `ImageGenerationCard.tsx` renders a single image, no multi-image carousel.
- [x] Video result cards. **Web** · `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx`
- [ ] Audio players. **Not found.**
- [x] Interactive charts. **Web, Desktop** · `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx` (Recharts + `Tooltip`)
- [ ] Inspectable chart data. **Partial:** hover tooltips expose per-point values, no data table/export view · `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx`
- [x] Geographic maps. **Web** · `apps/web/features/chat/components/messages/cards/MapSearchCard.tsx`
- [x] Place and business cards. **Web** · `apps/web/features/chat/components/messages/cards/PlacesMapCard.tsx`, `packages/contracts/types/src/interactive-cards.ts` (`places.v1`)
- [ ] Weather cards. **Not found.**
- [ ] Sports schedules. **Not found.**
- [ ] Sports scores and standings. **Not found.**
- [ ] Market-price charts. **Not found.**
- [ ] Company and financial-summary cards. **Not found.**
- [x] Product comparison cards. **Web** · `apps/web/features/chat/components/cards/ComparisonCard.tsx`
- [ ] Price and availability displays. **Not found.**
- [x] Travel itinerary cards. **Web** · `packages/contracts/types/src/interactive-cards.ts` (`itinerary.v1`, `ItineraryCardBody`)
- [ ] Flight-status cards. **Not found.**
- [ ] Package-tracking cards. **Not found.**
- [ ] Reservation choices. **Not found.**
- [ ] Calendar availability grids. **Not found.**
- [ ] Contact cards. **Not found.**
- [ ] Email draft widgets. **Not found.**
- [ ] Message draft widgets. **Not found.**
- [ ] Task and issue cards. **Not found:** `mcp-app.v1` is a generic sandboxed-app host, not a task/issue-specific card · `apps/web/features/chat/components/messages/cards/McpAppCard.tsx`
- [x] Approval forms. **Web, Desktop** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx` (`awaiting_approval`, approve/reject)
- [x] Interactive questionnaires. **Web** · `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx`, `packages/contracts/types/src/interactive-cards.ts` (`clarify.v1`)
- [x] Decision/comparison tables. **Web** · `apps/web/features/chat/components/cards/ComparisonCard.tsx` (feature comparison table)
- [x] Mind maps. **Web** · `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` (`mindmap`), `apps/web/features/chat/lib/visual-intent.ts`
- [x] Flowcharts. **Web** · `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx`, `apps/web/features/chat/lib/visual-intent.ts` (`DIAGRAM_SIGNALS`)
- [x] Timelines. **Web** · `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` (`timeline`)
- [ ] Flashcards. **Not found.**
- [ ] Quizzes. **Partial:** a conversational "Practise it" Q&A study mode exists, no dedicated quiz UI (multiple-choice, scoring) · `apps/web/features/study/lib/study-session.ts`
- [ ] Interactive demonstrations. **Not found.**
- [x] Embedded third-party app panels. **Web** · `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` (`@modelcontextprotocol/ext-apps/app-bridge`)
- [x] Generated application previews. **Web, Desktop** · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`

Grok’s own design discussion explicitly treats prose, structured widgets, actionable objects, and system events as different content types within one conversation timeline.

Section tally: 17 of 38 checked; 2 partial; 19 not found.

# D. Files, Projects, Library, and artifacts

## 23. Project workspace

- [x] Project creation. **Web** · `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx`, `apps/web/app/api/projects/route.ts`
- [x] Project name and description. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [x] Project icon and color. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (appearance picker), `apps/web/db/neon/0053_projects_managed_cloud_contract.sql`
- [ ] Project cover or identity treatment. **Partial:** an icon + accent-colour badge exists, no cover/banner image · `apps/web/app/chat/projects/[id]/page.tsx`
- [x] Project overview. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (hero + `ProjectHeader`)
- [x] Project conversations. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (Chats tab)
- [x] Project files. **Web** · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- [x] Project sources. **Web** · `apps/web/features/projects/components/SourcesPanel.tsx`, `apps/web/features/projects/components/AddSourcesModal.tsx`
- [x] Project instructions. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [ ] Project notes. **Not found.**
- [x] Project Memory. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (uses-global-memory toggle), `apps/web/db/neon/0135_project_scoped_memory.sql`
- [x] Project artifacts. **Web** · `apps/web/features/projects/components/ProjectArtifactsPanel.tsx`
- [ ] Project coding sessions. **Not found.**
- [x] Project work tasks. **Web** · `apps/web/features/projects/components/ProjectWorkPanel.tsx`
- [x] Project routines. **Web** · `apps/web/app/chat/projects/[id]/page.tsx` (Scheduled tab renders `SchedulesPage` scoped to `projectId`)
- [ ] Default model/profile. **Partial:** `default_model_id` persists through the API, no settings UI sets it · `apps/web/app/api/projects/[id]/route.ts`
- [ ] Default tools and Skills. **Not found.**
- [ ] Local-folder association. **Partial:** Tauri `project_context_*` commands exist but are not in the Electron bridge, so they are unreachable from the shipped desktop · `apps/desktop/src/stores/projectStore.ts`, `apps/desktop/src/lib/tauri-mock.ts`
- [ ] Repository association. **Not found.**
- [x] Project search. **Web** · `packages/ui/unified-chat/src/components/ProjectGallery.tsx`
- [x] Project members. **Web** · `apps/web/features/settings/sections/OrganizationSharingSection.tsx`, `apps/web/db/neon/0086_org_shared_ecosystem.sql`
- [x] Member roles. **Web** · `apps/web/features/settings/sections/OrganizationSharingSection.tsx` (per-member view/edit/none grant plus org roles; the edit grant's policy is `apps/web/db/neon/0217_shared_project_editor_write.sql`)
- [ ] Invite and remove members. **Partial:** an existing org member can be granted or denied access to a shared project; no per-project email invite · `apps/web/features/settings/sections/OrganizationSharingSection.tsx`
- [ ] Shared Project links. **Partial:** copies the in-app project URL (works for someone already granted access), no public/anonymous link token like conversations/artifacts have · `apps/web/app/chat/projects/page.tsx`
- [ ] Project-level access requests. **Not found.**
- [ ] Move or copy conversations. **Partial:** "move to project" exists on a conversation's menu; no copy/duplicate of a conversation · `apps/web/features/chat/components/ConversationTitleMenu.tsx`
- [ ] Add an answer to Project knowledge. **Not found.**
- [ ] Import an existing Project. **Not found.**
- [x] Duplicate a Project. **Web** · `apps/web/app/api/projects/[id]/duplicate/route.ts`, `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [x] Archive and restore. **Web** · `apps/web/app/chat/projects/page.tsx` (`handleArchiveProjectServer`/`handleUnarchiveProjectServer`)
- [x] Export. **Web** · `apps/web/app/api/projects/[id]/export/route.ts`
- [x] Delete. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [x] Project-only context mode. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (uses-global-memory toggle unchecked)
- [x] Shared versus personal-context explanation. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (helper copy under the Memory toggle)
- [ ] Project activity history. **Not found.**
- [ ] Coordinating conversation for parallel work, where offered. **Not found.**
- [ ] Overview of child threads and blocked work. **Not found:** a `parentRunId`/delegation-depth relation exists for AGI Work runs but has no UI consumer · `apps/web/lib/services/cloud-agent-budget.ts`
- [ ] Thread-specific steering without changing unrelated work. **Not found.**

The source inventories describe both ordinary Project containers and coordinating Project conversations. These should remain separate capability variants rather than one generic “Projects” entry.

Section tally: 21 of 38 checked; 6 partial; 11 not found.

## 24. Library and file-management experience

- [x] All-files view. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`all` tab)
- [ ] Uploaded-files view. **Partial:** the "Documents" tab mixes uploaded and generated non-artifact files; nothing isolates uploads only · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [x] Generated-files view. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`generated` tab, `origin: 'generated'`)
- [x] Artifact view. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`artifacts` tab)
- [x] Image collection. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`images` tab)
- [x] Video collection. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`videos` tab)
- [ ] Audio collection. **Not found:** `LIBRARY_KINDS` has no audio kind · `packages/contracts/cloud-contracts/src/library.ts`
- [ ] Recent-files view. **Partial:** default sort is "Modified" (recency), no dedicated Recent view · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Favorites. **Not found.**
- [ ] Shared-with-me view. **Partial:** a project shared into your org shows a "Shared with you" badge on its own page; no unified library-level shared view · `apps/web/app/chat/projects/[id]/page.tsx`
- [ ] Folder hierarchy. **Partial:** projects act as single-level folders, no nested subfolders · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [x] Grid/list toggle. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`viewMode` grid/list)
- [x] Search. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (search input)
- [ ] File-type filters. **Not found:** only coarse kind tabs reach the API; the schema's `resource_type` filter (pdf/csv/spreadsheet/…) is unused by both the UI and the route · `apps/web/app/api/library/route.ts`
- [ ] Source-provider filters. **Not found.**
- [ ] Owner filters. **Not found.**
- [ ] Project filters. **Partial:** browsing is done by opening a project as its own folder view, not by filtering the main list · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Created/modified date filters. **Not found.**
- [ ] Sort by name, date, size, or type. **Partial:** sorts by modified/name/size; no sort by type · `packages/contracts/cloud-contracts/src/library.ts`
- [ ] Multi-selection. **Not found.**
- [ ] Batch download. **Not found.**
- [ ] Batch move. **Not found.**
- [ ] Batch delete. **Not found.**
- [ ] Rename. **Not found.**
- [ ] Duplicate. **Not found.**
- [ ] Move to folder. **Not found:** only a copy-like "add to project" exists · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [x] Add to Project. **Web** · `apps/web/features/library/components/LibraryView.tsx` (`addToProject` → `uploadProjectKnowledgeFile`)
- [x] Attach to conversation. **Web** · `apps/web/features/library/components/LibraryView.tsx` (`addToChat`/`addToWork`)
- [ ] Open originating conversation. **Not found.**
- [ ] Open external original. **Not found.**
- [ ] File-details panel. **Not found.**
- [ ] Version history. **Partial:** re-uploading a project knowledge file supersedes the prior row server-side, no UI browses or restores past versions · `apps/web/db/neon/0098_project_knowledge_versions.sql`
- [x] Storage-consumption display. **Web** · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` (used/limit storage meter)
- [x] Trash and restore. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`viewDeleted`, `restoreItem`)
- [ ] Expired-resource display. **Partial:** a shared conversation's link shows "Expired"/"Expires {date}"; no such state for library files · `apps/web/features/settings/sections/OrganizationSharingSection.tsx`
- [x] Processing-status display. **Web** · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` (indexing spinner + retry)
- [ ] Connected-file browsing. **Partial:** Google Drive/Slack entries in "Add sources" only redirect to Settings to connect; no in-app browser to pick files · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [ ] Refresh external metadata. **Not found.**
- [ ] Save external content as a copy. **Not found.**
- [ ] Distinguish external references from owned files. **Not found.**

Section tally: 12 of 40 checked; 9 partial; 19 not found.

## 25. File previews and readers

- [x] PDF reader. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx` (`<iframe>` with `#page=` deep link)
- [x] Text-file reader. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx` (`TextPreview`, plain mode)
- [x] Markdown reader. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx` (`MarkdownContent`)
- [x] Source-code reader. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx` (`EXT_LANG` fenced-code rendering)
- [x] Image viewer. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (zoom)
- [ ] Audio player. **Not found:** `FilePreviewModal` and the Library viewer only branch on image/PDF/text/video · `apps/web/features/projects/components/FilePreviewModal.tsx`
- [x] Video player. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`FileViewerOverlay`, `<video>` element)
- [ ] Spreadsheet preview. **Partial:** an AI-generated tabular artifact renders as a sortable grid; an uploaded .xlsx falls to the unsupported-file message · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`, `apps/web/features/projects/components/FilePreviewModal.tsx`
- [ ] Presentation preview. **Partial:** an AI-generated "presentation" artifact renders as navigable slides; an uploaded .pptx is not rendered · `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx`, `apps/web/features/projects/components/FilePreviewModal.tsx`
- [ ] Document preview. **Partial:** an AI-generated document/markdown artifact renders inline; an uploaded .docx falls to the unsupported-file message · `apps/web/features/projects/components/FilePreviewModal.tsx`
- [ ] Archive-content preview. **Not found:** zip/tar files get an icon only, no content listing · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Page thumbnails. **Not found.**
- [ ] Page navigation. **Partial:** a citation deep-links a PDF to a specific page via `#page=`, no in-viewer page-by-page control · `apps/web/features/projects/components/FilePreviewModal.tsx`
- [ ] Zoom controls. **Partial:** the Library's image/video viewer has zoom in/out (25%–400%); the PDF/text previews do not · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Fit-to-width. **Not found.**
- [ ] Fit-to-page. **Not found.**
- [ ] Rotate view. **Not found.**
- [ ] Search within file. **Not found.**
- [ ] Highlight search matches. **Not found.**
- [ ] Select text for a question. **Not found.**
- [ ] Ask about selected page or range. **Partial:** a citation opens the file at the cited page, and the Library viewer has an unscoped "Ask about this file" box; neither is a range-scoped question · `apps/web/features/projects/components/SourcesPanel.tsx`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Citation-linked highlighting. **Partial:** a citation opens the source at the cited page, it does not highlight matched text on the page · `apps/web/features/projects/components/SourcesPanel.tsx`
- [ ] Transcript panel for audio/video. **Not found.**
- [ ] Timestamp navigation. **Not found.**
- [ ] Full-screen mode. **Partial:** the Library file viewer is a fixed full-viewport overlay with no dedicated fullscreen toggle; `FilePreviewModal` is a capped modal · `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [x] Download original. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
- [ ] Download converted representation. **Partial:** artifacts export to PDF/Word via `exportNative`; raw library files only download as-is · `apps/web/features/library/components/LibraryView.tsx`
- [ ] Copy selected content. **Partial:** code/artifact content has a Copy button in the artifact panel; `FilePreviewModal`'s text preview has none · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [ ] Open in native application. **Not found.**
- [x] Unsupported-preview fallback. **Web** · `apps/web/features/projects/components/FilePreviewModal.tsx` ("Preview is not available for this file type" + mime type)
- [ ] Partial-extraction warning. **Not found:** a "[Content truncated during extraction.]" marker is appended to the text sent to the model, it is not shown to the user in any Sources/Library UI · `apps/web/lib/server/project-knowledge-extraction.ts`

Section tally: 8 of 31 checked; 10 partial; 13 not found.

## 26. Artifact container and panel

- [x] Artifact launch card inside chat. **Web** · `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx`
- [x] Artifact title. **Web** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [x] Artifact type. **Web** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` (`getTypeLabel`/`getTypeCategory`)
- [x] Artifact status. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`cloudSyncStatus`: Syncing/Synced/Sync retrying)
- [x] Open artifact. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`selectArtifact`, `setPanelOpen`)
- [x] Close artifact without deleting it. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`setPanelOpen(false)`, artifact stays in the store)
- [x] Reopen artifact. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`ArtifactsToggleButton`)
- [x] Docked side panel. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- [x] Resizable panel. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (drag handle + arrow-key resize)
- [x] Full-screen artifact. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`handleFullscreen`, native Fullscreen API + expanded layout)
- [ ] Detached artifact window where supported. **Not found:** Electron's window management has no artifact-specific window · `apps/desktop/electron/main.ts`
- [x] Multiple-artifact switching. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (artifact tab bar)
- [x] Artifact tabs. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`ArtifactTab`)
- [x] Source/preview toggle. **Web** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` (Preview/Code buttons)
- [x] Direct-edit mode. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (edit → save/discard)
- [x] Read-only mode. **Web** · `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx`
- [ ] Selection-based edit request. **Not found.**
- [ ] Inline comments. **Not found.**
- [ ] Pending edit-request collection. **Not found.**
- [x] Version selector. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (version stepper, `v{n}/{total}`)
- [x] Previous/next version. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Compare versions. **Not found:** versions are browsed one at a time, no diff view · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Restore version. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`restoreArtifactVersion`, confirm dialog)
- [x] Duplicate artifact. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`forkArtifact` / "Duplicate")
- [ ] Rename artifact. **Not found.**
- [ ] Save to Library. **Partial:** a generated artifact lands in the Library automatically on creation; no manual "save" action from the artifact panel itself · `apps/web/lib/server/generated-file-persist.ts`
- [x] Associate with Project. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` ("Save to project")
- [x] Continue from another chat. **Web** · `apps/web/features/library/components/LibraryView.tsx` (`addToChat`/`addToWork` stage a library item into a new chat)
- [x] Export menu. **Web** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` (download/publish dropdown)
- [x] Copy content. **Web** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` (`CodeView` copy button)
- [x] Share controls. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`publishArtifactService`, `changeAudience`)
- [x] Public/private state. **Web** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (`artifactAudience.current`), `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx`
- [ ] Connected-data status. **Not found.**
- [ ] Refresh connected data. **Not found:** the panel's "Refresh" only re-mounts the sandbox iframe, no external data source · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Runtime error panel. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (`artifact-render-error` state, offers source fallback)
- [ ] Dependency-loading state. **Not found.**
- [ ] Artifact-specific usage information. **Not found.**
- [ ] Open originating session. **Not found.**
- [x] Live updates from ongoing work. **Web** · `apps/web/features/chat/components/artifacts/StreamingArtifactView.tsx`
- [x] Mobile reader adaptation. **Web, Mobile** · `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` (mobile overlay layout), `apps/mobile/app/(app)/artifacts/index.tsx`

Claude’s current artifact documentation describes a side-by-side work surface, direct and conversational editing, templates, exports, and separate mobile limitations. Its artifact family also includes documents, decks, designs, dashboards, and small interactive tools.

Section tally: 28 of 40 checked; 1 partial; 11 not found.

## 27. Document and writing editor

- [x] Document title. **Web, Shared** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Structured rich-text editor. **Not found.**
- [x] Markdown editing mode. **Web, source is edited as raw markdown/text in a plain textarea and saved as a new version** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Heading controls. **Not found.**
- [ ] Paragraph formatting. **Not found.**
- [ ] Bold, italic, underline, and links. **Partial:** bold/italic/links render from markdown syntax in the read-only preview; no toolbar, underline has no markdown form · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts`
- [ ] Lists and checklists. **Partial:** GFM lists and task-list checkboxes render read-only in the preview; no insert control · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts`
- [ ] Tables. **Partial:** GFM tables render in the markdown preview; no table insert/edit UI · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts`
- [ ] Images. **Partial:** markdown image syntax renders via a custom image renderer; no image-insert control in the editor · `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`
- [ ] Callouts. **Not found.**
- [x] Code and equation blocks. **Web/Shared, fenced code and KaTeX math both render in the document preview** · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`
- [ ] Outline panel. **Not found.**
- [ ] Find and replace. **Not found.**
- [ ] Word count. **Not found:** a `wordCount` field is defined but has no reader/consumer · `apps/web/features/chat/types/message-metadata.ts`
- [ ] Selection toolbar. **Not found.**
- [ ] Rewrite selection. **Not found.**
- [ ] Shorten selection. **Not found.**
- [ ] Expand selection. **Not found.**
- [ ] Change tone. **Not found.**
- [ ] Adjust audience. **Not found.**
- [ ] Translate selection. **Not found.**
- [ ] Suggest edits. **Not found.**
- [ ] Accept/reject suggestions. **Not found.**
- [ ] Tracked changes. **Not found.**
- [ ] Comments and replies. **Not found.**
- [ ] Collaborative presence. **Not found.**
- [ ] Autosave indicator. **Not found.**
- [ ] Undo and redo. **Partial:** only the native textarea's browser undo/redo; document-level "undo" is really version restore · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Revision history. **Web, a version chip steps through the artifact's stored content history** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Page-layout view. **Not found.**
- [ ] Print view. **Not found.**
- [ ] Template selection. **Not found.**
- [ ] Brand/style application. **Not found.**
- [ ] Citation management. **Not found.**
- [x] Export to document formats. Web, exports the current document to `.docx` with headings/lists/bold/links preserved · `apps/web/features/chat/services/document-export-service.ts`
- [x] Export to PDF. **Web, jsPDF-based markdown-to-PDF export** · `apps/web/features/chat/services/document-export-service.ts`
- [x] Export to Markdown. **Web** · `apps/web/features/chat/services/document-export-service.ts`
- [ ] Save into a connected document service. **Partial:** generic read-write Notion/OneDrive/Dropbox MCP connectors exist for the agent; no explicit "save this document" action in the editor · `apps/web/lib/connectors/catalog.ts`
- [x] Email draft presentation. **Web/Desktop (shared), parses From/To/Cc/Bcc/Subject/Reply-To/Date and body into an email-style card** · `packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx`
- [ ] Recipient, subject, and attachment fields. **Partial:** recipient and subject headers are parsed and shown; no attachment field · `packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx`
- [ ] Send-email review step. **Not found:** the card offers only "Copy email as text", no send action · `packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx`

Section tally: 8 of 41 checked; 7 partial; 26 not found.

## 28. Code Canvas and application preview

- [x] Editable code source. **Web, panel-variant artifacts are editable in place and saved as a new version through the same store path Restore uses** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Multi-file project tree. **Desktop, a real file-explorer tree over a chosen local folder** · `apps/desktop/src/features/code/FileTree.tsx`
- [x] File creation and deletion. Desktop, via `dir_create`/`file_delete`/`dir_delete` IPC commands · `apps/desktop/src/features/code/FileTree.tsx`
- [x] File rename. Desktop, via `file_rename` · `apps/desktop/src/features/code/FileTree.tsx`
- [x] Language-aware editing. **Desktop, Monaco editor per open file with language-specific options** · `apps/desktop/src/features/code/CodeEditor.tsx`
- [x] Syntax diagnostics. **Desktop, TS/JS semantic and syntax validation enabled on the Monaco instance** · `apps/desktop/src/lib/monaco-config.ts`
- [x] Code completion where offered. Desktop, `quickSuggestions`/`tabCompletion`/`wordBasedSuggestions` enabled · `apps/desktop/src/features/code/CodeEditor.tsx`
- [ ] Search across generated files. **Not found.**
- [ ] Source/preview split view. **Partial:** code and preview are two mutually exclusive view modes toggled by a button, not a simultaneous split pane · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [x] HTML preview. **Web/Desktop (shared), sandboxed iframe preview with run/pause and error reporting** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [x] React or supported framework preview. **Web/Desktop (shared), compiles a single default-export component with Babel and renders it in a sandboxed iframe** · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx`
- [ ] Responsive preview sizes. **Not found.**
- [ ] Preview theme selection. **Not found.**
- [ ] Element-selection editing. **Not found.**
- [ ] Console panel. **Not found.**
- [x] Runtime-error overlay. Web/Desktop (shared), the sandbox reports render errors back over `postMessage` and both HTML and React previews surface them · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [ ] Dependency-installation panel. **Not found:** the React preview loads only React itself from a CDN, with no dependency manager.
- [x] Preview reload. **Web/Desktop (shared)** · `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
- [ ] Restart runtime. **Partial:** the same reload action re-mounts the sandbox iframe; there is no separate "restart runtime" concept · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx`
- [ ] Network-permission controls. **Not found:** the sandbox applies one fixed CSP, with no user-facing permission toggle · `packages/ui/unified-chat/src/lib/artifact-sandbox.ts`
- [ ] Secret/configuration placeholders. **Not found.**
- [ ] AI-backed app behavior through a brokered API. **Not found:** no bridge lets a generated app call the model; previews are static HTML/CDN-React only.
- [ ] App-local storage or database configuration. **Not found.**
- [x] Download source. **Web/Desktop (shared)** · `packages/ui/unified-chat/src/lib/artifact-download.ts`
- [ ] Export project archive. **Partial:** zips every artifact in a conversation into one archive, not a single multi-file project bundle · `apps/web/features/chat/utils/downloadArtifacts.ts`
- [ ] Open in coding workspace. **Partial:** "Open in VS Code" opens a local dev folder via a `vscode://` deep link; it is not a direct artifact-to-workspace handoff · `apps/web/features/code/local-code.ts`
- [ ] Publish preview. **Not found:** there is no separate preview stage before a publish goes live.
- [x] Publish production version. **Web, publishing an artifact mints a durable public URL** · `packages/platform/artifacts/src/artifacts.ts`, `apps/web/lib/services/published-artifact-service.ts`
- [ ] Version comparison. **Not found:** the version stepper navigates between full revisions with no diff view.
- [x] Rollback. **Web, "Restore" re-adds an older version as the new latest** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Fork/copy another shared creation. **Partial:** "Duplicate" forks the user's own stored artifact; there is no remix action on someone else's published page · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Viewer-specific authentication for connected apps. **Not found.**

Section tally: 14 of 32 checked; 5 partial; 13 not found.

## 29. Spreadsheet and data-analysis workspace

- [ ] Workbook title and metadata. **Partial:** only the artifact's title is shown; no author/sheet-count metadata · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Sheet tabs. **Not found.**
- [ ] Add, rename, duplicate, and delete sheets. **Not found.**
- [x] Grid selection. **Web/Desktop (shared), click and arrow-key cell selection with Home/End/Ctrl navigation** · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`
- [ ] Cell editing. **Not found:** the renderer is documented as always read-only · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`
- [ ] Formula bar. **Not found.**
- [ ] Formula explanations. **Not found.**
- [ ] Named ranges. **Not found.**
- [ ] Tables. **Partial:** renders one parsed table from CSV/tabular content; no named or multiple Table objects · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`
- [ ] Sort and filter. **Partial:** click-to-sort per column exists; no filter UI · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`
- [ ] Freeze rows and columns. **Partial:** the header row is always sticky by default; not user-toggleable and no column freeze · `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`
- [ ] Row and column resizing. **Not found.**
- [ ] Number, date, and currency formats. **Not found.**
- [ ] Conditional formatting. **Not found.**
- [ ] Data validation. **Not found.**
- [ ] Protected cells and ranges. **Not found.**
- [ ] Chart insertion. **Partial:** a separate, model-authored "chart" artifact type renders from a JSON spec; nothing inserts a chart into a spreadsheet from the UI · `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx`
- [ ] Chart-type selector. **Not found.**
- [ ] Chart data-range editor. **Not found.**
- [ ] Pivot or aggregate views where supported. **Not found.**
- [ ] Data-cleaning preview. **Not found.**
- [ ] Missing-value summary. **Not found.**
- [ ] Duplicate-row summary. **Not found.**
- [ ] Type-inference summary. **Not found.**
- [ ] Transformation history. **Not found.**
- [ ] SQL query panel. **Not found.**
- [ ] Python analysis panel. **Partial:** a general `execute_code` tool runs Python (and other languages) in an E2B sandbox and returns output in chat; no dedicated spreadsheet analysis panel · `apps/web/lib/e2b/execution-tools.ts`
- [ ] Query-result table. **Not found.**
- [ ] Data-source details. **Not found.**
- [ ] Refresh connected data. **Not found.**
- [ ] Proposed-change preview. **Not found.**
- [ ] Accept/reject range changes. **Not found.**
- [ ] Formula-error display. **Not found.**
- [ ] Export workbook. **Partial:** a server tool builds a real `.xlsx` (with an optional chart) from model-structured input via a chat tool call; the interactive viewer has no export action of its own · `apps/web/lib/services/managed-workbook-builder.ts`, `apps/web/lib/services/managed-office-file-service.ts`
- [x] Export CSV. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`, `apps/web/features/chat/utils/downloadArtifacts.ts`
- [ ] Export chart. **Not found.**
- [ ] Explain analytical assumptions. **Not found.**
- [ ] Generate a report from analysis. **Not found.**
- [ ] Generate slides from analysis. **Not found.**
- [ ] Reusable analysis template. **Not found.**

Section tally: 2 of 40 checked; 7 partial; 31 not found.

## 30. Presentation workspace

- [x] Presentation title. **Web/Desktop (shared)** · `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx`
- [ ] Slide thumbnail rail. **Partial:** a dot-based slide indicator exists; it has no thumbnail previews · `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx`
- [ ] Add slide. **Not found.**
- [ ] Duplicate slide. **Not found.**
- [ ] Delete slide. **Not found.**
- [ ] Reorder slides. **Not found.**
- [ ] Slide layout selection. **Not found.**
- [ ] Theme selection. **Not found.**
- [ ] Brand/design-system selection. **Not found.**
- [ ] Direct text editing. **Not found:** slides are a read-only markdown-derived viewer.
- [ ] Image placement. **Not found.**
- [ ] Chart placement. **Not found.**
- [ ] Table placement. **Not found.**
- [ ] Shape and diagram elements. **Not found.**
- [ ] Element alignment. **Not found.**
- [ ] Element grouping. **Not found.**
- [ ] Layer ordering. **Not found.**
- [ ] Slide notes. **Not found.**
- [ ] Presenter notes. **Not found.**
- [ ] Selection-based AI edits. **Not found.**
- [ ] Rewrite an individual slide. **Not found.**
- [ ] Regenerate one slide without replacing the deck. **Not found.**
- [ ] Whole-deck restructuring. **Not found.**
- [ ] Comments. **Not found.**
- [ ] Version history. **Partial:** the generic artifact version stepper applies to the whole deck, not per slide · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [x] Presentation mode. **Web/Desktop (shared), fullscreen toggle with arrow-key/Home/End navigation** · `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx`
- [ ] Speaker view where offered. **Not found.**
- [ ] Export to PPTX. **Partial:** a server tool builds a real `.pptx` (pptxgenjs) from model-structured slide input via a chat tool call; the deck viewer has no export action · `apps/web/lib/services/managed-office-file-service.ts`
- [ ] Export to PDF. **Not found:** no PDF export path exists for the presentation artifact.
- [ ] Export selected slides. **Not found.**
- [ ] Connected-document and spreadsheet references. **Not found.**
- [ ] Reusable presentation templates. **Not found.**
- [ ] Shareable presentation viewer. **Not found:** the publish schema's kind check explicitly excludes `presentation` from public serving · `apps/web/db/neon/0095_published_artifacts.sql`

Section tally: 2 of 33 checked; 3 partial; 28 not found.

## 31. PDF and document-transformation products

- [x] Text-document to PDF conversion. **Web, jsPDF-based markdown-to-PDF** · `apps/web/features/chat/services/document-export-service.ts`
- [ ] Spreadsheet to PDF conversion. **Not found.**
- [ ] Presentation to PDF conversion. **Not found.**
- [x] PDF summarization. **Web, an attached PDF's extracted text is hydrated into the chat context for the model to summarize** · `apps/web/lib/server/pdf-attachment-content.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- [x] PDF question answering. **Web, same attachment path** · `apps/web/lib/server/pdf-attachment-content.ts`
- [ ] Page-specific questions. **Partial:** text is kept per page (an array indexable by page number), but there is no page-jump/page-picker UI · `apps/web/lib/server/pdf-attachment-content.ts`
- [x] PDF text extraction. **Web, via pdf.js** · `apps/web/lib/server/pdf-attachment-content.ts`
- [ ] Scanned-document OCR. **Partial:** a page with no text layer is rendered to a PNG and handed to the model directly; there is no OCR pass producing a text/searchable layer · `apps/web/lib/server/pdf-attachment-content.ts`
- [ ] Table extraction. **Not found.**
- [ ] Document comparison. **Not found.**
- [ ] PDF annotation. **Not found.**
- [ ] Highlighting and comments. **Not found.**
- [ ] Native form-field filling where supported. **Not found.**
- [ ] Visual form completion as a separate capability. **Not found.**
- [ ] Page insertion/removal where offered. **Not found.**
- [ ] Page reordering. **Not found.**
- [ ] Merge and split. **Not found.**
- [ ] Compression. **Not found.**
- [ ] Redaction. **Not found.**
- [ ] Metadata editing. **Not found.**
- [ ] Searchable-PDF generation. **Not found.**
- [ ] Accessible/tagged-PDF generation where promised. **Not found.**
- [ ] Signature-service integration. **Not found.**
- [ ] Export fidelity preview. **Not found.**
- [ ] Original-versus-transformed comparison. **Not found.**

Section tally: 4 of 25 checked; 2 partial; 19 not found.

## 32. Design workspace

- [ ] Design brief. **Not found:** an LLM-driven `design_generate_css` command exists only in the retained internal Rust backend, not the public Electron desktop · `apps/desktop/src-tauri/src/sys/commands/design.rs`
- [ ] Artboard canvas. **Partial:** a freehand/shape drawing canvas exists (Desktop, local mode); it is a generic whiteboard, not UI-design artboards/frames · `apps/desktop/src/features/canvas/CanvasWorkspace.tsx`
- [ ] Multiple design alternatives. **Not found.**
- [ ] Page or frame list. **Not found.**
- [x] Element selection. Desktop, a select tool with a tracked `selectedId` · `apps/desktop/src/features/canvas/CanvasWorkspace.tsx`
- [ ] Direct text editing. **Partial:** a text tool adds/edits text elements on the drawing canvas · `apps/desktop/src/features/canvas/CanvasWorkspace.tsx`
- [ ] Position and size controls. **Not found:** elements are placed and drawn by mouse only, no numeric position/size panel.
- [ ] Alignment and distribution. **Not found.**
- [ ] Layers. **Not found.**
- [ ] Grouping. **Not found.**
- [x] Color controls. **Desktop, stroke/fill color presets and picker** · `apps/desktop/src/features/canvas/CanvasWorkspace.tsx`
- [ ] Typography controls. **Not found.**
- [ ] Spacing controls. **Not found.**
- [ ] Image replacement. **Not found.**
- [ ] Component replacement. **Not found.**
- [ ] Custom adjustment sliders. **Not found.**
- [ ] Inline design comments. **Not found.**
- [ ] Selection-based change requests. **Not found.**
- [ ] Desktop/tablet/mobile breakpoints. **Not found.**
- [ ] Light/dark previews. **Not found.**
- [ ] Design-system import. **Not found.**
- [ ] Brand asset library. **Not found.**
- [ ] Reusable component library. **Not found.**
- [ ] Design-token mapping. **Not found.**
- [ ] Design-system conformance feedback. **Not found.**
- [ ] Prototype navigation. **Not found.**
- [ ] Interactive-state previews. **Not found.**
- [ ] Design-to-code handoff. **Not found.**
- [ ] Code-to-design synchronization. **Not found.**
- [ ] Figma import/export integration. **Partial:** Figma is reachable only as a generic read-write MCP connector; no dedicated import/export UI in a design canvas · `apps/web/lib/connectors/catalog.ts`
- [ ] Export to HTML. **Not found.**
- [ ] Export to PDF. **Not found.**
- [x] Export to image or archive. Desktop, PNG export of the drawing canvas via `canvas.toDataURL` · `apps/desktop/src/features/canvas/CanvasWorkspace.tsx`
- [ ] Version comparison and restoration. **Not found:** undo/redo history exists but there is no saved-version compare/restore.

Section tally: 3 of 34 checked; 3 partial; 28 not found.

## 33. Generated Sites and published applications

- [x] Generated-site dashboard. **Web, a "Published artifacts" list with open/copy/unpublish per item** · `apps/web/features/settings/sections/PublishedArtifactsSection.tsx`
- [ ] Application name and description. **Partial:** a published page carries a title only, taken from the artifact; no separate description field · `apps/web/db/neon/0095_published_artifacts.sql`
- [ ] Template-based creation. **Not found.**
- [x] Prompt-based creation. **Web, any chat-generated html/react/svg/mermaid/markdown/code artifact can be published as a page by prompting the model** · `packages/platform/artifacts/src/artifact-derivation.ts`, `apps/web/lib/services/published-artifact-service.ts`
- [ ] Source-code workspace. **Not found:** no in-place multi-file editor for a published app (single-file artifacts only, see §28).
- [ ] Build status. **Not found:** there is no build step, static content is published as-is.
- [ ] Preview deployment. **Not found:** there is no separate preview stage before a publish goes live.
- [x] Production deployment. **Web, publishing mints a durable public URL row** · `apps/web/lib/services/published-artifact-service.ts`, `apps/web/db/neon/0095_published_artifacts.sql`
- [ ] Deployment history. **Not found:** republish is an UPSERT on the same row, no version history is kept · `apps/web/db/neon/0095_published_artifacts.sql`
- [x] Public URL. **Web, unguessable token-based public route** · `apps/web/app/shared-artifact/[token]/page.tsx`
- [ ] Named-viewer access. **Not found:** sharing is public or whole-organization, not a per-individual allowlist.
- [x] Workspace-only access. **Web, an "organization" visibility closes the anonymous public path** · `apps/web/lib/services/published-artifact-service.ts`, `apps/web/lib/services/org-shared-artifact-service.ts`
- [ ] Password or authentication options where offered. **Not found.**
- [ ] Custom domain setup. **Not found.**
- [ ] Domain verification. **Not found.**
- [ ] Environment-variable management. **Not found.**
- [ ] Connected-service configuration. **Not found.**
- [ ] Application database setup. **Not found.**
- [ ] Usage and hosting limits. **Partial:** a per-user cap on live published pages is enforced; no bandwidth/storage/traffic limit · `apps/web/lib/services/published-artifact-service.ts`
- [ ] Model-call allowance for generated apps. **Not found:** published artifacts are static, with no model-call bridge (see §28).
- [ ] Logs and error inspection. **Not found.**
- [ ] Preview-to-production promotion. **Not found.**
- [ ] Rollback. **Not found:** publishing carries no version at all.
- [x] Unpublish. **Web** · `apps/web/features/settings/sections/PublishedArtifactsSection.tsx`
- [ ] Duplicate/fork. **Not found:** no action forks or remixes someone else's published page.
- [ ] Download source. **Not found:** neither the published page nor its management list offers a download action.
- [ ] App analytics. **Not found:** views are explicitly not counted or audited · `apps/web/lib/services/published-artifact-service.ts`
- [x] Abuse reporting. **Web, a "Report copyright infringement or abuse" link on every published page opens a real report form** · `apps/web/app/copyright/report/ReportContentLink.tsx`
- [ ] Content moderation. **Not found:** reporting is reactive intake only, no moderation/review pipeline evidenced.
- [x] Deletion of app and associated data. **Web, unpublish deletes the row that holds the page's own content** · `apps/web/lib/services/published-artifact-service.ts`

Section tally: 8 of 30 checked; 2 partial; 20 not found.

---

# E. Search, Research, notebooks, Memory, and learning

## 34. Search experiences

- [x] Search inside the current conversation. **Web** · `apps/web/features/chat/components/messages/MessageSearch.tsx`
- [x] Search conversation history. **Web** · `apps/web/app/api/search/route.ts`, `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
- [x] Search Projects. **Web** · `apps/web/app/api/search/route.ts` (projectClauses/projectResults)
- [x] Search Library. **Web** · `apps/web/app/api/search/route.ts` (fileClauses, `library_file` kind), `packages/platform/data-layer/src/search/types.ts`
- [x] Search artifacts. **Web** · `packages/platform/data-layer/src/search/types.ts` (`SEARCH_SOURCE_KINDS` includes `artifact`), `apps/web/features/chat/services/global-search-service.ts`
- [ ] Search connected company sources. **Partial:** connected apps can be added as Deep Research sources; no unified cross-connector search panel · `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts`
- [x] Public web search. **Web, Server** · `apps/web/lib/web-search/web-search-tool.ts`, `apps/web/lib/web-search/search-provider.ts`
- [ ] Search within specified websites. **Not found:** (web_search tool takes only `query`; no site filter param).
- [ ] Search by source type. **Partial:** `/api/search` accepts a `kind` filter server-side; no source-type control in the search dialog UI · `apps/web/app/api/search/route.ts`
- [ ] Academic search. **Not found.**
- [ ] News search. **Not found.**
- [ ] Video search. **Not found.**
- [ ] Image search. **Not found.**
- [ ] Social/X search where the provider supports it. **Not found:** (single provider, Perplexity generic search, no social result type).
- [ ] Date-range filters. **Partial:** only for conversation/message history search, not web search · `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
- [ ] Language filters. **Not found.**
- [ ] Geography filters. **Not found.**
- [x] Include/exclude domains. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` ("Only this site" / "Never this site")
- [ ] User-selected source collections. **Partial:** a chat can be scoped to a Project (a saved source collection); no such picker inside search itself · `apps/web/features/projects/components/SourcesPanel.tsx`
- [x] Search suggestions. **Web, Server** · `apps/web/app/api/search/route.ts` (`type=suggestions`, `get_search_suggestions`)
- [x] Follow-up query refinement. **Web** · `apps/web/features/chat/components/FollowUpSuggestions.tsx`
- [x] Query clarification choices. **Web, Server** · `apps/web/lib/services/clarify-tool-service.ts`, `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx`
- [x] Result previews. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` (snippet + date in tooltip)
- [x] Source cards. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (`SourceRow`)
- [x] Citation hover/tap preview. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`
- [x] Source list expansion. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` ("Citations" / "More" sections)
- [x] Open original source. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (`SourceRow` anchor)
- [x] Add source to answer. **Web** · `packages/contracts/types/src/research.ts` (`addResearchSource`), `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [x] Remove source from answer. **Web** · `packages/contracts/types/src/research.ts` (`removeResearchSource`), `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [ ] Save source to Project or notebook. **Partial:** a whole research report (with its sources) can be saved to a Project/Library, not an individual source · `apps/web/features/chat/components/research/ResearchReportView.tsx`
- [ ] Search-result freshness information. **Partial:** freshness/delivery is classified server-side and told to the model, not shown to the reader as a UI badge · `packages/contracts/types/src/search-provider.ts`
- [x] Empty-results and unavailable-source states. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (`SourcesEmptyState`), `apps/web/lib/web-search/web-search-tool.ts` ("No results found")

Section tally: 18 of 32 checked; 6 partial; 8 not found.

## 35. Research workspace

- [x] Research-task creation. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`
- [x] Objective and deliverable selection. **Web** · `apps/web/features/chat/components/research/ResearchPlan.tsx` (depth/format/min-sources fieldset)
- [ ] Clarifying-question flow. **Partial:** a general clarifying-question tool exists in chat, but Deep Research explicitly skips offering it · `apps/web/lib/services/clarify-tool-service.ts` (`shouldOfferClarifyTool` returns false when `research` is true)
- [x] Editable research plan. **Web** · `apps/web/features/chat/components/research/ResearchPlan.tsx`
- [x] Source-selection panel. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [x] Website restrictions. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (domain include/exclude)
- [x] Uploaded source intake. **Web** · `packages/contracts/types/src/research.ts` (`FILES_RESEARCH_SOURCE`), `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [x] Connected source intake. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (connector source option), `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts`
- [x] Research-progress view. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [x] Search activity timeline. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (`PlanStepRow` list with per-step status)
- [x] Visited-source list. **Web** · `apps/web/features/chat/components/research/ResearchPanel.tsx` (cited/more source lists)
- [x] Evidence collection. **Web** · `packages/contracts/types/src/research.ts` (`Citation[]` on `ResearchReport`)
- [ ] Findings grouped by question. **Partial:** `keyFindings` is a flat list; steps/gaps track per-question status but findings are not grouped by question · `packages/contracts/types/src/research.ts`
- [ ] Contradictory-evidence display. **Not found.**
- [ ] Research steering. **Partial:** sources can be edited only while the plan awaits approval, not once the run is searching · `apps/web/features/chat/components/research/ResearchActivity.tsx` (`canDecide` gate)
- [ ] Add sources while running. **Partial:** sources are added before "Start research", not while a run is actively searching · `apps/web/features/chat/components/research/ResearchActivity.tsx`
- [x] Pause and resume. **Web, Server** · `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts`
- [x] Cancel research. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (`interrupted` phase, cancel plan decision)
- [x] Partial report. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (renders non-`completed` status with an "incomplete" notice)
- [x] Full report reader. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx`
- [x] Report outline. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (`extractMarkdownHeadings`, Contents nav)
- [x] Linked citations. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (`CitationRow`, `linkifyCitations`)
- [ ] Tables and charts. **Partial:** GFM markdown tables render in the report body; no dedicated chart rendering · `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts`
- [ ] Supporting attachments. **Not found.**
- [x] Research-history list. **Web** · `apps/web/features/chat/components/research/ResearchReportsGallery.tsx`
- [x] Refresh or rerun research. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (`onRetry`)
- [ ] Compare report revisions. **Not found.**
- [x] Export report. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (Markdown/PDF/Word export)
- [ ] Convert report to slides. **Not found:** (report-to-artifact hand-off is hardcoded to a markdown `document` artifact).
- [ ] Convert report to audio overview. **Not found.**
- [ ] Convert report to interactive page. **Partial:** report can become an editable `document` artifact, not an interactive page type · `apps/web/features/chat/components/research/ResearchPanel.tsx` (`createArtifact`)
- [ ] Schedule recurring research. **Not found:** scheduled runs explicitly exclude research · `apps/web/features/schedules/components/ScheduleForm.tsx` ("Web search, tools, research, files, and media generation are not available in this surface")
- [x] Notify on completion. **Server, Web, Mobile** · `apps/web/lib/services/agent-notification-service.ts` (`notifyResearchReportSettled`)
- [ ] Remaining research allowance. **Partial:** per-run cost/credits are shown; no "N reports remaining this period" allowance display · `apps/web/features/chat/components/research/ResearchActivity.tsx` (`formatCredits`)

Section tally: 21 of 34 checked; 7 partial; 6 not found.

## 36. Sources and grounding interface

- [x] Citation marker. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`
- [x] Source title. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`
- [x] Publisher or provider. **Web** · `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts`
- [x] Source URL or resource identifier. **Web** · `packages/contracts/types/src/research.ts` (`Citation.url`)
- [x] Publication date. **Web** · `packages/contracts/types/src/research.ts` (`Citation.publishedDate`)
- [x] Retrieval date. **Server** · `packages/contracts/types/src/research.ts` (`Citation.accessedAt`), `packages/contracts/types/src/search-provider.ts` (`retrievedAt`)
- [ ] Source-type icon. **Partial:** favicon-based per-source icon; no distinct icon per `PublicSourceType` (web/news/paper/pdf) · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx`
- [x] Quoted supporting excerpt. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` (snippet)
- [x] Page-number locator. **Web** · `packages/contracts/types/src/project-file-citations.ts` (`ProjectFileAnchor.page`), `packages/contracts/types/src/research.ts` (`pdf_document` locator)
- [ ] Line-range locator. **Not found.**
- [ ] Spreadsheet-cell locator. **Not found.**
- [ ] Slide locator. **Not found.**
- [ ] Audio/video timestamp locator. **Not found.**
- [x] Message/thread locator. **Web** · `apps/web/features/chat/components/messages/CitationPastChats.tsx` (links to `?highlightMessage=`)
- [ ] Highlighted passage in source viewer. **Partial:** viewer jumps to the cited page, does not highlight the passage text · `apps/web/features/projects/components/FilePreviewModal.tsx`
- [x] Claim-to-source relationship. **Web** · `apps/web/features/chat/lib/citation-links.ts` (`linkifyCitations`)
- [x] Multiple sources per claim. **Web** · `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` (`items` array, "+N" chip)
- [ ] Conflicting-source presentation. **Not found.**
- [x] Unavailable-source notice. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (`research-report-uncaptured-sources`)
- [ ] Restricted-source notice. **Partial:** `url_fetch` refuses blocked/disallowed hosts with a reason code, not a per-permission "restricted" notice · `apps/web/lib/url-fetch/url-fetch-tool.ts` (`url_not_allowed`)
- [ ] Stale-source notice. **Partial:** server classifies `SourceFreshnessClass` including `stale`, but it is not rendered to the reader · `packages/contracts/types/src/search-provider.ts`
- [ ] Source correction. **Not found.**
- [ ] Source replacement. **Not found.**
- [x] User-controlled evidence set. **Web** · `apps/web/features/chat/components/research/ResearchActivity.tsx` (add/exclude sources before a run)
- [x] Citation-preserving export. **Web** · `apps/web/features/chat/components/research/ResearchReportView.tsx` (`researchReportToMarkdown` keeps the numbered Sources list through Markdown/PDF/Word export)

Section tally: 14 of 25 checked; 4 partial; 7 not found.

## 37. Notebook and knowledge-workspace product

- [ ] Notebook index. **Partial:** Projects list serves the equivalent role; no separate "Notebook" surface · `apps/web/features/projects/stores/project-store.ts`
- [ ] Notebook creation. **Partial:** Project creation is the closest analog · `apps/web/app/api/projects/route.ts`
- [ ] Notebook title and description. **Partial:** Projects have name/description/instructions, not a "notebook" · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [ ] Source rail. **Partial:** Project's Sources panel is the equivalent, not a dedicated notebook rail · `apps/web/features/projects/components/SourcesPanel.tsx`
- [ ] Source checkboxes. **Not found:** (no per-source include/exclude toggle in Projects' source list).
- [x] Add files. **Web** · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [ ] Add website. **Not found:** (no URL-as-content-source intake in Projects).
- [ ] Add video transcript. **Not found.**
- [ ] Add audio. **Not found.**
- [ ] Add connected document. **Partial:** Add-sources modal routes Google Drive/Slack to Settings → Connectors rather than ingesting a document directly · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [x] Add written note. **Web** · `apps/web/features/projects/components/AddSourcesModal.tsx` (`onUploadText`, becomes a text-file source)
- [ ] Source guide or summary. **Not found.**
- [ ] Source search. **Not found:** (Projects' Sources panel has sort/type-filter, no text search).
- [x] Source-grounded chat. **Web** · `packages/contracts/types/src/project-file-citations.ts`, `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx`
- [x] Notebook instructions. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (project `instructions` field)
- [ ] Saved chat responses. **Not found.**
- [ ] Notebook notes. **Partial:** a written note becomes an ordinary text-file source, not an independently editable note object · `apps/web/features/projects/components/AddSourcesModal.tsx`
- [ ] Editable notes beside sources. **Not found.**
- [x] Citation-linked navigation. **Web** · `apps/web/features/projects/components/SourcesPanel.tsx` (`knowledgeFile`/`page` URL params open the cited file)
- [ ] Studio/output panel. **Not found.**
- [ ] Audio overview. **Not found.**
- [ ] Video overview. **Not found.**
- [ ] Briefing document. **Not found.**
- [ ] Study guide. **Not found.**
- [ ] Frequently asked questions. **Not found.**
- [ ] Timeline. **Not found.**
- [ ] Mind map. **Partial:** general chat can render a Mermaid mind-map diagram artifact on request; no one-click, source-grounded notebook output · `apps/web/features/chat/lib/visual-intent.ts`
- [ ] Data table. **Not found:** (as a dedicated notebook output; general chat/markdown tables are a different item, §35).
- [ ] Infographic. **Not found.**
- [ ] Slide deck. **Not found:** (as a notebook output).
- [ ] Quiz. **Not found:** (as a notebook output; see §38 for the separate Study feature).
- [ ] Flashcard set. **Not found.**
- [ ] Interactive learning overview. **Not found.**
- [x] Notebook sharing. **Web** · `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts`
- [ ] Notebook export. **Not found:** (no whole-project/source-bundle export; only individual research reports export, §35).
- [ ] Source refresh. **Partial:** a failed knowledge-file index can be retried/reindexed; no general re-fetch-from-origin · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` (`/reindex`)
- [ ] Notebook-to-main-chat context handoff. **Not found:** (Project chat is already the main chat; no separate notebook to hand off from).
- [ ] Cross-application notebook synchronization. **Not found.**
- [ ] Notebook-specific compute and generation allowance. **Not found.**

Google’s July announcement identifies Gemini Notebook as the renamed standalone NotebookLM product, with source organization shared across its ecosystem and cloud-compute-backed analysis. Its September learning announcement adds or previews further study and recording interactions; those rollout states should not be flattened into universal availability.

Section tally: 6 of 39 checked; 8 partial; 25 not found.

## 38. Learning and study products

- [x] Study-mode entry. **Web** · `apps/web/features/study/components/StudyPage.tsx`
- [ ] Learning-goal setup. **Partial:** choosing a topic + mode (learn/practice/review) stands in for goal-setting; no multi-step goal flow · `apps/web/features/study/components/StudyPage.tsx`
- [x] Subject selection. **Web** · `apps/web/features/study/components/StudyPage.tsx` (topic field)
- [x] Level or background selection. **Web** · `apps/web/features/study/lib/study-session.ts` (`STUDY_LEVELS`)
- [ ] Course-material intake. **Not found:** (no dedicated material-upload step in Study mode).
- [ ] Initial diagnostic quiz. **Not found.**
- [ ] Personalized study plan. **Not found:** (a system-prompt instruction, not a stored plan).
- [ ] Lesson sequence. **Partial:** "learn" mode instructs the model to teach one idea at a time; no explicit, visible lesson list · `apps/web/features/study/lib/study-session.ts`
- [x] Socratic question flow. **Web** · `apps/web/features/study/lib/study-session.ts` (`MODE_INSTRUCTIONS.learn`/`.practice`: check understanding with a question before moving on)
- [ ] Hint progression. **Not found.**
- [ ] Worked examples. **Not found:** (as a dedicated Study-mode behavior).
- [ ] Interactive explanations. **Partial:** study modes are a turn-by-turn Q&A chat loop, rendered as plain text · `apps/web/features/study/lib/study-session.ts`
- [ ] Visual demonstrations. **Not found:** (as a dedicated Study-mode behavior).
- [x] Practice questions. **Web** · `apps/web/features/study/lib/study-session.ts` (`practice` mode)
- [ ] Multiple-choice questions. **Not found:** (no structured question-type UI; free-text chat only).
- [ ] Multiple-select questions. **Not found.**
- [ ] Short-answer questions. **Not found:** (as a distinct structured type).
- [ ] Fill-in-the-blank questions. **Not found.**
- [x] Answer explanations. **Web** · `apps/web/features/study/lib/study-session.ts` ("say exactly where a wrong answer went wrong")
- [x] Per-question feedback. **Web** · `apps/web/features/study/lib/study-session.ts` (`practice` mode instruction)
- [ ] Quiz editing. **Not found.**
- [ ] Flashcard generation. **Not found.**
- [ ] Flashcard editing. **Not found.**
- [ ] Flip-card interaction. **Not found.**
- [ ] Known/practice classification. **Not found.**
- [ ] Shuffle. **Not found.**
- [ ] Progress dashboard. **Not found:** (`study_sessions` stores only topic/mode/level/start/end, no scoring).
- [ ] Weak-topic recommendations. **Partial:** "review" mode instructs the model to concentrate on what the user gets wrong; no computed weak-topic data · `apps/web/features/study/lib/study-session.ts`
- [ ] Spoken-explanation feedback. **Not found.**
- [ ] Language-learning exercises. **Not found.**
- [ ] Pronunciation practice. **Not found.**
- [ ] Narrated storybooks. **Not found.**
- [ ] Illustrated stories. **Not found.**
- [ ] Print and share study materials. **Partial:** a study session is an ordinary conversation and inherits general chat export/share, not study-specific formatting · `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`, `apps/web/features/chat/components/share/ShareConversationDialog.tsx`
- [ ] Source-based follow-up after completing a quiz. **Not found.**

Section tally: 7 of 35 checked; 5 partial; 23 not found.

## 39. Memory product

- [ ] Memory onboarding. **Not found.**
- [x] Memory enable/disable control. **Web** · `apps/web/features/settings/sections/MemorySection.tsx`
- [x] Separate past-chat-reference control. **Web** · `apps/web/features/settings/sections/MemorySection.tsx`
- [x] Saved-Memory list. **Web, Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Memory search. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [ ] Topic grouping. **Partial:** memories are classified into a `category` server-side, never grouped by it in any list UI · `apps/web/lib/services/managed-memory-context-service.ts`
- [ ] Profile summary. **Not found.**
- [ ] Preference summary. **Not found.**
- [ ] Ongoing-work summary. **Not found.**
- [x] Add Memory manually. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Explicit “remember this” action. **Server** · `apps/web/lib/services/memory-commands.ts`
- [x] Automatic Memory update. **Server** · `apps/web/lib/services/managed-auto-memory-service.ts`
- [x] Edit Memory. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Delete individual Memory. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Delete all Memory. **Web, Shared** · `apps/web/features/settings/sections/MemorySection.tsx`, `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Prioritize Memory. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx` (pin/unpin)
- [x] Memory source/provenance. **Server** · `apps/web/lib/services/managed-memory-context-service.ts`, `apps/web/lib/services/__tests__/memory-provenance.test.ts`
- [x] Last-updated information. **Shared** · `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
- [x] Correction of stale information. **Server** · `apps/web/lib/services/managed-memory-context-service.ts` (`expiresAt`, `sweepExpiredMemories`)
- [x] Conflicting-Memory resolution. **Server** · `apps/web/lib/services/managed-memory-context-service.ts` (`writeConsolidatedMemory` supersession)
- [x] Memory import. **Web** · `apps/web/features/settings/components/ImportMemoryDialog.tsx`, `apps/web/app/api/memory/import/route.ts`
- [x] Memory export. **Web, Server** · `apps/web/app/api/user/export/route.ts`
- [ ] Memory-capacity display where relevant. **Not found.**
- [x] Project-scoped Memory. **Web, Shared** · `apps/web/features/settings/sections/MemorySection.tsx`, `packages/ui/unified-chat/src/stores/memoryStore.ts`
- [ ] Agent-specific Memory. **Partial:** autonomous runs tag a memory with an `agentId` for provenance only, no per-agent read scoping · `apps/web/lib/services/managed-memory-context-service.ts`
- [x] Organization knowledge distinct from personal Memory. **Web** · `apps/web/features/settings/sections/MemorySection.tsx` (Workspace vs Account scope)
- [ ] Memory-used indication. **Not found.**
- [x] Temporary-chat exclusions. **Web, Server** · `apps/web/lib/temporary-chat-policy.ts`, `apps/web/lib/services/managed-memory-context-service.ts`
- [x] Sensitive-Memory controls. **Web, Server** · `apps/web/features/settings/components/MemoryExclusions.tsx`, `apps/web/lib/services/managed-memory-context-service.ts` (`prohibitedMemoryCategory`)
- [x] Memory reset independent from chat deletion. **Web** · `apps/web/features/settings/sections/MemorySection.tsx` (Clear all memories, separate from Privacy's delete-all-chats)
- [x] Cross-model personalization. **Server** · `apps/web/lib/server/user-identity.ts` (personalization/instructions assembled once, independent of selected model)
- [x] Cross-surface Memory continuity. **Web, Desktop, Mobile** · `packages/ui/unified-chat/src/stores/memoryStore.ts`, `apps/desktop/src/stores/memoryStore.ts`

Section tally: 24 of 32 checked; 2 partial; 6 not found.

## 40. Instructions, preferences, and personal style

- [x] Preferred name or form of address. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [ ] Background information. **Partial:** only the general-purpose "Instructions for AGI" free-text box, no dedicated about-you field · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Role or profession. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` ("What best describes your work?")
- [ ] Goals and interests. **Not found.**
- [x] Desired response style. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Response-length preference. **Web** · `apps/web/features/chat/components/Composer/StyleSelector.tsx` (`RESPONSE_LENGTH_OPTIONS`, separate from style)
- [ ] Formality preference. **Partial:** only via the bundled "Formal" response-style option, no independent control · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Tone presets. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (`RESPONSE_STYLES`)
- [x] Warmth preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Enthusiasm preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Heading/list preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (headers/lists trait + preferred formatting)
- [x] Emoji preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Technical-depth preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Language preference. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (response language, distinct from display language)
- [ ] Units and formatting preferences. **Partial:** formatting (prose/bullets/tables) covered, no units/measurement preference · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Persistent custom instructions. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` ("Instructions for AGI" + enable toggle)
- [x] Project instructions. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- [ ] Agent instructions. **Partial:** an `agent_instruction` context layer exists for autonomous AGI Work runs, no user-facing named-agent instruction editor · `packages/contracts/context/src/instruction-precedence.ts`
- [ ] Conversation overrides. **Not found.**
- [ ] Writing-style examples. **Not found:** the composer's writing-style control is a fixed formal/casual/concise/detailed preset, not learned from user-supplied samples · `packages/ui/unified-chat/src/lib/writingStyle.ts`
- [ ] Connected-writing-source setup. **Not found.**
- [ ] Learned writing-style summary. **Not found.**
- [ ] Style reset. **Not found.**
- [x] Explanatory output style. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (`RESPONSE_STYLES` "explanatory")
- [ ] Learning-oriented output style. **Not found.**
- [x] Concise output style. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (`RESPONSE_STYLES` "concise")
- [ ] Custom output-style creation. **Not found.**
- [x] Effective-instruction explanation where useful. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (hint text explaining what the instructions field does, and what happens when switched off)
- [ ] Import preferences from another assistant. **Not found:** only Memory facts are importable, not tone/style preferences · `apps/web/features/settings/components/ImportMemoryDialog.tsx`
- [ ] Selective sharing of preferences with a Project. **Not found.**

Section tally: 16 of 30 checked; 4 partial; 10 not found.

## 41. Temporary and private experiences

- [x] Temporary-chat entry. **Web, Mobile** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx`
- [x] Visible temporary-mode banner. **Mobile, Web** · `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] History-persistence explanation. **Web, Shared** · `apps/web/lib/temporary-chat-policy.ts`
- [ ] Memory-read choice where offered. **Not found:** memory is skipped entirely (read and write) in a temporary chat, no separate read choice is offered · `apps/web/lib/services/managed-memory-context-service.ts`
- [x] Memory-write exclusion. **Server** · `apps/web/lib/services/managed-memory-context-service.ts` (`memoryContentRefusal` on `temporaryChat`)
- [ ] Custom-instruction choice. **Not found.**
- [x] Plugin availability in temporary mode. **Web, Shared** · `apps/web/lib/temporary-chat-policy.ts` (connectors remain usable but re-confirm every call)
- [x] File-retention explanation. **Web, Shared** · `apps/web/lib/temporary-chat-policy.ts`
- [ ] Generated-output saving choice. **Not found.**
- [ ] Save temporary conversation explicitly. **Not found:** ending a temporary chat is explicitly stated as irrecoverable · `apps/web/lib/temporary-chat-policy.ts`
- [ ] Temporary-to-normal conversion review. **Not found.**
- [ ] Incognito search. **Not found.**
- [ ] Private browser session. **Not found:** the Chrome extension explicitly disallows incognito · `apps/extension/manifest.json`
- [x] Local-only conversation. **Desktop, CLI** · `apps/desktop/src/features/settings/tabs/Privacy/index.tsx`, `apps/web/features/settings/sections/PrivacySection.tsx` (CLI Local Mode disclosure)
- [ ] Local-only file collection. **Partial:** local encrypted credential/database storage is confirmed on Desktop, no explicit local-only Library/file-collection statement · `apps/desktop/src/features/settings/tabs/Privacy/index.tsx`
- [x] Local-only Memory. **Desktop, Mobile, Shared** · `packages/ui/unified-chat/src/stores/memoryStore.ts`, `apps/mobile/src/features/memory/components/MemoryControlsCard.tsx`
- [x] Clear local data. **Desktop** · `apps/desktop/src/features/settings/tabs/Privacy/index.tsx` ("Clear All Data")
- [ ] Separate history, training, and retention controls. **Partial:** history controls (temporary/archive/delete) and a workspace retention window exist; no training-data control because the product states no training pipeline exists · `apps/web/features/settings/sections/PrivacySection.tsx`, `apps/web/lib/services/managed-memory-context-service.ts`
- [x] Privacy-setting education. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` ("How we protect/use your data")
- [x] Per-feature processing-location disclosure. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` (Local Mode / BYOK / Hosted Web / Desktop / Managed Cloud disclosure)

Section tally: 11 of 20 checked; 2 partial; 7 not found.

## 42. Proactive assistance, briefings, and reflection

- [ ] Daily briefing setup. **Partial:** a generic "Daily briefing" preset for the scheduled-tasks feature, not a dedicated briefing product · `apps/web/features/schedules/lib/schedule-templates.ts`
- [ ] Briefing topics. **Not found.**
- [ ] Selected connected sources. **Not found:** schedules take a free-text prompt, no per-schedule source picker · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Delivery time and timezone. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Briefing home. **Not found.**
- [ ] Briefing cards. **Not found:** run results render as a plain expandable text block, not cards · `apps/web/features/schedules/components/ScheduleRunHistory.tsx`
- [ ] Calendar overview. **Not found.**
- [ ] Email or work summary. **Partial:** achievable via a Gmail/Outlook connector plus the "Inbox triage" schedule template, no dedicated summary surface · `apps/web/features/schedules/lib/schedule-templates.ts`
- [x] Suggested next actions. **Web** · `apps/web/features/settings/sections/ReflectSection.tsx` (insight `nextStep`)
- [ ] Follow-up questions on a briefing item. **Not found.**
- [ ] Listen-to-briefing mode. **Not found.**
- [ ] Mark helpful/not helpful. **Not found.**
- [ ] Dismiss topic. **Not found.**
- [ ] Add topic. **Not found.**
- [x] Pause briefings. **Web** · `apps/web/features/schedules/components/ScheduleCard.tsx` (Pause/Resume any schedule, including a daily briefing)
- [x] Quiet hours. **Web, Mobile** · `apps/web/features/settings/sections/TimeFocusSection.tsx`
- [x] Work-completion notifications. **Mobile** · `apps/mobile/src/features/settings/notifications/categories.ts` ("Work Updates: Task results, schedule runs, and chat replies")
- [ ] Important-change alerts. **Partial:** the "Monitor a topic" schedule template plus errors/status notification categories, no dedicated change-alert type · `apps/web/features/schedules/lib/schedule-templates.ts`, `apps/mobile/src/features/settings/notifications/categories.ts`
- [x] Personal usage reflection. **Web** · `apps/web/features/settings/sections/ReflectSection.tsx`
- [x] Periodic recap. **Web, Server** · `apps/web/features/settings/sections/ReflectSection.tsx`, `apps/web/lib/services/reflect-service.ts`
- [ ] Annual recap. **Partial:** an on-demand "Past year" (365-day) range on the same Reflect page, not a delivered/celebratory annual recap · `apps/web/lib/services/reflect-service.ts`
- [x] Break reminders. **Web** · `apps/web/features/settings/sections/TimeFocusSection.tsx`
- [x] Time-and-focus settings. **Web** · `apps/web/features/settings/sections/TimeFocusSection.tsx`
- [ ] Clear end-of-digest state. **Not found.**
- [ ] Proactive-feature history and saved editions. **Partial:** schedule run history is kept (including for a daily briefing), no "saved editions" concept · `apps/web/features/schedules/components/ScheduleRunHistory.tsx`

Section tally: 9 of 25 checked; 5 partial; 11 not found.

# F. Multimodal understanding, generation, and voice

## 43. Image and visual understanding

- [x] Single-image questions. **Web, Desktop** · `apps/web/features/chat/lib/persisted-attachments.ts`, `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- [x] Multiple-image comparison. **Web** · `apps/web/features/chat/lib/persisted-attachments.ts` (attachments array, each sent as its own `image_url` part)
- [x] Screenshot interpretation. **Web, Desktop** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` ("Take a screenshot"), `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- [x] Document-image interpretation. **Server** · `apps/web/lib/server/scanned-document-text.ts` (vision-model OCR transcription of scanned pages)
- [x] Chart interpretation. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` (generic vision QA over an attached image)
- [x] Diagram interpretation. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- [x] Handwriting recognition. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` (same generic vision pipeline)
- [x] Visual text extraction. **Server** · `apps/web/lib/server/scanned-document-text.ts`
- [ ] Image-region selection. **Not found.**
- [ ] Crop-and-zoom inspection. **Partial:** full-screen viewer zooms/pans, no crop tool · `apps/web/features/chat/components/ImageLightbox.tsx`
- [ ] Annotated visual answers. **Not found.**
- [x] Object counting. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` (generic vision QA)
- [x] Scene comparison. **Web** · `apps/web/features/chat/lib/persisted-attachments.ts` (multi-image attach + QA)
- [x] Visual troubleshooting. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- [ ] Image-to-structured-data extraction. **Partial:** OCR yields plain transcribed text only, no schema/JSON extraction workflow · `apps/web/lib/server/scanned-document-text.ts`
- [ ] Image-to-table workflow. **Not found.**
- [x] Reference-image selection for another task. **Web** · `apps/web/features/library/lib/library-chat-handoff.ts` (`stageLibraryItemForImageRemix`)
- [ ] High-resolution versus reduced-resolution handling. **Partial:** request schema accepts an image `detail` (auto/low/high) field but no UI sets it · `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- [ ] Image input-quality warning. **Not found.**
- [ ] Visual uncertainty presentation. **Partial:** scanned-document OCR text is prefixed with a "may contain mistakes" note; general chat vision answers carry no such flag · `apps/web/lib/server/scanned-document-text.ts`

Section tally: 12 of 20 checked; 4 partial; 4 not found.

## 44. Image-generation studio

- [x] Text-to-image composer. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (image mode), `apps/web/app/api/media/image/generate/route.ts`
- [x] Image-model picker. **Web** · `apps/web/features/chat/lib/imageGenerationOptions.ts` (`IMAGE_MODELS`)
- [ ] Style presets. **Not found.**
- [ ] Reference-image slots. **Partial:** one `source_image` plus one `mask_image` only, no multi-image reference slots · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [ ] Prompt suggestions. **Not found.**
- [ ] Prompt enhancement with user control. **Not found.**
- [x] Aspect-ratio selector. **Web** · `apps/web/features/chat/lib/imageGenerationOptions.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [ ] Size/resolution selector. **Partial:** `size` field exists server-side, composer only exposes aspect ratio · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [ ] Quality selector. **Partial:** `quality` (standard/hd) accepted by the schema, no UI control · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [ ] Output-count selector. **Partial:** `n` (1-4) accepted by the schema, no UI control · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [x] Background transparency option. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`imageTransparentBackground` toggle)
- [ ] Supported seed control. **Not found.**
- [ ] Supported negative-prompt control. **Partial:** route/schema accept `negative_prompt`, no composer control sets it · `apps/web/app/api/media/image/generate/route.ts`
- [ ] Generation-cost indication. **Not found.**
- [ ] Remaining-generation allowance. **Partial:** shown reactively as an upgrade/reset-time banner only after quota is exhausted · `apps/web/features/chat/lib/mediaPaywallRecovery.ts`
- [ ] Generation queue. **Partial:** concurrent jobs are tracked and rendered inline per message, no dedicated queue view · `apps/web/shared/stores/media-store.ts`
- [ ] In-progress previews where supported. **Not found:** static shimmer placeholder only, no partial-image preview · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Cancel generation. **Partial:** `/api/media/image/cancel` route exists, no UI ever calls it · `apps/web/app/api/media/image/cancel/route.ts`
- [x] Retry generation. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` ("Try again")
- [x] Variation generation. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (Variation button)
- [x] Image grid. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (`LibraryGrid`)
- [x] Full-screen image viewer. **Web** · `apps/web/features/chat/components/ImageLightbox.tsx`
- [x] Prompt and settings inspection. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (EditPanel shows model/aspect/prompt)
- [x] Reuse prompt. **Web** · `apps/web/features/library/lib/library-chat-handoff.ts`
- [ ] Reuse settings. **Partial:** remix restores prompt and image mode, not aspect ratio or model · `apps/web/features/library/lib/library-chat-handoff.ts`
- [ ] Favorite image. **Not found.**
- [x] Save to Library. **Web** · `apps/web/app/api/media/route.ts` (generated images persist automatically and are listed/managed there)
- [x] Add to Project. **Web** · `apps/web/features/library/components/LibraryView.tsx` (`addToProject`)
- [x] Download full-quality image. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (`downloadImage`)
- [ ] Copy image. **Partial:** copies the image URL to the clipboard, not the image bytes · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [x] Share image. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (`ShareModal`)
- [ ] Share prompt. **Not found.**
- [x] Edit image. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (`EditPanel`)
- [ ] Animate image into video. **Not found.**
- [x] Report generated output. **Web** · `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx`, wired per-message in `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [x] Content/provenance labeling. **Server** · `apps/web/lib/compliance/ai-act.ts` (`aiGeneratedHeaders`), `apps/web/app/api/media/image/generate/route.ts`

Section tally: 17 of 36 checked; 10 partial; 9 not found.

## 45. Image editor

- [x] Upload an existing image. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`imageSourceFile` = first attachment in image mode)
- [x] Open a previously generated image. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` (`EditPanel`), `apps/web/features/library/lib/library-chat-handoff.ts`
- [x] Conversational edit instruction. **Web** · `apps/web/features/chat/components/ImageGenerationCard.tsx` ("Describe a change to this image")
- [ ] Click-to-comment editing. **Not found.**
- [ ] Region-selection tool. **Not found.**
- [ ] Brush selection. **Not found.**
- [ ] Eraser. **Not found.**
- [ ] Brush-size control. **Not found.**
- [ ] Selection overlay. **Not found.**
- [ ] Clear selection. **Partial:** "Remove mask" clears an uploaded mask file, not a drawn selection · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Invert selection where offered. **Not found.**
- [ ] Object addition. **Partial:** only via free-text edit description, no dedicated tool · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Object removal. **Partial:** only via free-text edit description · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Background replacement. **Partial:** only via free-text edit description · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Background removal. **Partial:** only via free-text edit description, no one-click action · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Outpainting. **Partial:** `outpaint` operation defined end-to-end server-side, no UI ever sends it · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [ ] Crop. **Not found.**
- [ ] Resize. **Not found.**
- [ ] Reframe. **Not found.**
- [ ] Lighting adjustment. **Partial:** only via free-text edit description · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Color/style transformation. **Partial:** only via free-text edit description · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Reference-based composition. **Not found.**
- [ ] Multi-image combination. **Not found.**
- [ ] Pose/reference guidance. **Not found.**
- [x] Text-bearing image generation. **Web** · `apps/web/features/chat/lib/imageGenerationOptions.ts` (unrestricted prompt to a text-capable image model)
- [ ] Photo restoration. **Not found.**
- [ ] Colorization. **Not found.**
- [ ] Before/after comparison. **Not found.**
- [ ] Version history. **Not found:** regeneration overwrites the same transcript message in place · `apps/web/features/chat/pages/WebChatPage.tsx` (`handleRegenerateImageInPlace`)
- [ ] Undo and redo. **Not found.**
- [ ] Preserve-original action. **Not found:** the prior image is overwritten, not kept alongside the edit · `apps/web/features/chat/pages/WebChatPage.tsx`
- [ ] Export format. **Partial:** download keeps the provider's returned format, no user-selectable export format · `apps/web/features/chat/components/ImageGenerationCard.tsx` (`imageDownloadFilename`)
- [x] Alpha-channel preservation. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (transparent-background toggle yields PNG output with alpha)
- [ ] Brand-reference reuse. **Not found.**
- [ ] Avatar-reference reuse. **Not found.**
- [ ] Sticker-pack creation. **Not found.**
- [ ] Messaging-app sticker export. **Not found.**

Section tally: 5 of 37 checked; 9 partial; 23 not found.

## 46. Video-generation studio

- [x] Text-to-video composer. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (video mode), `apps/web/app/api/media/video/generate/route.ts`
- [ ] Image-to-video input. **Not found:** no source-image field on the video-generation request · `packages/contracts/cloud-contracts/src/managed-media.ts`
- [ ] Video-to-video input. **Not found.**
- [ ] Multiple reference slots. **Not found.**
- [x] Video-model picker. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`availableVideoModels`, `showVideoModelMenu`)
- [ ] Duration selector. **Partial:** duration is implied by the chosen resolution/quality tuple, no independent control · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Aspect-ratio selector. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`getVideoAspectOptionsForModel`)
- [x] Resolution selector. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (`getVideoQualityOptionsForModel`)
- [ ] Supported frame-rate selector. **Not found.**
- [ ] Camera-motion instructions. **Not found:** no dedicated control, only free prompt text.
- [x] Scene/action instructions. **Web** · `apps/web/app/api/media/video/generate/route.ts` (free-text `prompt` field)
- [ ] Dialogue instructions. **Not found.**
- [ ] Generated-audio option. **Partial:** `generate_audio` is wired end-to-end server-side, no UI control sets it · `apps/web/app/api/media/video/generate/route.ts`
- [ ] Reference-audio option where supported. **Not found.**
- [ ] Style presets. **Not found.**
- [ ] Template gallery. **Not found.**
- [ ] Character/reference selection. **Not found.**
- [ ] Storyboard creation. **Not found.**
- [ ] Shot cards. **Not found.**
- [ ] Shot ordering. **Not found.**
- [ ] Shot duplication. **Not found.**
- [ ] Shot deletion. **Not found.**
- [ ] Per-shot duration. **Not found.**
- [ ] Per-shot references. **Not found.**
- [ ] Generation queue. **Partial:** concurrent jobs tracked and rendered inline per message, no dedicated queue view · `apps/web/shared/stores/media-store.ts`
- [x] Progress display. **Web** · `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx` (elapsed time + provider progress %)
- [ ] Estimated or actual credit use. **Not found.**
- [x] Cancel request. **Web** · `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx` ("Stop generating" → `/api/media/video/cancel`)
- [x] Retry failed job. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (`onRetryVideo`)
- [x] Completed clip gallery. **Web** · `packages/ui/unified-chat/src/components/library/LibraryView.tsx` (videos tab)
- [x] Playback controls. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (native `<video controls>`)
- [x] Download. **Web** · `apps/web/features/chat/components/messages/MessageBubble.tsx` (download link)
- [ ] Share. **Partial:** `ShareModal` supports a video `mediaKind` but is never invoked for a generated video message · `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [x] Save to Project. **Web** · `apps/web/features/library/components/LibraryView.tsx` (`addToProject`, applies to any media kind)
- [ ] Remix. **Not found.**
- [ ] Extend. **Not found.**
- [ ] Regenerate a selected segment where supported. **Not found.**

Section tally: 12 of 37 checked; 4 partial; 21 not found.

## 47. Video editing and media continuity

- [ ] Clip trimming. **Not found.**
- [ ] Scene extension. **Not found.**
- [ ] Conversational revision. **Not found:** no revise/edit panel exists for a generated video (contrast with the image `EditPanel`).
- [ ] Style transfer. **Not found.**
- [ ] Object or background changes where supported. **Not found.**
- [ ] Reference-consistent characters. **Not found.**
- [ ] Shot-to-shot continuity. **Not found.**
- [ ] First-frame/last-frame guidance where supported. **Not found.**
- [ ] Clip concatenation. **Not found.**
- [ ] Audio replacement. **Not found.**
- [ ] Generated sound effects. **Not found.**
- [ ] Dialogue regeneration. **Not found.**
- [ ] Caption generation. **Not found.**
- [ ] Caption editing. **Not found.**
- [ ] Thumbnail selection. **Not found:** a `thumbnail_url` is provider-supplied, not user-chosen · `apps/web/app/api/media/video/status/route.ts`
- [ ] Cover image. **Not found.**
- [ ] Before/after comparison. **Not found.**
- [ ] Parent-clip lineage. **Not found.**
- [ ] Version history. **Not found.**
- [ ] Export/transcode options. **Not found.**
- [ ] Reusable avatar or cameo management. **Not found.**
- [ ] Likeness consent controls. **Not found:** moderation blocks likeness misuse but captures no consent flow · `apps/web/lib/moderation/text-classifier.ts`
- [ ] Likeness reuse permissions. **Not found.**
- [ ] Likeness revocation. **Not found.**
- [ ] Public versus private media collection. **Not found:** media is private/workspace-scoped only, no public option · `apps/web/app/api/media/route.ts`
- [ ] Remix-permission settings. **Not found.**
- [ ] Generated-media discovery feed where offered. **Not found.**

Section tally: 0 of 27 checked; 0 partial; 27 not found.

## 48. Voice conversation interface

- [x] Voice entry from an existing chat. **Web** · `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Start a new voice conversation. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (empty-chat variant), `apps/web/features/chat/stores/voice-session-store.ts`
- [x] Integrated voice-and-text layout. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (ChatMessageList stays mounted beside VoiceModeSurface)
- [x] Separate full-screen voice layout. **Web** · `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` (focus-mode fixed overlay)
- [x] Listening indicator. **Web** · `packages/ui/unified-chat/src/voice/voice-session-machine.ts`, `apps/web/features/chat/components/Voice/VoiceOrb.tsx`
- [x] Speaking indicator. **Web, Desktop** · `packages/ui/unified-chat/src/voice/voice-session-machine.ts`, `apps/desktop/src/features/voice/SpokenReplies.tsx`
- [x] Thinking/working indicator. **Web** · `packages/ui/unified-chat/src/voice/voice-session-machine.ts` (`ORB_STATE.thinking`)
- [ ] Waveform or amplitude visualization. **Partial:** real amplitude bars exist for composer dictation; the live Voice-mode orb is a scripted breathing animation, not amplitude-driven · `apps/web/features/chat/components/Composer/DictationStrip.tsx`, `packages/ui/unified-chat/src/components/VoiceOrb.tsx`
- [x] Microphone mute. **Web** · `apps/web/features/chat/components/Voice/VoiceComposer.tsx`
- [x] End conversation. **Web** · `apps/web/features/chat/components/Voice/VoiceComposer.tsx`
- [ ] Pause/resume. **Partial:** mute acts as an input pause; no separate pause/resume of the running call · `apps/web/features/chat/hooks/use-voice-session.ts`
- [x] Push-to-talk. **Mobile, Desktop** · `apps/mobile/src/features/voice/hooks/useVoiceConversation.ts` (pttMode), `apps/desktop/src/features/settings/VoiceSettings.tsx` (hold-to-dictate hotkeys)
- [x] Hands-free mode. **Web, Mobile** · `apps/web/features/chat/hooks/use-voice-session.ts`, `apps/mobile/src/features/voice/services/voice.ts`
- [x] Interruption/barge-in. **Web, Mobile** · `apps/web/features/chat/lib/live-voice-session.ts`, `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` (`interrupted` state)
- [x] Voice picker. **Web** · `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx`
- [ ] Voice preview. **Not found.**
- [x] Language selection. **Web** · `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx`
- [x] Input-device selection. **Desktop** · `apps/desktop/src/features/settings/VoiceSettings.tsx` (microphone picker + test recording); not found on Web
- [x] Output-device selection. **Web** · `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx`
- [x] Speaker/Bluetooth routing. **Web** · `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx` (`setSinkId` over enumerated `audiooutput` devices)
- [x] Captions. **Web** · `apps/web/features/chat/components/Voice/VoiceCaptions.tsx`
- [x] Transcript display. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`handleVoiceTranscript`), `apps/web/features/chat/components/Voice/VoiceCaptions.tsx`
- [ ] Transcript editing where appropriate. **Partial:** voice turns land as ordinary chat messages editable via the normal message-edit action; captions themselves are read-only · `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Type while speaking. **Web** · `apps/web/features/chat/components/Voice/VoiceComposer.tsx`
- [x] View images and maps during Voice. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (ChatMessageList remains rendered and interactive under VoiceModeSurface)
- [x] View tool results during Voice. **Web** · `apps/web/features/chat/components/Voice/VoiceActivityPanel.tsx`
- [x] Approve an action during Voice. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (`ToolApprovalProvider` wraps the still-mounted message list)
- [x] Open a generated document from Voice. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx` (message list/Artifacts panel stay reachable in an active conversation)
- [ ] Attach image during Voice. **Not found.**
- [x] Camera sharing. **Web** · `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx`, `apps/web/lib/visual/use-visual-session.ts`
- [ ] Screen sharing. **Partial:** capture contract supports `getDisplayMedia`, but the Voice UI only wires the camera source · `packages/contracts/types/src/visual-session-capture.ts`, `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx`
- [ ] Camera switching. **Not found.**
- [ ] Picture-in-picture. **Not found.**
- [ ] Background-conversation preference. **Not found:** mobile explicitly ends the live session when the app backgrounds · `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts`
- [ ] Lock-screen controls. **Not found.**
- [x] Reconnection state. **Web** · `apps/web/features/chat/hooks/use-voice-session.ts`, `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx`
- [x] Usage-limit notice. **Web** · `apps/web/features/chat/lib/live-voice-session.ts` (`LIVE_SESSION_MESSAGE.usageExhausted`), `apps/web/app/api/voice/live/sessions/route.ts`
- [ ] Continue unfinished work in text. **Partial:** exiting Voice returns to the same conversation with the transcript already written in; no dedicated handoff control · `apps/web/features/chat/hooks/use-voice-session.ts`
- [ ] Resume a previous voice conversation. **Partial:** server stores session history and an active-session lookup, but no client calls it · `apps/web/app/api/voice/live/sessions/active/route.ts`
- [ ] Remote coding-session voice control. **Not found.**
- [x] Separate spoken-response cancellation from task cancellation. **Web** · `apps/web/features/chat/hooks/use-voice-session.ts` (`cancelBackendWork` vs `cancelPending`)

Gemini’s current Live page explicitly describes switching between talking and typing in the same thread, visual cards, connected apps, and feature-specific exclusions. Voice therefore needs its own capability matrix rather than inheriting every text-chat feature automatically.

Section tally: 28 of 41 checked; 6 partial; 7 not found.

## 49. Dictation, transcription, and recording

- [x] Composer dictation. **Web, Desktop** · `apps/web/features/chat/hooks/use-dictation.ts`, `apps/desktop/src/features/settings/VoiceSettings.tsx`
- [x] Editable transcription before send. **Web** · `apps/web/features/chat/components/Composer/DictationStrip.tsx` (`onStop` inserts into the composer field for editing)
- [x] Dictation language selection. **Web, Desktop** · `apps/web/features/settings/sections/VoiceSection.tsx`, `apps/desktop/src/lib/voiceLanguage.ts`
- [x] Interim transcript. **Web** · `apps/web/features/chat/lib/live-voice-session.ts` (`appendUser`/`appendAssistant`, `final: false`)
- [x] Final transcript. **Web** · `apps/web/features/chat/lib/live-voice-session.ts` (`finalizeUser`/`finalizeAssistant`)
- [x] Retry failed transcription. **Web** · `apps/web/features/chat/components/Composer/DictationStrip.tsx`, `apps/web/features/chat/hooks/use-dictation.ts`
- [x] Discard recording. **Web** · `apps/web/features/chat/components/Composer/DictationStrip.tsx`, `apps/web/features/chat/stores/voice-input-store.ts` (`cancelListening`)
- [ ] Audio-file upload. **Partial:** a general transcription API accepts uploaded audio files, but no product UI lets a user upload an existing recording · `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`
- [x] Batch transcription. **Web** · `apps/web/features/chat/stores/voice-input-store.ts` (record full blob, then transcribe)
- [x] Streaming transcription. **Web** · `apps/web/features/chat/lib/live-voice-session.ts`
- [ ] Timestamped transcript. **Not found.**
- [ ] Speaker labels. **Partial:** turns are tagged user/assistant only, no named multi-speaker diarization · `apps/web/features/chat/components/Voice/voice-captions.ts`
- [ ] Speaker-name correction. **Not found.**
- [ ] Transcript search. **Partial:** general conversation search covers voice-turn text; no search inside a recording transcript · `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
- [ ] Click transcript to seek audio. **Not found.**
- [ ] Meeting recording. **Not found.**
- [ ] Recording notice and consent interface. **Partial:** a generic microphone-consent notice covers dictation/Voice, not a meeting-recording consent flow · `apps/web/features/chat/components/MicrophonePrivacyNotice.tsx`
- [ ] Pause and resume recording. **Not found.**
- [ ] Recording-duration display. **Not found.**
- [ ] Meeting summary. **Not found.**
- [ ] Action-item extraction. **Not found.**
- [ ] Decisions summary. **Not found.**
- [ ] Follow-up email draft. **Not found.**
- [ ] Recording-to-Project association. **Not found.**
- [x] Transcript export. **Web** · `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` (conversation export includes voice-turn text as ordinary messages)
- [ ] Audio download. **Not found.**
- [x] Retention and deletion controls. **Web** · `apps/web/app/privacy/page.tsx` (documents that no audio is stored and the transcript follows conversation deletion)
- [ ] Desktop dictation into another application. **Not found:** system-wide dictation is a compile-time `false` on every OS · `apps/desktop/src-tauri/src/features/speech/dictation/coordinator.rs`, `docs/specs/desktop-global-voice/spec.md`
- [ ] Spoken rewriting of selected text. **Not found.**
- [ ] Undo inserted text. **Not found.**

Section tally: 11 of 30 checked; 4 partial; 15 not found.

## 50. Audio overviews, speech generation, and music

- [x] Text-to-speech playback. **Web** · `apps/web/lib/hooks/useTTS.ts`
- [x] Voice and language selection. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (`ReadAloudVoiceRow`)
- [x] Speaking-rate control where supported. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (`VoiceSpeedRow`), `apps/web/shared/stores/web-settings-store.ts`
- [ ] Download generated speech. **Not found.**
- [ ] Source-to-audio overview. **Not found.**
- [ ] Single-narrator overview. **Not found.**
- [ ] Multi-host overview. **Not found.**
- [ ] Brief versus detailed overview. **Not found.**
- [ ] Source-selection controls. **Not found.**
- [ ] Overview instructions. **Not found.**
- [ ] Audio transcript. **Not found.**
- [ ] Source-linked transcript references. **Not found.**
- [ ] Regenerate overview. **Not found.**
- [ ] Interactive interruption where offered. **Not found.**
- [ ] Original music generation. **Not found.**
- [ ] Vocal/instrumental choice. **Not found.**
- [ ] Genre controls. **Not found.**
- [ ] Mood controls. **Not found.**
- [ ] Instrumentation controls. **Not found.**
- [ ] Tempo guidance. **Not found.**
- [ ] Lyrics input. **Not found.**
- [ ] Song-structure guidance. **Not found.**
- [ ] Short/long generation modes. **Not found.**
- [ ] Music templates. **Not found.**
- [ ] Remix starters. **Not found.**
- [ ] Cover-art generation. **Not found.**
- [ ] Track title and metadata. **Not found.**
- [ ] Playback and seek controls. **Not found.**
- [ ] Download and sharing. **Not found.**
- [ ] Music-service playback integration as a separate capability. **Not found.**
- [ ] Custom-voice creation as a separately governed product. **Not found.**
- [ ] Voice-consent and deletion management. **Partial:** a microphone-consent notice and a documented no-audio-retention policy exist; no dedicated voice-data deletion control · `apps/web/features/chat/components/MicrophonePrivacyNotice.tsx`, `apps/web/app/privacy/page.tsx`

Section tally: 3 of 32 checked; 1 partial; 28 not found.

## 51. Voice-agent builder and telephony extensions

- [ ] Voice-agent creation wizard. **Not found.**
- [ ] Agent name and role. **Not found.**
- [ ] System instructions. **Not found.**
- [ ] Voice selection. **Not found.**
- [ ] Knowledge-source setup. **Not found.**
- [ ] Tool and MCP setup. **Not found.**
- [ ] Conversation goals. **Not found.**
- [ ] Guardrail configuration. **Not found.**
- [ ] Human-transfer action. **Not found.**
- [ ] Test-call interface. **Not found.**
- [ ] Web voice widget. **Not found.**
- [ ] Phone-number provisioning. **Not found.**
- [ ] Bring-your-own-number setup. **Not found.**
- [ ] SIP connection setup. **Not found.**
- [ ] Inbound call routing. **Not found.**
- [ ] Outbound calling, only where offered and authorized. **Not found.**
- [ ] Call transcripts. **Not found.**
- [ ] Call recordings and consent controls. **Not found.**
- [ ] Call outcome labels. **Not found.**
- [ ] Latency and failure dashboards. **Not found.**
- [ ] Usage and billing. **Not found.**
- [ ] Agent versioning. **Not found.**
- [ ] Publish and rollback. **Not found.**
- [ ] Business-hours configuration. **Not found.**
- [ ] Escalation and fallback behavior. **Not found.**

This is a distinct ecosystem extension, not simply “Voice mode.” xAI’s Voice Agent Builder combines telephony, retrieval, tools, MCP, guardrails, and observability in one configuration product.

Section tally: 0 of 25 checked; 0 partial; 25 not found.

---

# G. Custom assistants, Skills, Plugins, connectors, and tools

## 52. Custom-assistant builder

- [ ] Assistant manager. **Partial:** Desktop agent list in settings; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Create assistant. **Partial:** Desktop create-agent form; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Guided conversational builder. **Not found.**
- [ ] Direct configuration editor. **Partial:** Desktop form editor for name, description, model, scope, tools and prompt; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Live test/preview pane. **Not found.**
- [ ] Assistant name. **Partial:** Desktop agent name field; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Avatar or icon. **Not found.**
- [ ] Short description. **Partial:** Desktop description field; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Long description. **Not found.**
- [ ] Instructions. **Partial:** Desktop system-prompt field; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Conversation starters. **Not found.**
- [ ] Suggested use cases. **Not found.**
- [ ] Reference-file upload. **Not found.**
- [ ] Connected reference sources. **Not found.**
- [ ] Source-refresh behavior. **Not found.**
- [ ] Model preference. **Partial:** Desktop per-agent model select; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Tool selection. **Partial:** Desktop allowed-tools toggles; its list/save commands are handled only by the internal Tauri backend, not the shipped Electron app · `apps/desktop/src/features/settings/CustomAgentEditor.tsx`
- [ ] Web-search enablement. **Not found.**
- [ ] Code-execution enablement. **Not found.**
- [ ] Media-generation enablement. **Not found.**
- [ ] Connector selection. **Not found.**
- [ ] Custom-action schema. **Not found.**
- [ ] Authentication configuration for actions. **Not found.**
- [ ] Tool testing. **Not found.**
- [ ] Sample prompts. **Not found.**
- [ ] Output-format examples. **Not found.**
- [ ] Draft save. **Not found.**
- [ ] Publish. **Not found.**
- [ ] Version history. **Not found.**
- [ ] Revert published version. **Not found.**
- [ ] Private access. **Not found.**
- [ ] Named-user access. **Not found.**
- [ ] Workspace access. **Not found.**
- [ ] Public listing. **Not found.**
- [ ] Creator profile. **Not found.**
- [ ] Verified publisher information. **Not found.**
- [ ] Usage analytics. **Not found.**
- [ ] Duplicate/fork. **Not found.**
- [ ] Export or migration. **Not found.**
- [ ] Deprecation notice. **Not found.**
- [ ] Replacement-assistant link. **Not found.**

**Lifecycle distinction:** OpenAI currently documents a planned custom-GPT-to-Plugin migration. Existing GPTs remain a relevant product pattern, but treating their builder as a timeless, unchanged strategic destination would miss the migration product itself.

Section tally: 0 of 41 checked; 8 partial; 33 not found.

## 53. Skill creation and management

- [x] Skill directory. **Web** · `apps/web/app/skills/page.tsx`, `packages/ui/ui/src/directory/DirectoryPanel.tsx`
- [x] Installed Skills. **Web** · `apps/web/app/api/skills/installs/route.ts`, `apps/web/features/directory/services/skills-directory.ts`
- [x] Personal Skills. **Web** · `apps/web/lib/services/user-skill-service.ts`, `apps/web/features/skills/components/SkillEditorDialog.tsx`
- [ ] Project Skills. **Not found.**
- [ ] Organization Skills. **Not found.**
- [x] Skill detail page. **Web** · `packages/ui/ui/src/directory/SkillDetailView.tsx`
- [x] Skill name and description. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx`
- [x] Invocation guidance. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx` (description field doubles as prompt-matching guidance)
- [x] Instruction editor. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx`
- [ ] Reference-file bundle. **Partial:** bundled/managed skills expose a browsable file tree, user-authored skills are a single SKILL.md only · `packages/ui/ui/src/directory/SkillFileViewer.tsx`, `apps/web/app/api/skills/[name]/files/route.ts`
- [ ] Script bundle. **Partial:** bundled skill packages ship scripts, but authoring UI has no way to add scripts to a user's own skill · `packages/tools/skills/reference-bundles/skill-creator/scripts/run_eval.py`
- [ ] Input parameters. **Not found.**
- [ ] Expected outputs. **Not found.**
- [ ] Required tools. **Partial:** computed server-side but never rendered in the skill UI · `apps/web/app/api/skills/route.ts`
- [ ] Required connections. **Not found.**
- [ ] Supported surfaces. **Not found.**
- [x] Manual invocation. **Web** · `apps/web/features/directory/hooks/useDirectoryAdapter.ts` (trySkillInChat), `packages/ui/ui/src/directory/SkillDetailView.tsx`
- [x] Automatic relevance-based invocation. **Web** · `packages/tools/skills/src/relevance.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts`
- [ ] Skill composition. **Partial:** multiple matched skills' instructions are merged into one prompt, no authoring feature to compose skills · `packages/tools/skills/src/merge.ts`, `packages/tools/skills/src/format.ts`
- [x] Enable/disable. **Web** · `apps/web/app/api/skills/installs/route.ts`
- [x] Upload/import. **Web** · `apps/web/features/skills/components/SkillEditorDialog.tsx`, `apps/web/app/api/skills/route.ts`
- [x] Export. **Web** · `apps/web/app/api/skills/[name]/download/route.ts`
- [ ] Version selection. **Partial:** a version string is read and displayed, no UI to choose/switch versions · `apps/web/app/api/skills/route.ts`
- [ ] Update notification. **Not found.**
- [ ] Organization sharing. **Not found.**
- [ ] Skill duplication/customization. **Not found.**
- [ ] Recorded-demonstration creation. **Not found.**
- [ ] Screen-and-voice teaching flow. **Not found.**
- [ ] Replay configuration. **Not found.**
- [ ] Example-based template creation. **Not found.**
- [ ] Test cases. **Not found.**
- [ ] Test results. **Not found.**
- [ ] With-versus-without comparison. **Not found.**
- [ ] Cost estimate. **Not found.**
- [ ] Performance history. **Not found.**
- [ ] Permission and provenance summary. **Partial:** author/publisher shown per skill, no permissions summary · `apps/web/features/directory/services/skills-directory.ts`

Section tally: 12 of 36 checked; 6 partial; 18 not found.

## 54. Plugin marketplace and customization

- [x] Unified Customize destination. **Web** · `apps/web/features/settings/components/WebSettingsModal.tsx`, `packages/ui/ui/src/directory/DirectoryPanel.tsx`
- [x] Plugins tab. **Web** · `packages/ui/ui/src/directory/types.ts` (DirectorySectionKey 'plugins')
- [x] Skills tab. **Web** · `packages/ui/ui/src/directory/types.ts` (DirectorySectionKey 'skills')
- [x] Connectors tab. **Web** · `packages/ui/ui/src/directory/types.ts` (DirectorySectionKey 'connectors')
- [x] Public marketplace. **Web** · `apps/web/features/plugins/server/directory/official-marketplace.ts`, `apps/web/features/plugins/server/directory/public-directory.ts`
- [ ] Private organization marketplace. **Partial:** a member can add their own repository-backed marketplace scoped to their account, no separate admin-curated org-wide marketplace · `apps/web/app/api/plugins/marketplaces/route.ts`
- [x] Repository-backed marketplace. **Web** · `apps/web/app/api/plugins/marketplaces/route.ts`, `apps/web/lib/services/plugin-marketplace-service.ts`
- [x] Search and filters. **Web** · `apps/web/features/directory/services/plugins-directory.ts`
- [ ] Role/use-case categories. **Not found:** only a "works with" surface facet exists, no role/use-case taxonomy · `apps/web/features/plugins/server/directory/constants.ts`
- [ ] Featured plugins. **Partial:** sortable by install count as a popularity proxy, no curated "featured" flag · `apps/web/features/plugins/server/directory/constants.ts` (PLUGIN_SORT_INSTALLS)
- [ ] Recommended plugins. **Not found.**
- [ ] Publisher detail. **Partial:** publisher name shown on plugin detail, no dedicated publisher profile page · `packages/ui/ui/src/directory/PluginDetailView.tsx`
- [x] Plugin detail. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx`
- [x] Included Skills. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (componentRows)
- [x] Included connectors. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (ConnectorRows)
- [x] Included agents. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (PLUGIN_AGENTS_LABEL)
- [x] Included commands. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (PLUGIN_COMMANDS_LABEL)
- [x] Included hooks. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (PLUGIN_HOOKS_LABEL)
- [ ] Required permissions. **Partial:** permissions are tracked and gated server-side per version, never listed on the plugin detail UI · `apps/web/lib/services/plugin-lifecycle.ts`
- [x] Supported surfaces. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (PLUGIN_WORKS_WITH_LABEL)
- [x] Install. **Web** · `apps/web/features/directory/hooks/useDirectoryAdapter.ts` (installPlugin), `apps/web/app/api/plugins/installations/route.ts`
- [x] Configure. **Web** · `apps/web/app/api/plugins/[id]/settings/route.ts`, `packages/ui/ui/src/directory/PluginDetailView.tsx` (ContentsTabs)
- [x] Authenticate bundled connections. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (ConnectorRows Connect button)
- [x] Enable/disable. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (EnabledRow)
- [ ] Update. **Partial:** version-update lifecycle exists server-side, no UI component calls it · `apps/web/app/api/plugins/updates/route.ts`, `apps/web/lib/services/plugin-lifecycle.ts`
- [ ] Pin version. **Partial:** each installation is pinned to a fixed version server-side, no UI to pick/change it · `apps/web/lib/services/plugin-lifecycle.ts`
- [x] Customize installed plugin. **Web** · `apps/web/features/directory/hooks/useDirectoryAdapter.ts` (setPluginSkillEnabled)
- [ ] Fork plugin. **Not found.**
- [x] Uninstall. **Web** · `apps/web/app/api/plugins/installations/[id]/route.ts`
- [ ] Organization assignment. **Partial:** an admin can approve/block plugins for all members, not push-assign one · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`
- [ ] Installation approval request. **Partial:** workspace-wide allow/block list gates installs; personal permission acknowledgment on updates, no per-request admin approval · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`, `apps/web/lib/services/plugin-lifecycle.ts`
- [ ] Security-scan result. **Partial:** uploaded archives are scanned and unsafe ones rejected, no scan report is surfaced beyond the rejection message · `apps/web/lib/security/upload-scan.ts`, `apps/web/features/plugins/server/directory/archive.ts`
- [x] Compatibility warning. **Web** · `packages/ui/ui/src/directory/PluginDetailView.tsx` (InstallFromCli renders detail.runtimeNote), `apps/web/features/plugins/server/directory/constants.ts` (RUNTIME*NOTE*\*)
- [ ] Missing-dependency repair. **Not found.**
- [ ] Plugin-creation assistant. **Partial:** a manual structured "Create plugin" form and a "Create with AGI" chat hand-off exist, neither generates the plugin via AI · `packages/ui/ui/src/directory/CreatePluginDialog.tsx`, `apps/web/app/api/plugins/authored/route.ts`
- [ ] Submission and review workflow. **Partial:** draft → in_review → published transitions exist server-side, no user-facing submission UI found · `apps/web/lib/services/plugin-lifecycle.ts`
- [ ] Listing moderation. **Partial:** an operator can deprecate/suspend a published version fleet-wide, no moderation UI/queue found · `apps/web/lib/services/plugin-lifecycle.ts`
- [ ] Report plugin. **Not found.**
- [ ] Publisher analytics. **Not found.**
- [ ] Commercial procurement where offered. **Not found.**

Claude’s documentation makes the distinction concrete: Skills can work in chat, while hook and subagent functionality can be restricted to execution-capable surfaces. A Plugin can therefore be installed but only partially usable on a particular client.

Section tally: 21 of 40 checked; 12 partial; 7 not found.

## 55. Connector setup and account management

- [x] Connector directory. **Web** · `apps/web/app/connectors/page.tsx`, `apps/web/lib/connectors/directory/categorize.ts`
- [x] Connector search. **Web** · `apps/web/features/directory/services/connectors-directory.ts`
- [x] Connector categories. **Web** · `apps/web/lib/connectors/directory/categorize.ts` (DIRECTORY_CATEGORIES)
- [x] Connector detail page. **Web** · `packages/ui/ui/src/directory/ConnectorDetailView.tsx`
- [x] Supported-operation list. **Web** · `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx`
- [x] Read/write capability explanation. **Web** · `apps/web/features/connectors/components/ConnectorScopeList.tsx`, `apps/web/features/connectors/data/connectors.ts` (capabilitySummary)
- [x] Connect action. **Web** · `apps/web/app/api/connectors/route.ts`, `apps/web/features/directory/hooks/useDirectoryAdapter.ts`
- [x] OAuth authorization. **Web** · `apps/web/app/api/connectors/oauth/start/route.ts`, `apps/web/app/api/connectors/oauth/callback/route.ts`
- [x] API-key authorization. **Web** · `apps/web/features/connectors/components/ConnectorApiKeyForm.tsx`, `apps/web/app/api/connectors/[connectorId]/credentials`
- [x] Service-account authorization. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`, `apps/web/lib/connectors/accounts.ts`
- [ ] Organization-managed authorization. **Partial:** a "Work"/"Service account" scope exists per connector, configured by the member rather than provisioned by an org admin · `apps/web/lib/connectors/accounts.ts`
- [x] Multiple accounts per connector. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`, `apps/web/app/api/connectors/[connectorId]/accounts`
- [x] Account display name. **Web** · `apps/web/lib/connectors/accounts.ts` (connectorAccountDisplayName)
- [ ] Account identity and domain. **Partial:** an accountLabel field exists on the schema but is stored null in the OAuth callback path found, so the UI falls back to a generic scope label · `apps/web/lib/connectors/oauth-store.ts`
- [x] Default-account selection. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx` ("Use by default")
- [ ] Per-task account selection. **Not found.**
- [x] Granted-scope display. **Web** · `apps/web/features/connectors/components/ConnectorScopeList.tsx`
- [x] Connection health. **Web** · `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx`, `apps/web/app/api/connectors/health`
- [ ] Last synchronization time. **Partial:** health tracks last API call/latency, not a distinct content-sync timestamp · `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx`
- [x] Reconnect/reauthorize. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx` (needsReauthorization), `apps/web/lib/connectors/scopes-escalation.ts`
- [ ] Test connection. **Partial:** a custom MCP endpoint is probed before it is saved, no on-demand "test" action for an already-connected connector · `apps/web/lib/connectors/mcp-custom-connections.ts` (probeMcpServer)
- [x] Disconnect. **Web** · `apps/web/features/connectors/components/ConnectorAccountSelector.tsx`
- [x] Revoke permission. **Web** · `apps/web/features/connectors/components/ToolPermissionsPanel.tsx`, `apps/web/features/connectors/stores/tool-permissions-store.ts`
- [ ] Sync-source selection. **Not found.**
- [ ] Folder or repository selection. **Partial:** GitHub connections are scoped to repos through GitHub's own App-installation picker, reflected read-only in-app; no in-product folder/repo picker for other connectors · `apps/web/features/connectors/hooks/use-connectors-settings-adapter.tsx`
- [ ] Read-only mode. **Not found.**
- [x] Write-action settings. **Web** · `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` (per-tool allow/ask/deny)
- [ ] Data-retention explanation. **Not found.**
- [x] Source-provider attribution. **Web** · `packages/ui/ui/src/directory/types.ts` (DirectoryConnectorDetail publisher/authorName/publisherUrl), `packages/ui/ui/src/directory/ConnectorDetailView.tsx`
- [ ] Missing-scope request. **Partial:** scope escalation is detected and forces a full reauthorization, no standalone "request additional access" action · `apps/web/lib/connectors/scopes-escalation.ts`
- [x] Organization approval flow. **Web** · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`, `apps/web/lib/services/connector-policy-service.ts`
- [ ] Private-network setup where offered. **Not found.**

Section tally: 21 of 32 checked; 6 partial; 5 not found.

## 56. Concrete integration families

- [ ] Email search. **Partial:** OAuth scopes + generic MCP proxy exist; no default Gmail/Outlook server wired · `apps/web/lib/connectors/catalog.ts`, `apps/web/lib/connectors/mcp-endpoints.ts`
- [ ] Email reading. **Partial:** same gmail.readonly scope + proxy pipeline, no shipped server · `apps/web/lib/connectors/oauth-scope-allowlist.ts`
- [ ] Email drafting. **Partial:** same foundation, no default server · `apps/web/lib/connectors/catalog.ts`
- [ ] Email sending. **Partial:** gmail.send scope declared; real SMTP send only in internal Tauri client · `apps/desktop/src-tauri/src/features/communications/smtp_client.rs`
- [ ] Email attachments. **Partial:** attachment parsing exists only in internal Tauri client · `apps/desktop/src-tauri/src/features/communications/email_parser.rs`
- [ ] Email labels and folders. **Not found.**
- [ ] Calendar search. **Partial:** list_events implemented in internal Tauri client only, not public Desktop/Web · `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs`
- [ ] Free/busy inspection. **Not found.**
- [ ] Event creation. **Partial:** create_event exists in internal Tauri client, not reachable from public Electron/Web · `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs`
- [ ] Event editing and cancellation. **Partial:** update_event/delete_event in internal Tauri client only · `apps/desktop/src-tauri/src/features/calendar/outlook_calendar.rs`
- [ ] Meeting invitations. **Partial:** attendee fields on create/update event, internal Tauri client only · `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs`
- [ ] Contacts and recipient lookup. **Partial:** contacts client exists only in internal Tauri code · `apps/desktop/src-tauri/src/features/communications/contacts.rs`
- [x] Cloud-file search. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts`, `apps/web/lib/user-connector-tools.ts`
- [x] Cloud-file download. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts`
- [x] Cloud-file creation. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts`
- [ ] Cloud-file editing. **Partial:** Box/Dropbox connectors wired, but exact edit tools are runtime-discovered from vendor server · `apps/web/lib/connectors/mcp-endpoints.ts`
- [x] Folder and sharing management. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Box, Dropbox)
- [ ] Document editing. **Partial:** create_office_file only produces new .docx; in-place edit exists only in internal Tauri code · `apps/web/lib/prompts/chat-system-prompt.ts`, `apps/desktop/src-tauri/src/features/document/edit_word.rs`
- [ ] Spreadsheet editing. **Partial:** create_office_file creates new .xlsx; edit_excel exists only in internal Tauri code · `apps/desktop/src-tauri/src/features/document/edit_excel.rs`
- [ ] Presentation editing. **Partial:** create_office_file can produce a new .pptx; no editing of an existing one found on any surface · `apps/web/lib/prompts/chat-system-prompt.ts`
- [x] Team-message search. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Slack)
- [x] Team-message drafting and posting. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Slack)
- [x] Knowledge-base search. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Notion, Confluence)
- [x] Wiki/page editing. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Notion, Confluence)
- [x] Issue and task creation. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Jira, Linear, Asana)
- [x] Issue status updates. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Jira, Linear)
- [x] Project-management boards. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Asana, ClickUp, Monday)
- [x] CRM account/contact lookup. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (HubSpot)
- [ ] CRM opportunity updates. **Partial:** HubSpot connector wired with a default server, but Salesforce (also cataloged) has none · `apps/web/lib/connectors/mcp-endpoints.ts`, `apps/web/lib/connectors/catalog.ts`
- [x] Support-ticket workflows. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Intercom)
- [ ] Repository search. **Not found:** the first-party GitHub adapter has only 3 declared tools, none is search · `apps/web/lib/user-connector-tools.ts`
- [ ] Pull-request workflows. **Partial:** view diff, comment, and review exist; no create/merge tool · `apps/web/lib/user-connector-tools.ts`
- [ ] CI status and logs. **Partial:** inbound webhook triggers react to check_run/workflow_run; no tool to fetch logs on demand · `apps/web/lib/triggers/github-events.ts`
- [x] Design-file inspection. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Figma)
- [ ] Design-to-code references. **Partial:** Figma connector is wired to its real server, but code-generation tool support is runtime-discovered, not declared here · `apps/web/lib/connectors/mcp-endpoints.ts`
- [ ] Database querying. **Partial:** Postgres/MongoDB/Redis/Elasticsearch are catalog entries with no default server; only reachable if an operator supplies one · `apps/web/lib/connectors/catalog.ts`
- [ ] Warehouse analysis. **Partial:** Snowflake/BigQuery/Databricks catalog entries, operator-configured only, no default server · `apps/web/lib/connectors/catalog.ts`
- [ ] Dashboard creation. **Not found.**
- [x] Deployment management. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Vercel, Cloudflare)
- [ ] Licensed research retrieval. **Not found.**
- [ ] Shopping/product lookup. **Not found.**
- [ ] Reservations and bookings. **Not found.**
- [ ] Media playback. **Not found.**
- [ ] Native messaging applications. **Not found:** Telegram/WhatsApp are catalog entries only, no default server · `apps/web/lib/connectors/catalog.ts`
- [x] Local notes and calendars. **Mobile** · `apps/mobile/src/features/integrations/services/deviceIntegrations.ts`, `apps/mobile/src/features/reminders/service.ts`
- [ ] Health-record connections. **Partial:** Epic FHIR/Cerner are catalog entries, operator-configured only, no default server · `apps/web/lib/connectors/catalog.ts`
- [x] Financial-account connections. **Web** · `apps/web/lib/connectors/mcp-endpoints.ts` (Plaid)

Section tally: 17 of 47 checked; 21 partial; 9 not found.

## 57. Tool catalog and invocation experience

- [x] Search tool. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`, `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Fetch-page tool. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`
- [ ] Source-reader tool. **Partial:** url_fetch reads any cited URL, but there is no tool distinct from generic fetch · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`
- [x] File-search tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] File-read tool. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`
- [x] File-write tool. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`
- [ ] Spreadsheet tool. **Partial:** create_office_file produces a new .xlsx; no standalone spreadsheet tool · `apps/web/lib/prompts/chat-system-prompt.ts`
- [ ] Document tool. **Partial:** create_office_file produces a new .docx; no standalone document tool · `apps/web/lib/prompts/chat-system-prompt.ts`
- [ ] Presentation tool. **Partial:** create_office_file produces a new .pptx only · `apps/web/lib/prompts/chat-system-prompt.ts`
- [x] Code-execution tool. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts`
- [x] Shell tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Patch/edit tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`, `packages/tools/apply-patch/src/index.ts`
- [x] Browser-navigation tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Browser-action tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [ ] Computer-action tool. **Partial:** browser click/type/navigate are classified as ComputerUse; no OS-wide mouse/keyboard tool found, and a `computer_use` device capability flag defaults false · `apps/cli/src/device_registry.rs`
- [x] Image-generation tool. **Web** · `apps/web/app/api/media/image/generate/route.ts`
- [x] Image-editing tool. **Web** · `apps/web/app/api/media/image/lib/image-generation-provider.ts`
- [x] Video-generation tool. **Web** · `apps/web/app/api/media/video/generate/route.ts`
- [x] Transcription tool. **Web** · `apps/web/app/api/voice/transcribe/route.ts`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`
- [x] Speech-generation tool. **Web** · `apps/web/lib/hooks/useTTS.ts`
- [x] Memory tool. **Web, Shared** · `apps/web/lib/services/memory-write-service.ts`, `packages/ai/agent-core/src/memory.ts`
- [ ] Calendar tool. **Partial:** only reachable via an operator-configured Google Calendar connector, no default server · `apps/web/lib/connectors/catalog.ts`
- [ ] Messaging tool. **Partial:** only reachable via Slack/Teams connectors, no first-party send-message tool · `apps/web/lib/connectors/mcp-endpoints.ts`
- [x] Scheduling tool. **CLI, Web** · `apps/cli/src/platform/runtime/tool_catalog.rs` (cron_create/list/delete), `apps/web/lib/services/schedule-service.ts`
- [x] Agent-delegation tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs` (task tool), `apps/cli/src/subagent_v2.rs`
- [x] Clarification/input tool. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs` (ask_user), `apps/cli/src/tui/widgets/elicitation_overlay.rs`
- [ ] Approval-request tool. **Not found:** approval is an automatic gate around every tool call, not a distinct callable tool · `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts`
- [x] Tool discovery. **CLI, Web** · `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/web/lib/connectors/mcp-discovery.ts`
- [x] Tool search. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs` (tool_search)
- [x] Tool descriptions and schemas. **Web, CLI** · `apps/web/lib/user-connector-tools.ts`, `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Tool argument preview. **Shared** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Tool-call progress. **Shared** · `packages/ui/unified-chat/src/components/ActionLogTimeline.tsx`
- [x] Tool result preview. **Shared** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `packages/ui/unified-chat/src/components/InlineToolCall.tsx`
- [ ] Tool result expansion. **Partial:** parameters/result blocks render inline, but no dedicated expand-to-full-size affordance confirmed · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Tool error and retry. **Web** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
- [ ] Large-result references. **Partial:** per-tool output size caps truncate results; no confirmed reference/pagination to fetch the rest · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Tool receipt. **Shared, Web** · `packages/ui/unified-chat/src/components/ActionLogTimeline.tsx`, `apps/web/app/api/connectors/calls/route.ts`
- [ ] Per-tool cost and usage where exposed. **Not found:** no per-tool cost/usage display located; usage tracking found is model-level, not per-tool · `apps/web/lib/services/cloud-code-agent-loop.ts`

Section tally: 27 of 38 checked; 9 partial; 2 not found.

## 58. MCP and interactive extension products

- [x] MCP server list. **Desktop, CLI** · `apps/desktop/src/features/mcp/MCPServerManager.tsx`, `apps/cli/src/mcp/registry.rs`
- [x] Add local server. **CLI** · `apps/cli/src/mcp/registry.rs` (stdio transport)
- [x] Add remote server. **Web, CLI** · `apps/web/features/connectors/hooks/use-connectors-settings-adapter.tsx` (addCustomConnector), `apps/cli/src/mcp/registry.rs`
- [x] Server configuration editor. **Desktop** · `apps/desktop/src/features/mcp/MCPConfigEditor.tsx`
- [x] Environment-variable configuration. **Desktop** · `apps/desktop/mcp-servers-config.example.json`
- [x] Credential configuration. **Web** · `apps/web/features/connectors/components/ConnectorApiKeyForm.tsx`
- [ ] Connection test. **Partial:** health status is computed from real call outcomes, but no explicit "test connection" action found · `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx`
- [x] Tool discovery. **Web, Shared** · `apps/web/lib/connectors/mcp-discovery.ts`, `packages/tools/mcp/src/connect.ts`
- [x] Resource discovery. **Shared, Web** · `crates/agiworkforce-mcp/src/resources.rs`, `apps/web/features/chat/components/mcp/McpResourceList.tsx`
- [x] Prompt discovery where supported. **Shared** · `packages/tools/mcp/src/connect.ts` (listPrompts)
- [x] Server capability inspector. **Web** · `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx`
- [x] Server health and logs. **Web** · `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx`, `apps/web/features/connectors/components/ConnectorCallLog.tsx`
- [x] Enable/disable server. **CLI** · `apps/cli/src/mcp/registry.rs` (enable/disable)
- [x] Per-Project server configuration. **CLI** · `apps/cli/src/lib.rs` (project `.mcp.json`), `apps/cli/src/tui/widgets/screen_renderers.rs`
- [x] Organization-approved server catalog. **Web** · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`
- [ ] Private-network connector route. **Not found.**
- [ ] Interactive MCP app panel. **Partial:** server tool results carry an `app`/`isApp` descriptor, but no embedded interactive widget host found · `packages/tools/mcp/src/types.ts`, `apps/web/features/chat/components/mcp/McpResourceList.tsx`
- [ ] Embedded app initialization. **Not found.**
- [ ] Host-to-widget state. **Not found.**
- [ ] Widget-to-host actions. **Not found.**
- [ ] Widget resizing. **Not found.**
- [ ] Widget authentication. **Not found.**
- [ ] Viewer-specific authorization. **Not found.**
- [x] Site-provided tools such as WebMCP as a distinct category. **Chrome** · `apps/extension/src/webmcp.ts`
- [x] Tool availability changing with site state. **Chrome** · `apps/extension/src/webmcp.ts` (MutationObserver re-discovery)
- [ ] Extension debugging console. **Not found.**
- [ ] Developer-mode connection flow. **Not found.**
- [ ] Schema/version compatibility diagnostics. **Not found:** protocolVersion is sent on initialize, but no diagnostics UI for mismatches found · `crates/agiworkforce-mcp/src/client.rs`

Section tally: 16 of 28 checked; 2 partial; 10 not found.

## 59. Approvals and human-in-the-loop UI

- [x] One-action approval. **Shared, CLI, Mobile** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/cli/src/tui/widgets/approval_overlay.rs`, `apps/mobile/src/shared/components/ApprovalModal.tsx`
- [ ] Batch approval. **Not found:** approval UI reviewed is one call at a time; no multi-select "approve all pending" found.
- [x] Per-session approval. **CLI** · `apps/cli/src/tui/widgets/approval_overlay.rs` (AllowSession), `apps/cli/src/permissions.rs`
- [x] Per-application permission. **Web** · `apps/web/features/connectors/components/ToolPermissionsPanel.tsx`
- [x] Per-folder permission. **CLI** · `apps/cli/src/tui/approval_broker.rs` (TrustDirectory), `apps/cli/src/permissions.rs` (workspace_rules)
- [x] Per-domain permission. **Web** · `apps/web/lib/services/connector-policy-evaluator.ts` (allowedMcpHosts), `apps/web/lib/user-connector-tools.ts` (mcpHostPermitted)
- [x] Persistent permission settings. **Web, CLI** · `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts`, `apps/cli/src/permissions.rs`
- [x] Permission-mode selector. **Web, CLI** · `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx`, `apps/cli/src/cli_options.rs`
- [x] Read-only mode. **CLI** · `apps/cli/src/cli_options.rs` (Plan mode)
- [x] Ask-before-writing mode. **Web** · `packages/contracts/types/src/tool-approval-policy.ts` (ask_every_time)
- [x] Automatic low-risk approval mode. **Web** · `packages/contracts/types/src/tool-approval-policy.ts` (auto_approve_read_only)
- [x] Approval summary. **Mobile** · `apps/mobile/src/shared/components/ApprovalModal.tsx` (description, risk level, tool name)
- [ ] Exact recipients. **Partial:** tool arguments render generically as JSON; no dedicated recipient field extraction found · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [ ] Exact destination. **Partial:** generic argument display only; file path and diff are the only fields specially parsed · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [ ] Exact amount or purchase. **Partial:** same generic argument display, no dedicated amount field · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Exact command. **Shared, CLI** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/cli/src/tui/approval_broker.rs` (Exec.command)
- [x] Exact files or records affected. **Shared, CLI** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/cli/src/tui/approval_broker.rs` (Patch.files)
- [x] Proposed-diff preview. **Shared** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`
- [x] Allow action. **Shared, CLI, Mobile** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/cli/src/tui/widgets/approval_overlay.rs`
- [x] Deny action. **Shared, CLI, Mobile** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/mobile/src/shared/components/ApprovalModal.tsx`
- [ ] Edit proposed action. **Not found:** no affordance to modify a tool's arguments before approving was found.
- [ ] Ask for an alternative. **Partial:** mobile reject flow takes an optional reason, but no dedicated "suggest alternative" action · `apps/mobile/src/shared/components/ApprovalModal.tsx`
- [x] Approval expiration. **Shared** · `packages/ui/unified-chat/src/components/ToolCallCard.tsx` (expired prop, 120s timeout described at `apps/web/app/features/tools/page.tsx`)
- [x] Approval history. **Web** · `apps/web/features/connectors/components/ConnectorCallLog.tsx`
- [x] Revoke saved permission. **Web, CLI** · `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` (resetConnectorPermissions), `apps/cli/src/permissions.rs`
- [x] Approval from another device. **Mobile** · `apps/mobile/src/features/tasks/useApprovalSignal.ts`, `packages/ui/unified-chat/src/components/ToolCallCard.tsx` (deviceStep)
- [x] Approval via notification. **Mobile** · `apps/mobile/src/features/tasks/useApprovalSignal.ts` (agent_approval_needed push)
- [ ] Stronger confirmation for sensitive operations. **Partial:** a fixed list of tools always re-prompts and cannot be remembered, but no distinct "type to confirm" step found · `apps/web/app/features/tools/page.tsx` (NEVER_REMEMBERABLE)
- [ ] User takeover. **Partial:** background/cloud agent runs can be paused, but no evidence of the user taking manual control mid-action · `apps/desktop/src/stores/backgroundAgentStore.ts`
- [x] Resume after user intervention. **Desktop, CLI** · `apps/desktop/src/stores/backgroundAgentStore.ts` (resumeAgent), `apps/cli/src/context_handoff.rs`
- [x] Action receipt and outcome display. **Shared, Web** · `packages/ui/unified-chat/src/components/ActionLogTimeline.tsx`, `apps/web/features/connectors/components/ConnectorCallLog.tsx`

Section tally: 23 of 31 checked; 6 partial; 2 not found.

---

# H. Agents, tasks, browser operation, and coding

## 60. Agentic work product

- [x] Work-task composer. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/web/features/code/components/CodeComposer.tsx`
- [x] Task title. **Web** · `apps/web/shared/stores/web-chat-store.ts`, `apps/web/features/code/components/CodeSessionMenu.tsx`
- [x] Objective. **Web** · `apps/web/app/agi-work/page.tsx`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Deliverable selection. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Source selection. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Tool selection. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [x] Execution-location selection. **Web** · `apps/web/features/code/components/CodeComposer.tsx`
- [x] Model/profile selection. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Effort selection. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [ ] Spend budget. **Partial:** fixed $20/run server cost cap enforced, not a user-set field · `apps/web/lib/services/cloud-agent-budget.ts`
- [ ] Time budget. **Partial:** fixed 6-hour wall-clock cap enforced, not user-selectable · `apps/web/lib/services/cloud-agent-budget.ts`
- [ ] Completion condition. **Not found.**
- [x] Reviewable task plan. **Web** · `apps/web/app/agi-work/page.tsx`, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [x] Step list. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [ ] Dependency display. **Not found.**
- [x] Running-step indicator. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [x] Parallel-work indicator. **Web** · `apps/web/features/chat/components/messages/ToolTimeline.tsx`
- [x] Clarification request. **Web** · `apps/web/app/agi-work/page.tsx`, `packages/ui/unified-chat/src/components/tasks/task-display.ts`
- [x] Approval request. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`, `apps/web/features/code/CloudCodePage.tsx`
- [x] Task steering. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Pause. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Resume. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [x] Cancel. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [ ] Retry failed step. **Partial:** Code surface retries the whole failed turn, not a single step · `apps/web/features/code/CloudCodePage.tsx`
- [ ] Restart task. **Not found.**
- [x] Duplicate task. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [ ] Save as routine. **Not found.**
- [ ] Save as Skill. **Not found.**
- [x] Results summary. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [x] Generated deliverables. **Web** · `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
- [x] Partial-outcome summary. **Web** · `apps/web/app/agi-work/page.tsx`
- [x] Task history. **Web** · `apps/web/features/tasks/components/TasksPage.tsx`
- [ ] Task sharing. **Partial:** only the source conversation is shareable, no per-run share action · `apps/web/features/chat/hooks/use-share-conversation.ts`
- [x] Cross-device task continuation. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`

Section tally: 25 of 34 checked; 4 partial; 5 not found.

## 61. Persistent agents and agent rosters

- [x] Agent roster. **CLI** · `apps/cli/src/agents.rs`, `apps/cli/src/repl/slash_commands.rs`
- [x] Create persistent agent. **CLI** · `apps/cli/src/agents.rs`
- [ ] Agent name and avatar. **Partial:** named agent definitions exist, no avatar concept in a text CLI · `apps/cli/src/agents.rs`
- [x] Role description. **CLI** · `apps/cli/src/agents.rs`
- [x] Agent-specific instructions. **CLI** · `apps/cli/src/agents.rs`
- [ ] Agent-specific Memory. **Not found.**
- [ ] Agent-specific routines. **Not found.**
- [x] Shared account-level tools. **CLI** · `apps/cli/src/ecosystem.rs`
- [x] Shared account-level Skills. **Web** · `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`
- [ ] Agent workspace/computer. **Not found.**
- [x] Presence/activity indicator. **CLI** · `apps/cli/src/tui/widgets/screen_renderers.rs`
- [ ] Active responsibility list. **Not found.**
- [x] Agent conversation. **CLI** · `apps/cli/src/agents.rs`
- [ ] Agent group conversation. **Not found.**
- [ ] Chief-of-staff/coordinator pattern. **Not found.**
- [x] Specialist-agent delegation. **CLI** · `apps/web/app/features/agents/page.tsx`, `apps/cli/src/subagent.rs`
- [ ] Inter-agent messages. **Not found:** message-passing module exists but has no callers · `apps/cli/src/subagent_v2.rs`
- [ ] Human escalation. **Partial:** blocking approval/clarification prompts, no distinct human-review queue · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [ ] Agent pause/disable. **Not found.**
- [x] Resource-budget controls. **CLI/Server** · `apps/cli/src/subagent.rs`, `apps/web/lib/services/cloud-agent-budget.ts`
- [ ] Agent configuration versioning. **Not found.**
- [ ] Agent activity history. **Partial:** subagent runs append to an audit log file, no viewer/command surfaces it · `apps/cli/src/subagent_audit.rs`
- [ ] Agent duplication. **Not found.**
- [ ] Agent retirement and ownership transfer. **Not found.**

Grok Bot’s documented design separates shared capabilities from agent-specific Memory and Routines, and introduces status, preview, and takeover levels for an agent’s computer. Those are additional product components beyond ordinary chat history.

Section tally: 10 of 24 checked; 3 partial; 11 not found.

## 62. Multi-agent and multi-model interfaces

- [x] Parent task. **CLI/Server** · `apps/cli/src/subagent.rs`, `apps/web/lib/services/cloud-agent-budget.ts`
- [x] Child-agent list. **CLI** · `apps/cli/src/subagent.rs`, `apps/cli/src/tui/widgets/screen_renderers.rs`
- [ ] Role labels. **Partial:** entries carry a free-text description, not a distinct role field · `apps/cli/src/subagent.rs`
- [ ] Model labels. **Not found.**
- [x] Per-agent status. **CLI** · `apps/cli/src/subagent.rs`
- [ ] Per-agent transcript. **Not found:** `/task` supports only `list` · `apps/cli/src/repl/slash_commands.rs`
- [x] Per-agent result. **CLI** · `apps/cli/src/subagent.rs`
- [x] Per-agent usage. **CLI** · `apps/cli/src/subagent.rs`, `apps/cli/src/subagent_audit.rs`
- [x] Concurrent task view. **CLI** · `apps/cli/src/tui/widgets/screen_renderers.rs`
- [ ] Needs-input prioritization. **Not found.**
- [x] Inline unblock response. **Web** · `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`
- [ ] Full-transcript drill-down. **Not found.**
- [ ] Shared-workspace versus isolated-workspace indicator. **Not found.**
- [ ] Agent handoff. **Not found.**
- [ ] Summary-only handoff. **Not found.**
- [ ] Background fork. **Partial:** tasks run asynchronously while the app stays usable, not framed as forking a conversation · `apps/web/features/tasks/components/TasksPage.tsx`
- [ ] Interactive branch. **Not found.**
- [ ] Advisor consultation. **Not found.**
- [ ] Model-comparison view. **Not found:** council types defined but never imported anywhere · `packages/contracts/types/src/council.ts`
- [ ] Independent parallel answers. **Not found.**
- [ ] Synthesis answer. **Not found.**
- [ ] Agreement and disagreement display. **Not found.**
- [ ] Unique findings per model. **Not found.**
- [ ] Combined-source inspection. **Not found.**
- [ ] Comparison-cost estimate. **Not found.**
- [ ] Selected model set. **Not found.**
- [ ] Rerun one participant. **Not found.**
- [ ] Save comparison. **Not found.**

Perplexity’s Model Council is a documented example of parallel answers followed by a separate synthesis stage. It should not be reduced to ordinary routing or fallback.

Section tally: 7 of 28 checked; 2 partial; 19 not found.

## 63. Routines, schedules, and triggers

- [x] Routine gallery. **Web** · `apps/web/features/schedules/lib/schedule-templates.ts`
- [x] Create routine from a prompt. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Create routine from a completed task. **Not found.**
- [x] Routine name and description. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Prompt editor. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Source selection. **Not found:** prompts run self-contained with no chat context or memory · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Repository selection. **Partial:** only as a GitHub trigger's account-scope field, not a repo the routine operates on · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [x] Connector selection. **Web** · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [ ] Agent selection. **Not found.**
- [ ] Model/effort selection. **Partial:** model select exists, no effort control · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] One-time schedule. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Recurring schedule. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Timezone control. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Advanced recurrence. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Event-trigger selection. **Web** · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [x] Event filters. **Web** · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [x] Webhook trigger. **Web** · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [ ] API trigger. **Partial:** the signed-webhook endpoint doubles as one, no separate API-key trigger · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [x] Manual run. **Web** · `apps/web/features/schedules/components/ScheduleCard.tsx`
- [x] Next-run display. **Web/Desktop** · `apps/web/features/schedules/components/ScheduleCard.tsx`, `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`
- [x] Last-run display. **Web/Desktop** · `apps/web/features/schedules/components/ScheduleCard.tsx`, `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`
- [x] Run-history list. **Web** · `apps/web/features/schedules/components/ScheduleRunHistory.tsx`
- [x] Per-run results. **Web** · `apps/web/features/schedules/components/ScheduleRunHistory.tsx`
- [x] Enable/disable. **Web/Desktop** · `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`
- [ ] Pause until date. **Not found:** only a permanent expiry date and manual pause/resume exist · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [x] Edit schedule. **Web/Desktop** · `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`
- [x] Delete routine. **Web/Desktop** · `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`
- [ ] Duplicate routine. **Not found.**
- [ ] Share routine template. **Not found:** code comment states no sharing endpoint exists, it only copies the app's own link · `apps/web/features/schedules/components/SchedulesPage.tsx`
- [ ] Notification preferences. **Partial:** account-wide alert settings only, not per-routine · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Budget controls. **Not found:** only an unrelated org-wide spend limit exists · `apps/web/app/api/settings/organization/spend-limit/route.ts`
- [ ] Required-approval behavior. **Not found:** scheduled runs carry no tools, so no approval step applies.
- [x] Missed-run explanation. **Web** · `apps/web/features/schedules/components/ScheduleForm.tsx`
- [ ] Deferred execution after allowance reset. **Not found.**
- [ ] Connection-expiry repair flow. **Partial:** verification-pending state shown, general connector reconnect flow is account-wide not schedule-specific · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`, `apps/web/features/connectors/hooks/use-connectors.ts`

Section tally: 21 of 35 checked; 5 partial; 9 not found.

## 64. Browser-assistant experience

- [x] Current-page context. **Chrome** · `apps/extension/src/features/content/in-page-panel/pageActions.ts`
- [x] Selected-text context. **Chrome** · `apps/extension/src/content.ts`
- [ ] Open-tab picker. **Not found.**
- [ ] Multi-tab comparison. **Not found.**
- [x] Page summary. **Chrome** · `apps/extension/src/features/content/in-page-panel/pageActions.ts`
- [x] Question about page. **Chrome** · `apps/extension/src/features/content/in-page-panel/pageActions.ts`, `apps/extension/src/features/side-panel/index.ts`
- [ ] Question about video/transcript. **Partial:** YouTube quick actions summarize by title only, no transcript is fetched · `apps/extension/src/features/content/in-page-panel/pageActions.ts`
- [x] Browser side conversation. **Chrome** · `apps/extension/src/features/side-panel/index.ts`
- [ ] Browser history context where explicitly enabled. **Not found.**
- [x] Open URL. **Chrome** · `apps/extension/src/features/computer-use/cdpDriver.ts`
- [ ] Back/forward/reload. **Not found.**
- [ ] Create or close tab. **Partial:** tab creation is wired (`chrome.tabs.create`); no close-tab action found · `apps/extension/src/side_panel.ts`
- [x] Organize tabs. **Chrome** · `apps/extension/src/side_panel.ts`
- [ ] Website search. **Not found.**
- [x] Form filling. **Chrome** · `apps/extension/src/features/content/autofill/filler.ts`, `apps/extension/src/features/content/autofill/detector.ts`
- [x] Multi-step website task. **Chrome** · `apps/extension/src/features/computer-use/agentLoop.ts`
- [x] Structured site-tool invocation. **Chrome** · `apps/extension/src/features/tools/siteToolRegistry.ts`
- [x] Visible action timeline. **Chrome** · `apps/extension/src/features/side-panel/computerUsePanel.ts`
- [ ] Live browser preview. **Partial:** per-step screenshot thumbnails only, not a continuous live feed · `apps/extension/src/features/side-panel/computerUsePanel.ts`
- [ ] Active-tab indicator. **Partial:** a tab-group state chip exists; no "acting on this tab" label found · `apps/extension/src/side_panel.ts`
- [x] Login handoff. **Chrome** · `apps/extension/src/features/computer-use/escalationEngine.ts`
- [x] Human verification handoff. **Chrome** · `apps/extension/src/features/computer-use/escalationEngine.ts`
- [ ] Take over. **Partial:** dismissing Chrome's own debugger bar cancels the run; no in-panel takeover control · `apps/extension/src/features/computer-use/runOwnership.ts`
- [ ] Return control to agent. **Not found.**
- [x] Pause/stop. **Chrome** · `apps/extension/src/features/side-panel/computerUsePanel.ts`
- [x] Download review. **Chrome** · `apps/extension/src/features/side-panel/browserToolsPanel.ts`, `apps/extension/src/features/browser-tools/downloads.ts`
- [x] Upload review. **Chrome** · `apps/extension/src/features/computer-use/approvalPolicy.ts`
- [x] Website permission controls. **Chrome** · `apps/extension/src/features/options/site-allowlist.ts`, `apps/extension/src/features/options/site-permission-policy.ts`
- [ ] Browser-session persistence setting. **Partial:** per-origin browser-control consent persists durably; no session-only toggle found · `apps/extension/src/features/computer-use/browserControlConsent.ts`
- [ ] Clear website data. **Not found.**
- [ ] Isolated agent browser versus user browser choice. **Partial:** an isolated-profile browser tool exists but no surface in the repo imports it · `packages/tools/browser-tool/src/profile.ts`
- [x] Browser-task result summary. **Chrome** · `apps/extension/src/features/computer-use/agentLoop.ts`

Section tally: 18 of 32 checked; 7 partial; 7 not found.

## 65. Computer-use experience

- [x] Computer-access setup. **Desktop** · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`, `apps/desktop/src/features/settings/ComputerUseConsentDialog.tsx`
- [x] Operating-system permission explanation. **Desktop** · `apps/desktop/electron/runtime/computerUseService.ts`
- [ ] Application allowlist. **Partial:** the per-app allow list runs on the Tauri build only; not bridged into the shipped Electron app · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`, `apps/desktop/src-tauri/src/sys/commands/computer_use.rs`
- [ ] Application blocklist. **Partial:** same Tauri-only per-app block list; the Electron IPC dispatcher has no equivalent case · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`
- [x] Window selection. **Desktop** · `apps/desktop/src/features/screen-capture/WindowSelector.tsx`
- [x] Monitor selection. **Desktop** · `apps/desktop/electron/runtime/computerUseService.ts`
- [x] Screen preview. **Desktop** · `apps/desktop/src/features/execution-sidecar/ExecutionSidecarScreenView.tsx`
- [x] Cursor/action visualization. **Desktop** · `apps/desktop/src/features/execution-sidecar/ComputerUseOverlay.tsx`
- [ ] Current-application indicator. **Partial:** reading the focused app/window is a Tauri-only command with no Electron path · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`
- [ ] Current-window indicator. **Partial:** same Tauri-only active-window read · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`
- [x] Clipboard permission. **Desktop** · `apps/desktop/electron/runtime/dispatcher.ts`
- [x] Local-folder permission. **Desktop** · `packages/contracts/local-runtime/src/capabilities.ts`, `apps/desktop/electron/runtime/permissionManager.ts`
- [ ] Application launch. **Partial:** a `LaunchApplication` action exists only in the Tauri automation module, no Electron case · `apps/desktop/src-tauri/src/automation/computer_use/types.rs`
- [x] Clicking and typing. **Desktop** · `apps/desktop/electron/runtime/dispatcher.ts`, `apps/desktop/electron/runtime/computerUseService.ts`
- [x] Scrolling. **Desktop** · `apps/desktop/electron/runtime/computerUseService.ts`
- [x] Drag-and-drop actions. **Desktop** · `apps/desktop/electron/runtime/computerUseService.ts`
- [ ] Native file-dialog interaction. **Partial:** `ChooseFileInDialog`/`RespondToDialog` exist only in the Tauri automation module · `apps/desktop/src-tauri/src/automation/computer_use/types.rs`
- [ ] Background application operation where supported. **Not found:** the Windows automation path explicitly calls `SetForegroundWindow` before acting · `apps/desktop/src-tauri/src/automation/uia/actions.rs`
- [ ] User-input arbitration. **Partial:** a manual takeover flag blocks the agent; no automatic live user-activity detection found · `apps/desktop/electron/runtime/computerUseService.ts`
- [x] Emergency stop. **Desktop, Mobile** · `apps/desktop/electron/runtime/dispatcher.ts`, `apps/mobile/services/companion.ts`
- [x] Pause and takeover. **Desktop** · `apps/desktop/electron/appMenu.ts`, `apps/desktop/src/stores/computerUseStore.ts`
- [x] Return control. **Desktop** · `apps/desktop/electron/appMenu.ts`, `apps/desktop/src/stores/computerUseStore.ts`
- [x] Sensitive-action review. **Desktop** · `apps/desktop/src/stores/computerUseStore.ts`
- [ ] Authentication handoff. **Partial:** implemented for the browser assistant, not confirmed for native desktop screen control · `apps/extension/src/features/computer-use/escalationEngine.ts`
- [x] Action outcome/receipt. **Desktop** · `apps/desktop/src/services/controlReceipts.ts`
- [x] Unsupported-application explanation. **Desktop** · `apps/desktop/src-tauri/src/automation/computer_use/safety.rs`, `apps/desktop/src-tauri/src/automation/mod.rs`
- [ ] Device-offline state. **Partial:** a device heartbeat/registry exists; no computer-use-specific offline message confirmed · `apps/desktop/src/services/deviceRegistryHeartbeat.ts`
- [x] Permission-revoked state. **Desktop** · `apps/desktop/electron/runtime/dispatcher.ts`
- [x] Remote access to a permitted local computer. **Desktop, Mobile** · `apps/desktop/electron/remote/remoteControlHost.ts`, `apps/mobile/services/companion.ts`

Section tally: 19 of 29 checked; 9 partial; 1 not found.

## 66. Coding-workspace frontend

- [x] Repository picker. **Web** · `apps/web/features/code/CloudCodePage.tsx`
- [ ] Branch picker. **Partial:** branch is a free-text field defaulting to the repository default branch; no branch list or switcher · `apps/web/features/code/components/CodeComposer.tsx`
- [x] Worktree picker. **CLI** · `apps/cli/src/repl/slash_commands.rs`
- [x] Local/cloud execution selector. **Web** · `apps/web/features/code/CloudCodePage.tsx`
- [x] Coding-session list. **Web** · `apps/web/features/code/components/CodeRail.tsx`
- [x] Coding-session title. **Web** · `apps/web/features/code/CloudCodePage.tsx`
- [x] Session status. **Web** · `apps/web/features/code/code-surface.ts`
- [x] File tree. **Desktop** · `apps/desktop/src/features/code/FileTree.tsx`
- [x] File search. **Desktop** · `apps/desktop/src/features/code/FileTree.tsx`
- [ ] Symbol search. **Not found.**
- [x] Code editor. **Desktop** · `apps/desktop/src/features/code/CodeEditor.tsx`
- [x] Editor tabs. **Desktop** · `apps/desktop/src/features/code/CodeWorkspace.tsx`
- [x] Selected-code context. **VS Code** · `apps/extension-vscode/src/data/composerContext.ts`, `apps/extension-vscode/src/providers/diagnosticsProvider.ts`
- [x] Diagnostics panel. **VS Code** · `apps/extension-vscode/src/providers/diagnosticsProvider.ts`
- [x] Integrated terminal. **Web, Desktop** · `apps/web/features/code/components/CodeChangesPanel.tsx`, `apps/desktop/src/features/execution/TerminalPanel.tsx`
- [ ] Terminal tabs. **Not found.**
- [x] Command-history view. **Web** · `apps/web/features/code/components/CodeChangesPanel.tsx`
- [x] Diff viewer. **Web, Desktop** · `apps/web/features/code/components/CodeChangesPanel.tsx`, `apps/desktop/src/features/code/DiffViewer.tsx`
- [x] File-change summary. **Web** · `apps/web/features/code/components/CodeChangesPanel.tsx`
- [ ] Inline review comments. **Not found.**
- [ ] Hunk acceptance/rejection. **Partial:** `acceptHunk`/`rejectHunk` exist but the viewer is not mounted by any screen · `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx`, `apps/desktop/src/stores/editingStore.ts`
- [ ] Checkpoint list. **Partial:** CLI reports only a checkpoint count; Desktop's list API has no panel wired to it · `apps/cli/src/repl/slash_commands.rs`, `apps/desktop/src/stores/codingCheckpointStore.ts`
- [x] Restore checkpoint. **CLI** · `apps/cli/src/repl/registry.rs`
- [x] Plan mode. **CLI** · `apps/cli/src/cli_options.rs`
- [x] Edit/agent mode. **CLI** · `apps/cli/src/permissions.rs`
- [x] Permission-mode control. **CLI** · `apps/cli/src/cli_options.rs`
- [x] Context-usage indicator. **CLI, Web** · `apps/cli/src/tui/tui_app.rs`, `apps/web/features/code/CloudCodePage.tsx`
- [x] Usage/cost indicator. **CLI** · `apps/cli/src/tui/tui_app.rs`
- [x] Background task list. **Desktop** · `apps/desktop/src/features/agi/AgentTaskMonitor.tsx`
- [x] Subagent panel. **CLI** · `apps/cli/src/tui/widgets/screen_renderers.rs`, `apps/cli/src/subagent.rs`
- [x] Browser preview. **Desktop** · `apps/desktop/src/features/execution-sidecar/ExecutionSidecarHeader.tsx`, `apps/desktop/src/features/execution-sidecar/ExecutionSidecarScreenView.tsx`
- [x] Console-log panel. **Desktop** · `apps/desktop/src/features/execution/TerminalPanel.tsx`
- [ ] Running-server list. **Not found.**
- [ ] Port/preview URL. **Not found.**
- [ ] Simulator panel where offered. **Not found.**
- [x] Pull-request panel. **Web** · `apps/web/features/code/components/CodeChangesPanel.tsx`
- [ ] CI-status panel. **Not found.**
- [x] Test-results panel. **Web** · `apps/web/features/code/hooks/use-local-tests.ts`, `apps/web/features/code/components/LocalSessionPanel.tsx`
- [ ] Session recap. **Not found.**
- [ ] Share session. **Not found.**
- [x] Continue in another client. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`, `apps/mobile/src/features/companion/remote-code/service.ts`

Section tally: 29 of 41 checked; 3 partial; 9 not found.

## 67. Coding capabilities and developer workflows

- [x] Explain repository structure. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Find implementations. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Find references. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Trace call paths. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Answer repository questions. **CLI, Web** · `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/web/features/code/CloudCodePage.tsx`
- [x] Implement a feature. **CLI, Web** · `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/web/features/code/CloudCodePage.tsx`
- [x] Fix a defect. **CLI, Web** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Refactor code. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Generate tests. **CLI** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Run tests. **Web, CLI** · `apps/web/features/code/hooks/use-local-tests.ts`, `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Interpret test failures. **Web** · `apps/web/features/code/hooks/use-local-tests.ts`
- [x] Run type checking. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Run linting. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Build applications. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Start development servers. **CLI, Server** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Inspect browser behavior. **CLI, Chrome** · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Inspect console errors. **Chrome** · `apps/extension/src/features/browser-tools/consoleCapture.ts`
- [x] Inspect network failures. **Chrome** · `apps/extension/src/features/browser-tools/networkCapture.ts`
- [ ] Interact with a simulator. **Not found.**
- [x] Review code changes. **Server** · `packages/guardian/github/src/events.ts`
- [x] Review pull requests. **Server** · `packages/guardian/github/src/events.ts`
- [x] Scan for security problems. **Server** · `packages/guardian/github/src/commands.ts`
- [x] Explain findings. **Server** · `packages/guardian/github/src/summary.ts`, `packages/guardian/github/src/commands.ts`
- [x] Propose patches. **Server** · `packages/guardian/github/src/commands.ts`
- [x] Apply selected patches. **Server** · `packages/guardian/github/src/commands.ts`
- [ ] Generate documentation. **Partial:** only the generic `write_file` tool; no dedicated documentation-generation workflow · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [ ] Perform migrations. **Partial:** only generic shell/edit tools; no dedicated migration tool or workflow · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [ ] Upgrade dependencies. **Partial:** only generic shell tools; no dedicated dependency-upgrade tool · `apps/cli/src/platform/runtime/tool_catalog.rs`
- [x] Create commits. **Web** · `apps/web/features/code/CloudCodePage.tsx`
- [x] Create branches. **CLI** · `apps/cli/src/platform/runtime/git_tools.rs`
- [x] Create pull requests. **Web** · `apps/web/features/code/CloudCodePage.tsx`
- [x] Respond to review feedback. **Server** · `packages/guardian/github/src/commands.ts`
- [ ] Investigate CI failures. **Partial:** Guardian posts its own check runs but does not fetch/diagnose another CI's failing run · `packages/guardian/github/src/checks.ts`
- [x] Work from issues or team mentions. **Server** · `packages/guardian/github/src/events.ts`
- [ ] Produce repository-grounded reports, slides, and designs. **Partial:** a general artifact/canvas system exists, not a repo-grounded report or slide generator · `packages/platform/artifacts/src/artifact-derivation.ts`
- [x] Run bounded goal/completion loops. **Web, CLI** · `apps/web/features/code/CloudCodePage.tsx`
- [ ] Persist useful repository-specific Memory. **Partial:** instruction-file loading and an account-level cloud memory exist; no repo-scoped memory store · `apps/cli/src/agent/mod.rs`
- [x] Load repository instruction files. **CLI** · `apps/cli/src/agent/mod.rs`
- [x] Use project-specific Skills and Plugins. **CLI** · `apps/cli/src/skills.rs`, `apps/cli/src/features/plugins/plugins.rs`

Section tally: 32 of 39 checked; 6 partial; 1 not found.

## 68. Session continuity and remote-session product

- [x] Shared session identifier across supported clients. **Mobile, Desktop** · `apps/mobile/src/features/companion/remote-code/store.ts`, `apps/desktop/electron/runtime/developerSessionService.ts`
- [x] Same conversation history. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [x] Same active branch. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx`
- [x] Same repository association. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx`
- [ ] Same worktree association. **Partial:** only a single "folder" path is synced to mobile, no distinct worktree field · `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx`
- [ ] Same model and instruction configuration. **Partial:** carried in the CLI handoff record, not surfaced by the live mobile mirror · `apps/cli/src/platform/runtime/session_handoff.rs`
- [ ] Same task plan and checkpoints. **Partial:** handoff carries plan steps; the mobile mirror shows tool activity/diffs, not a plan list · `apps/cli/src/platform/runtime/session_handoff.rs`
- [x] Same pending approvals. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [x] Same tool activity. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [ ] Read-only session attachment. **Not found.**
- [x] Active-control attachment. **Mobile** · `apps/mobile/src/features/companion/remote-code/service.ts`
- [ ] Execution-owner indicator. **Not found.**
- [ ] Transfer control between clients. **Partial:** both clients can steer/interrupt the same run concurrently; no explicit handoff ceremony · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [x] Continue local execution from mobile. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [ ] Continue cloud execution from desktop. **Not found.**
- [ ] Move work to cloud through an explicit handoff. **Partial:** `HandoffEnvironment::Cloud` exists server-side with no client that triggers it · `apps/cli/src/platform/runtime/session_handoff.rs`
- [ ] Bring cloud results back to local workspace. **Partial:** same handoff-only evidence, unconsumed by any client · `apps/cli/src/platform/runtime/session_handoff.rs`
- [x] File/environment transfer review. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [ ] Remote-machine discovery. **Not found.**
- [x] Remote-machine card. **Mobile** · `apps/mobile/src/features/companion/components/DesktopInfoCard.tsx`
- [x] Host capabilities. **Desktop** · `apps/desktop/src/services/deviceRegistryHeartbeat.ts`
- [x] Device pairing. **Desktop, Mobile** · `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx`, `apps/mobile/src/features/companion/components/QRScanner.tsx`
- [x] Pairing revocation. **Desktop** · `apps/desktop/electron/runtime/permissionManager.ts`
- [ ] Start a session in an allowed remote folder. **Not found.**
- [x] Device-offline explanation. **Mobile** · `apps/mobile/src/features/companion/components/ConnectionStateViews.tsx`
- [x] Resume after reconnect. **Mobile** · `apps/mobile/src/features/companion/components/StatusBanners.tsx`
- [x] Session export. **CLI** · `apps/cli/src/repl/slash_commands.rs`
- [ ] Summary-only transfer as a separate option. **Not found.**
- [ ] Transcript branch as a separate option. **Not found.**
- [x] Cross-client activity notifications. **Mobile** · `apps/mobile/services/companionNotifications.ts`

Section tally: 17 of 30 checked; 6 partial; 7 not found.

# I. Platform-specific product surfaces

## 69. Web application

- [x] Browser-based chat and work. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] Responsive desktop/tablet/mobile layouts. **Web** · `apps/web/features/chat/pages/WebChatPage.tsx`
- [x] URL-addressable conversations and resources. **Web** · `apps/web/app/chat/[sessionId]/page.tsx`
- [x] Browser history integration. **Web** · `apps/web/app/chat/[sessionId]/page.tsx`
- [x] Browser refresh restoration. **Web** · `apps/web/app/chat/[sessionId]/page.tsx`
- [x] Drag-and-drop uploads. **Web** · `apps/web/features/chat/components/Composer/DragDropOverlay.tsx`
- [x] Clipboard integration. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Camera and microphone permissions. **Web** · `apps/web/features/chat/lib/live-voice-session.ts` (microphone), `packages/contracts/types/src/visual-session-capture.ts` (camera via `apps/web/lib/visual/use-visual-session.ts`)
- [x] Screen/tab sharing. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [ ] Cloud code execution. **Partial:** E2B sandbox notebook execution exists but is gated behind an env flag and private beta · `apps/web/lib/e2b/gate.ts`
- [ ] Cloud browser execution. **Not found.**
- [x] Remote desktop-host control. **Web** · `apps/web/features/desktop-host/components/RemoteControlSection.tsx`, `apps/web/app/api/pair/initiate/route.ts`
- [x] Web notifications where supported. **Web** · `apps/web/features/notifications/components/WebPushToggle.tsx`
- [x] Installable web application where offered. **Web** · `apps/web/app/manifest.ts`
- [x] Offline/read-only fallback. **Web** · `apps/web/app/offline/OfflineStatus.tsx`
- [x] Multi-tab coordination. **Web** · `apps/web/lib/offline/offlineQueue.ts`
- [x] Downloads and export. **Web** · `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- [x] Browser capability detection. **Web** · `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`
- [x] Unsupported-browser explanation. **Web** · `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`
- [x] Public share and preview experiences. **Web** · `apps/web/app/share/[token]/page.tsx`, `apps/web/app/shared-artifact/[token]/page.tsx`

Section tally: 18 of 20 checked; 1 partial; 1 not found.

## 70. Desktop application

- [x] Native application shell. **Desktop** · `apps/desktop/electron/main.ts`
- [x] System menu integration. **Desktop** · `apps/desktop/electron/appMenu.ts`
- [x] Tray/menu-bar integration. **Desktop** · `apps/desktop/electron/tray.ts`
- [ ] Dock/taskbar behavior. **Not found.**
- [x] Global shortcut. **Desktop** · `apps/desktop/electron/shortcuts.ts`
- [x] Quick composer. **Desktop** · `apps/desktop/electron/quickAsk.ts`
- [x] Companion window. **Desktop** · `apps/desktop/electron/quickAsk.ts`
- [x] Always-on-top option. **Desktop** · `apps/desktop/src/features/layout/TitleBar.tsx`, `apps/desktop/src/stores/windowStore.ts`
- [x] Multiple windows. **Desktop** · `apps/desktop/electron/windowRegistry.ts`
- [ ] Detachable panels. **Not found.**
- [x] Native file picker. **Desktop** · `apps/desktop/electron/main.ts`
- [x] Persistent folder access. **Desktop** · `apps/desktop/electron/runtime/workspaceStore.ts`
- [x] Local filesystem search. **Desktop** · `apps/desktop/electron/runtime/filesystemService.ts`
- [x] Local filesystem editing. **Desktop** · `apps/desktop/electron/runtime/filesystemService.ts`
- [x] Local shell execution. **Desktop** · `apps/desktop/electron/runtime/shellService.ts`
- [x] Local agent daemon. **Desktop** · `apps/desktop/electron/browser/bridgeServer.ts`
- [x] Local MCP servers. **Desktop** · `apps/desktop/src/stores/mcp/mcpServersStore.ts`
- [x] Native application context. **Desktop** · `apps/desktop/electron/runtime/appsService.ts`
- [x] Screen/window capture. **Desktop** · `apps/desktop/electron/screenshot.ts`
- [ ] Cross-application dictation. **Partial:** global shortcut wakes AGI's own composer's dictation from any app, not typed into other apps · `apps/desktop/electron/voiceDictation.ts`
- [x] Computer use. **Desktop** · `apps/desktop/electron/runtime/computerUseLoop.ts`
- [x] Remote-host service. **Desktop** · `apps/desktop/electron/remote/remoteControlHost.ts`
- [x] Local model management where offered. **Desktop** · `apps/desktop/electron/runtime/localInferenceService.ts`, `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx`
- [x] Launch at login. **Desktop** · `apps/desktop/electron/launchAtLogin.ts`
- [ ] Background-runtime controls. **Partial:** app stays alive in the tray on macOS by default; no user-facing background-runtime toggle found · `apps/desktop/electron/main.ts`
- [ ] Automatic updates. **Partial:** "Check for Updates" compares versions and opens an external download page, not a silent auto-install · `apps/desktop/electron/desktopCloudUpdate.ts`
- [ ] Update-channel selection. **Not found.**
- [x] Diagnostic export. **Desktop** · `apps/desktop/src/features/feedback/FeedbackDialog.tsx`
- [x] Local cache/storage management. **Desktop** · `apps/desktop/src/features/settings/CacheManagement.tsx`
- [x] Native deep links. **Desktop** · `apps/desktop/electron/main.ts`
- [x] OS-specific privacy settings. **Desktop** · `apps/desktop/electron/permissionPolicy.ts`
- [ ] Sleep/wake and lock-state behavior. **Not found.**

Section tally: 25 of 32 checked; 3 partial; 4 not found.

## 71. Mobile application

- [x] Native navigation. **Mobile** · `apps/mobile/app/(app)/_layout.tsx`
- [x] Compact composer. **Mobile** · `apps/mobile/src/features/chat/components/Composer/Composer.tsx`
- [x] Keyboard-aware layout. **Mobile** · `apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts`
- [x] Touch message actions. **Mobile** · `apps/mobile/src/features/chat/components/MessageBubble.tsx`
- [x] Long-press menus. **Mobile** · `apps/mobile/src/features/chat/components/MessageBubble.tsx`
- [x] Camera intake. **Mobile** · `apps/mobile/app/(app)/camera.tsx`
- [x] Photo-picker intake. **Mobile** · `apps/mobile/app.config.js`
- [x] File-provider intake. **Mobile** · `apps/mobile/app.config.js`
- [x] Share-sheet intake. **Mobile** · `apps/mobile/native/ios/withAGIShareExtension.cjs`, `apps/mobile/native/android/withAGIShareIntent.cjs`
- [x] Voice conversation. **Mobile** · `apps/mobile/app/(app)/voice.tsx`
- [x] Audio-route controls. **Mobile** · `apps/mobile/src/features/voice/components/AudioRoutePicker.tsx`
- [x] Push notifications. **Mobile** · `apps/mobile/services/notifications.ts`
- [x] Notification deep links. **Mobile** · `apps/mobile/services/notifications.ts`
- [ ] Quick reply to agent questions. **Not found.**
- [x] Remote action approval. **Mobile** · `apps/mobile/src/shared/components/ApprovalModal.tsx`
- [x] Remote coding review. **Mobile** · `apps/mobile/src/features/companion/components/CodeSessionView.tsx`
- [x] Cloud-task initiation. **Mobile** · `apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx`, `apps/mobile/app/(app)/tasks.tsx`
- [x] Background upload recovery. **Mobile** · `apps/mobile/src/features/chat/upload/uploadLifecycle.ts`
- [x] Conversation restoration after process death. **Mobile** · `apps/mobile/stores/chat/chatMessageStore.ts`
- [ ] Home-screen widgets. **Not found.**
- [ ] Lock-screen widgets where supported. **Not found.**
- [ ] Live activity where supported. **Not found.**
- [x] System shortcuts/App Intents. **Mobile** · `apps/mobile/src/features/widget-setup/index.tsx`, `apps/mobile/app.config.js`
- [ ] Default-assistant integration where supported. **Not found.**
- [x] Tablet layout. **Mobile** · `apps/mobile/src/shared/hooks/useTabletLayout.ts`
- [ ] Foldable adaptation. **Not found.**
- [ ] Landscape adaptation. **Partial:** layout code sizes for iPad Split View landscape, but `app.config.js` locks device orientation to portrait · `apps/mobile/app.config.js`
- [x] Offline data management. **Mobile** · `apps/mobile/services/offlineQueue.ts`
- [x] Cellular-data preferences. **Mobile** · `apps/mobile/src/features/model-picker/installStore.ts`
- [x] Local inference where intentionally implemented. **Mobile** · `apps/mobile/app.config.js`
- [x] App-store purchase and restoration. **Mobile** · `apps/mobile/src/features/billing/useMobileIap.ts`
- [x] Mobile-specific privacy controls. **Mobile** · `apps/mobile/app/(app)/settings/cloud-privacy.tsx`

Section tally: 25 of 32 checked; 1 partial; 6 not found.

## 72. CLI and terminal application

- [x] Interactive terminal UI. **CLI** · `apps/cli/src/tui/tui_app.rs`
- [x] Linear accessible output mode. **CLI** · `apps/cli/src/lib.rs`
- [x] Headless/noninteractive mode. **CLI** · `apps/cli/src/lib.rs`
- [x] Standard input support. **CLI** · `apps/cli/src/lib.rs`
- [x] Piped input. **CLI** · `apps/cli/src/lib.rs`
- [x] Plain-text output. **CLI** · `apps/cli/src/lib.rs`
- [x] Structured JSON output. **CLI** · `apps/cli/src/lib.rs`
- [x] Streaming JSON events. **CLI** · `apps/cli/src/sdk_io/mod.rs`
- [x] Exit-code contract. **CLI** · `apps/cli/src/main.rs`
- [x] Authentication commands. **CLI** · `apps/cli/src/auth.rs`, `apps/cli/src/oauth.rs`
- [x] Session list. **CLI** · `apps/cli/src/sessions.rs`
- [x] Resume command. **CLI** · `apps/cli/src/lib.rs`
- [x] Branch command. **CLI** · `apps/cli/src/lib.rs`
- [x] Model command. **CLI** · `apps/cli/src/lib.rs`
- [x] Effort command. **CLI** · `apps/cli/src/lib.rs`
- [x] Permission command. **CLI** · `apps/cli/src/permissions.rs`
- [x] Context command. **CLI** · `apps/cli/src/context.rs`
- [x] Usage command. **CLI** · `apps/cli/src/usage_summary.rs`
- [x] Compact-context command. **CLI** · `apps/cli/src/compaction.rs`
- [x] Tool/MCP commands. **CLI** · `apps/cli/src/lib.rs`
- [x] Skill/Plugin commands. **CLI** · `apps/cli/src/skills.rs`
- [x] Repository/folder selection. **CLI** · `apps/cli/src/project_registry.rs`, `apps/cli/src/project_scope.rs`
- [x] File mentions. **CLI** · `apps/cli/src/mentions.rs`
- [x] Prompt history. **CLI** · `apps/cli/src/repl/mod.rs`
- [x] Keyboard shortcuts. **CLI** · `apps/cli/src/keybindings.rs`
- [x] Shell completion. **CLI** · `apps/cli/src/lib.rs`
- [x] Theme selection. **CLI** · `apps/cli/src/tui/widgets/theme_picker.rs`
- [x] No-color mode. **CLI** · `apps/cli/src/output.rs`
- [x] Terminal resize handling. **CLI** · `apps/cli/src/tui/tui_app.rs`
- [x] Remote-session attachment. **CLI** · `apps/cli/src/app_server/developer_host.rs`
- [x] Background-task management. **CLI** · `apps/cli/src/daemon.rs`
- [x] Export transcript. **CLI** · `apps/cli/src/conversations.rs`
- [x] Configuration-file support. **CLI** · `apps/cli/src/config.rs`
- [x] Environment-variable support. **CLI** · `apps/cli/src/lib.rs`
- [ ] Installer and updater. **Partial:** `agi update --install` runs, but code notes it can fail since no release yet carries a signed manifest · `apps/cli/src/lib.rs`
- [x] Diagnostics command. **CLI** · `apps/cli/src/doctor.rs`
- [x] CI/scripting integration. **CLI** · `apps/cli/src/lib.rs`

Section tally: 36 of 37 checked; 1 partial; 0 not found.

## 73. VS Code and IDE extension

- [x] Sidebar chat view. **VS Code** · `apps/extension-vscode/package.json`
- [x] Editor-adjacent chat. **VS Code** · `apps/extension-vscode/package.json`
- [x] Session picker. **VS Code** · `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts`
- [x] Repository/workspace association. **VS Code** · `apps/extension-vscode/src/data/projectInstructions.ts`
- [x] Active-file context. **VS Code** · `apps/extension-vscode/src/data/contextBuilder.ts`
- [x] Selected-code context. **VS Code** · `apps/extension-vscode/src/data/contextBuilder.ts`
- [x] Unsaved-buffer context. **VS Code** · `apps/extension-vscode/src/data/contextBuilder.ts`
- [x] File mentions. **VS Code** · `apps/extension-vscode/src/data/mentionSearch.ts`
- [x] Symbol mentions. **VS Code** · `apps/extension-vscode/src/data/mentionSearch.ts`, `apps/extension-vscode/src/data/workspaceIndexer.ts`
- [x] Diagnostics context. **VS Code** · `apps/extension-vscode/src/providers/diagnosticsProvider.ts`
- [x] Inline suggestions. **VS Code** · `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`
- [x] Inline edits. **VS Code** · `apps/extension-vscode/package.json`
- [x] Native diff review. **VS Code** · `apps/extension-vscode/src/providers/diffDecorationProvider.ts`
- [x] Hunk acceptance. **VS Code** · `apps/extension-vscode/src/providers/diffDecorationProvider.ts`
- [x] Apply patch. **VS Code** · `apps/extension-vscode/src/integrations/patchEngine.ts`
- [x] Terminal integration. **VS Code** · `apps/extension-vscode/src/providers/terminalProvider.ts`
- [x] Command-palette actions. **VS Code** · `apps/extension-vscode/package.json`
- [x] Keyboard bindings. **VS Code** · `apps/extension-vscode/package.json`
- [x] Status-bar indicators. **VS Code** · `apps/extension-vscode/src/core/statusBar.ts`
- [x] Model and permission controls. **VS Code** · `apps/extension-vscode/package.json`
- [x] Task and approval notifications. **VS Code** · `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts`
- [x] Project instructions. **VS Code** · `apps/extension-vscode/src/data/projectInstructions.ts`
- [x] MCP/Skill/Plugin settings. **VS Code** · `apps/extension-vscode/src/features/surfaces/cliCapabilities.ts`
- [x] Shared session with CLI/desktop. **VS Code** · `apps/extension-vscode/src/integrations/developerSessionHandoff.ts`
- [x] Remote workspace support. **VS Code** · `apps/extension-vscode/src/platform/remoteEnvironment.ts`
- [x] Container/WSL support where offered. **VS Code** · `apps/extension-vscode/src/platform/remoteEnvironment.ts`
- [x] Workspace-trust experience. **VS Code** · `apps/extension-vscode/src/platform/config.ts`
- [x] Webview error and loading states. **VS Code** · `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`
- [ ] Extension update flow. **Partial:** a first-run "Getting Started" walkthrough exists; nothing detects a version change or shows what's new · `apps/extension-vscode/package.json`
- [ ] IDE-version compatibility messaging. **Partial:** `engines.vscode` blocks install on too-old VS Code; no runtime message telling a user to upgrade · `apps/extension-vscode/package.json`

Section tally: 28 of 30 checked; 2 partial; 0 not found.

## 74. Browser extension

- [x] Toolbar action. **Chrome** · `apps/extension/manifest.json`
- [ ] Popup interface. **Not found.**
- [x] Side panel. **Chrome** · `apps/extension/manifest.json`
- [x] Selection context menu. **Chrome** · `apps/extension/src/background.ts`
- [x] Ask about selected text. **Chrome** · `apps/extension/src/background.ts`
- [x] Ask about current page. **Chrome** · `apps/extension/src/side_panel.ts`
- [x] Summarize current page. **Chrome** · `apps/extension/src/background.ts`
- [ ] Ask about a video. **Not found.**
- [ ] Tab context picker. **Not found.**
- [ ] Multi-tab comparison. **Not found.**
- [ ] Multiple side conversations. **Partial:** conversation history lets you switch chats one at a time; no simultaneous multi-conversation view found · `apps/extension/src/features/background/conversation-history.ts`
- [x] Page-context chips. **Chrome** · `apps/extension/src/side_panel.ts`
- [x] Explicit site-access request. **Chrome** · `apps/extension/src/features/computer-use/browserControlConsent.ts`
- [x] Per-site permission settings. **Chrome** · `apps/extension/src/features/site-policy/store.ts`
- [x] Agent action indicator. **Chrome** · `apps/extension/src/features/computer-use/describeAction.ts`
- [x] Browser-control mode. **Chrome** · `apps/extension/src/features/computer-use/cdpDriver.ts`
- [x] Stop/takeover control. **Chrome** · `apps/extension/src/features/computer-use/agentLoop.ts`
- [x] Desktop-app pairing. **Chrome** · `apps/extension/src/background.ts`
- [x] Native-host connection status. **Chrome** · `apps/extension/src/background.ts`
- [ ] Account/workspace switching. **Partial:** cloud sync validates a workspace binding and blocks on mismatch; no account/workspace switcher UI found · `apps/extension/src/features/cloud-bridge/conversationSync.ts`
- [x] Voice entry where supported. **Chrome** · `apps/extension/src/features/side-panel/voice.ts`
- [ ] Page-to-Project saving. **Not found.**
- [ ] Page-to-Library saving. **Not found.**
- [ ] Extension update notice. **Not found.**
- [x] Unsupported-page explanation. **Chrome** · `apps/extension/src/features/side-panel/surface-policy.ts`
- [ ] Private/incognito controls. **Partial:** manifest sets `incognito: "not_allowed"`, disabling it outright; no in-extension incognito settings found · `apps/extension/manifest.json`
- [ ] Browser-specific feature differences. **Partial:** code comments flag Chrome/Firefox API gaps; extension ships Chrome/Chromium MV3 only, no Firefox build · `apps/extension/src/background.ts`
- [x] Recovery after background-worker suspension. **Chrome** · `apps/extension/src/background.ts`

Section tally: 17 of 28 checked; 4 partial; 7 not found.

## 75. Platform capability differences to represent explicitly

| Capability            | Web                                                    | Desktop                                                           | Mobile                                                                 | CLI/IDE                                               | Browser extension                                                 | This repository                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local file access** | User-selected browser access or upload.                | Broader granted folders and filesystem operations.                | System pickers and application sandbox.                                | Workspace/filesystem access under execution policy.   | Page context; local files usually require a bridge.               | Web uploads/drag-drop only; desktop grants persistent folder access and fs search/edit; mobile uses OS pickers; CLI runs under a path/sandbox policy. `apps/desktop/electron/runtime/workspaceStore.ts`     |
| **Shell execution**   | Hosted sandbox or paired host.                         | Local or isolated runtime.                                        | Usually cloud or paired host.                                          | Local, remote, container, or cloud runtime.           | Usually a paired runtime, not direct unrestricted shell access.   | Desktop runs local shell commands directly; CLI executes under a Rust sandbox/exec policy; web/mobile have no direct shell, only gated E2B cloud sandboxes. `apps/desktop/electron/runtime/shellService.ts` |
| **Background work**   | Durable server work can continue after the tab closes. | Depends on whether the UI, daemon, host, or cloud owns execution. | Cloud work can continue; native background activity is OS-constrained. | Process/daemon/cloud ownership determines continuity. | Service-worker lifetime is not a durable task runtime.            | The CLI runs a cron/webhook/file-watcher daemon; desktop's Electron process keeps a loopback bridge server alive; web relies on server-persisted state, not a cache. `apps/cli/src/daemon.rs`               |
| **Computer control**  | Cloud computer or authorized paired host.              | Native host integrations where implemented.                       | Remote control or limited approved device integrations.                | Tool/daemon integrations.                             | Browser actions, with separate native-host access if implemented. | Chrome drives tabs via a CDP driver; desktop has a native BrowserExecutor and remote-control host; a shared browser-tool package exists but is unused. `packages/tools/browser-tool/README.md`              |
| **Artifact editing**  | Usually the broadest browser editing surface.          | Similar plus native file/app integration.                         | Often adapted to touch and smaller screens.                            | Source-oriented manipulation and external preview.    | Narrow embedded preview or full-app handoff.                      | Web has the fullest artifact/canvas editor; desktop shares it via unified-chat; mobile has its own artifacts screen; CLI/IDE stay source-oriented. `packages/ui/unified-chat/src/index.ts`                  |
| **Voice**             | Browser media permissions and realtime transport.      | Native audio integration and global invocation.                   | Strong native voice/camera integration.                                | Optional companion or remote voice surface.           | Optional browser media capture and side-panel experience.         | Web and mobile use native getUserMedia/WebRTC for live voice; desktop adds global-shortcut dictation; CLI has its own push-to-talk Whisper capture; extension has dictation. `apps/cli/src/voice.rs`        |

This is a **design capability matrix**, not a statement that every named competitor ships every cell.

---

# J. Model capabilities and feature gating

## 76. Model-capability registry

- [x] Text input. **Shared** · `packages/ai/model-registry/generated/registry.ts` (INTRINSIC_CAPABILITY_NAMES `textInput`), `packages/ai/routing/src/auto.ts`
- [x] Text output. **Shared** · `packages/ai/model-registry/generated/registry.ts` (`textOutput`), `packages/ai/routing/src/auto.ts`
- [x] Image understanding. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts`, `packages/ui/unified-chat/src/lib/modelPicker.ts`
- [ ] Multiple-image input. **Not found.**
- [ ] High-resolution image inspection. **Not found.**
- [ ] Native PDF/document input. **Partial:** `pdf` recorded in curation `inputModalities` but attachments gate on the shared vision flag, no distinct field · `packages/ai/model-registry/catalog/models.curation.json`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Audio understanding. **Web** · `packages/ui/unified-chat/src/lib/modelPicker.ts` (`audioInput` filter), `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [ ] Audio transcription. **Not found:** only free-text `bestFor` tags ("Transcription"), no schema field distinct from audioInput.
- [ ] Realtime audio input. **Partial:** `realtime` intrinsic field exists in the registry but the live-voice mode keys off `streaming` only · `packages/ai/model-registry/generated/registry.ts`, `packages/contracts/types/src/interaction-modes.json`
- [x] Speech output. **Web** · `packages/ui/unified-chat/src/lib/modelPicker.ts` (`audioOutput`), `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [ ] Realtime speech-to-speech. **Partial:** a real WebRTC live-voice session exists but isn't gated by the registry's `realtime` field · `apps/web/features/chat/lib/live-voice-session.ts`
- [ ] Video understanding. **Partial:** `videoInput` consumed only in the internal admin route-economics panel, not product gating · `apps/web/features/admin/components/RouteEconomicsPanel.tsx`
- [ ] Timestamped video processing. **Not found.**
- [x] Image generation. **Web** · `packages/ui/unified-chat/src/lib/modelPicker.ts` (`imageGen`), `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [x] Image editing. **Web** · `apps/web/lib/services/media-model-availability-service.ts` (`supports_edit`), `apps/web/features/chat/components/ImageGenerationCard.tsx`
- [ ] Multi-reference image editing. **Not found:** `ImageEditRequest` carries one `sourceImageBase64`, no multi-reference array · `apps/web/features/chat/lib/imageGenerationOptions.ts`
- [x] Video generation. **Web** · `packages/ui/unified-chat/src/lib/modelPicker.ts` (`videoGen`), `packages/ai/model-registry/catalog/models.curation.json`
- [ ] Video editing. **Not found.**
- [ ] Generated video audio. **Not found:** mentioned only in free-text pricing notes, no schema field.
- [ ] Music generation. **Not found.**
- [x] Function/tool calling. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts` (`metadata.capabilities.tools`)
- [ ] Parallel tool calls. **Partial:** real but a fixed app-wide constant, not a per-model registry field · `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
- [ ] Multi-round tool use. **Partial:** real multi-round tool loop exists app-wide, not modeled as a per-model capability · `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
- [ ] Structured JSON output. **Partial:** `structuredOutput`/`json` field is compiled and health-tracked, but no product feature reads it to gate a JSON-mode control · `apps/web/lib/services/free-lane/capability-health-service.ts`
- [ ] Schema-constrained output. **Not found:** `toolSchemaSupport` exists only inside the registry compiler/schema, no downstream consumer.
- [x] Reasoning-effort controls. **Web** · `packages/ui/unified-chat/src/lib/thinkingPolicy.ts`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Supported sampling parameters. **Shared** · `packages/ai/providers/anthropic/src/translate.ts` (`rejectsSamplingParameters` strips temperature/top_p/top_k)
- [x] Context-window limit. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts` (`contextBudgetTokens`)
- [x] Output-token limit. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts` (`maxOutputTokens` in `contextBudgetTokens`)
- [ ] Maximum file/image/audio/video sizes. **Not found:** as a per-model field: one flat app-wide byte cap applies to every model · `packages/contracts/cloud-contracts/src/chat-attachments.ts`
- [x] Streaming capabilities. **Shared** · `packages/contracts/types/src/interaction-modes.json` (`requiredModelCapabilities: ["streaming"]`)
- [x] Cache capabilities. **Shared** · `packages/ai/providers/anthropic/src/translate.ts` (`cache_control` breakpoints)
- [ ] Batch/deferred processing. **Not found:** `endpoints` records `v1/batch` per model but no code submits a batch job.
- [x] Regional route availability. **Shared** · `packages/ai/routing/src/auto.ts` (`residencyRegions`, `usOnly` policy)
- [x] Retention/data-use constraints. **Shared** · `packages/ai/routing/src/auto.ts` (`dataRetention`), `apps/web/lib/services/zero-data-retention-provider-overrides.ts`
- [ ] Serving-speed options. **Partial:** a `speed` value is compiled per model but the customer-facing catalogue entry omits it, no serving-speed selector · `apps/web/lib/server/model-catalogue.ts`
- [x] Model lifecycle and retirement. **Web** · `apps/web/features/models/lib/model-presentation.ts` (`retirementLabel`), `packages/ai/model-registry/catalog/models.curation.json` (retired-models.json)
- [x] Route-specific differences. **Shared** · `packages/ai/routing/src/auto.ts` (`admissibleModelRoutes`), `docs/generated/provider-capability-matrix.md`

Section tally: 19 of 38 checked; 8 partial; 11 not found.

## 77. Feature capability is not always native model capability

The gating decision should ask **whether an eligible implementation path exists**, not merely whether one selected language model has every required modality.

| Feature                | Possible implementation paths                                                  | UI consequence                                                                                                       | This repository                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ask about a PDF**    | Native document input; text extraction; OCR; page-image analysis; RAG.         | A text-only model can still answer from extracted text. Hide upload only when no permitted path can handle the file. | Composer gates PDF uploads on the model's vision flag; Projects runs separate text-extraction and OCR pipelines. `apps/web/lib/server/project-knowledge-extraction.ts`                      |
| **Ask about an image** | Native vision model; separate vision tool; explicit model switch.              | Show image understanding only through a real supported path; describe an explicit switch or limitation.              | Composer sends images only to vision-capable models, via a compatibility warning, not a separate tool or forced switch. `apps/web/features/chat/components/Composer/model-compatibility.ts` |
| **Dictation**          | Speech-to-text followed by ordinary text inference.                            | Dictation need not disappear when the selected language model lacks audio input.                                     | Browser speech-to-text transcribes locally, then sends plain text to whatever model is selected. `apps/web/features/chat/hooks/use-dictation.ts`                                            |
| **Live Voice**         | Native speech-to-speech or a composed transcription/text/speech pipeline.      | Available controls and latency depend on the chosen voice architecture.                                              | Native WebRTC realtime session; the interaction mode requires only `streaming`, not a distinct realtime flag. `apps/web/features/chat/lib/live-voice-session.ts`                            |
| **Image generation**   | Native multimodal generation or a separate image-generation tool.              | A text model can coordinate image creation without producing image pixels itself.                                    | Local heuristics classify generation requests and route them to a dedicated image model regardless of the chat model. `packages/ai/routing/src/classify.ts`                                 |
| **Image editing**      | An editing-capable model/tool plus an actual source image.                     | Generation support alone is insufficient for an Edit button.                                                         | Edit control appears only when `supports_edit` is true for the model and a source image exists. `apps/web/features/chat/components/ImageGenerationCard.tsx`                                 |
| **Code execution**     | Model produces code; an authorized runtime executes it.                        | Execution is gated by the runtime, tool interface, permissions, and tier, not simply "coding intelligence."          | Cloud sandbox executes model-produced code, gated by plan tier and an explicit tool toggle. `apps/web/lib/e2b/execution-tools.ts`                                                           |
| **Web search**         | Native hosted search or external search/fetch tools.                           | Search may remain available across several models through an orchestration layer.                                    | Both a native hosted-search harness flag and an external search/fetch tool are wired. `apps/web/lib/web-search/web-search-tool.ts`                                                          |
| **Research**           | Planning model, search/retrieval tools, evidence store, and report generation. | Research is a product workflow, not synonymous with a "Thinking" model.                                              | Deep Research is its own interaction mode with planning, search and report generation, independent of one model. `apps/web/features/chat/components/research/ResearchPanel.tsx`             |
| **Video generation**   | Separate asynchronous media service, possibly coordinated by a text model.     | Video settings come from the video route, not the chat model.                                                        | Separate async media route (its own settings/pricing) distinct from the conversation's chat model. `packages/ai/model-registry/catalog/models.curation.json`                                |
| **Local shell**        | Local executor, remote host, or cloud sandbox.                                 | Show execution location and required permission.                                                                     | CLI runs a locally sandboxed bash tool; web instead uses a cloud sandbox, no user-chosen remote host. `apps/cli/src/sandbox.rs`                                                             |
| **Long context**       | Native context capacity, retrieval, summarization, or compaction.              | A paid tier cannot make an unsupported native context window larger; alternative handling must be explicit.          | Native window enforces a token budget with explicit trimming; a separate engine assembles retrieval-based context. `packages/platform/context-engine/src/engine.ts`                         |

## 78. UI gating and adaptation components

- [x] Feature-availability resolver. **Web** · `apps/web/lib/services/capability-handshake-service.ts` (server), consumed via `disabled_features` in `apps/web/features/chat/hooks/use-dictation.ts`
- [x] Model-dependent composer controls. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts`
- [x] Model-dependent accepted-file types. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Model-dependent reasoning options. **Web** · `packages/ui/unified-chat/src/lib/thinkingPolicy.ts`
- [x] Model-dependent sampling options. **Shared** · `packages/ai/providers/anthropic/src/translate.ts` (drops temp/top_p/top_k per model)
- [x] Model-dependent media settings. **Web** · `apps/web/features/chat/lib/imageGenerationOptions.ts` (`normalizeImageAspectRatioForModel`)
- [x] Tier-dependent entitlement checks. **Web** · `apps/web/lib/services/entitlement-resolution.ts`
- [x] Tier-dependent remaining allowance. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Workspace-policy restrictions. **Web** · `apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx`
- [ ] Role restrictions. **Partial:** org roles (owner/admin/member) exist and gate console settings, no confirmed model/composer gate by role · `apps/web/features/workspace-console/components/WorkspaceRoles.tsx`
- [x] Regional restrictions. **Web** · `apps/web/lib/server/data-region.ts`
- [ ] Age or account eligibility restrictions. **Partial:** mobile has a self-declared age gate; the repo's own trust page states web has none · `apps/mobile/app/(public)/age-gate.tsx`
- [x] Required-connection detection. **Web** · `apps/web/features/chat/components/messages/ToolTimeline.tsx` (`findConnectRequest`)
- [x] Required-device detection. **Web** · `apps/web/features/models/lib/model-presentation.ts` (`requiresEnvironment`/`environmentLock`)
- [x] Required-runtime detection. **Web** · `apps/web/features/models/lib/model-presentation.ts` (same `requiresEnvironment` check)
- [x] Unsupported versus temporarily unavailable distinction. **Web** · `apps/web/features/models/lib/model-presentation.ts` (`statusLabel`: "Coming soon" vs "Temporarily unavailable")
- [x] Hidden irrelevant controls. **Web** · `apps/web/features/chat/components/Composer/ComposerFooter.tsx` (`hasEffortControl` conditional render)
- [x] Disabled but discoverable restricted controls. **Web** · `apps/web/lib/server/model-catalogue.ts` (`admitted`/`temporarilyUnavailable`), `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Upgrade explanation. **Web** · `apps/web/features/models/lib/model-presentation.ts` (`accessLabel`: "X plan and above")
- [x] Connect-account explanation. **Web** · `apps/web/features/chat/components/messages/ToolTimeline.tsx` (`ConnectorConnectCard`, "Connection required: X")
- [x] Grant-permission explanation. **Web** · `packages/ui/unified-chat/src/lib/connectorPermissionStore.ts`
- [x] Use-another-model explanation. **Web** · `apps/web/features/chat/components/Composer/model-compatibility.ts` (no_vision/no_tools findings), "Use Free Auto" copy in `ChatComposerNew.tsx`
- [x] Continue-on-another-device action. **Web, Desktop, Mobile** · `apps/web/features/desktop-host/components/RemoteControlSection.tsx`, `apps/desktop/electron/remote/remoteControlHost.ts`
- [x] Explicit processing-path selection. **Desktop** · `apps/desktop/src/stores/appModeStore.ts` (local vs cloud mode)
- [ ] Attachment-preservation choice after model change. **Partial:** composer warns that history attachments won't be sent, no toggle to keep or drop them · `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Unsupported-parameter removal or correction. **Shared** · `packages/ai/providers/anthropic/src/translate.ts`
- [ ] Effective-capability inspector. **Partial:** a real `EffectiveCapabilityDocument` handshake is built and served on `/api/me`, but no client reads `capability_handshake` to display it · `packages/contracts/types/src/capability-handshake/registry.ts`, `apps/web/app/api/me/route.ts`
- [ ] Live updates after a plan, policy, connection, or device change. **Partial:** refetches `/api/me` after the user's own upgrade/preference action; no cross-tab/cross-device push · `apps/web/shared/stores/web-auth-store.ts`, `apps/web/app/billing/UpgradeWelcome.tsx`

Section tally: 23 of 28 checked; 5 partial; 0 not found.

## 79. Routing and model-neutral orchestration

- [x] Automatic model selection. **Shared** · `packages/ai/routing/src/auto.ts` (`resolveAutoRoute`)
- [x] User-selected model. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/web/features/chat/components/Composer/ModelCatalogue.tsx`
- [x] Project default model. **Web** · `apps/web/features/projects/services/managed-cloud-projects.ts` (`defaultModelId`)
- [x] Task-specific model profile. **Shared** · `packages/ai/routing/src/profiles/index.ts` (`taskFamilies` per named profile)
- [x] Speed-first profile. **Shared** · `packages/ai/routing/src/profiles/index.ts` (`Instant`, latency weight 0.5)
- [x] Quality-first profile. **Shared** · `packages/ai/routing/src/profiles/index.ts` (`High`, quality weight 0.7)
- [x] Cost-first profile. **Web** · "Free Auto" mode · `packages/ai/routing/src/free-auto.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- [x] Privacy-first profile. **Desktop** · `apps/desktop/src/stores/appModeStore.ts` (local-only mode)
- [x] Classification of task intent. **Shared** · `packages/ai/routing/src/classify.ts`
- [ ] Classification of required tools. **Partial:** classifier detects agentic/computer-use intent but tool need is otherwise supplied by the caller, not classified · `packages/ai/routing/src/classify.ts`
- [x] Classification of required modalities. **Shared** · `packages/ai/routing/src/classify.ts` (attachment mime detection → `multimodal`)
- [ ] Complexity/effort classification. **Partial:** task-type routing (reasoning/coding) picks a quality band, but the reasoning-effort level itself is user-selected, not auto-scored · `packages/ai/routing/src/profiles/index.ts`
- [x] Source-freshness classification. **Shared** · `packages/ai/routing/src/classify.ts` (`RE_RESEARCH` recency regex)
- [x] Model eligibility filtering. **Shared** · `packages/ai/routing/src/auto.ts` (capability/tier/region admission)
- [x] Provider-route selection. **Shared** · `packages/ai/routing/src/auto.ts` (`admissibleModelRoutes`)
- [x] Exact-model lock. **Shared** · `packages/ai/routing/src/auto.ts` (same-model cross-provider fallback)
- [x] Provider lock. **Shared** · `packages/ai/routing/src/auto.ts` (`excludedProviders`)
- [x] Route lock. **Shared** · `packages/ai/routing/src/auto.ts` (`excludedRouteHosts`)
- [x] Quota-aware selection. **Shared** · `packages/ai/routing/src/rate-limits.ts`
- [x] Health-aware fallback. **Shared** · `packages/ai/routing/src/route-health-store.ts`
- [x] Explicit model-switch offer. **Web** · `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` ("Use Free Auto"/"Use Auto")
- [x] Advisor escalation. **CLI** · `apps/cli/src/platform/runtime/advisor.rs`
- [x] Specialist worker selection. **Shared** · `packages/ai/agent-core/src/candidate-decisions.ts`
- [x] Multi-model comparison. **Web** · `apps/web/features/models/components/ModelCompareTable.tsx`
- [x] Confidence-based abstention. **Shared** · `packages/ai/agent-core/src/candidate-decisions.ts` (`low_confidence` fallback)
- [x] User-visible routing explanation. **Web** · `apps/web/lib/chat-fallback-reason.ts`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- [x] Actual-model attribution. **Web** · `apps/web/lib/chat-fallback-reason.ts` (`servedModel` vs `requestedModel`)
- [x] Routing-policy versioning. **Shared** · `packages/ai/routing/src/promotion/release-ledger.ts`
- [x] Classification adapter, including Jev if chosen. **Shared** · `packages/ai/routing/src/classify.ts` (Jev itself is doc-only, `docs/specs/jev-auto-routing`, not implemented in code)
- [ ] Classification failure fallback. **Partial:** classifier always degrades to a `general` catch-all; classification is purely local/heuristic so no external-classifier failure path exists · `packages/ai/routing/src/classify.ts`
- [x] Routing evaluation dashboard. **Web** · `apps/web/features/admin/components/RoutingHealthPanel.tsx`

Jev belongs here as an optional implementation choice; it should not be presented as a verified component used by these competitors.

Section tally: 28 of 31 checked; 3 partial; 0 not found.

---

# K. Subscription, usage, billing, and commercial product

## 80. What can vary by tier

These are **independent commercial dimensions**, not a rule that every limit increases together.

| Dimension             | Examples of tier differentiation                                                             | This repository                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model access**      | Available families, specialist models, premium reasoning models, preview access.             | Differentiates via `TIER_POLICIES.allowedSlots`/`manualModelSelection` (free/pro/max/enterprise) enforced by `canAccessModel` in `packages/contracts/types/src/model-catalog.ts`. |
| **Overall allowance** | Message counts, weighted compute, credits, or a combination.                                 | Per-tier monthly token caps plus rolling 5-hour/weekly/monthly credit buckets in `apps/web/lib/billing/managed-usage-caps.ts`.                                                    |
| **Reasoning**         | Available effort levels, maximum per-task spend, premium serving modes.                      | `splitEffortsByEntitlement`/`clampEffortToEntitlement` cap effort above default for tiers lacking manual selection, `packages/contracts/types/src/model-catalog.ts`.              |
| **Context handling**  | Allowed request budget, attached-source count, retrieval scope, compaction features.         | Trim/compaction budget follows the selected model's context window, not the plan tier, `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts`.                          |
| **Uploads**           | Per-file size, files per prompt, cumulative uploads, processing allowance.                   | Flat global `MAX_ATTACHMENT_BYTES` (25MB) for every tier; not tier-differentiated, `packages/contracts/types/src/chat.ts`.                                                        |
| **Storage**           | Total storage, Project storage, generated-media retention, version retention.                | `knowledgeStorageBytes` scales 100MB (free) to unlimited (Max), `packages/contracts/types/src/billing-catalog.ts`.                                                                |
| **Images**            | Generation allowance, quality, resolution, batch count, editing access.                      | Gated to Pro+ via `canUseBillingPlanCapability(tier,'image_generation')`, `apps/web/app/api/media/image/generate/route.ts`.                                                       |
| **Video**             | Generation allowance, duration, resolution, priority, simultaneous jobs.                     | Gated to Max 15x/Enterprise only, with `videoSecondsPerMonth` metering, `apps/web/app/api/media/video/generate/route.ts`.                                                         |
| **Voice**             | Minutes or compute allowance, premium voices, background use, visual context.                | `voiceMinutesPerMonth` differs per tier (30 free, 300 Pro, unlimited Max), `apps/web/lib/services/tier-unit-quota-service.ts`.                                                    |
| **Research**          | Research allowance, depth, concurrency, source integrations, export options.                 | `allowDeepResearch` boolean gate: off on Free/Pro, on for Max/Enterprise, `packages/contracts/types/src/model-catalog.ts`.                                                        |
| **Code execution**    | Compute time, memory, persistent environments, simultaneous sandboxes.                       | `codeHarnessDailyCeilingCents` scales 0 (free) to 7500 (Max 15x), custom for Enterprise, `packages/contracts/types/src/billing-catalog.ts`.                                       |
| **Agent work**        | Task budget, duration, concurrency, schedules, parallel agents.                              | `maxConcurrentTurns`/`maxSandboxes`/`maxScheduledTasks` scale per tier, `packages/contracts/types/src/billing-catalog.ts`.                                                        |
| **Integrations**      | Available connectors, custom connections, private-network access, organizational management. | `maxConnectorTools`/`customMcpServers`/`allowMCP` scale per tier (25 to 500+), `packages/contracts/types/src/billing-catalog.ts`.                                                 |
| **Customization**     | Skill creation, Plugin creation, private marketplaces, custom assistants.                    | Only custom-MCP-server count differs per tier; no skill/plugin-creation or marketplace tiering found.                                                                             |
| **Collaboration**     | Shared Projects, members, roles, guest access, publishing controls.                          | `projects` count scales per tier; seat purchase and admin roles gated to Team/Enterprise, `apps/web/app/api/settings/team/team-admin-access.ts`.                                  |
| **Service quality**   | Queue priority, concurrency, capacity reservations, support level.                           | Only `maxConcurrentTurns` (concurrency) scales per tier; no queue-priority/support-tier field found, `packages/contracts/types/src/billing-catalog.ts`.                           |
| **Governance**        | SSO, provisioning, retention, residency, audit, customer-managed keys.                       | SSO/SCIM gated to Team/Enterprise via `enterprise_controls` capability, `apps/web/lib/server/sso/sso-access.ts`.                                                                  |
| **Developer access**  | API entitlements, programmatic budgets, service accounts, admin APIs.                        | `managed_api`/`developer_surfaces` capabilities restricted to Pro+ tiers, `packages/contracts/types/src/billing-catalog.ts`.                                                      |

Modern offerings do not all use simple message counts. For example, Grok documents a shared compute-based allowance across product areas, and Gemini Notebook describes compute-sensitive limits influenced by task and source complexity.

## 81. Free / Basic / Pro / Max 5x / Max 15x planning structure

- [x] Versioned plan catalog. **Server** · `packages/contracts/types/src/billing-plan-catalog.ts`
- [x] Free-plan feature bundle. **Server** · `packages/contracts/types/src/model-catalog.ts`
- [x] Basic-plan feature bundle. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [x] Pro-plan feature bundle. **Server** · `packages/contracts/types/src/model-catalog.ts`
- [x] Max 5x feature bundle. **Server** · `packages/contracts/types/src/model-catalog.ts`
- [x] Max 15x feature bundle. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [x] Explicit definition of the baseline behind “5x” and “15x.” **Web** · `apps/web/lib/billing/managed-usage-caps.ts`
- [x] Explicit identification of the allowance being multiplied. **Web** · `apps/web/lib/billing/managed-usage-caps.ts` [, `apps/web/features/settings/sections/BillingSection.tsx`]
- [x] Separate feature-access differences. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [ ] Separate upload-size limits. **Not found.**
- [x] Separate storage limits. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [ ] Separate context limits. **Partial:** window follows model, not plan tier · `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts`
- [x] Separate concurrency limits. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [x] Separate generation settings. **Server** · `packages/contracts/types/src/model-catalog.ts`
- [x] Separate per-model caps. **Server** · `packages/contracts/types/src/model-catalog.ts`
- [x] Shared versus dedicated usage pools. **Server** · `apps/web/lib/services/free-lane/runtime-state-service.ts`
- [x] Monthly and annual billing choices. **Web** · `apps/web/app/pricing/page.tsx`
- [ ] Trial entitlements. **Partial:** `trialDays`/checkout trial wiring exists, no plan sets one · `apps/web/app/api/checkout/route.ts`
- [x] Promotional entitlements. **Web, Server** · `apps/web/app/api/claim-offer/route.ts`
- [x] Purchased credit balances. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Optional overage. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Grandfathered plan versions. **Server** · `packages/contracts/types/src/billing-plan-catalog.ts`
- [x] Upgrade effective time. **Server** · `apps/web/lib/server/stripe-plan-change.ts`
- [ ] Downgrade effective time. **Partial:** routed to Stripe portal, no in-app timing rule · `apps/web/lib/server/stripe-plan-change.ts`
- [x] Grace-period behavior. **Server** · `apps/web/app/api/cron/enforce-billing-collection/route.ts`
- [x] API/programmatic use treated explicitly. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [x] Cross-platform entitlement sharing. **Server** · `packages/contracts/types/src/billing-catalog.ts`
- [x] Plan-specific feature explanations. **Web** · `apps/web/features/billing/lib/plan-display.ts`

Section tally: 24 of 28 checked; 3 partial; 1 not found.

## 82. Usage dashboard and limit UI

- [x] Current plan. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Billing period. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Overall usage meter. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Per-model usage. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Per-feature usage. **Web** · `apps/web/lib/billing/usage-attribution.ts`
- [ ] Voice usage. **Partial:** metered server-side, no dedicated UI meter · `apps/web/lib/services/tier-unit-quota-service.ts`
- [ ] Image usage. **Not found:** folded into token cap, no distinct meter.
- [ ] Video usage. **Partial:** metered server-side, no dedicated UI meter · `apps/web/lib/services/tier-unit-quota-service.ts`
- [x] Research usage. **Web** · `apps/web/lib/billing/usage-attribution.ts`
- [x] Coding/work usage. **Web** · `apps/web/lib/billing/usage-attribution.ts`
- [ ] Storage usage. **Partial:** shown per-Project only, not in Usage dashboard · `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- [ ] Active-job count. **Not found.**
- [x] Remaining credits. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Purchased versus included credits. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Promotional credits. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Credit-expiry information. **Partial:** only purchased-credit rollover text, no promo expiry · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Reset countdown. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Daily/weekly/monthly history. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [ ] Usage by Project. **Not found.**
- [ ] Usage by task. **Partial:** broken down "by product area", not per task · `apps/web/app/api/usage/history/route.ts`
- [ ] Usage by device or surface where useful. **Not found.**
- [ ] Estimated task cost. **Not found.**
- [x] Actual task cost. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Budget warning. **Web** · `apps/web/features/settings/sections/UsageSection.tsx`
- [x] Budget-reached state. **Shared** · `packages/contracts/types/src/billing-plan-catalog.ts`
- [x] Alternative eligible model suggestion. **Web** · `apps/web/features/chat/components/InlinePaywallCard.tsx`
- [x] Wait-until-reset option. **Shared** · `packages/contracts/types/src/billing-plan-catalog.ts`
- [ ] Resume-after-reset preference. **Not found.**
- [x] Extra-usage purchase. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Auto-reload settings. **Partial:** spends existing credits on limit, does not auto-buy more · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Spending cap. **Partial:** workspace/org-level only, no individual-account cap UI · `apps/web/features/settings/sections/WorkspacePolicySection.tsx`
- [ ] Download usage report. **Partial:** general account-data export exists, not a usage-specific report · `apps/web/features/settings/sections/PrivacySection.tsx`
- [ ] Billing discrepancy report. **Not found:** dispute handling is a backend Stripe webhook only.

Section tally: 18 of 33 checked; 8 partial; 7 not found.

## 83. Billing and subscription screens

- [x] Plan-comparison dialog. **Web** · `apps/web/app/upgrade/UpgradeChooser.tsx`
- [x] Monthly/annual toggle. **Web** · `apps/web/app/pricing/page.tsx`
- [x] Upgrade checkout. **Web** · `apps/web/features/billing/components/UpgradeOrderPanel.tsx`
- [ ] Downgrade review. **Partial:** sent to Stripe portal, no in-app review screen · `apps/web/lib/server/stripe-plan-change.ts`
- [x] Proration explanation. **Web** · `apps/web/app/upgrade/UpgradeChooser.tsx`
- [x] Tax and total-price display. **Server** · `apps/web/lib/billing/tax-policy.ts`
- [x] Coupon entry. **Server** · `apps/web/app/api/checkout/route.ts`
- [ ] Trial terms. **Partial:** checkout trial machinery wired, no plan sets `trialDays` · `apps/web/app/api/checkout/route.ts`
- [x] Payment-method entry. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Payment-method management. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Billing address. **Server** · `apps/web/lib/billing/tax-policy.ts`
- [x] Tax identifier. **Server** · `apps/web/lib/billing/tax-policy.ts`
- [x] Purchase confirmation. **Web** · `apps/web/app/billing/UpgradeWelcome.tsx`
- [x] Payment failure. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Retry payment. **Partial:** delegated to Stripe portal, no in-app retry control · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Billing-history list. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Invoice download. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Receipt download. **Partial:** same Stripe hosted-invoice link, no separate receipt · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Credit-note display. **Not found.**
- [x] Refund status. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Cancel subscription. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Resume subscription. **Partial:** delegated to Stripe portal, no in-app resume control · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Scheduled cancellation. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] End-of-term access explanation. **Web** · `apps/web/app/upgrade/UpgradeChooser.tsx`
- [x] Mobile purchase restoration. **Mobile** · `apps/mobile/src/features/settings/cloud-billing/index.tsx`
- [x] Store-managed subscription instructions. **Web, Mobile** · `apps/web/features/settings/sections/BillingSection.tsx`
- [x] Duplicate-subscription warning. **Mobile, Web** · `apps/mobile/src/features/settings/cloud-billing/index.tsx` [, `apps/web/app/api/checkout/route.ts`]
- [x] Team seat purchase. **Server** · `apps/web/app/api/checkout/route.ts`
- [x] Seat assignment. **Server** · `apps/web/app/api/settings/team/invitations/route.ts`
- [x] Enterprise billing contacts. **Server** · `apps/web/lib/services/enterprise-contracts/index.ts`
- [x] Purchase-order and invoicing workflows. **Server** · `apps/web/lib/services/enterprise-billing-service.ts`
- [x] Credit-purchase history. **Web** · `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Auto-reload history. **Not found:** no separate log beyond the general credit ledger.

Section tally: 26 of 33 checked; 5 partial; 2 not found.

---

# L. Settings, account management, enterprise, and support

## 84. General and appearance settings

- [x] Display language. **Web, Desktop** · `apps/web/features/settings/components/LanguageSelector.tsx`
- [ ] Timezone. **Partial:** set within Reflect/time-focus settings only · `apps/web/features/settings/sections/TimeFocusSection.tsx`
- [x] Theme. **Web, Desktop** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Accent color where offered. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Text size. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [ ] Interface density. **Not found.**
- [x] Reduced motion. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [ ] Code theme. **Not found.**
- [x] Code line wrapping. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Default model. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Default effort. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [ ] Default mode. **Not found.**
- [ ] Default workspace. **Not found.**
- [ ] Send-key behavior. **Partial:** only found on Desktop · `apps/desktop/src/stores/settings/chatPrefs.ts`
- [x] Keyboard shortcuts. **Web, Desktop** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [ ] Sound effects. **Not found.**
- [x] Haptics. **Mobile** · `apps/mobile/src/features/settings/general/index.tsx`
- [x] Notification channels. **Web** · `apps/web/features/settings/sections/NotificationsSection.tsx`
- [x] Quiet hours. **Web** · `apps/web/features/settings/sections/TimeFocusSection.tsx`
- [ ] Startup destination. **Not found.**
- [x] Launch-at-login preference. **Desktop** · `apps/desktop/src/features/settings/tabs/General/index.tsx`
- [ ] Companion-window preference. **Partial:** global-hotkey/menu-bar toggle governs it · `apps/desktop/src/features/settings/tabs/General/index.tsx`
- [x] Sidebar behavior. **Desktop** · `apps/desktop/src/stores/ui.ts`
- [ ] Layout reset. **Not found.**
- [ ] Experimental-feature enrollment. **Not found.**
- [ ] Restore defaults. **Partial:** per-shortcut/all-shortcuts reset only, not global · `apps/desktop/src/features/settings/KeybindingsSettings.tsx`

Section tally: 14 of 26 checked; 4 partial; 8 not found.

## 85. Personalization and data settings

- [x] Profile details. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx`
- [x] Custom instructions. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (avatar/name/work fields, "Instructions for AGI" textarea with on/off switch)
- [x] Communication style. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (Response style, Technical level, Preferred formatting selects)
- [x] Writing-style personalization. **Web** · `apps/web/features/settings/sections/GeneralSection.tsx` (warmth/enthusiasm/headersLists/emoji trait selects, shared with Mobile via the `personalization` namespace)
- [x] Saved Memory. **Web** · `apps/web/features/settings/sections/MemorySection.tsx`, `packages/ui/unified-chat` `MemoryEditor`
- [x] Past-chat reference. **Web** · `apps/web/features/settings/sections/MemorySection.tsx` ("Search past chats" toggle)
- [x] Project Memory preferences. **Web** · `apps/web/features/projects/components/ProjectSettingsDialog.tsx` (`usesGlobalMemory` checkbox, backed by `user_memories.project_id`/`user_projects.uses_global_memory`)
- [x] Connected personalization sources. **Web** · `apps/web/features/settings/components/MemoryExclusions.tsx` (per-surface `suppressedSources`: auto/web/desktop/mobile)
- [ ] Location-use preference. **Not found:** `PrivacySection.tsx` names `locationMetadata` as deliberately removed from its toggle list because no location collection exists to gate.
- [ ] Browsing-context preference. **Not found.**
- [ ] Activity-history preference. **Partial:** a read-only recent-activity log exists but nothing lets a user opt out of what is tracked · `apps/web/features/settings/components/RecentActivityPanel.tsx`
- [ ] Training/improvement choice. **Not found:** `PrivacySection.tsx` states outright "There is no training opt-in, because that data path does not exist."
- [ ] Feedback-data choice. **Partial:** telemetry consent and a feedback dialog exist but there is no separate feedback-data toggle · `apps/web/features/settings/sections/PrivacySection.tsx`, `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx`
- [x] Diagnostic-sharing choice. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` ("Share crash and usage telemetry" switch)
- [ ] Voice recording retention. **Not found.**
- [x] Temporary-chat preferences. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` ("Start new chats as temporary" switch)
- [x] Archived-chat management. **Web** · `apps/web/features/settings/sections/ArchivedChatsSection.tsx`
- [x] Delete all chats. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` (`handleDeleteAllChats`)
- [x] Shared-link management. **Web** · `apps/web/features/settings/sections/SharedLinksSection.tsx`
- [x] Data export. **Web** · `apps/web/features/settings/sections/PrivacySection.tsx` (`handleExport`), `apps/web/app/api/user/data`
- [ ] Import history. **Not found.**
- [x] Import Memory. **Web** · `apps/web/features/settings/components/ImportMemoryDialog.tsx` (wired into `MemorySection.tsx`)
- [ ] Clear local storage. **Not found.**
- [ ] Clear browser data. **Not found.**
- [ ] Reset personalization. **Not found.**
- [x] Delete account. **Web** · `apps/web/features/settings/sections/AccountSection.tsx` (`useDeleteAccount`, scheduled deletion + cancel)

Section tally: 16 of 26 checked; 2 partial; 8 not found.

## 86. Security and connected-access settings

- [x] Authentication methods. **Web** · `apps/web/features/settings/sections/SecuritySection.tsx` (password, passkeys, 2FA together)
- [x] Password management. **Web** · `apps/web/features/settings/sections/SecuritySection.tsx` (`TwoFactorPanel` change-password form)
- [x] Passkeys. **Web** · `apps/web/features/settings/components/Settings/PasskeysPanel.tsx`
- [x] Multifactor authentication. **Web** · `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx` (TOTP only; the page states hardware keys and SMS are "not available in the current account contract")
- [x] Recovery codes. **Web** · `apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx` (backup codes, generate/regenerate/print/download)
- [x] Active sessions. **Web** · `apps/web/features/settings/sections/AccountSection.tsx` (session table + per-row revoke)
- [ ] Trusted devices. **Not found:** `SecuritySection.tsx` states explicitly: "trusted-device lists are not available in the current account contract."
- [x] Remote paired devices. **Desktop** · `apps/web/features/desktop-host/components/RemoteControlSection.tsx` (phone-to-desktop pairing)
- [x] Sign out current device. **Web** · `apps/web/features/settings/sections/AccountSection.tsx` (per-session "Log out"/"Revoke")
- [x] Sign out all devices. **Web** · `apps/web/features/settings/sections/AccountSection.tsx` ("Log out of all devices")
- [x] Security notifications. **Server** · `apps/web/lib/services/identity-events/catalogue.ts` (new_sign_in, new_device, password_changed, etc.), `apps/web/lib/services/account-activity-notifications.ts`
- [ ] Connected accounts. **Partial:** backend list/unlink of sign-in identities exists with no settings pane calling it yet · `apps/web/app/api/settings/identities/route.ts` (confirmed callerless in `apps/web/__tests__/api/routes-without-callers.test.ts`)
- [x] Granted connector scopes. **Web** · `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` (per-tool allow/ask/deny per connector)
- [x] API keys. **Web** · `apps/web/features/settings/components/Settings/ApiKeys.tsx`
- [ ] Personal access tokens. **Partial:** same mechanism as API keys, no separate PAT concept · `apps/web/features/settings/components/Settings/ApiKeys.tsx`
- [x] Local folders. **Desktop** · `apps/web/features/desktop-host/components/LocalAccessSection.tsx` (approve/revoke workspace roots)
- [x] Browser sites. **Chrome** · `apps/extension/src/features/options/site-permission-policy.ts` (default site permission + revocable browser permission profiles)
- [x] Computer applications. **Desktop** · `apps/desktop/src/features/settings/ComputerUseSettings.tsx` (per-app allow/deny/ask registry, always-blocked list)
- [ ] Clipboard access. **Not found:** as a distinct grant; clipboard read/write is used internally (`apps/desktop/src/api/automation.ts`) with no user-facing permission control.
- [ ] Microphone access. **Partial:** a one-time in-chat consent notice, no settings-page control to review/revoke · `apps/web/features/chat/components/MicrophonePrivacyNotice.tsx`
- [ ] Camera access. **Partial:** runtime share/stop-sharing controls in a voice call, no settings-page control · `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx`
- [ ] Screen-sharing preferences. **Not found:** as a settings-page control (only a runtime "Show Action Overlay" switch while Computer Use is active) · `apps/desktop/src/features/settings/ComputerUseSettings.tsx`
- [x] Saved approvals. **Web/Chrome** · `apps/web/features/desktop-host/components/LocalAccessSection.tsx` (command allow/deny lists), `apps/extension/src/features/options/site-permission-policy.ts` (permission profiles)
- [x] Default permission mode. **Web** · `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx`
- [ ] Revoke all optional grants. **Not found:** Revocation exists per-connector, per-folder, per-profile and per-app, but no single "revoke everything" action.
- [x] Advanced/hardened account-security mode. **Web** · `apps/web/features/settings/components/LockdownModePanel.tsx` ("Lockdown mode" refuses every connector tool account-wide)

Section tally: 18 of 26 checked; 4 partial; 4 not found.

## 87. Enterprise administration screens

- [x] Organization overview. **Web** · `apps/web/app/workspace/page.tsx`, `apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx`
- [x] Member directory. **Web** · `apps/web/features/settings/sections/TeamSection.tsx` (Members list)
- [x] Invitations. **Web** · `apps/web/features/settings/sections/TeamSection.tsx` (create/renew/revoke invitation)
- [x] Groups. **Web** · `apps/web/features/workspace-console/components/WorkspaceRoles.tsx` (`DirectoryGroupRoles`)
- [x] Roles. **Web** · `apps/web/features/workspace-console/components/WorkspaceRoles.tsx`
- [x] Custom roles. **Web** · `apps/web/features/workspace-console/components/WorkspaceRoles.tsx` (`RoleEditor` create/edit/delete)
- [x] Seat assignment. **Web** · `apps/web/features/settings/sections/TeamSection.tsx` (licensed/in-use/available seats, invite/remove)
- [x] Owner transfer. **Web** · `apps/web/features/settings/sections/TeamSection.tsx` (`useTransferOrganizationOwnership`, step-up confirmed)
- [x] Domain verification. **Web** · `apps/web/features/settings/sections/team/SSOPanel.tsx` (DNS TXT challenge, verify/reissue)
- [x] SSO setup. **Web** · `apps/web/features/settings/sections/team/SSOPanel.tsx` (SAML/OIDC connection create/activate)
- [x] Directory provisioning. **Server/Web** · `apps/web/app/api/scim/v2/*` routes (SCIM 2.0), `apps/web/features/admin/pages/DirectorySyncAdminPage.tsx` (mounted in `WorkspaceIdentityPanels.tsx`)
- [x] Service accounts. **Web** · `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx`
- [x] Model-access policy. **Web** · `apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx`
- [x] Feature-access policy. **Web** · `apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx` (per-feature toggles + role/group/user exceptions)
- [x] Tool policy. **Web** · `apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx` (browser/computer_use/code/etc. feature gates)
- [x] Connector policy. **Web** · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`
- [x] Skill and Plugin policy. **Web** · `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` (`PluginPolicySection` approve/block), `WorkspaceFeatureControls.tsx` (skills feature toggle)
- [ ] Private marketplace. **Partial:** `/api/plugins/marketplaces*` backend exists but has no admin UI caller yet (`apps/web/__tests__/api/routes-without-callers.test.ts`: "plugins directory work in flight").
- [x] Shared Project administration. **Web** · `apps/web/features/settings/sections/OrganizationSharingSection.tsx`
- [x] External-sharing controls. **Web** · `apps/web/features/settings/sections/WorkspacePolicySection.tsx` ("Public sharing" toggle)
- [ ] Public-publishing controls. **Partial:** covered by the same workspace-wide "Public sharing" toggle above; no separate publishing-specific control · `apps/web/features/settings/sections/WorkspacePolicySection.tsx`
- [x] Memory policy. **Web** · `apps/web/features/settings/sections/WorkspacePolicySection.tsx` ("Allow memory" toggle)
- [x] Data-retention settings. **Web** · `apps/web/features/settings/sections/WorkspacePolicySection.tsx` (retention window + enforce switch), `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx` (sweep record)
- [ ] Data-residency settings. **Partial:** region-pinning and pooling exist server-side but only the home region is provisioned and no admin UI sets it · `apps/web/lib/server/data-region.ts`
- [ ] Customer-managed-key setup where offered. **Partial:** full CMEK lifecycle (`apps/web/lib/crypto/cmek-lifecycle.ts`) and API (`apps/web/app/api/settings/organization/keys`) exist; confirmed callerless, "the settings pane that calls it is not built yet" (`apps/web/__tests__/api/routes-without-callers.test.ts`).
- [x] Network/IP restrictions. **Web** · `apps/web/features/settings/sections/WorkspacePolicySection.tsx` (IP allow list, CIDR entries)
- [ ] Device-management integration. **Not found.**
- [x] Audit-log viewer. **Web** · `apps/web/features/settings/sections/WorkspaceAuditSection.tsx`
- [x] Audit export. **Web** · `apps/web/features/settings/sections/WorkspaceAuditSection.tsx` (export link), `apps/web/features/settings/sections/WorkspacePolicySection.tsx` ("Allow audit export")
- [x] Usage analytics. **Web** · `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx`
- [ ] Group spending limits. **Not found:** Only a single workspace-wide cap and per-member usage visibility exist, no per-group cap.
- [ ] User spending limits. **Not found:** `WorkspaceUsageAnalytics.tsx` shows per-member spend but does not cap it.
- [x] Organization budget. **Web** · `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx`, `apps/web/features/settings/sections/WorkspacePolicySection.tsx` (monthly spend cap)
- [x] Billing administration. **Web** · `apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx`, `apps/web/features/settings/sections/BillingSection.tsx`
- [ ] Support-access controls. **Not found:** for customers. The only "support access" mechanism is a platform-operator break-glass procedure (`apps/web/app/api/admin/support-access`), not a customer-facing grant.
- [ ] Compliance export. **Partial:** audit export and per-legal-hold record export exist; no single "compliance package" export · `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx` (`HoldExportLink`)
- [x] Legal-hold administration where offered. **Web** · `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx` (place/release holds, export records)
- [ ] Managed rollout and update settings. **Not found:** for enterprise customers. `apps/web/app/admin/releases/page.tsx` is a platform-operator-only release dashboard, not a customer admin control.
- [x] Policy diagnostics. **Web** · `apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx` (per-control "Enforced" / "Stated position" / "Not configured" badges)
- [x] Administrative API access. **Web** · `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx`

Section tally: 30 of 40 checked; 5 partial; 5 not found.

## 88. Support, trust, and policy product

- [x] Contextual help links. **Web** · `apps/web/features/settings/sections/HelpSection.tsx` (docs/help/support/changelog/status/legal links inside Settings)
- [x] Searchable help center. **Web** · `apps/web/app/help/page.tsx`, `apps/web/features/support/components/HelpSearch.tsx`
- [x] Contact-support flow. **Web** · `apps/web/app/support/page.tsx`, `apps/web/features/support/components/SupportTicketsPanel.tsx`
- [x] Report-a-bug flow. **Web** · `apps/web/app/support/page.tsx` (#bugs), `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx`
- [x] Product feedback. **Web** · `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx`
- [x] Feature request. **Web** · `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` ('feature' category)
- [ ] User-reviewable diagnostic bundle. **Partial:** a diagnostics bundle (build, platform, recent errors) is collected and attached automatically to a support ticket, but is not shown to the user for review before sending · `apps/web/lib/support/diagnostics/collect.ts`, `apps/web/features/support/lib/ticket-client.ts`
- [ ] Request/error identifier. **Not found:** as a user-facing "give this ID to support" identifier; error copy is deliberately stripped of trace/request IDs before reaching the user (`apps/web/features/settings/sections/AccountSection.tsx` `readApiError`).
- [ ] Known-issue display. **Not found.**
- [x] Service-status integration. **Web** · `apps/web/app/status/page.tsx` (live dependency/route health checks)
- [ ] Incident notices. **Partial:** the status page states the notification commitment and process but explicitly has no incident feed or archive · `apps/web/app/status/page.tsx` ("We have not published an incident archive or postmortems.")
- [ ] Maintenance notices. **Not found.**
- [x] Release-update education. **Web** · `apps/web/app/changelog` (linked from Help and Status), `apps/web/lib/changelog-entries.ts`
- [x] Model-retirement notice. **Web** · `apps/web/features/models/components/ModelCard.tsx` (`retirementLabel`, `deprecatedOn`)
- [ ] Feature-migration assistant. **Not found.**
- [x] Privacy-rights request portal. **Web** · `apps/web/app/privacy/requests` (linked from `PrivacySection.tsx` "Privacy requests")
- [x] Cookie preference center. **Web** · `apps/web/app/cookies/CookiePreferencesButton.tsx`, `apps/web/app/cookies/page.tsx`
- [x] Content-reporting flow. **Web** · `apps/web/app/copyright/report/ReportContentLink.tsx`, `apps/web/app/api/content-report/route.ts`
- [x] Copyright/impersonation reporting. **Web** · `apps/web/app/copyright/report/CopyrightNoticeForm.tsx`, `apps/web/app/api/copyright-notice/route.ts`
- [ ] Safety-warning appeal. **Not found:** `apps/web/features/settings/sections/SafetySection.tsx` is a content-sensitivity preference, not an appeal flow.
- [x] Account-suspension appeal. **Web** · `apps/web/features/auth/AuthNoticeStep.tsx` ("Contact support" with an `appeal` subject on `account_suspended`/`account_locked`)
- [x] Security vulnerability reporting. **Web** · `apps/web/app/.well-known/security.txt/route.ts`, `apps/web/app/security/page.tsx` (coordinated disclosure terms)
- [ ] Accessibility feedback. **Not found:** as a distinct channel.
- [x] Policy-version history. **Web** · `apps/web/app/privacy/page.tsx` ("Last updated" date, material changes recorded on `/changelog`)
- [x] Subprocessor information. **Web** · `apps/web/app/subprocessors/page.tsx`
- [x] Security/compliance evidence portal. **Web** · `apps/web/app/trust/page.tsx` (dated, control-by-control posture ledger naming what is and is not held, e.g. no SOC 2/ISO 27001)
- [x] Jurisdiction-specific notices where applicable. **Web** · `apps/web/app/privacy/india/page.tsx`, `apps/web/app/legal/eu-representative/page.tsx`

Section tally: 19 of 27 checked; 2 partial; 6 not found.

---

# M. Backend product components

The following are **logical components needed to support the product inventory**. They do not each need to become a separate microservice, and they are not claims about competitors’ unpublished service names.

## 89. Account and access components

- [x] Account service. **Server** · `packages/platform/identity/src/identities.ts` [, `apps/web/lib/server/identity-account.ts`]
- [x] Authentication-provider adapters. **Server** · `packages/platform/identity/src/adapters/clerk.ts` [, `packages/platform/identity/src/factory.ts`]
- [x] Session service. **Server** · `apps/web/lib/server/session-status.ts` [, `packages/platform/identity/src/session-cookie.ts`]
- [x] Token refresh and revocation service. **Server** · `apps/web/lib/server/refresh-token-family.ts` [, `apps/web/lib/server/session-revocation.ts`]
- [x] Device registry. **Server** · `apps/web/db/neon/0207_device_registrations.sql` [, `apps/web/lib/server/device-signin-policy.ts`]
- [x] Recovery service. **Server** · `apps/web/app/api/settings/security/compromise/route.ts` [, `apps/web/app/api/settings/2fa/backup-codes/route.ts`]
- [x] Profile service. **Server** · `apps/web/lib/server/user-identity.ts` [, `apps/web/lib/auth/account-lifecycle.ts`]
- [x] User-preference service. **Server** · `apps/web/app/api/settings/preferences/route.ts`
- [x] Consent and terms-version store. **Server** · `apps/web/lib/server/consent-records.ts` [, `apps/web/lib/server/terms.ts`]
- [x] Organization service. **Server** · `apps/web/app/api/settings/organization/route.ts`
- [x] Workspace service. **Server** · `apps/web/app/api/settings/workspaces/route.ts`
- [x] Membership service. **Server** · `apps/web/app/api/settings/team/route.ts` [, `apps/web/app/api/settings/organization/members/[userId]/roles/route.ts`]
- [x] Invitation service. **Server** · `apps/web/app/api/settings/team/invitations/route.ts`
- [x] Group service. **Server** · `apps/web/app/api/settings/organization/groups/route.ts`
- [x] Role/permission service. **Server** · `apps/web/app/api/settings/organization/roles/route.ts`
- [x] Resource-authorization layer. **Server** · `apps/web/lib/server/rls-db.ts` [, `apps/web/lib/server/workspace-scope/index.ts`]
- [x] SSO configuration. **Server** · `apps/web/lib/server/sso/sso-access.ts` [, `apps/web/app/api/admin/sso/route.ts`]
- [x] Directory-provisioning adapter. **Server** · `apps/web/lib/server/scim/scim-provisioning-service.ts` [, `apps/web/app/api/admin/directory-sync/route.ts`]
- [x] Service-account management. **Server** · `apps/web/lib/server/service-principals/caller.ts` [, `apps/web/app/api/settings/organization/service-principals/route.ts`]
- [x] API-key management. **Server** · `apps/web/app/api/settings/api-keys/route.ts` [, `apps/web/lib/services/api-key-service.ts`]
- [ ] Personal-access-token management. **Partial:** same scoped `api_keys` mechanism doubles as PATs; no separate PAT entity · `apps/web/lib/api-key-scopes.ts`
- [x] Remote-device pairing service. **Server** · `apps/web/app/api/device/link/route.ts` [, `apps/web/db/neon/0077_gateway_compatibility_tables.sql`]
- [x] Account export/deletion coordinator. **Server** · `apps/web/lib/server/account-erasure.ts` [, `apps/web/lib/server/data-rights-requests.ts`]
- [x] Administrative access service. **Server** · `apps/web/lib/server/admin-data-access.ts` [, `apps/web/app/api/settings/organization/delegation/route.ts`]

Section tally: 23 of 24 checked; 1 partial; 0 not found.

## 90. Conversation and synchronization components

- [x] Conversation store. **Server** · `apps/web/db/neon/0001_mvp_chat.sql` [, `apps/web/app/api/chat/conversations/route.ts`]
- [x] Turn/message store. **Server** · `apps/web/db/neon/0001_mvp_chat.sql` (`public.web_messages`)
- [x] Message-version store. **Server** · `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts` (parent_id tree + `active_leaf_message_id`)
- [x] Branch graph. **Server** · `apps/web/db/neon/0078_conversation_branching_runtime.sql` [, `apps/web/app/api/chat/conversations/[id]/branches/route.ts`]
- [ ] Generation-attempt store. **Partial:** retries are modeled as sibling messages via `parent_id`, no dedicated attempt/retry-metadata table · `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts`
- [x] Conversation-title generator. **Server** · `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts`
- [x] Draft store. **Server** · `apps/web/db/neon/0219_conversation_drafts.sql`
- [x] Pin/archive service. **Server** · `apps/web/db/neon/0059_conversation_star_archive.sql` [, `apps/web/db/neon/0001_mvp_chat.sql`]
- [x] Conversation search index. **Server** · `apps/web/app/api/search/route.ts` [, `apps/web/db/neon/0202_retrieval_index.sql`]
- [ ] Transcript export. **Partial:** user/project data export covers conversations, no conversation-scoped transcript export endpoint · `apps/web/app/api/user/export/route.ts`
- [x] Shared-conversation snapshot service. **Server** · `apps/web/db/neon/0021_shared_conversations.sql` [, `apps/web/app/api/share/[token]/route.ts`]
- [x] Conversation metadata service. **Server** · `apps/web/lib/server/workspace-revision.ts` [, `apps/web/app/api/chat/conversations/[id]/route.ts`]
- [x] Event-stream gateway. **Server** · `apps/web/app/api/llm/v1/chat/completions/route.ts` [, `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts`]
- [x] Streaming event codec. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/stream-envelope.ts`
- [x] Stream cursor/replay store. **Server** · `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts`
- [x] Client-event reconciliation. **Shared** · `packages/client/sync/src/settings.ts` [, `packages/client/sync/src/cursor.ts`]
- [x] Cross-device synchronization. **Shared** · `packages/client/sync/src/conversations.ts` [, `packages/client/sync/src/availability.ts`]
- [x] Notification fan-out. **Server** · `apps/web/lib/services/notification-service.ts` [, `apps/web/app/api/notifications/route.ts`]
- [x] Offline-change reconciliation. **Shared** · `packages/client/sync/src/tombstones.ts` [, `packages/client/sync/src/__tests__/settings-rebase.test.ts`]
- [x] Conversation/resource deep-link resolver. **Desktop, Mobile** · `apps/desktop/src/lib/desktopDeepLinkRouter.ts` [, `apps/mobile/src/integrations/universalLinks.ts`]
- [x] Deletion tombstone propagation. **Shared** · `packages/client/sync/src/tombstones.ts`
- [ ] Import and migration adapters. **Not found.**
- [x] Client-version compatibility layer. **Server** · `apps/web/lib/feature-flags/version-disable.ts`

Section tally: 20 of 23 checked; 2 partial; 1 not found.

## 91. Model and inference components

- [x] Model registry. **Server, Shared** · `packages/ai/model-registry/generated/registry.json` [, `packages/ai/model-registry/catalog/models.curation.json`]
- [x] Provider registry. **Shared** · `packages/ai/model-registry/catalog/provider-hosts.json` [, `packages/ai/providers/factory/src/gateway.ts`]
- [x] Provider-route registry. **Shared** · `packages/ai/model-registry/catalog/model-routes.json`
- [x] Capability registry. **Shared** · `packages/ai/routing/src/capability-health.ts`
- [x] Model alias resolution. **Shared** · `packages/ai/provider-protocol/src/provider-model-id.ts`
- [x] Model lifecycle management. **Shared** · `packages/ai/model-registry/scripts/lifecycle-stages.mjs` [, `packages/ai/model-registry/catalog/retired-models.json`]
- [x] Inference request coordinator. **Server** · `apps/web/app/api/llm/v1/chat/completions/route.ts`
- [x] Provider adapter interface. **Shared** · `packages/ai/providers/anthropic/src/index.ts` [, `packages/ai/providers/openai/src/index.ts`]
- [x] Provider credential broker. **Server, Shared** · `packages/ai/providers/factory/src/gateway.ts` [, `apps/web/lib/server/provider-endpoints.ts`]
- [x] Request translation. **Shared** · `packages/ai/provider-protocol/src/openai-wire-compat.ts` [, `packages/ai/provider-protocol/src/anthropic-payload-policy.ts`]
- [x] Multimodal input translation. **Shared** · `packages/ai/providers/google/src/translate.ts` [, `packages/ai/providers/openai/src/translate.ts`]
- [x] Tool-schema translation. **Shared** · `packages/ai/provider-protocol/src/openai-tool-schema.ts` [, `packages/ai/provider-protocol/src/anthropic-tool-payload-compat.ts`]
- [ ] Structured-output translation. **Partial:** `json_object` supported; `json_schema` response_format explicitly rejected · `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
- [x] Streaming normalization. **Shared** · `packages/ai/providers/google/src/stream.ts` [, `packages/ai/providers/ollama/src/stream.ts`]
- [x] Provider-error normalization. **Shared** · `packages/ai/provider-runtime/src/errors.ts`
- [x] Usage extraction. **Shared** · `packages/ai/provider-protocol/src/openai-completions-compat.ts`
- [ ] Token estimation/counting. **Partial:** heuristic estimation only, no tokenizer-accurate counting found · `packages/ai/routing/src/classify.ts`
- [x] Context-budget resolver. **Shared** · `packages/ai/agent-core/src/context.ts`
- [x] Model router. **Shared** · `packages/ai/routing/src/auto.ts` [, `packages/ai/routing/src/routing-stages.ts`]
- [x] Task classifier. **Shared** · `packages/ai/routing/src/classify.ts`
- [x] Route health monitor. **Shared** · `packages/ai/routing/src/route-health-store.ts`
- [x] Fallback coordinator. **Shared** · `packages/ai/provider-runtime/src/failover.ts` [, `packages/ai/routing/src/auto.ts`]
- [x] Exact-selection enforcement. **Shared** · `packages/ai/routing/src/auto.ts` (`isDispatchableNow`/exact-model fallback plan)
- [x] Cancellation propagation. **Server** · `packages/ai/provider-runtime/src/client/streamFromProvider.ts`
- [x] Request deadline management. **Shared** · `packages/ai/provider-runtime/src/watchdog.ts`
- [x] Retry management. **Shared** · `packages/ai/provider-runtime/src/retry.ts` [, `packages/ai/provider-runtime/src/retry-after-internal.ts`]
- [ ] Prompt/template registry. **Not found.**
- [x] Prompt caching. **Shared** · `packages/ai/provider-protocol/src/system-prompt-cache-boundary.ts`
- [x] Cache diagnostics. **Server** · `apps/web/lib/services/route-cache-observability-service.ts`
- [ ] Batch/deferred inference coordinator. **Not found.**
- [x] Inference telemetry. **Server, Shared** · `packages/ai/routing/src/routing-trace.ts` [, `apps/web/db/neon/0212_routing_decision_traces.sql`]
- [x] Model evaluation service. **Server** · `apps/web/app/api/admin/model-rollout/route.ts` [, `packages/ai/model-registry/tests/eval-gate.test.mjs`]

Section tally: 28 of 32 checked; 2 partial; 2 not found.

## 92. Tool-calling and agent-loop components

- [x] Tool registry. **Server, CLI** · `crates/agiworkforce-command-registry/src/lib.rs` [, `crates/agiworkforce-protocol/src/tool_primitive.rs`]
- [x] Tool discovery/search. **Server, CLI** · `crates/agiworkforce-protocol/src/dynamic_tools.rs` [, `apps/web/db/neon/0147_mcp_stateless_cache.sql` (`mcp_discovery_cache`)]
- [x] Tool schema loader. **Shared** · `crates/agiworkforce-protocol/src/dynamic_tools.rs` (`DynamicToolSpec.input_schema`)
- [ ] Tool argument validator. **Partial:** execpolicy validates shell command arguments; no general JSON-schema arg validator for all tools found · `crates/agiworkforce-execpolicy/src/rule.rs`
- [x] Tool-call parser. **CLI, Server** · `crates/agiworkforce-protocol/src/parse_command.rs`
- [x] Tool executor dispatcher. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs`
- [x] Tool result normalizer. **Shared** · `crates/agiworkforce-protocol/src/exec_output.rs`
- [x] Tool-result storage. **Server** · `apps/web/db/neon/0082_cloud_code_agent_turns.sql` (`cloud_code_agent_steps`)
- [x] Large-result reference service. **Server** · `apps/web/db/neon/0147_mcp_stateless_cache.sql` (`mcp_app_payloads` opaque-id card)
- [x] Multi-round model/tool loop. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs`
- [x] Parallel tool scheduler. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs` (parallel read-only partition)
- [x] Dependency-aware execution. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs` (task → parallel → sequential partitioning)
- [x] Approval-policy evaluator. **CLI, Server** · `crates/agiworkforce-execpolicy/src/policy.rs` [, `crates/agiworkforce-protocol/src/request_permissions.rs`]
- [x] Approval-request store. **Server** · `apps/web/db/neon/0082_cloud_code_agent_turns.sql` (`cloud_code_agent_approvals`)
- [x] Approval-decision store. **Server, CLI** · `crates/agiworkforce-protocol/src/approvals.rs` (`ReviewDecision`) [, `apps/web/db/neon/0082_cloud_code_agent_turns.sql`]
- [x] Action-binding validator. **Server** · `apps/web/db/neon/0147_mcp_stateless_cache.sql` (`mcp_task_bindings`, bound to user+connector)
- [x] Action-receipt store. **Server** · `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` (result/usage/error columns)
- [x] Idempotency manager. **Server** · `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` (`input_hash`, `lease_token`)
- [x] External-outcome reconciliation. **Server** · `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` (`retry_safety`, `outcome_unknown` status)
- [x] Cancellation coordinator. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs` (`ToolCancellation`/`CancelFuture`)
- [x] Agent definition store. **CLI** · `apps/cli/src/agents.rs`
- [x] Agent runtime. **CLI, Server** · `crates/agiworkforce-agent-core/src/engine.rs` [, `apps/web/db/neon/0061_cloud_agent_runs.sql`]
- [x] Plan/step store. **Server, CLI** · `crates/agiworkforce-protocol/src/plan_tool.rs` [, `apps/web/db/neon/0237_work_plans.sql`]
- [x] Subagent coordinator. **CLI** · `apps/cli/src/subagent_v2.rs` [, `apps/cli/src/subagent.rs`]
- [x] Checkpoint store. **Server** · `apps/web/db/neon/0190_device_step_checkpoint.sql` [, `apps/web/db/neon/0061_cloud_agent_runs.sql` (`cloud_agent_approval_checkpoints`)]
- [x] Completion-condition evaluator. **Shared** · `crates/agiworkforce-protocol/src/task_state.rs` (`AgentTaskState`)
- [x] Human-input queue. **Shared** · `crates/agiworkforce-protocol/src/request_user_input.rs`
- [x] Per-task budget manager. **Server, CLI** · `crates/agiworkforce-agent-core/src/engine.rs` (`max_budget_usd`) [, `apps/web/db/neon/0061_cloud_agent_runs.sql` (`cloud_agent_run_budgets`)]
- [x] Durable task scheduler. **Server** · `apps/web/app/api/schedules/route.ts` [, `apps/web/app/api/cron/run-schedules/route.ts`]
- [x] Runtime recovery manager. **CLI, Server** · `crates/agiworkforce-agent-core/src/runaway.rs`

Section tally: 29 of 30 checked; 1 partial; 0 not found.

## 93. Search, retrieval, and context components

- [x] Context-source registry. **Shared** · `packages/contracts/context/src/context-source.ts`
- [x] Context selection. **Server, Shared** · `packages/platform/context-engine/src/engine.ts`
- [x] Instruction resolver. **Shared** · `packages/contracts/context/src/instruction-precedence.ts`
- [x] Context manifest builder. **Server, Shared** · `packages/platform/context-engine/src/manifest-store.ts` [, `apps/web/db/neon/0252_context_manifests_and_source_policy.sql`]
- [x] Context compaction. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` [, `apps/web/db/neon/0164_memory_policy_and_context_compaction.sql`]
- [x] Summary versioning. **Server** · `apps/web/db/neon/0164_memory_policy_and_context_compaction.sql` (`compaction_summary_through_message_id`)
- [x] Conversation retrieval. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`source_kind = 'conversation'`)
- [x] Project retrieval. **Server** · `apps/web/lib/services/project-context-service.ts`
- [x] Public-search adapters. **Server** · `apps/web/lib/web-search/search-provider.ts`
- [x] Web-fetch service. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` (`web_fetch` tool) [, `apps/web/lib/egress-policy.ts`]
- [x] Safe URL resolver. **Server** · `apps/web/lib/egress-policy.ts` (`assertNonInternalHostname`)
- [x] Page-content extraction. **Server** · `apps/web/lib/server/office-document-text.ts` [, `apps/web/lib/server/pdf-attachment-content.ts`]
- [x] Search-query planner. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`
- [x] Search-result normalization. **Server** · `apps/web/lib/web-search/web-search-tool.ts`
- [x] Result deduplication. **Server, Shared** · `apps/web/lib/web-search/search-provider.ts` (`dedupeSearchSources`)
- [x] Relevance ranking. **Shared** · `packages/ai/search/src/source-ranking.ts`
- [x] Source freshness evaluation. **Shared** · `packages/ai/search/src/source-ranking.ts`
- [x] Document chunking. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`retrieval_chunks.chunk_index`)
- [x] Embedding generation. **Server** · `apps/web/lib/services/retrieval-embedding-service.ts` [, `apps/web/lib/server/google-embeddings.ts`]
- [x] Vector index. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`embedding vector(1536)`)
- [x] Lexical index. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`search_vector tsvector` + GIN)
- [x] Hybrid retrieval. **Server** · `apps/web/lib/services/retrieval-search-service.ts`
- [x] Reranking. **Server** · `apps/web/lib/services/retrieval-search-service.ts` (`rerankCandidates`)
- [x] Permission-aware retrieval filters. **Server, Shared** · `packages/platform/context-engine/src/permissions.ts`
- [x] Source locator registry. **Shared** · `packages/contracts/types/src/research.ts` (`PublicSourceLocator`)
- [x] Citation resolver. **Server** · `apps/web/lib/web-search/web-search-tool.ts` (`citationNumberFor`)
- [ ] Grounding checker. **Partial:** cost/pricing "grounding" tracked, no claim-vs-source verification step found · `apps/web/lib/web-search/grounding-cost.ts`
- [x] Research evidence store. **Server** · `apps/web/db/neon/0224_research_retention_domain.sql` (`research_reports`) [, `apps/web/lib/services/research-file-source-service.ts`]
- [x] Research orchestrator. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`
- [x] Research report generator. **Server** · `apps/web/lib/services/research-report-service.ts` [, `apps/web/app/api/research/reports/route.ts`]
- [ ] Knowledge-graph or wiki projection where offered. **Not found.**

Section tally: 29 of 31 checked; 1 partial; 1 not found.

## 94. Memory and personalization components

- [x] Memory candidate extraction. **Shared, Server** · `packages/ai/agent-core/src/memory.ts` (`extractCandidateMemoryFacts`) [, `apps/web/lib/services/model-memory-extraction.ts`]
- [x] Explicit Memory write handler. **Server** · `apps/web/lib/services/memory-write-service.ts` [, `apps/web/lib/services/memory-commands.ts`]
- [x] Memory topic store. **Server** · `apps/web/db/neon/0203_user_memories_lifecycle.sql` (`public.user_memories`)
- [x] Memory provenance. **Server** · `apps/web/db/neon/0285_user_memories_provenance.sql`
- [x] Memory retrieval. **Server** · `apps/web/lib/services/managed-memory-context-service.ts`
- [x] Memory relevance ranking. **Shared** · `packages/ai/agent-core/src/memory.ts` (`memoryRelevanceScore`) [, `apps/web/lib/services/semantic-decisions/consumers/memory-relevance.ts`]
- [x] Duplicate-Memory merger. **Server, Shared** · `apps/web/lib/services/managed-memory-context-service.ts` (merge-on-write) [, `packages/ai/agent-core/src/memory.ts` (`memoryConsolidationKey`)]
- [x] Contradiction/correction handling. **Server, Shared** · `apps/web/db/neon/0203_user_memories_lifecycle.sql` (`superseded_by`/`superseded_at`) [, `packages/ai/agent-core/src/memory.ts` (`memoryConflictTopic`)]
- [x] Memory prioritization. **Server, Shared** · `apps/web/db/neon/0047_user_memories_pinned.sql` [, `packages/ai/agent-core/src/memory.ts` (`boostMemoryImportance`)]
- [x] Memory expiry. **Server** · `apps/web/db/neon/0203_user_memories_lifecycle.sql` (`expires_at`) [, `apps/web/app/api/cron/expire-memories/route.ts`]
- [x] Memory deletion. **Server** · `apps/web/lib/services/memory-commands.ts` (soft delete / explicit forget)
- [x] Memory import/export. **Server** · `apps/web/lib/memory/import-parser.ts` [, `apps/web/lib/memory/import-store.ts`]
- [x] Personal versus Project scope resolver. **Server** · `apps/web/lib/services/managed-memory-context-service.ts` (`memoryRetentionClass`)
- [ ] Agent-specific Memory store. **Not found.**
- [ ] Background Memory maintenance. **Partial:** only the expiry cron found; no broader consolidation/decay job · `apps/web/app/api/cron/expire-memories/route.ts`
- [ ] Writing-style profile generator. **Not found.**
- [x] Personalization-source selection. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` (combines memory + past-chat sources)
- [x] Personalization attribution. **Server** · `apps/web/lib/past-chat-citation.ts` [, `apps/web/lib/services/past-chat-context-service.ts`]
- [x] Sensitive-data exclusion rules. **Server** · `apps/web/lib/services/memory-write-service.ts` (`excludedMemoryMessage`/exclusion terms)
- [x] Temporary-conversation exclusions. **Server** · `apps/web/lib/temporary-chat-policy.ts`
- [x] Personal recap generator. **Server** · `apps/web/app/api/reflect/route.ts` [, `apps/web/lib/services/reflect-service.ts`]
- [ ] Daily-brief context builder. **Partial:** a `daily-briefing` scheduled-task prompt template runs through the ordinary context pipeline; no dedicated briefing context assembly · `apps/web/features/schedules/lib/schedule-templates.ts`

Section tally: 18 of 22 checked; 2 partial; 2 not found.

## 95. File and Library components

- [x] Upload-session service. **Server** · `apps/web/app/api/files/uploads/route.ts`, `apps/web/app/api/files/uploads/[uploadId]/route.ts`
- [x] Multipart/resumable-upload service. **Server** · `apps/web/app/api/files/uploads/resumable-upload.ts`
- [x] File metadata store. **Server** · `apps/web/db/neon/0006_projects.sql`, `apps/web/db/neon/0036_media_assets.sql`
- [x] Blob/object storage. **Server** · `packages/platform/object-storage/src/adapters/s3.ts`, `packages/platform/object-storage/src/types.ts`
- [x] MIME/content inspection. **Server** · `apps/web/lib/security/upload-scan.ts`
- [ ] Malware/quarantine pipeline. **Partial:** signature/credential scan plus an optional external-AV webhook; a rejection deletes the object, no quarantine state · `apps/web/lib/security/upload-scan.ts`
- [x] Document parser workers. **Server** · `apps/web/lib/server/office-document-text.ts`, `apps/web/lib/server/pdf-attachment-content.ts`
- [x] OCR worker. **Server** · `apps/web/lib/server/scanned-document-text.ts`
- [x] Image preprocessing. **Web** · `apps/web/features/chat/lib/attachment-metadata.ts`, `packages/platform/utils/src/imageMetadata.ts`
- [ ] Audio transcription worker. **Partial:** only for live voice calls (§97), no audio extractor in the Library ingestion pipeline · `packages/contracts/types/src/file-model.ts` (`DOCUMENT_EXTRACTORS`)
- [ ] Video frame/transcript processor. **Not found.**
- [ ] Preview generator. **Partial:** browser-native inline rendering (PDF bytes, text preview modal), no generated preview-image asset · `apps/web/app/api/files/[id]/route.ts`, `apps/web/features/projects/components/FilePreviewModal.tsx`
- [ ] Thumbnail generator. **Not found.**
- [x] Extraction-result store. **Server** · `apps/web/db/neon/0064_project_knowledge_extraction.sql`
- [x] File-version store. **Server** · `apps/web/lib/server/generated-file-persist.ts` (`file_lineage`), `apps/web/db/neon/0257_file_versions_and_lineage.sql`
- [x] Library catalog. **Web, Shared** · `apps/web/features/library/components/LibraryView.tsx`, `packages/platform/files/src/library.ts`
- [x] Folder hierarchy. **Web** · `apps/web/features/library/components/LibraryView.tsx` (projects mapped to folders)
- [ ] External-resource reference store. **Partial:** `ExternalResourceRef` type is defined but has no consumer wiring it to a connector-backed file · `packages/contracts/types/src/file-reference.ts`
- [ ] Connected-file synchronization. **Not found.**
- [x] Download authorization. **Server** · `apps/web/app/api/files/[id]/route.ts`
- [ ] Export packaging. **Not found.**
- [ ] File conversion. **Not found.**
- [x] Storage-quota accounting. **Server** · `apps/web/app/api/projects/[id]/knowledge-files/route.ts`
- [x] Trash/restore service. **Server** · `apps/web/lib/server/media-assets.ts` (`softDeleteMediaAsset`/`restoreMediaAsset`)
- [x] Retention cleanup. **Server** · `apps/web/app/api/cron/purge-temporary-chats/route.ts`
- [ ] Derivative-resource cleanup. **Not found.**
- [ ] Resource-sharing service. **Not found:** (no per-file/library share route; see §96 for artifact sharing).
- [ ] Source-deletion propagation. **Not found.**

Section tally: 16 of 28 checked; 4 partial; 8 not found.

## 96. Artifact and generated-application components

- [x] Artifact registry. **Server** · `apps/web/db/neon/0095_published_artifacts.sql`, `apps/web/app/api/artifacts/index/route.ts`
- [x] Artifact-version store. **Server** · `apps/web/app/api/artifacts/publish/route.ts` (`published_artifact_versions`), `apps/web/db/neon/0257_file_versions_and_lineage.sql`
- [ ] Structured-document storage. **Not found:** (artifact content is a raw string, not block/structured storage).
- [ ] Collaborative editing backend. **Not found.**
- [ ] Comment and suggestion service. **Not found.**
- [ ] Selection-to-edit translation. **Not found.**
- [x] Document-generation worker. **Server** · `apps/web/lib/services/managed-office-file-service.ts`
- [x] Spreadsheet-generation worker. **Server** · `apps/web/lib/services/managed-workbook-builder.ts`
- [x] Presentation-generation worker. **Server** · `apps/web/lib/services/managed-office-file-service.ts` (PptxGenJS)
- [x] PDF-generation worker. **Server** · `apps/web/lib/services/managed-office-file-service.ts` (jsPDF)
- [x] Export-format adapters. **Web** · `apps/web/features/chat/services/document-export-service.ts`
- [x] Artifact preview renderer. **Web, Server** · `apps/web/db/neon/0095_published_artifacts.sql`, `packages/ui/unified-chat/src/lib/artifact-sandbox.ts`
- [x] Generated-code build service. **Web** · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx` (in-browser Babel standalone transpile)
- [x] Dependency resolver. **Web** · `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx` (esm.sh CDN import resolution)
- [x] Preview sandbox. **Shared** · `packages/ui/unified-chat/src/lib/artifact-sandbox.ts`
- [x] Preview-origin management. **Shared** · `packages/ui/unified-chat/src/lib/artifact-sandbox.ts` (`getArtifactSandboxOrigin`)
- [ ] Artifact data store. **Not found:** (no runtime capability for an artifact to read/write a shared data store).
- [ ] Connected-data proxy. **Not found.**
- [x] Viewer-authentication bridge. **Server** · `apps/web/app/api/settings/organization/shared/artifacts/[artifactId]/route.ts` (`requireOrgMember`)
- [ ] Generated-site deployment service. **Not found.**
- [ ] Deployment history. **Not found.**
- [ ] Custom-domain management. **Not found.**
- [x] Published-app authorization. **Server** · `apps/web/app/api/settings/organization/shared/artifacts/[artifactId]/route.ts`
- [ ] App-level metering. **Not found:** (publish action is rate-limited, but no per-visit/app usage metering).
- [ ] Publication moderation. **Not found:** (no scan/report gate tied to `published_artifacts`).
- [ ] Unpublish/rollback controller. **Partial:** unpublish (`DELETE /api/artifacts/publish/[token]`) exists; rollback to an earlier published version is not persisted server-side · `apps/web/db/neon/0095_published_artifacts.sql`
- [ ] Template registry. **Not found.**
- [ ] Design-system asset registry. **Not found.**

Section tally: 14 of 28 checked; 1 partial; 13 not found.

## 97. Media and realtime components

- [x] Image-generation adapter. **Server** · `apps/web/app/api/media/image/generate/route.ts`, `apps/web/app/api/media/image/lib/image-generation-provider.ts`
- [x] Image-editing adapter. **Server** · `apps/web/app/api/media/image/lib/image-generation-provider.ts` (`images/edits`)
- [x] Reference-asset manager. **Server** · `apps/web/app/api/media/image/generate/route.ts` (`resolveImageRefBytes`)
- [x] Mask-processing service. **Server** · `apps/web/app/api/media/image/lib/image-generation-provider.ts` (`maskBytes`)
- [x] Media-job queue. **Server** · `apps/web/lib/server/image-generation-jobs.ts`, `apps/web/lib/server/video-generation-jobs.ts`
- [x] Provider-job reconciliation. **Server** · `apps/web/lib/server/video-generation-jobs.ts` (`reconcile_claim_token`)
- [x] Polling/webhook completion handler. **Server** · `apps/web/app/api/media/video/status/route.ts`, `apps/web/app/api/media/video/openrouter-webhook/route.ts`
- [x] Generated-asset downloader. **Server** · `apps/web/lib/server/media-storage.ts` (`bytesFromUrl`)
- [x] Media object storage. **Server** · `apps/web/lib/server/media-storage.ts`
- [ ] Image postprocessing. **Not found:** (no resize/watermark/metadata-embed step after generation).
- [ ] Video transcoding. **Not found:** (resolution is a provider request parameter, no in-house transcode step).
- [ ] Thumbnail/contact-sheet generation. **Not found:** (`thumbnail_url` is a provider-supplied pass-through field) · `apps/web/app/api/media/video/status/route.ts`
- [ ] Subtitle/transcript generation. **Not found.**
- [x] Provenance metadata service. **Server** · `apps/web/lib/compliance/ai-act.ts`
- [ ] Likeness/voice-consent store. **Not found:** (only outbound moderation refusing likeness/deepfake requests).
- [x] Audio transcription service. **Server** · `apps/web/app/api/voice/transcribe/route.ts`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`
- [x] Text-to-speech service. **Server** · `apps/web/app/api/voice/live/sessions/route.ts` (`audio.output.voice`)
- [x] Realtime session broker. **Server** · `apps/web/app/api/voice/live/sessions/route.ts`
- [ ] Ephemeral credential service. **Not found:** the server itself holds the provider API key and brokers the SDP exchange; no short-lived client credential is minted.
- [x] Audio transport. **Web, Server** · `apps/web/app/api/voice/live/sessions/route.ts` (`transport: { type: 'webrtc' }`)
- [ ] Voice activity detection. **Not found:** (delegated to the provider's live session defaults; no in-repo VAD).
- [ ] Turn-detection coordinator. **Not found:** (same as above).
- [ ] Playback/interruption coordinator. **Partial:** mute/pending-utterance state is tracked client-side; barge-in itself runs inside the provider's realtime session · `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx`
- [x] Voice-to-tool bridge. **Server** · `apps/web/lib/voice/live-voice-tools.ts`
- [ ] Voice-to-durable-task handoff. **Not found:** the `agi_work` tool is explicitly marked `reachable: false` because "the provider-side delegation has no callback into the tool loop that could pause for one" · `apps/web/lib/voice/live-voice-tools.ts`
- [x] Visual-frame ingestion. **Web** · `apps/web/lib/visual/use-visual-session.ts`
- [ ] Audio/video synchronization. **Not found.**
- [x] Voice session persistence. **Server** · `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts`, `apps/web/db/neon/0260_voice_sessions.sql`
- [ ] Audio overview generator. **Not found.**
- [ ] Music-generation adapter. **Not found.**

Section tally: 17 of 30 checked; 1 partial; 12 not found.

## 98. Integration and extensibility components

- [x] Connector registry. **Server** · `apps/web/lib/connectors/catalog.ts`, `apps/web/app/api/connectors/route.ts`
- [x] Connected-account store. **Server** · `apps/web/app/api/connectors/[connectorId]/accounts/route.ts`
- [x] OAuth callback service. **Server** · `apps/web/app/api/connectors/oauth/callback/route.ts`
- [x] Token vault. **Server** · `apps/web/lib/custom-connector-crypto.ts`, `apps/web/lib/connectors/oauth-store.ts`
- [x] Token refresh coordinator. **Server** · `apps/web/lib/connectors/oauth-access.ts`
- [x] Scope/consent manager. **Server** · `apps/web/lib/connectors/scope-descriptions.ts`, `apps/web/lib/connectors/oauth-scope-allowlist.ts`
- [x] Provider-specific connector adapters. **Server** · `apps/web/lib/connectors/catalog.ts`
- [ ] Connector search/index worker. **Not found:** (connector content is queried live via MCP tool calls; no background indexing worker).
- [x] External webhook receiver. **Server** · `apps/web/app/api/webhooks/gmail/route.ts`, `apps/web/app/api/webhooks/slack/route.ts`
- [x] Connector health monitor. **Server** · `apps/web/app/api/connectors/health`
- [x] Multi-account selection. **Server** · `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` (`connectorSupportsMultipleAccounts`)
- [x] MCP client runtime. **CLI, Shared** · `crates/agiworkforce-mcp/src/client.rs`, `packages/tools/mcp/src/connect.ts`
- [ ] MCP server host. **Not found:** `crates/agiworkforce-mcp/src/lib.rs` documents itself as a "Shared MCP client engine"; no MCP server implementation for external clients was found.
- [x] MCP gateway/proxy. **Server** · `apps/web/lib/mcp-tool-executor.ts`
- [ ] Private-network bridge. **Not found.**
- [x] Interactive-app host bridge. **Server** · `apps/web/app/api/mcp-apps/sandbox/route.ts`
- [x] Plugin registry. **Server** · `apps/web/lib/services/plugin-registry-service.ts`
- [x] Plugin package validator. **Server** · `apps/web/lib/services/plugin-marketplace-service.ts` (`validateManifestAgainstCatalog`)
- [ ] Plugin dependency resolver. **Not found.**
- [x] Plugin installer/updater. **Server** · `apps/web/lib/services/plugin-installation-service.ts`, `apps/web/app/api/plugins/updates`
- [x] Skill registry. **Shared** · `packages/tools/skills/src/loader.ts`
- [x] Skill resource loader. **Shared** · `packages/tools/skills/src/loader.ts`
- [x] Hook dispatcher. **CLI** · `apps/cli/src/features/hooks/hooks.rs`
- [x] Command registry. **CLI** · `crates/agiworkforce-command-registry/src/lib.rs`
- [x] Marketplace catalog service. **Server** · `apps/web/lib/services/plugin-marketplace-service.ts`
- [x] Publisher identity service. **Server** · `apps/web/db/neon/0096_plugin_registry.sql` (`publisher_id`/`publisher_name`/`publisher_kind`)
- [x] Organization distribution service. **Server** · `apps/web/lib/services/org-shared-connector-service.ts`
- [x] Package scanning. **Shared** · `packages/client/client-runtime/src/plugins/packageScan.ts`
- [x] Extension evaluation service. **Server** · `apps/web/lib/services/plugin-lifecycle.ts` (`submitPluginVersionForReview`)

Section tally: 25 of 29 checked; 0 partial; 4 not found.

## 99. Coding and local-runtime components

- [x] Shared coding-session service. **Server** · `crates/agiworkforce-app-server/src/lib.rs`
- [x] App-server/session protocol. **CLI, Server** · `crates/agiworkforce-app-server/src/developer_sessions.rs`
- [x] Local daemon. **CLI** · `apps/cli/src/daemon.rs`
- [x] Runtime discovery. **CLI** · `apps/cli/src/context.rs` (`detect_project_language`, `detect_package_manager`)
- [x] Repository registry. **CLI** · `apps/cli/src/repo/layout.rs` (nested repo/worktree roots)
- [x] Workspace discovery. **Shared** · `packages/client/ide-runtime/src/workspace.ts`
- [x] File search engine. **Shared** · `packages/client/ide-runtime/src/workspace.ts` (`grepLines`)
- [x] Symbol index. **CLI** · `apps/cli/src/platform/lsp/client.rs` (`document_symbol`)
- [x] Language-service adapters. **CLI** · `apps/cli/src/platform/lsp/mod.rs`
- [ ] Unsaved-buffer synchronization. **Not found:** (no `isDirty`/editor-buffer sync in the VS Code extension).
- [x] Repository instruction loader. **CLI** · `apps/cli/src/repl/registry.rs` (AGENTS.md)
- [x] Patch engine. **CLI, Shared** · `apps/cli/src/apply_patch.rs`, `packages/tools/apply-patch/src/index.ts`
- [x] Diff engine. **Shared** · `packages/client/ide-runtime/src/diff.ts`
- [x] Checkpoint manager. **CLI** · `apps/cli/src/agent/history.rs`
- [x] Git adapter. **Shared, CLI** · `packages/client/ide-runtime/src/git.ts`, `apps/cli/src/platform/runtime/git.rs`
- [x] Worktree manager. **CLI** · `apps/cli/src/platform/runtime/worktree.rs`
- [x] Terminal/PTY manager. **Desktop** · `apps/desktop/src-tauri/src/features/terminal/pty.rs`
- [x] Process manager. **CLI** · `apps/cli/src/process_tree.rs`
- [x] Environment manager. **CLI** · `apps/cli/src/sandbox.rs` (`SandboxManager`)
- [ ] Development-server manager. **Not found.**
- [ ] Preview-port broker. **Not found.**
- [x] Browser verification adapter. **Shared** · `packages/tools/browser-tool/src/index.ts`
- [ ] Simulator adapter. **Not found:** (no iOS/Android simulator control; only desktop UI-automation input simulation).
- [x] SCM provider integration. **Server** · `packages/guardian/github/src/checks.ts` (GitHub only)
- [x] Code-review pipeline. **Server, Shared** · `packages/guardian/core/src/index.ts`, `packages/guardian/github/src/checks.ts`
- [ ] Test-result parser. **Not found.**
- [x] CI integration. **Server** · `apps/web/app/api/github/webhook/webhook-router.ts` (`check_run`/`workflow_run`)
- [ ] Remote-host relay. **Not found:** (only devcontainer/CI environment detection, not remote-host relaying).
- [x] Host capability manifest. **CLI, Server** · `apps/cli/src/lib.rs` (`host.capabilities()`), `crates/agiworkforce-app-server/src/lib.rs`
- [x] Local-to-cloud handoff coordinator. **CLI** · `apps/cli/src/platform/runtime/session_handoff.rs`

Section tally: 24 of 30 checked; 0 partial; 6 not found.

## 100. Commercial and administrative components

- [x] Plan catalog. **Server** · `apps/web/lib/services/plan-catalog-service.ts`
- [x] Price catalog. **Server** · `apps/web/lib/services/plan-catalog-service.ts` (`PlanCatalogEntry`/`Plan`)
- [x] Entitlement resolver. **Server** · `apps/web/lib/services/entitlement-resolution.ts`, `apps/web/lib/services/plan-catalog-service.ts` (`toEntitlement`)
- [x] Limit/quota resolver. **Server** · `apps/web/lib/services/tier-unit-quota-service.ts`
- [x] Usage-event ingestion. **Server** · `apps/web/lib/services/managed-usage-request-service.ts` (`reserveManagedUsageRequest`)
- [x] Usage ledger. **Server** · `apps/web/lib/services/managed-usage-accounting-service.ts`, `apps/web/db/neon/0076_enterprise_control_plane_tables.sql` (`organization_usage_ledger`)
- [x] Credit reservation. **Server** · `apps/web/lib/services/credit-service.ts`, `apps/web/lib/services/managed-usage-request-service.ts`
- [x] Credit settlement. **Server** · `apps/web/lib/services/credit-service.ts` (`CreditSettlementResult`)
- [x] Credit refund/release. **Server** · `apps/web/app/api/stripe-webhook/lib/handlers.ts` (`charge.refunded`)
- [x] Cost attribution. **Server** · `apps/web/lib/services/cogs-ledger-service.ts`
- [x] Rate-limiting service. **Server** · `apps/web/lib/rate-limit.ts` (Upstash Redis)
- [x] Concurrency-limiting service. **Server** · `apps/web/lib/rate-limit.ts` (`acquireManagedTurnSlot`)
- [x] Budget manager. **Server** · `apps/web/lib/services/spend-limit-service.ts`
- [x] Checkout adapter. **Server** · `apps/web/app/api/checkout/route.ts`
- [x] Subscription synchronization. **Server** · `apps/web/lib/services/subscription-service.ts`
- [x] Payment webhook processor. **Server** · `apps/web/app/api/stripe-webhook/route.ts`
- [x] Mobile receipt validation. **Server, Mobile** · `apps/web/app/api/mobile/iap/verify/route.ts`
- [x] Invoice service. **Server** · `apps/web/lib/services/billing-invoice-service.ts`
- [x] Refund/dispute workflow. **Server** · `apps/web/app/api/stripe-webhook/lib/handlers.ts`
- [x] Tax calculation integration. **Server** · `apps/web/lib/billing/tax-policy.ts` (Stripe Tax)
- [x] Seat/license service. **Server** · `apps/web/lib/services/organization-seat-service.ts`
- [x] Promotion service. **Server** · `apps/web/app/api/checkout/route.ts` (`allow_promotion_codes`)
- [ ] Referral service. **Partial:** `public.referrals` table exists but no route creates, redeems or rewards a referral; only touched by data-export/erasure · `apps/web/db/neon/0016_misc.sql`
- [x] Usage reporting. **Server** · `apps/web/lib/services/organization-usage-service.ts`
- [x] Enterprise billing integration. **Server** · `apps/web/lib/services/enterprise-billing-service.ts`
- [x] Administrative API. **Server** · `apps/web/app/api/admin` (feature-flags, cost-operations, security, sso, etc.)
- [x] Support-case integration. **Server** · `apps/web/app/api/support/tickets/route.ts`
- [x] Audit-event store. **Server** · `apps/web/lib/security-audit.ts`

Section tally: 27 of 28 checked; 1 partial; 0 not found.

---

# N. Shared packages, runtimes, and implementation choices

## 101. Shared package boundaries

These represent reusable responsibilities; package names are illustrative.

- [x] Shared request/response contracts. **Shared** · `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts`, `packages/contracts/types/src/provider-adapter.ts`
- [x] Shared event schemas. **Shared** · `packages/contracts/cloud-contracts/src/agent-events.ts`, `packages/contracts/cloud-contracts/src/domain-events.ts`
- [x] Shared content-block schemas. **Shared** · `packages/contracts/types/src/provider-adapter.ts`
- [x] Shared error definitions. **Shared** · `packages/contracts/types/src/error-taxonomy.ts`, `packages/contracts/types/src/errors.ts`
- [x] Shared resource identifiers. **Shared** · `packages/contracts/types/src/identifier-contract.ts`
- [x] Shared model metadata. **Shared** · `packages/ai/model-registry/catalog/model-families.json`, `packages/contracts/types/src/model-catalog.ts`
- [x] Shared capability resolution. **Shared** · `packages/contracts/types/src/capabilities.ts`
- [x] Shared entitlement resolution. **Shared** · `packages/contracts/types/src/product-plan.ts`
- [x] Shared policy contracts. **Shared** · `packages/contracts/trust-boundaries/src/egress-policy.ts`
- [x] Shared authentication client. **Shared** · `packages/platform/identity/src/index.ts`
- [x] Shared API client. **Shared** · `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts`
- [x] Shared streaming client. **Shared** · `packages/ai/provider-runtime/src/index.ts`
- [x] Shared conversation-state logic. **Shared** · `packages/ui/unified-chat/src/stores/chatStore.ts`
- [x] Shared synchronization logic. **Shared** · `packages/client/sync/src/index.ts`
- [x] Shared Project models. **Shared** · `packages/contracts/cloud-contracts/src/projects.ts`
- [x] Shared file/Library models. **Shared** · `packages/platform/files/src/index.ts`, `packages/contracts/types/src/file-model.ts`
- [x] Shared artifact models. **Shared** · `packages/platform/artifacts/src/index.ts`, `packages/contracts/types/src/artifacts.ts`
- [x] Shared source/citation models. **Shared** · `packages/contracts/types/src/project-file-citations.ts`, `packages/contracts/types/src/web-search-citations.ts`
- [x] Shared Memory contracts. **Shared** · `packages/contracts/types/src/memory.ts`
- [x] Shared tool definitions. **Shared** · `packages/contracts/types/src/tool-primitive.ts`, `packages/contracts/types/src/tool-display.ts`
- [x] Shared approval contracts. **Shared** · `packages/contracts/types/src/tool-approval-policy.ts`
- [x] Shared connector interfaces. **Shared** · `packages/contracts/cloud-contracts/src/connectors.ts`
- [x] Shared Skill/Plugin manifests. **Shared** · `packages/tools/skills/src/index.ts`, `packages/contracts/types/src/plugins.ts`
- [x] Shared agent/task models. **Shared** · `packages/contracts/types/src/agent.ts`, `packages/contracts/types/src/agent-status.ts`
- [x] Shared coding-session protocol. **Shared** · `packages/contracts/types/src/developer-session-versioning.ts`
- [x] Shared usage/billing models. **Shared** · `packages/contracts/types/src/billing-catalog.ts`, `packages/contracts/types/src/credits.ts`
- [x] Shared notifications. **Shared** · `packages/contracts/types/src/notifications.ts`
- [x] Shared localization. **Shared** · `packages/ui/i18n/src/index.ts`
- [x] Shared design tokens. **Shared** · `packages/ui/design-tokens/src/chat.css`
- [x] Shared web UI primitives. **Shared** · `packages/ui/ui/src/primitives/Button.tsx`
- [x] Platform-specific native UI primitives. **Mobile, Desktop** · `apps/mobile/components/ui/button.tsx`, `apps/desktop/src/ui/Card.tsx`
- [x] Shared Markdown/content transformations. **Shared** · `packages/platform/utils/src/markdownSource.ts`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`
- [x] Platform-specific renderers. **Desktop, Mobile** · `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx`, `apps/mobile/lib/markdown.ts`
- [x] Shared telemetry conventions. **Shared** · `packages/platform/observability/src/index.ts`
- [x] Shared test data and schema conformance fixtures. **Shared** · `packages/client/sync/src/__fixtures__/pull-apply.json`, `packages/contracts/cloud-contracts/src/__fixtures__/me-response.golden.json`
- [ ] Shared configuration validation. **Partial:** each package validates its own env/config (object-storage, guardian-core); no single shared cross-package validator · `packages/platform/object-storage/src/config.ts`
- [x] Shared security-sensitive utility code. **Shared** · `packages/platform/utils/src/crypto.ts`, `packages/platform/utils/src/pathContainment.ts`
- [x] Explicit browser-only, server-only, and native-only exports. **Shared** · `packages/platform/identity/package.json`, `packages/client/client-runtime/package.json`

Section tally: 37 of 38 checked; 1 partial; 0 not found.

## 102. Runtime inventory

- [x] Browser application runtime. **Web** · `apps/web/features/chat/components/WebChatRoot.tsx`
- [x] Server-rendered web runtime. **Web** · `apps/web/app/chat/page.tsx`
- [x] Backend API runtime. **Server** · `apps/web/app/api/health/route.ts`
- [x] Streaming gateway runtime. **Server** · `apps/web/app/api/llm/v1/chat/completions/route.ts`
- [x] Durable agent runtime. **Server** · `apps/web/lib/services/cloud-code-agent-loop.ts`, `apps/web/lib/services/scheduled-agent-executor.ts`
- [x] Research worker runtime. **Server** · `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`, `apps/web/lib/services/research-report-service.ts`
- [x] Document/media worker runtime. **Server** · `apps/web/app/api/media/image/lib/image-job-drain.ts`
- [x] Cloud code sandbox. **Server** · `apps/web/lib/services/cloud-code-agent-runner.ts`
- [ ] Cloud browser runtime. **Not found.**
- [ ] Cloud virtual-computer runtime. **Not found.**
- [x] Desktop renderer. **Desktop** · `apps/desktop/src/App.tsx`
- [x] Desktop privileged host process. **Desktop** · `apps/desktop/electron/runtime/dispatcher.ts`
- [x] Desktop local daemon. **Desktop** · `apps/desktop/electron/main.ts` (browser-pairing bridge, telemetry domain `local_daemon`)
- [x] Local shell/PTY runtime. **Desktop** · `apps/desktop/electron/runtime/shellService.ts`, `apps/desktop/src/features/terminal/Terminal.tsx`
- [x] Local code sandbox. **Desktop** · `apps/desktop/electron/runtime/shellSandbox.ts`
- [x] Local MCP process host. **CLI** · `apps/cli/src/mcp/mod.rs`, `crates/agiworkforce-mcp/src/lib.rs`
- [x] Local model runtime. **Mobile** · `apps/mobile/src/features/model-picker/localModelRuntime.ts`, `packages/platform/local-llm/src/index.ts`
- [x] CLI interactive runtime. **CLI** · `apps/cli/src/tui/tui_app.rs`
- [x] CLI headless runtime. **CLI** · `apps/cli/src/lib.rs` (`Command::Exec`, alias `e`)
- [x] IDE extension-host runtime. **VS Code** · `apps/extension-vscode/src/extension.ts`
- [x] IDE webview runtime. **VS Code** · `apps/extension-vscode/src/protocol/webviewMessages.ts`
- [x] Browser-extension background runtime. **Chrome** · `apps/extension/src/background.ts`, `apps/extension/manifest.json`
- [x] Browser content-script runtime. **Chrome** · `apps/extension/src/content.ts`, `apps/extension/manifest.json`
- [x] Mobile JavaScript/native runtime where applicable. **Mobile** · `apps/mobile/app/_layout.tsx`
- [x] Native audio/camera modules. **Mobile** · `apps/mobile/src/features/voice/services/voiceInput.ts`, `apps/mobile/package.json` (expo-camera, expo-speech-recognition)
- [x] Remote-device relay. **Server** · `services/signaling-server/src/index.ts`
- [x] Scheduler. **Server** · `apps/web/app/api/cron/reap-agent-runs/route.ts`
- [ ] Connector synchronization workers. **Partial:** a cron job refreshes the connector directory catalog, not per-account external data · `apps/web/app/api/cron/refresh-connector-directory/route.ts`
- [x] Indexing workers. **Server** · `apps/web/lib/workflows/retrieval-index-workflow.ts`
- [x] Realtime audio session service. **Server** · `apps/web/app/api/voice/live/sessions/route.ts`
- [x] Interactive artifact sandbox. **Web** · `apps/web/features/chat/components/SandboxedIframe.tsx`, `apps/web/lib/artifact-sandbox.ts`
- [ ] Generated-application hosting runtime. **Not found.**

Section tally: 28 of 32 checked; 1 partial; 3 not found.

## 103. Data and persistence categories

- [x] Accounts and authentication identities. **Server** · `apps/web/db/neon/0174_identities.sql`, `apps/web/db/neon/0014_security.sql` (`authentication_attempts`)
- [x] Sessions and devices. **Server** · `apps/web/db/neon/0014_security.sql` (`account_sessions`), `apps/web/db/neon/0207_device_registrations.sql`
- [x] Organizations and workspaces. **Server** · `apps/web/db/neon/0015_organizations.sql`, `apps/web/db/neon/0234_workspaces_membership_status_and_installations.sql`
- [x] Memberships and roles. **Server** · `apps/web/db/neon/0015_organizations.sql` (`organization_members`), `apps/web/db/neon/0200_organization_permission_grid.sql` (`organization_roles`)
- [x] Preferences and policy versions. **Server** · `apps/web/db/neon/0028_user_settings.sql`, `apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql`
- [x] Conversations and turns. **Server** · `apps/web/db/neon/0077_gateway_compatibility_tables.sql` (`conversations`, `chat_messages`)
- [x] Message versions and branches. **Server** · `apps/web/db/neon/0022_chat_features.sql` (`conversation_branches`, `conversation_branch_messages`)
- [x] Execution attempts. **Server** · `apps/web/db/neon/0063_cloud_agent_execution_operations.sql`
- [x] Context manifests. **Server** · `apps/web/db/neon/0252_context_manifests_and_source_policy.sql`
- [x] Memory items and provenance. **Server** · `apps/web/db/neon/0010_memory.sql`, `apps/web/db/neon/0285_user_memories_provenance.sql`
- [x] Projects and notes. **Server** · `apps/web/db/neon/0006_projects.sql` (`user_projects`, `description`/`instructions` columns)
- [x] Files and versions. **Server** · `apps/web/db/neon/0036_media_assets.sql`, `apps/web/db/neon/0257_file_versions_and_lineage.sql`
- [x] Folders and Library entries. **Server** · `apps/web/db/neon/0022_chat_features.sql` (`chat_folders`), `apps/web/db/neon/0036_media_assets.sql` (Library list backing store)
- [ ] External resource references. **Partial:** citations/sources are stored inline as jsonb on message and report rows, not as a dedicated resource-reference table · `apps/web/db/neon/0094_research_reports.sql`
- [x] Extracted source content. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`retrieval_documents`)
- [x] Search and vector indexes. **Server** · `apps/web/db/neon/0202_retrieval_index.sql` (`retrieval_chunks`, pgvector + tsvector)
- [x] Citations and source locators. **Server** · `apps/web/db/neon/0094_research_reports.sql` (`citations` jsonb column)
- [x] Artifacts and revisions. **Server** · `apps/web/db/neon/0039_artifact_cloud_sync.sql` (`web_artifacts`, `web_artifact_versions`)
- [ ] Generated applications and deployments. **Not found.**
- [x] Media jobs and assets. **Server** · `apps/web/db/neon/0226_durable_image_generation_jobs.sql`, `apps/web/db/neon/0105_durable_video_generation_jobs.sql`
- [x] Agents and task plans. **Server** · `apps/web/db/neon/0024_support_tickets.sql` (`agent_tools`), `apps/web/db/neon/0237_work_plans.sql`
- [x] Tool invocations and receipts. **Server** · `apps/web/db/neon/0024_support_tickets.sql` (`agent_tool_executions`)
- [x] Approval requests and decisions. **Server** · `apps/web/db/neon/0077_gateway_compatibility_tables.sql` (`agent_approval_requests`), `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql`
- [x] Checkpoints. **Server** · `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql`
- [x] Coding sessions and repository bindings. **Server** · `apps/web/db/neon/0075_cloud_code_sessions.sql` (`repository_url`)
- [x] Connectors and connected accounts. **Server** · `apps/web/db/neon/0048_user_connectors.sql`, `apps/web/db/neon/0052_user_custom_connectors.sql`
- [x] Encrypted credential references. **Server** · `apps/web/db/neon/0052_user_custom_connectors.sql` (encrypted bearer token column)
- [x] Skills and Plugins. **Server** · `apps/web/db/neon/0157_user_skills.sql`, `apps/web/db/neon/0109_web_plugin_installations.sql`
- [x] Schedules and trigger definitions. **Server** · `apps/web/db/neon/0009_scheduling.sql` (`scheduled_tasks`), `apps/web/db/neon/0210_event_triggers.sql`
- [x] Notifications. **Server** · `apps/web/db/neon/0016_misc.sql` (`notifications`)
- [x] Plans and subscriptions. **Server** · `apps/web/db/neon/0003_subscriptions.sql`
- [x] Usage and credit ledger entries. **Server** · `apps/web/db/neon/0016_misc.sql` (`usage_events`), `apps/web/db/neon/0182_managed_usage_microusd_ledger.sql`
- [x] Invoices and payment references. **Server** · `apps/web/db/neon/0163_enterprise_billing_contracts.sql` (`organization_billing_invoices`)
- [x] Audit events. **Server** · `apps/web/db/neon/0014_security.sql` (`security_audit_logs`)
- [x] Feedback and support cases. **Server** · `apps/web/db/neon/0016_misc.sql` (`feedback`), `apps/web/db/neon/0076_enterprise_control_plane_tables.sql` (`support_cases`)
- [x] Retention/deletion records. **Server** · `apps/web/db/neon/0103_erasure_tombstones.sql`, `apps/web/db/neon/0205_domain_retention.sql`
- [x] Consent and policy acceptance. **Server** · `apps/web/db/neon/0113_dpdp_consent_records.sql`
- [x] Published-content access rules. **Server** · `apps/web/db/neon/0095_published_artifacts.sql` (RLS + public-read policy)

Section tally: 36 of 38 checked; 1 partial; 1 not found.

## 104. Named technology options, not claims about competitor internals

| Component problem                 | Concrete option to evaluate                                                     | Boundary                                                                                                        | This repository                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web application framework         | **React with Next.js**.                                                         | A possible implementation choice for routing, rendering, server/client boundaries, and web delivery.            | Used. Next.js 16 App Router is the web app; `"next"` dependency in `apps/web/package.json`.                                                                                                 |
| Reusable web components           | **shadcn/ui** and its underlying component primitives.                          | A customizable component foundation, not evidence that all competitors use it.                                  | Used. Radix UI + class-variance-authority (shadcn/ui's own stack) in `packages/ui/ui/package.json`.                                                                                         |
| Rich document editor              | **Tiptap**.                                                                     | An editor foundation that still requires product-specific persistence, collaboration, export, and permissions.  | Used for the chat composer only (mention/paragraph extensions), not a full document editor; `packages/ui/unified-chat/package.json`.                                                        |
| Server-state fetching and caching | **TanStack Query**.                                                             | Client-side asynchronous state management, not a replacement for authoritative backend state.                   | Used. `@tanstack/react-query` consumed in `apps/web/features/workspaces/hooks/use-workspaces.ts`.                                                                                           |
| Collaborative editing             | **Yjs**.                                                                        | Shared-data synchronization building blocks; product authorization and business conflict rules remain separate. | Not found. No `yjs` or CRDT dependency anywhere in the repo.                                                                                                                                |
| Diagrams                          | **Mermaid**.                                                                    | Text-defined diagram rendering.                                                                                 | Used. `mermaid` rendered in `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx`.                                                                                          |
| Mathematical typesetting          | **KaTeX**.                                                                      | Rendering mathematical notation, not verifying mathematical correctness.                                        | Used. `katex`/`rehype-katex` rendered in `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`.                                                                            |
| PDF viewing                       | **PDF.js**.                                                                     | PDF display and navigation, not an entire document-generation or redaction system.                              | Used. `pdfjs-dist` renders a viewer at `apps/desktop/src/features/file-upload/PDFViewer.tsx`; also used server-side for text extraction in `apps/web/lib/server/pdf-attachment-content.ts`. |
| Browser/desktop terminal UI       | **xterm.js**.                                                                   | Terminal presentation; command execution belongs in a separate process/runtime.                                 | Used. `@xterm/xterm` in `apps/desktop/package.json`, rendered by `apps/desktop/src/features/terminal/Terminal.tsx`.                                                                         |
| Terminal application architecture | **Rust TUI/runtime separation**, or **TypeScript/React/Ink-style composition**. | Both have direct coding-agent precedents in the public repositories above.                                      | Rust TUI/runtime separation is used: `apps/cli` (Rust binary `agi`) with `apps/cli/src/tui`; no Ink-style TS composition found.                                                             |
| Relational application storage    | **PostgreSQL**.                                                                 | A viable authoritative-data option; OpenAI's deployment is evidence of usage, not a topology to copy wholesale. | Used. Neon Postgres is the primary store; 294 migration files, e.g. `apps/web/db/neon/0001_mvp_chat.sql`.                                                                                   |
| Embedded conversational apps      | **MCP server plus isolated UI bridge**.                                         | Separates tool execution, identity, and interactive presentation.                                               | Used. `@modelcontextprotocol/ext-apps` sandboxed at `apps/web/app/api/mcp-apps/sandbox/route.ts`; MCP client in `packages/tools/mcp/package.json`.                                          |

Additional technology **decision slots** should remain explicit even before selecting vendors:

- [x] Code editor engine. **Desktop** · Monaco Editor · `apps/desktop/src/features/code/CodeEditor.tsx`
- [x] Syntax highlighter. **Shared** · Shiki · `packages/ui/unified-chat/package.json`
- [x] Markdown parser and sanitizer. **Shared** · react-markdown + rehype-sanitize · `packages/ui/unified-chat/package.json`
- [x] Charting engine. **Shared** · Recharts · `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx`
- [ ] Spreadsheet grid engine. **Not found.**
- [x] Presentation editor/renderer. **Web** · pptxgenjs (generation only, no interactive editor) · `apps/web/package.json`
- [ ] Image editor/canvas engine. **Not found.**
- [ ] Video playback and editing engine. **Not found.**
- [x] Native desktop shell. **Desktop** · Tauri 2 (internal) and Electron (public) · `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/package.json`
- [x] Native mobile implementation strategy. **Mobile** · Expo / React Native · `apps/mobile/package.json`
- [x] Local database. **Desktop** · SQLite via `rusqlite`/sqlcipher in the internal Tauri shell · `apps/desktop/src-tauri/Cargo.toml`
- [x] Object storage. **Shared** · S3-compatible via AWS SDK · `packages/platform/object-storage/package.json`
- [x] Search engine. **Server** · Postgres full-text (`tsvector`/GIN) · `apps/web/db/neon/0202_retrieval_index.sql`
- [x] Vector index. **Server** · pgvector (HNSW, cosine) · `apps/web/db/neon/0202_retrieval_index.sql`
- [x] Queue/job system. **Server** · homegrown Postgres-backed job queue · `apps/web/lib/jobs/job-service.ts`
- [x] Durable workflow engine. **Server** · Workflow DevKit (`workflow` package) · `apps/web/lib/workflows/retrieval-index-workflow.ts`
- [x] Realtime transport. **Server** · WebSocket (`ws`) for device signaling, SSE-style streaming for chat · `services/signaling-server/package.json`, `apps/web/app/api/llm/v1/chat/completions/route.ts`
- [x] WebRTC/media infrastructure. **Mobile, Server** · `react-native-webrtc` client, signaling relay · `apps/mobile/package.json`, `services/signaling-server/src/index.ts`
- [x] Secrets/KMS provider. **Server** · multi-cloud (AWS KMS, Azure Key Vault, GCP Cloud KMS) · `apps/web/lib/crypto/kms-providers.ts`
- [x] Authentication provider. **Shared** · Clerk · `packages/platform/identity/src/adapters/clerk.ts`
- [x] Payment provider. **Web** · Stripe · `apps/web/package.json`
- [x] Observability platform. **Web** · Sentry (`@sentry/nextjs`) · `apps/web/package.json`
- [x] Feature-flag system. **Server** · homegrown DB-backed flags · `apps/web/lib/feature-flags/evaluate-flags.ts`
- [x] Sandbox provider. **Server** · E2B (`@e2b/code-interpreter`) · `apps/web/lib/services/cloud-code-agent-runner.ts`
- [x] Browser automation engine. **Chrome** · Chrome DevTools Protocol via `chrome.debugger` · `apps/extension/src/features/computer-use/debuggerSession.ts` (the Playwright package `packages/tools/browser-tool` has no production consumer)
- [x] Local inference engine. **Mobile, Desktop** · llama.rn/react-native-executorch (mobile), whisper-rs (desktop, optional) · `packages/platform/local-llm/package.json`, `apps/desktop/src-tauri/Cargo.toml`
- [x] CI/build/signing pipeline. **Shared** · GitHub Actions + electron-builder (notarize) · `.github/workflows/ci.yml`, `apps/desktop/electron-builder.yml`

Section tally: 24 of 27 checked; 0 partial; 3 not found.

---

# O. Additional ecosystem products that are easy to miss

## 105. Developer platform and console

- [ ] Developer organization/project creation. **Partial:** workspace ("organization") creation exists; no separate per-project API scoping · `apps/web/features/settings/sections/TeamSection.tsx`, `apps/web/app/api/settings/organization/route.ts`
- [x] API-key management. **Web** · `apps/web/features/settings/components/Settings/ApiKeys.tsx`, `apps/web/features/settings/sections/AccountSection.tsx`
- [x] Service-account management. **Web** · `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx`, `apps/web/app/workspace/identity/page.tsx`
- [x] Model catalog. **Web** · `apps/web/app/models/page.tsx`, `apps/web/features/models/components/ModelCatalogueBrowser.tsx`
- [ ] API playground. **Not found.**
- [ ] Request builder. **Not found.**
- [ ] Streaming event inspector. **Not found.**
- [ ] Tool-call inspector. **Not found.**
- [ ] Structured-output schema editor. **Not found.**
- [ ] File upload and reuse. **Not found.**
- [ ] Retrieval collection manager. **Not found.**
- [ ] Prompt templates. **Not found.**
- [ ] Prompt versions. **Not found.**
- [ ] Evaluation datasets. **Not found.**
- [ ] Evaluation runs. **Not found.**
- [ ] Per-case evaluation results. **Not found.**
- [ ] Trace explorer. **Not found.**
- [x] Usage and cost dashboards. **Web** · `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx`, `apps/web/app/workspace/usage/page.tsx`
- [ ] Rate-limit inspection. **Not found.**
- [x] Budget controls. **Web** · `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx`
- [x] Webhook configuration. **Web** · `apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx`, `apps/web/app/workspace/audit/page.tsx`
- [ ] Webhook event history. **Partial:** shows last-delivered time and consecutive-failure count, no delivery log · `apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx`
- [ ] SDK documentation. **Partial:** docs how to point the OpenAI SDK at the gateway; no first-party SDK · `apps/web/app/api-docs/page.tsx`
- [x] API reference. **Web** · `apps/web/public/openapi.json`, `apps/web/app/api-docs/page.tsx`
- [x] Integration examples. **Web** · `apps/web/app/api-docs/page.tsx`
- [ ] Migration guides. **Not found.**
- [ ] Deprecation notices. **Not found.**
- [ ] Developer support. **Partial:** general email/help-centre support channel, no developer-specific queue · `apps/web/app/support/page.tsx`
- [ ] Custom app/Plugin testing. **Not found.**
- [ ] Publishing workflow. **Not found.**

Section tally: 8 of 30 checked; 4 partial; 18 not found.

## 106. Office, collaboration-channel, and email surfaces

- [ ] Assistant inside Word. **Not found.**
- [ ] Assistant inside Excel. **Not found.**
- [ ] Assistant inside PowerPoint. **Not found.**
- [ ] Assistant inside Outlook. **Not found.**
- [ ] Assistant inside Google Docs. **Not found.**
- [ ] Assistant inside Google Sheets. **Not found.**
- [ ] Assistant inside Google Slides. **Not found.**
- [ ] Host-document selection context. **Not found.**
- [ ] Native tracked edits. **Not found.**
- [ ] Protected-range awareness. **Not found.**
- [ ] Cross-document references. **Not found.**
- [ ] Shared conversation context across supported host applications. **Not found.**
- [ ] Slack direct-message assistant. **Not found.**
- [ ] Slack channel agent. **Partial:** signed Slack Events API receiver feeds a generic trigger/task pipeline; no confirmed in-channel reply · `apps/web/app/api/webhooks/slack/route.ts`
- [ ] Teams assistant. **Not found.**
- [ ] Mention-to-task handoff. **Partial:** any Slack event type can be bound to a scheduled-task trigger; not a dedicated @mention feature · `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx`
- [ ] Email-to-task address. **Not found.**
- [ ] Forward-email-to-agent workflow. **Partial:** connected-mailbox Gmail push watch fires a task on new mail, not a forward-to address · `apps/web/app/api/webhooks/gmail/route.ts`
- [ ] Task replies within an email thread. **Not found.**
- [ ] Channel-based approvals. **Not found.**
- [x] Agent identity distinct from a human account. **Web** · `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx`
- [ ] Channel-specific permissions. **Not found.**
- [ ] Conversation-to-session mapping. **Not found.**
- [x] Results mirrored into the main application. **Web** · `apps/web/app/tasks/page.tsx`, `apps/web/features/schedules/components/ScheduleRunHistory.tsx`
- [ ] Native-host and standalone-app handoff. **Not found.**

The uploaded inventories distinguish Office add-ins, embedded external-document views, and generated downloadable files. Those are three different product implementations, even when all involve “working on a spreadsheet.”

Section tally: 2 of 25 checked; 3 partial; 20 not found.

## 107. Discovery, social, and public-content products

- [ ] Personalized discovery feed. **Not found.**
- [ ] Topic-following controls. **Not found.**
- [ ] News/research collections. **Not found.**
- [x] Curated public pages. **Web** · `apps/web/app/blog/page.tsx`
- [ ] Public artifact gallery. **Partial:** static "inspiration" examples plus the signed-in user's own artifacts; no multi-creator public browsing · `apps/web/app/gallery/GalleryClient.tsx`
- [ ] Public generated-app gallery. **Not found.**
- [ ] Public image/video gallery. **Not found.**
- [ ] Creator profiles. **Not found.**
- [ ] Follow creator. **Not found.**
- [ ] Favorite/save. **Not found.**
- [ ] Remix/fork. **Partial:** `forkArtifact` duplicates one of your own artifact versions; no fork from another user's shared content · `apps/web/features/chat/stores/artifacts-store.ts`
- [ ] Prompt reuse. **Not found.**
- [x] Attribution and source lineage. **Web** · `apps/web/features/chat/lib/researchReportSources.ts`, `apps/web/features/chat/components/messages/MessageBubble.tsx`
- [ ] Public comments where offered. **Not found.**
- [x] Content reporting. **Web, Mobile** · `apps/web/features/chat/components/messages/MessageBubble.tsx`, `apps/mobile/src/features/chat/components/ReportFlagButton.tsx`
- [ ] Block/mute controls. **Not found.**
- [ ] Feed-personalization controls. **Not found.**
- [ ] Sponsored-content labeling where applicable. **Not found.**
- [ ] Organic versus paid ranking separation. **Not found.**
- [ ] Publisher participation. **Not found.**
- [ ] Licensed-content access. **Not found.**
- [ ] Merchant or partner participation. **Not found.**
- [x] Public-content moderation dashboard. **Web** · `apps/web/features/admin/components/ContentReportQueuePanel.tsx`, `apps/web/app/api/admin/content-reports/route.ts`

Section tally: 4 of 23 checked; 2 partial; 17 not found.

## 108. Specialist workspaces

These are separate product candidates, not automatic requirements for the core assistant.

- [ ] Personal-finance dashboard. **Not found.**
- [ ] Connected accounts. **Not found.**
- [ ] Spending analysis. **Not found.**
- [ ] Budget planning. **Not found.**
- [ ] Net-worth view. **Not found.**
- [ ] Financial-document explanation. **Not found.**
- [ ] Credit-report view. **Not found.**
- [ ] Credit-score history. **Not found.**
- [ ] Financial research workspace. **Not found.**
- [ ] Company research. **Not found.**
- [ ] Earnings and filing analysis. **Not found.**
- [ ] Health-record workspace. **Not found.**
- [ ] Health timeline. **Not found.**
- [ ] Lab-result explanation. **Not found.**
- [ ] Wearable-data summaries. **Not found.**
- [ ] Appointment preparation. **Not found.**
- [ ] Legal research workspace. **Not found.**
- [ ] Matter/document organization. **Not found.**
- [ ] Contract review. **Not found.**
- [ ] Scientific research workspace. **Not found.**
- [ ] Literature/source management. **Not found.**
- [ ] Reproducible research environments. **Not found.**
- [ ] Education/teacher workspace. **Not found.**
- [ ] Curriculum and lesson generation. **Not found.**
- [ ] Business operations workspace. **Not found.**
- [ ] Sales and CRM workflows. **Partial:** Salesforce/HubSpot connectors give the assistant CRM tool access via chat; no dedicated CRM workspace UI · `apps/web/features/connectors/data/connectors.ts`
- [ ] Customer-support workflows. **Partial:** Zendesk/Intercom/Freshdesk connectors give the assistant ticket access via chat; no dedicated support workspace · `apps/web/features/connectors/data/connectors.ts`
- [ ] HR and recruiting workflows. **Not found.**
- [ ] Marketing and campaign workflows. **Partial:** Mailchimp connector gives the assistant campaign tool access via chat; no dedicated workspace · `apps/web/features/connectors/data/connectors.ts`
- [ ] Engineering/CAD connector workflows. **Not found.**
- [ ] Shopping comparisons. **Not found.**
- [ ] Virtual try-on. **Not found.**
- [ ] Travel planning and reservations. **Not found.**
- [ ] Commerce checkout. **Not found.**
- [ ] Customer-service voice agents. **Not found.**

Section tally: 0 of 35 checked; 3 partial; 32 not found.

## 109. Optional native and ambient extensions

- [ ] Home-screen widgets. **Not found.**
- [ ] Lock-screen widgets. **Not found.**
- [x] Menu-bar quick actions. **Desktop** · `apps/desktop/electron/tray.ts`
- [x] Desktop companion. **Desktop** · `apps/desktop/electron/tray.ts`, `apps/desktop/electron/main.ts`
- [x] Compact floating assistant. **Desktop** · `apps/desktop/electron/quickAsk.ts`
- [ ] Optional animated companion/pet. **Not found.**
- [x] Global dictation. **Desktop** · `apps/desktop/electron/voiceDictation.ts`
- [ ] Selected-text rewrite shortcut. **Not found.**
- [x] Screenshot-to-chat shortcut. **Desktop** · `apps/desktop/electron/screenshot.ts`
- [ ] Window-to-chat shortcut. **Partial:** shortcut captures the whole display (`desktopCapturer` types: `['screen']`), not a chosen window · `apps/desktop/electron/screenshot.ts`
- [ ] Hardware shortcut/macropad integration. **Not found.**
- [ ] Wearable voice access. **Not found.**
- [ ] Headset/earbud invocation. **Not found.**
- [ ] Automotive voice surface. **Not found.**
- [ ] Telephone access. **Not found.**
- [ ] Messaging-platform access. **Partial:** Slack/WhatsApp/Teams connect UI exists but is never imported/mounted, and its commands have no Electron backend · `apps/desktop/src/features/messaging/MessagingIntegrations.tsx`
- [ ] Spatial/XR interface. **Not found.**
- [ ] Local-model download manager. **Partial:** pull-model UI/API exist but only wired to the retained-internal Tauri build, not the shipped Electron desktop · `apps/desktop/src/features/settings/SettingsPanel.tsx`, `apps/desktop/src-tauri/src/sys/commands/ollama.rs`
- [ ] Local-model storage manager. **Partial:** same gating for delete-model · `apps/desktop/src/api/ollama.ts`
- [ ] Local hardware-capability panel. **Not found.**
- [ ] Model loading/unloading controls. **Not found.**
- [ ] Local runtime health. **Partial:** Electron backend probes Ollama/LM Studio reachability, but no renderer UI calls it · `apps/desktop/electron/runtime/localInferenceService.ts`
- [ ] Hybrid local/cloud task mode. **Partial:** Electron backend can route chat to a local server, but nothing in the renderer invokes it · `apps/desktop/electron/runtime/dispatcher.ts`
- [ ] Explicit cloud-escalation approval. **Not found.**
- [ ] Local resource/compute dashboard. **Not found.**

Section tally: 5 of 25 checked; 6 partial; 14 not found.

## 110. Cross-product experiences to include in the product map

- [x] Chat → editable document. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Document → presentation. **Not found.**
- [ ] Spreadsheet → chart → report. **Not found.**
- [ ] Research → report → audio overview. **Not found.**
- [ ] Research → interactive page. **Partial:** "Turn this report into an artifact" saves a Deep Research report as a markdown artifact, not confirmed as an interactive page · `apps/web/features/chat/components/research/ResearchReportView.tsx`
- [ ] Image → edited image → video. **Not found.**
- [ ] Voice → durable work task. **Not found.**
- [ ] Voice → generated document. **Not found.**
- [ ] Browser page → Project source. **Partial:** extension attaches the current page as chat context inside a project-scoped conversation; no dedicated "add as source" action · `apps/extension/src/side_panel.ts`, `apps/extension/src/features/side-panel/projectsDrawer.ts`
- [ ] Email thread → agent task. **Partial:** a connected mailbox's new mail fires a scheduled-task trigger; no per-thread task creation · `apps/web/app/api/webhooks/gmail/route.ts`
- [ ] Team mention → coding session. **Not found.**
- [ ] Design → implementation. **Not found.**
- [ ] Repository → review deck. **Not found.**
- [ ] Completed task → reusable Skill. **Not found.**
- [ ] Completed task → scheduled routine. **Not found.**
- [ ] Custom assistant → Plugin migration. **Not found.**
- [ ] Shared artifact → viewer-authorized connected app. **Not found.**
- [x] Web conversation → mobile continuation. **Web, Mobile** · `apps/mobile/services/cloudSyncEngine.ts`
- [x] CLI session → desktop continuation. **Desktop, CLI** · `packages/contracts/local-runtime/src/developer-sessions.ts`, `apps/desktop/electron/runtime/dispatcher.ts`
- [x] Desktop session → IDE continuation. **Desktop, VS Code** · `apps/extension-vscode/src/integrations/developerSessionHandoff.ts`, `packages/contracts/local-runtime/src/developer-sessions.ts`
- [ ] Mobile request → authorized local-host execution. **Partial:** QR-paired Remote Control UI exists, but `remoteControlSupported()` is explicitly false on the shipped Electron build · `apps/desktop/src/lib/remoteControlSupport.ts`, `apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx`
- [x] Local work → explicit cloud handoff. **Web** · `apps/web/features/chat/lib/localByokHandoff.ts`
- [ ] Cloud result → local repository application. **Not found.**
- [x] Existing notebook → main assistant context. **Web** · `apps/web/lib/services/project-context-service.ts`
- [x] Main conversation → persistent notebook sources. **Web** · `apps/web/features/chat/components/ConversationTitleMenu.tsx`
- [ ] Usage exhaustion → alternative eligible path. **Partial:** hitting a plan/feature limit shows an upgrade paywall card; no automatic routing to an alternative eligible model · `apps/web/features/chat/components/InlinePaywallCard.tsx`
- [x] Disconnected integration → reconnect and resume. **Web** · `apps/web/features/connectors/components/ConnectorOutcomeAnnouncer.tsx`
- [x] Published output → versioned update. **Web** · `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
- [ ] Public creation → private fork. **Not found.**
- [x] Personal resource → explicitly shared workspace resource. **Web** · `apps/web/features/settings/sections/OrganizationSharingSection.tsx`, `apps/web/app/workspace/sharing/page.tsx`

Section tally: 10 of 30 checked; 5 partial; 15 not found.

---

**The product inventory is the union of these experiences and components, not
a claim that all five competitors ship every item, use the same packages, or
expose the same capabilities on every platform. The implementation unit should
be the concrete capability and its interface: for example, an artifact version
selector, a connected-source picker, a voice-to-task handoff, or a reusable
Plugin builder, not merely “artifacts,” “integrations,” or “agents.”**
