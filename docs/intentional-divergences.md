# Intentional Divergences from Claude Reference

Status: Current
Owner: Platform lead

Items in this document are BY DESIGN different from Claude. Re-audits should NOT flag these as flaws.

Last updated: 2026-05-24

## v1 Scope Deferrals (will be built later)

| ID   | Divergence                                                           | Reason                                                             | Target     |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| D-01 | No Chat/Cowork/Code mode tabs                                        | v1 has single Chat surface; Cowork and Code are desktop-only modes | v1.1       |
| D-02 | No real OAuth connector flow                                         | v1 is local-only; cloud connectors are waitlist-gated              | v1.1       |
| D-03 | User-specific connector state from authenticated sessions            | Requires real OAuth backend infrastructure                         | v1.1       |
| D-04 | No Code-surface model+effort menu with numbered shortcuts            | No Code surface in v1 web                                          | v1.1       |
| D-05 | No screenshot capture in composer                                    | Requires browser extension or desktop API                          | v1.1       |
| D-06 | No GitHub file reference integration ("Add from GitHub")             | Requires GitHub OAuth app                                          | v1.1       |
| D-07 | No "Gift AGI" menu item                                              | No gifting/referral system in v1                                   | v1.1       |
| D-08 | No "Learn more" submenu in account menu                              | No knowledge base content yet                                      | v1.1       |
| D-09 | No "Import memory from other AI providers"                           | No migration tooling in v1                                         | v1.1       |
| D-10 | Marketing pages use placeholder screenshots, not real product images | Surfaces not demo-ready for screenshots yet                        | Pre-launch |
| D-11 | Plugin marketplace shows "Coming Soon"                               | Plugin system is MVP with local store only                         | v1.1       |
| D-12 | No active sessions management (view/revoke sessions)                 | Requires Clerk session API integration                             | v1.1       |
| D-13 | No "Add to project" submenu in composer + menu                       | Project-chat association is client-side only                       | v1.1       |
| D-14 | No feature showcase / integrations marketing page                    | Requires dedicated content creation                                | Pre-launch |

## Intentional Product Decisions (different by choice)

| ID   | Divergence                                                                               | Reason                                                                |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P-01 | Pricing tiers are Local/BYOK/Hobby/Pro/Max (not Free/Pro/Max)                            | AGI has different business model with local-first focus               |
| P-02 | Download page is CLI-focused (not app marketplace layout)                                | CLI is v1 lead surface; desktop/mobile are secondary                  |
| P-03 | Settings is full-page layout (not modal overlay)                                         | Architectural choice — full page gives more room for settings content |
| P-04 | Font labeled "Instrument Serif" (not "Anthropic Serif")                                  | Different product uses different font branding                        |
| P-05 | Voice names are Nova/Ember/Vale/Echo (not "Buttery")                                     | Different product identity for voice options                          |
| P-06 | Brand is "AGI" (not "Claude") throughout                                                 | Different product, different brand                                    |
| P-07 | Config directory is `.agiworkforce/` (not `.claude/`)                                    | Different product config namespace                                    |
| P-08 | Greeting includes creative variants ("Rise and shine") alongside standard "Good morning" | Intentional personality differentiation                               |
| P-09 | 5th suggestion chip is "AGI's pick" (not "From Gmail" or "Claude's choice")              | No Gmail connector in v1; different brand                             |
| P-10 | CLI binary is `agi` (not `claude`)                                                       | Different product binary name                                         |
| P-11 | Artifact gallery heading is "Artifacts" (not "Gallery.")                                 | Clearer labeling for users                                            |

## Re-Audit Instructions

When re-auditing, compare this document against each finding. If a finding matches any D-XX or P-XX item above, classify it as `INTENTIONAL_DIVERGENCE` (not a flaw). Only flag items as critical/major if they represent:

1. Real bugs (broken functionality, routing errors, dead code wired as live)
2. Parity gaps NOT listed in this document
3. Security vulnerabilities
4. Marketing claims about features that don't exist
